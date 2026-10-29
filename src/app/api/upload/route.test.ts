import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UPLOAD_BODY_LIMIT_BYTES } from "@/lib/shared/limits";
import { normalizeReport } from "@/lib/shared/text";

const mocks = vi.hoisted(() => ({
  ingestReport: vi.fn(),
  deleteChunksForReport: vi.fn(),
  deleteChunksForSession: vi.fn(),
  getSession: vi.fn(),
  isProcessingStale: vi.fn(),
  markSessionError: vi.fn(),
  markSessionReady: vi.fn(),
  startSession: vi.fn(),
}));

vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/server/ingest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/ingest")>();
  return { ...actual, ingestReport: mocks.ingestReport };
});

vi.mock("@/lib/server/session", () => ({
  deleteChunksForReport: mocks.deleteChunksForReport,
  deleteChunksForSession: mocks.deleteChunksForSession,
  getSession: mocks.getSession,
  isProcessingStale: mocks.isProcessingStale,
  markSessionError: mocks.markSessionError,
  markSessionReady: mocks.markSessionReady,
  startSession: mocks.startSession,
}));

vi.mock("@/lib/server/log", () => ({
  logError: vi.fn(),
  logEvent: vi.fn(),
  logWarning: vi.fn(),
  newRequestId: () => "req-test",
}));

import { POST } from "./route";

const sessionId = "123e4567-e89b-42d3-a456-426614174000";
const otherSessionId = "123e4567-e89b-42d3-a456-426614174001";
const now = new Date("2026-10-28T00:00:00.000Z");
const expiresAt = new Date("2026-10-29T00:00:00.000Z");

const pages = [
  {
    page: 1,
    text: "Synthetic lab report. Hemoglobin 13.8 g/dL. ".repeat(10),
  },
];

const payload = {
  filename: "synthetic-report.pdf",
  fileSize: 12_345,
  pageCount: 1,
  pages,
};

const reportHash = createHash("sha256")
  .update(normalizeReport(pages), "utf8")
  .digest("hex");

function uploadRequest(
  body: unknown,
  options: { sessionId?: string | null; rawBody?: string } = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (options.sessionId !== null) {
    headers["x-session-id"] = options.sessionId ?? sessionId;
  }

  return new Request("http://localhost/api/upload", {
    method: "POST",
    headers,
    body: options.rawBody ?? JSON.stringify(body),
  });
}

async function eventsOf(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.getSession.mockResolvedValue(null);
  mocks.isProcessingStale.mockReturnValue(false);
  mocks.deleteChunksForReport.mockResolvedValue(undefined);
  mocks.deleteChunksForSession.mockResolvedValue(undefined);
  mocks.markSessionError.mockResolvedValue(undefined);
  mocks.markSessionReady.mockResolvedValue(undefined);
  mocks.startSession.mockResolvedValue({
    _id: sessionId,
    status: "processing",
    createdAt: now,
    updatedAt: now,
    expiresAt,
    report: null,
    error: null,
    questionCount: 0,
  });
  mocks.ingestReport.mockImplementation(
    async (options: {
      reportHash: string;
      onPrepared?: (count: number) => void;
      onProgress?: (progress: {
        current: number;
        total: number;
        progress: number;
      }) => void;
    }) => {
      options.onPrepared?.(1);
      options.onProgress?.({ current: 1, total: 1, progress: 100 });
      return { reportHash: options.reportHash, chunkCount: 1 };
    },
  );
});

describe("POST /api/upload", () => {
  it("rejects a missing or malformed session id", async () => {
    const response = await POST(uploadRequest(payload, { sessionId: null }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_SESSION_ID", requestId: "req-test" },
    });
  });

  it("rejects a body larger than the upload cap", async () => {
    const response = await POST(
      uploadRequest(null, {
        rawBody: "x".repeat(UPLOAD_BODY_LIMIT_BYTES + 1),
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
  });

  it("rejects malformed JSON and invalid payloads", async () => {
    const malformed = await POST(uploadRequest(null, { rawBody: "{" }));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({
      error: { code: "INVALID_PAYLOAD" },
    });

    const invalid = await POST(uploadRequest({ pages: [] }));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: "INVALID_PAYLOAD" },
    });
  });

  it("returns 409 while a live upload is in progress", async () => {
    mocks.getSession.mockResolvedValue({
      status: "processing",
      createdAt: now,
      updatedAt: now,
      expiresAt,
      report: null,
      error: null,
      questionCount: 0,
    });

    const response = await POST(uploadRequest(payload));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UPLOAD_IN_PROGRESS" },
    });
    expect(mocks.deleteChunksForSession).not.toHaveBeenCalled();
  });

  it("reuses a ready report with the same normalized hash", async () => {
    mocks.getSession.mockResolvedValue({
      status: "ready",
      createdAt: now,
      updatedAt: now,
      expiresAt,
      report: {
        filename: "previous.pdf",
        pageCount: 1,
        chunkCount: 2,
        sizeBytes: 99,
        sha256: reportHash,
        indexedAt: now,
      },
      error: null,
      questionCount: 3,
    });

    const response = await POST(uploadRequest(payload));

    expect(response.status).toBe(200);
    await expect(eventsOf(response)).resolves.toEqual([
      {
        type: "done",
        report: {
          filename: "previous.pdf",
          pageCount: 1,
          chunkCount: 2,
          sizeBytes: 99,
        },
        reused: true,
      },
    ]);
    expect(mocks.ingestReport).not.toHaveBeenCalled();
    expect(mocks.deleteChunksForSession).not.toHaveBeenCalled();
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it("replaces a different report before streaming progress", async () => {
    mocks.getSession.mockResolvedValue({
      status: "ready",
      createdAt: now,
      updatedAt: now,
      expiresAt,
      report: {
        filename: "previous.pdf",
        pageCount: 1,
        chunkCount: 2,
        sizeBytes: 99,
        sha256: "0".repeat(64),
        indexedAt: now,
      },
      error: null,
      questionCount: 3,
    });

    const response = await POST(uploadRequest(payload));
    const events = await eventsOf(response);

    expect(response.status).toBe(200);
    expect(mocks.deleteChunksForSession).toHaveBeenCalledWith(sessionId);
    expect(mocks.startSession).toHaveBeenCalledWith(sessionId);
    expect(mocks.ingestReport).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        reportHash,
        filename: "synthetic-report.pdf",
        pages,
        createdAt: now,
        expiresAt,
      }),
    );
    expect(mocks.markSessionReady).toHaveBeenCalledWith(sessionId, {
      filename: "synthetic-report.pdf",
      pageCount: 1,
      chunkCount: 1,
      sizeBytes: 12_345,
      sha256: reportHash,
    });
    expect(events).toEqual([
      {
        type: "stage",
        stage: "preparing",
        message: "Preparing 1 sections…",
        current: 1,
        total: 1,
      },
      {
        type: "stage",
        stage: "embedding",
        message: "Indexing 1 of 1 sections…",
        current: 1,
        total: 1,
        progress: 100,
      },
      { type: "stage", stage: "finalizing", message: "Finishing up…" },
      {
        type: "done",
        report: {
          filename: "synthetic-report.pdf",
          pageCount: 1,
          chunkCount: 1,
          sizeBytes: 12_345,
        },
        reused: false,
      },
    ]);
  });

  it("cleans up this report and marks the session failed when ingestion fails", async () => {
    mocks.ingestReport.mockRejectedValue(
      new (await import("@/lib/shared/errors")).AppError("PROVIDER_ERROR"),
    );

    const response = await POST(uploadRequest(payload));
    const events = await eventsOf(response);

    expect(mocks.deleteChunksForReport).toHaveBeenCalledWith(
      sessionId,
      reportHash,
    );
    expect(mocks.markSessionError).toHaveBeenCalledWith(
      sessionId,
      "PROVIDER_ERROR",
      expect.any(String),
    );
    expect(mocks.markSessionReady).not.toHaveBeenCalled();
    expect(events).toEqual([
      expect.objectContaining({
        type: "error",
        code: "PROVIDER_ERROR",
        requestId: "req-test",
      }),
    ]);
  });

  it("starts clean when a previous processing row is stale", async () => {
    mocks.getSession.mockResolvedValue({
      status: "processing",
      createdAt: now,
      updatedAt: now,
      expiresAt,
      report: null,
      error: null,
      questionCount: 0,
    });
    mocks.isProcessingStale.mockReturnValue(true);

    const response = await POST(uploadRequest(payload));
    await eventsOf(response);

    expect(mocks.deleteChunksForSession).toHaveBeenCalledWith(sessionId);
    expect(mocks.startSession).toHaveBeenCalledWith(sessionId);
    expect(mocks.ingestReport).toHaveBeenCalled();
  });

  it("does not leak another session id into the ingest call", async () => {
    await eventsOf(await POST(uploadRequest(payload, { sessionId: otherSessionId })));

    expect(mocks.ingestReport).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: otherSessionId }),
    );
    expect(mocks.markSessionReady).toHaveBeenCalledWith(
      otherSessionId,
      expect.anything(),
    );
  });
});
