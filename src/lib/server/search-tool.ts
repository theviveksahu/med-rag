import "server-only";

import type { Document } from "@langchain/core/documents";
import { tool } from "@langchain/core/tools";
import { StateBackend } from "deepagents";
import { z } from "zod";

import { AppError } from "@/lib/shared/errors";
import {
  MAX_SEARCHES_PER_TURN,
  TOP_K,
} from "@/lib/shared/limits";
import type { AppErrorData, StageData, TraceData } from "@/lib/shared/types";

import { redactReportPii } from "./redact";
import { getVectorStore } from "./vector-store";

export type EmitData = (
  part:
    | { type: "data-stage"; data: StageData }
    | { type: "data-trace"; data: TraceData }
    | { type: "data-error"; data: AppErrorData },
) => void;

export interface CreateSearchToolOptions {
  sessionId: string;
  backend: StateBackend;
  emit: EmitData;
  signal?: AbortSignal;
}

const SEARCH_SCHEMA = z.object({
  query: z
    .string()
    .trim()
    .min(3, "Use a query of at least 3 characters.")
    .max(300, "Keep the query under 300 characters.")
    .describe(
      "A short, specific search query for the uploaded medical report. Use the user's question or a focused medical term. Do not repeat a previous query.",
    ),
});

function pageFromMetadata(metadata: Record<string, unknown>): number {
  const page = metadata.page;
  return typeof page === "number" && Number.isInteger(page) && page > 0
    ? page
    : 1;
}

function previewOf(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 180) return normalized;
  return `${normalized.slice(0, 180)}…`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Chat aborted.", "AbortError");
  }
}

/**
 * Build the only retrieval tool available to the main agent. The session id is
 * captured here, so the model cannot search another browser session's vectors.
 * Retrieved text is redacted before it enters the in-memory backend.
 */
export function createSearchTool(options: CreateSearchToolOptions) {
  const { sessionId, backend, emit, signal } = options;
  let searchCount = 0;

  return tool(
    async ({ query }) => {
      if (searchCount >= MAX_SEARCHES_PER_TURN) {
        return "Search limit reached for this question. Answer with the sections already retrieved.";
      }

      searchCount += 1;
      throwIfAborted(signal);

      const searchStageId = crypto.randomUUID();
      const analyzeStageId = crypto.randomUUID();
      const startedAt = Date.now();

      emit({
        type: "data-stage",
        data: {
          id: searchStageId,
          stage: "searching",
          message: "Searching your report…",
          startedAt,
        },
      });

      const store = await getVectorStore();
      const results: Array<[Document, number]> =
        await store.similaritySearchWithScore(query, TOP_K, {
          preFilter: { sessionId: { $eq: sessionId } },
        });

      throwIfAborted(signal);

      const durationMs = Date.now() - startedAt;

      if (results.length === 0) {
        emit({
          type: "data-trace",
          data: {
            type: "search",
            query,
            pages: [],
            chunkCount: 0,
            durationMs,
          },
        });
        emit({
          type: "data-stage",
          data: {
            id: searchStageId,
            stage: "searching",
            message: "No matching sections found.",
            startedAt,
            durationMs,
          },
        });

        return "No matching sections were found in this report.";
      }

      const batchId = crypto.randomUUID().slice(0, 8);
      const encoder = new TextEncoder();
      const uploads: Array<[string, Uint8Array]> = [];
      const paths: string[] = [];
      const previews: string[] = [];
      const pages: number[] = [];
      const scores: number[] = [];

      for (const [index, [doc, score]] of results.entries()) {
        const page = pageFromMetadata(doc.metadata);
        const path = `/retrieved/${batchId}/chunk_${index + 1}.md`;
        const redactedText = redactReportPii(doc.pageContent);
        const content = `# Report section (page ${page})\n\n${redactedText}`;

        paths.push(path);
        previews.push(previewOf(redactedText));
        pages.push(page);
        scores.push(Number(score.toFixed(3)));
        uploads.push([path, encoder.encode(content)]);
      }

      const uploadResponses = backend.uploadFiles(uploads);
      if (uploadResponses.some((response) => response.error)) {
        throw new AppError("INTERNAL");
      }

      emit({
        type: "data-trace",
        data: {
          type: "search",
          query,
          pages,
          scores,
          chunkCount: results.length,
          durationMs,
        },
      });
      emit({
        type: "data-stage",
        data: {
          id: searchStageId,
          stage: "searching",
          message: `Found ${results.length} relevant section${results.length === 1 ? "" : "s"}.`,
          startedAt,
          durationMs,
        },
      });
      emit({
        type: "data-stage",
        data: {
          id: analyzeStageId,
          stage: "analyzing",
          message: `Analyzing ${results.length} section${results.length === 1 ? "" : "s"}…`,
          startedAt: Date.now(),
        },
      });

      return results
        .map(
          ([, score], index) =>
            `${index + 1}. ${paths[index]} — page ${pages[index]}, relevance ${score.toFixed(3)}\nPreview: ${previews[index]}`,
        )
        .join("\n\n");
    },
    {
      name: "search_report",
      description:
        "Search the uploaded medical report for sections relevant to the user's question. Returns temporary /retrieved/ file paths and short previews; delegate those paths to the chunk-analyst.",
      schema: SEARCH_SCHEMA,
    },
  );
}
