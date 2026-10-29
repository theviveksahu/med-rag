import { beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_TTL_MS, STALE_UPLOAD_MS } from "@/lib/shared/limits";
import type { SessionDocument } from "./db";

const mocks = vi.hoisted(() => ({
  getSessionsCollection: vi.fn(),
  getChunksCollection: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  getSessionsCollection: mocks.getSessionsCollection,
  getChunksCollection: mocks.getChunksCollection,
}));

vi.mock("@/lib/server/log", () => ({
  logError: mocks.logError,
}));

import {
  deleteSession,
  getSession,
  incrementQuestionCount,
  isProcessingStale,
  markSessionReady,
  startSession,
} from "./session";

const sessionId = "123e4567-e89b-42d3-a456-426614174000";

function sessionDoc(
  overrides: Partial<SessionDocument> = {},
): SessionDocument {
  return {
    _id: sessionId,
    status: "processing",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    report: null,
    error: null,
    questionCount: 0,
    ...overrides,
  };
}

function sessionsCollection(overrides: Record<string, unknown> = {}) {
  return {
    findOne: vi.fn(),
    updateOne: vi.fn(),
    deleteOne: vi.fn(),
    ...overrides,
  };
}

function chunksCollection(overrides: Record<string, unknown> = {}) {
  return {
    deleteMany: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mocks.getSessionsCollection.mockReset();
  mocks.getChunksCollection.mockReset();
  mocks.logError.mockReset();
});

describe("startSession", () => {
  it("sets a short crash-safety expiry", async () => {
    const findOneAndUpdate = vi.fn().mockResolvedValue(sessionDoc());
    const sessions = sessionsCollection({ findOneAndUpdate });
    mocks.getSessionsCollection.mockResolvedValue(sessions);

    const before = Date.now();
    await startSession(sessionId);
    const after = Date.now();

    const update = findOneAndUpdate.mock.calls[0]?.[1] as {
      $set: { expiresAt: Date };
    };
    expect(update.$set.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + SESSION_TTL_MS,
    );
    expect(update.$set.expiresAt.getTime()).toBeLessThanOrEqual(
      after + SESSION_TTL_MS,
    );
    expect(SESSION_TTL_MS).toBe(30 * 60 * 1_000);
  });
});

describe("getSession", () => {
  it("returns a live session", async () => {
    const document = sessionDoc();
    const sessions = sessionsCollection({
      findOne: vi.fn().mockResolvedValue(document),
    });
    mocks.getSessionsCollection.mockResolvedValue(sessions);

    await expect(getSession(sessionId)).resolves.toBe(document);
    expect(sessions.findOne).toHaveBeenCalledWith({ _id: sessionId });
  });

  it("returns null for a missing or expired session", async () => {
    const sessions = sessionsCollection({
      findOne: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(
        sessionDoc({ expiresAt: new Date(Date.now() - 1) }),
      ),
    });
    mocks.getSessionsCollection.mockResolvedValue(sessions);

    await expect(getSession(sessionId)).resolves.toBeNull();
    await expect(getSession(sessionId)).resolves.toBeNull();
  });
});

describe("markSessionReady", () => {
  it("stores the report and returns its server timestamp", async () => {
    const updateOne = vi.fn().mockResolvedValue({ matchedCount: 1 });
    const sessions = sessionsCollection({ updateOne });
    mocks.getSessionsCollection.mockResolvedValue(sessions);

    const report = {
      filename: "synthetic-report.pdf",
      pageCount: 1,
      chunkCount: 4,
      sizeBytes: 1_400,
      sha256: "a".repeat(64),
    };
    const stored = await markSessionReady(sessionId, report);

    expect(stored).toMatchObject(report);
    expect(stored.indexedAt).toBeInstanceOf(Date);
    expect(updateOne).toHaveBeenCalledWith(
      { _id: sessionId, expiresAt: { $gt: expect.any(Date) } },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "ready",
          report: stored,
          error: null,
        }),
      }),
    );
  });

  it("rejects when the session has ended", async () => {
    const sessions = sessionsCollection({
      updateOne: vi.fn().mockResolvedValue({ matchedCount: 0 }),
    });
    mocks.getSessionsCollection.mockResolvedValue(sessions);

    await expect(
      markSessionReady(sessionId, {
        filename: "report.pdf",
        pageCount: 1,
        chunkCount: 1,
        sizeBytes: 100,
        sha256: "b".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "SESSION_ENDED" });
  });
});

describe("deleteSession", () => {
  it("deletes chunks before the session row", async () => {
    const calls: string[] = [];
    const chunks = chunksCollection({
      deleteMany: vi.fn().mockImplementation(async () => {
        calls.push("chunks");
      }),
    });
    const sessions = sessionsCollection({
      deleteOne: vi.fn().mockImplementation(async () => {
        calls.push("session");
      }),
    });
    mocks.getChunksCollection.mockResolvedValue(chunks);
    mocks.getSessionsCollection.mockResolvedValue(sessions);

    await deleteSession(sessionId);

    expect(chunks.deleteMany).toHaveBeenCalledWith({ sessionId });
    expect(sessions.deleteOne).toHaveBeenCalledWith({ _id: sessionId });
    expect(calls).toEqual(["chunks", "session"]);
  });
});

describe("incrementQuestionCount", () => {
  it("rejects when the session no longer exists", async () => {
    const sessions = sessionsCollection({
      updateOne: vi.fn().mockResolvedValue({ matchedCount: 0 }),
    });
    mocks.getSessionsCollection.mockResolvedValue(sessions);

    await expect(incrementQuestionCount(sessionId)).rejects.toMatchObject({
      code: "SESSION_ENDED",
    });
  });

  it("increments an existing session", async () => {
    const updateOne = vi.fn().mockResolvedValue({ matchedCount: 1 });
    const sessions = sessionsCollection({ updateOne });
    mocks.getSessionsCollection.mockResolvedValue(sessions);

    await incrementQuestionCount(sessionId);

    expect(updateOne).toHaveBeenCalledWith(
      { _id: sessionId },
      expect.objectContaining({
        $inc: { questionCount: 1 },
      }),
    );
  });
});

describe("isProcessingStale", () => {
  it("only marks old processing sessions as stale", () => {
    expect(
      isProcessingStale(
        sessionDoc({
          status: "processing",
          updatedAt: new Date(Date.now() - STALE_UPLOAD_MS - 1),
        }),
      ),
    ).toBe(true);

    expect(
      isProcessingStale(
        sessionDoc({
          status: "processing",
          updatedAt: new Date(),
        }),
      ),
    ).toBe(false);

    expect(
      isProcessingStale(
        sessionDoc({
          status: "ready",
          updatedAt: new Date(Date.now() - STALE_UPLOAD_MS - 1),
        }),
      ),
    ).toBe(false);
  });
});
