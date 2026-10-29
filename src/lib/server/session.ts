import "server-only";

import { AppError, isAppError } from "@/lib/shared/errors";
import { SESSION_TTL_MS, STALE_UPLOAD_MS } from "@/lib/shared/limits";
import type { ReportSummary } from "@/lib/shared/types";

import {
  getChunksCollection,
  getSessionsCollection,
  type ServerSessionReport,
  type SessionDocument,
} from "./db";
import { logError } from "./log";

export type ReadyReport = ReportSummary & { sha256: string };

/**
 * Start a fresh upload for this session. Existing rows are reset, but
 * `createdAt` and `questionCount` are preserved when the session already exists.
 */
export async function startSession(
  sessionId: string,
): Promise<SessionDocument> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const sessions = await getSessionsCollection();

  const session = await sessions.findOneAndUpdate(
    { _id: sessionId },
    {
      $set: {
        status: "processing",
        updatedAt: now,
        expiresAt,
        report: null,
        error: null,
      },
      $setOnInsert: {
        createdAt: now,
        questionCount: 0,
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  if (!session) {
    throw new AppError("INTERNAL", {
      message: "We couldn't start this session. Please try again.",
    });
  }

  return session;
}

/**
 * Return a live session, or null when it is missing or past its fixed TTL.
 */
export async function getSession(
  sessionId: string,
): Promise<SessionDocument | null> {
  const sessions = await getSessionsCollection();
  const session = await sessions.findOne({ _id: sessionId });

  if (!session || session.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  return session;
}

export async function markSessionReady(
  sessionId: string,
  report: ReadyReport,
): Promise<ServerSessionReport> {
  const now = new Date();
  const storedReport: ServerSessionReport = {
    ...report,
    indexedAt: now,
  };
  const sessions = await getSessionsCollection();

  const result = await sessions.updateOne(
    { _id: sessionId, expiresAt: { $gt: now } },
    {
      $set: {
        status: "ready",
        report: storedReport,
        error: null,
        updatedAt: now,
      },
    },
  );

  if (result.matchedCount === 0) {
    throw new AppError("SESSION_ENDED");
  }

  return storedReport;
}

export async function markSessionError(
  sessionId: string,
  code: string,
  message: string,
): Promise<void> {
  const sessions = await getSessionsCollection();

  await sessions.updateOne(
    { _id: sessionId },
    {
      $set: {
        status: "error",
        report: null,
        error: { code, message },
        updatedAt: new Date(),
      },
    },
  );
}

export async function deleteChunksForReport(
  sessionId: string,
  reportHash: string,
): Promise<void> {
  const chunks = await getChunksCollection();
  await chunks.deleteMany({ sessionId, reportHash });
}

export async function deleteChunksForSession(
  sessionId: string,
): Promise<void> {
  const chunks = await getChunksCollection();
  await chunks.deleteMany({ sessionId });
}

/**
 * Delete chunks first, then the session. The short TTL remains the backstop if
 * this fails partway through.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await deleteChunksForSession(sessionId);

  const sessions = await getSessionsCollection();
  await sessions.deleteOne({ _id: sessionId });
}

export async function endSessionBestEffort(
  sessionId: string,
  requestId: string,
): Promise<void> {
  try {
    await deleteSession(sessionId);
  } catch (error) {
    logError({
      requestId,
      route: "session",
      stage: "end",
      errorCode: isAppError(error) ? error.code : "INTERNAL",
    });
  }
}

export async function incrementQuestionCount(
  sessionId: string,
): Promise<void> {
  const sessions = await getSessionsCollection();
  const result = await sessions.updateOne(
    { _id: sessionId },
    {
      $inc: { questionCount: 1 },
      $set: { updatedAt: new Date() },
    },
  );

  if (result.matchedCount === 0) {
    throw new AppError("SESSION_ENDED");
  }
}

export function isProcessingStale(session: SessionDocument): boolean {
  return (
    session.status === "processing" &&
    Date.now() - session.updatedAt.getTime() > STALE_UPLOAD_MS
  );
}
