import "server-only";

import { createHash } from "node:crypto";
import path from "node:path";

import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import { AppError } from "@/lib/shared/errors";
import {
  CHUNK_OVERLAP,
  CHUNK_SIZE,
  EMBED_BATCH_SIZE,
  EMBEDDING_DIMENSIONS,
  MAX_CHUNKS,
  MAX_REPORT_FILENAME_CHARS,
} from "@/lib/shared/limits";
import type { UploadPage } from "@/lib/shared/schemas";
import {
  normalizeExtractedText,
  normalizeReport,
} from "@/lib/shared/text";

import { mapProviderError } from "./errors";
import { getEmbeddings } from "./models";
import { deleteChunksForReport } from "./session";
import { getVectorStore } from "./vector-store";

export interface PreparedReport {
  normalizedText: string;
  reportHash: string;
}

export interface IngestProgress {
  current: number;
  total: number;
  progress: number;
}

export interface IngestReportOptions {
  sessionId: string;
  reportHash: string;
  filename: string;
  pages: UploadPage[];
  createdAt: Date;
  expiresAt: Date;
  signal?: AbortSignal;
  onPrepared?: (chunkCount: number) => void;
  onProgress?: (progress: IngestProgress) => void;
}

export interface IngestResult {
  reportHash: string;
  chunkCount: number;
}

interface PrepareChunksOptions {
  sessionId: string;
  reportHash: string;
  source: string;
  pages: UploadPage[];
  createdAt: Date;
  expiresAt: Date;
}

interface IndexChunksOptions {
  chunks: Document[];
  signal?: AbortSignal;
  onProgress?: (progress: IngestProgress) => void;
}

/**
 * Hash the normalized report text. The browser and server use the same
 * normalization so a retry of the same extracted report de-duplicates.
 */
export function hashNormalizedReport(normalizedText: string): string {
  return createHash("sha256").update(normalizedText, "utf8").digest("hex");
}

export function prepareReport(pages: UploadPage[]): PreparedReport {
  const normalizedText = normalizeReport(pages);
  return {
    normalizedText,
    reportHash: hashNormalizedReport(normalizedText),
  };
}

/**
 * Keep only a basename, remove control characters, and cap the display/storage
 * name. The fallback is deterministic; the original filename is never logged.
 */
export function sanitizeFilename(filename: string): string {
  const base = path.basename(filename.replace(/\\/g, "/"));
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const safe = cleaned || "report.pdf";
  if (safe.length <= MAX_REPORT_FILENAME_CHARS) return safe;

  return `${safe.slice(0, MAX_REPORT_FILENAME_CHARS - 4)}.pdf`;
}

/**
 * Split each page independently so every chunk keeps an exact page number.
 * The returned documents already carry all fields needed by Atlas.
 */
export async function prepareChunks(
  options: PrepareChunksOptions,
): Promise<Document[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  const chunks: Document[] = [];
  let chunkIndex = 0;

  for (const page of options.pages) {
    const text = normalizeExtractedText(page.text);
    if (!text) continue;

    const splits = await splitter.splitText(text);

    for (const split of splits) {
      const pageContent = split.trim();
      if (!pageContent) continue;

      if (chunks.length >= MAX_CHUNKS) {
        throw new AppError("REPORT_TOO_LARGE");
      }

      chunks.push(
        new Document({
          pageContent,
          metadata: {
            sessionId: options.sessionId,
            reportHash: options.reportHash,
            chunkIndex,
            source: options.source,
            page: page.page,
            createdAt: options.createdAt,
            expiresAt: options.expiresAt,
          },
        }),
      );

      chunkIndex += 1;
    }
  }

  if (chunks.length === 0) {
    throw new AppError("EMPTY_REPORT");
  }

  return chunks;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Upload aborted.", "AbortError");
  }
}

function validateVectors(vectors: number[][], expectedCount: number): void {
  if (vectors.length !== expectedCount) {
    throw new AppError("PROVIDER_ERROR", {
      message: "The embedding model returned an unexpected number of vectors.",
    });
  }

  for (const vector of vectors) {
    if (
      !Array.isArray(vector) ||
      vector.length !== EMBEDDING_DIMENSIONS ||
      vector.some(
        (value) => typeof value !== "number" || !Number.isFinite(value),
      )
    ) {
      throw new AppError("PROVIDER_ERROR", {
        message: "The embedding model returned an unexpected vector size.",
      });
    }
  }
}

/**
 * Embed and insert sequentially in 16-section batches. Sequential batches keep
 * the request count within the free-tier embedding rate limit.
 */
export async function indexChunks(options: IndexChunksOptions): Promise<void> {
  const { chunks, signal, onProgress } = options;
  const total = chunks.length;

  if (total === 0) return;

  const embeddings = getEmbeddings();
  const vectorStore = await getVectorStore();

  for (let start = 0; start < total; start += EMBED_BATCH_SIZE) {
    throwIfAborted(signal);

    const batch = chunks.slice(start, start + EMBED_BATCH_SIZE);
    let vectors: number[][];

    try {
      vectors = await embeddings.embedDocuments(
        batch.map((document) => document.pageContent),
      );
    } catch (error) {
      throwIfAborted(signal);
      throw mapProviderError(error);
    }

    throwIfAborted(signal);
    validateVectors(vectors, batch.length);

    await vectorStore.addVectors(vectors, batch);
    throwIfAborted(signal);

    const current = Math.min(start + batch.length, total);
    onProgress?.({
      current,
      total,
      progress: Math.round((current / total) * 100),
    });
  }
}

/**
 * Normalize, split, embed, and store one report. On any failure, remove only
 * this report's chunks so a failed replacement cannot leave a mix of reports.
 */
export async function ingestReport(
  options: IngestReportOptions,
): Promise<IngestResult> {
  const { sessionId, reportHash } = options;

  try {
    const chunks = await prepareChunks({
      sessionId,
      reportHash,
      source: sanitizeFilename(options.filename),
      pages: options.pages,
      createdAt: options.createdAt,
      expiresAt: options.expiresAt,
    });

    options.onPrepared?.(chunks.length);

    await indexChunks({
      chunks,
      signal: options.signal,
      onProgress: options.onProgress,
    });

    return { reportHash, chunkCount: chunks.length };
  } catch (error) {
    await deleteChunksForReport(sessionId, reportHash).catch(() => undefined);
    throw error;
  }
}
