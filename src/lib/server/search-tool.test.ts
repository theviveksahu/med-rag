import { Document } from "@langchain/core/documents";
import { StateBackend } from "deepagents";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_SEARCHES_PER_TURN, TOP_K } from "@/lib/shared/limits";
import type { TraceData } from "@/lib/shared/types";

const mocks = vi.hoisted(() => ({
  getVectorStore: vi.fn(),
}));

vi.mock("./vector-store", () => ({
  getVectorStore: mocks.getVectorStore,
}));

import { createSearchTool } from "./search-tool";

const sessionId = "123e4567-e89b-42d3-a456-426614174000";

function setup(results: Array<[Document, number]>) {
  const similaritySearchWithScore = vi.fn().mockResolvedValue(results);
  mocks.getVectorStore.mockResolvedValue({ similaritySearchWithScore });
  const emit = vi.fn();
  const backend = new StateBackend();
  const tool = createSearchTool({ sessionId, backend, emit });
  return { tool, emit, similaritySearchWithScore, backend };
}

beforeEach(() => {
  mocks.getVectorStore.mockReset();
});

describe("createSearchTool", () => {
  it("queries Atlas with TOP_K and the server-held session filter", async () => {
    const { tool, similaritySearchWithScore } = setup([
      [
        new Document({
          pageContent: "Patient Name: Jane Doe\nHemoglobin: 13.8 g/dL",
          metadata: { page: 2 },
        }),
        0.9123,
      ],
    ]);

    const result = await tool.invoke({ query: "hemoglobin" });

    expect(similaritySearchWithScore).toHaveBeenCalledWith(
      "hemoglobin",
      TOP_K,
      { preFilter: { sessionId: { $eq: sessionId } } },
    );
    expect(result).toContain("/retrieved/");
    expect(result).toContain("page 2, relevance 0.912");
    expect(result).toContain("Hemoglobin: 13.8 g/dL");
    expect(result).not.toContain("Jane Doe");
  });

  it("emits only redacted search trace and stage data", async () => {
    const { tool, emit } = setup([
      [
        new Document({
          pageContent: "Patient Name: Jane Doe\nGlucose: 92 mg/dL",
          metadata: { page: 1 },
        }),
        0.8,
      ],
    ]);

    await tool.invoke({ query: "glucose" });

    const trace = emit.mock.calls
      .map(([part]) => part)
      .find((part) => part.type === "data-trace")?.data as TraceData;

    expect(trace).toMatchObject({
      type: "search",
      query: "glucose",
      pages: [1],
      chunkCount: 1,
      scores: [0.8],
    });
    expect(JSON.stringify(emit.mock.calls)).not.toContain("Jane Doe");
  });

  it("returns a safe message when no sections match", async () => {
    const { tool, emit } = setup([]);

    await expect(tool.invoke({ query: "missing" })).resolves.toBe(
      "No matching sections were found in this report.",
    );

    const trace = emit.mock.calls
      .map(([part]) => part)
      .find((part) => part.type === "data-trace")?.data as TraceData;
    expect(trace).toMatchObject({ pages: [], chunkCount: 0 });
  });

  it("caps searches per turn", async () => {
    const { tool, similaritySearchWithScore } = setup([]);

    for (let index = 0; index < MAX_SEARCHES_PER_TURN; index += 1) {
      await tool.invoke({ query: `query-${index}` });
    }

    await expect(tool.invoke({ query: "one too many" })).resolves.toContain(
      "Search limit reached",
    );
    expect(similaritySearchWithScore).toHaveBeenCalledTimes(
      MAX_SEARCHES_PER_TURN,
    );
  });

  it("does not search after the request is aborted", async () => {
    const { similaritySearchWithScore } = setup([]);
    const controller = new AbortController();
    controller.abort();

    const abortedTool = createSearchTool({
      sessionId,
      backend: new StateBackend(),
      emit: vi.fn(),
      signal: controller.signal,
    });

    await expect(abortedTool.invoke({ query: "hemoglobin" })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(similaritySearchWithScore).not.toHaveBeenCalled();
  });
});
