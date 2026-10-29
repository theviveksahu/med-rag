import { setTimeout as delay } from "node:timers/promises";

import {
  AppError,
  isAppError,
  toErrorPayload,
} from "@/lib/shared/errors";
import {
  INDEX_LAG_MS,
  UPLOAD_BODY_LIMIT_BYTES,
} from "@/lib/shared/limits";
import {
  sessionIdSchema,
  uploadRequestSchema,
} from "@/lib/shared/schemas";
import type { ReportSummary, UploadEvent } from "@/lib/shared/types";
import { mapProviderError } from "@/lib/server/errors";
import {
  ingestReport,
  prepareReport,
  sanitizeFilename,
} from "@/lib/server/ingest";
import { logError, logEvent, logWarning, newRequestId } from "@/lib/server/log";
import {
  deleteChunksForReport,
  deleteChunksForSession,
  getSession,
  isProcessingStale,
  markSessionError,
  markSessionReady,
  startSession,
} from "@/lib/server/session";
import {
  encodeNdjson,
  ndjsonLineResponse,
  ndjsonResponse,
} from "@/lib/server/stream";

export const maxDuration = 300;

const MAX_BODY_BYTES = UPLOAD_BODY_LIMIT_BYTES;

type BodyReadResult =
  | { ok: true; text: string }
  | { ok: false; reason: "too_large" };

interface UploadTarget {
  createdAt: Date;
  expiresAt: Date;
}

function errorResponse(error: AppError, requestId: string): Response {
  return Response.json(toErrorPayload(error, error.code, requestId), {
    status: error.status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function readBodyWithLimit(request: Request): Promise<BodyReadResult> {
  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }

      text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();
    return { ok: true, text };
  } finally {
    reader.releaseLock();
  }
}

function reportSummary(
  report: {
    filename: string;
    pageCount: number;
    chunkCount: number;
    sizeBytes: number;
  },
): ReportSummary {
  return {
    filename: report.filename,
    pageCount: report.pageCount,
    chunkCount: report.chunkCount,
    sizeBytes: report.sizeBytes,
  };
}

async function resolveUploadTarget(
  sessionId: string,
  reportHash: string,
  requestId: string,
): Promise<
  | { type: "reused"; report: ReportSummary }
  | { type: "proceed"; target: UploadTarget }
> {
  const existing = await getSession(sessionId);

  if (existing?.status === "ready" && existing.report?.sha256 === reportHash) {
    return {
      type: "reused",
      report: reportSummary(existing.report),
    };
  }

  if (
    existing?.status === "processing" &&
    !isProcessingStale(existing)
  ) {
    throw new AppError("UPLOAD_IN_PROGRESS", { requestId });
  }

  // A stale processing row, a failed upload, a different report, or a missing
  // session all begin from a clean chunk set.
  await deleteChunksForSession(sessionId);
  const session = await startSession(sessionId);

  return {
    type: "proceed",
    target: {
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    },
  };
}

function createUploadStream(params: {
  request: Request;
  requestId: string;
  startedAt: number;
  sessionId: string;
  reportHash: string;
  filename: string;
  fileSize: number;
  pageCount: number;
  pages: Array<{ page: number; text: string }>;
  target: UploadTarget;
}): Response {
  const {
    request,
    requestId,
    startedAt,
    sessionId,
    reportHash,
    filename,
    fileSize,
    pageCount,
    pages,
    target,
  } = params;

  const abortController = new AbortController();
  const onRequestAbort = () => abortController.abort();

  if (request.signal.aborted) {
    abortController.abort();
  } else {
    request.signal.addEventListener("abort", onRequestAbort, { once: true });
  }

  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let readyCommitted = false;

      const emit = (event: UploadEvent): boolean => {
        if (closed) return false;

        try {
          controller.enqueue(encodeNdjson(event));
          return true;
        } catch {
          closed = true;
          abortController.abort();
          return false;
        }
      };

      const emitOrAbort = (event: UploadEvent): void => {
        if (!emit(event)) {
          throw new DOMException("Upload stream closed.", "AbortError");
        }
      };

      const cleanupReport = async (): Promise<void> => {
        await deleteChunksForReport(sessionId, reportHash).catch(
          () => undefined,
        );
      };

      try {
        if (abortController.signal.aborted) {
          await cleanupReport();
          return;
        }

        const result = await ingestReport({
          sessionId,
          reportHash,
          filename,
          pages,
          createdAt: target.createdAt,
          expiresAt: target.expiresAt,
          signal: abortController.signal,
          onPrepared: (chunkCount) => {
            emitOrAbort({
              type: "stage",
              stage: "preparing",
              message: `Preparing ${chunkCount} sections…`,
              current: chunkCount,
              total: chunkCount,
            });
          },
          onProgress: ({ current, total, progress }) => {
            emitOrAbort({
              type: "stage",
              stage: "embedding",
              message: `Indexing ${current} of ${total} sections…`,
              current,
              total,
              progress,
            });
          },
        });

        emitOrAbort({
          type: "stage",
          stage: "finalizing",
          message: "Finishing up…",
        });

        // Atlas Search is near-real-time. Give the final insert a short window
        // before marking the session ready and releasing the chat UI.
        await delay(INDEX_LAG_MS, undefined, {
          signal: abortController.signal,
        });

        if (abortController.signal.aborted) {
          await cleanupReport();
          return;
        }

        const report: ReportSummary = {
          filename,
          pageCount,
          chunkCount: result.chunkCount,
          sizeBytes: fileSize,
        };

        await markSessionReady(sessionId, {
          ...report,
          sha256: reportHash,
        });

        readyCommitted = true;

        emitOrAbort({
          type: "done",
          report,
          reused: false,
        });

        logEvent({
          requestId,
          route: "upload",
          stage: "done",
          durationMs: Date.now() - startedAt,
          pageCount,
          chunkCount: result.chunkCount,
          reused: false,
        });
      } catch (error) {
        // A disconnect after ready is committed leaves a valid report behind;
        // the pagehide beacon (or TTL) owns cleanup from here.
        if (readyCommitted) return;

        if (abortController.signal.aborted) {
          await cleanupReport();
          logWarning({
            requestId,
            route: "upload",
            stage: "aborted",
            durationMs: Date.now() - startedAt,
          });
          return;
        }

        const appError = isAppError(error)
          ? error
          : mapProviderError(error);

        await cleanupReport();
        await markSessionError(
          sessionId,
          appError.code,
          appError.message,
        ).catch(() => undefined);

        emit({
          type: "error",
          code: appError.code,
          message: appError.message,
          requestId,
        });

        logError({
          requestId,
          route: "upload",
          stage: "ingest",
          errorCode: appError.code,
          durationMs: Date.now() - startedAt,
        });
      } finally {
        request.signal.removeEventListener("abort", onRequestAbort);

        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // The client may have cancelled between the last check and close.
          }
        }
      }
    },

    cancel() {
      closed = true;
      abortController.abort();
      request.signal.removeEventListener("abort", onRequestAbort);
    },
  });

  return ndjsonResponse(stream);
}

/**
 * Accept extracted PDF text only. The PDF bytes are parsed in the browser and
 * never uploaded; this route persists normalized chunks and embeddings.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();
  const startedAt = Date.now();

  try {
    const sessionIdResult = sessionIdSchema.safeParse(
      request.headers.get("x-session-id"),
    );

    if (!sessionIdResult.success) {
      return errorResponse(new AppError("INVALID_SESSION_ID"), requestId);
    }

    const sessionId = sessionIdResult.data;
    const contentLength = request.headers.get("content-length");

    if (contentLength) {
      const declaredBytes = Number(contentLength);
      if (
        Number.isFinite(declaredBytes) &&
        declaredBytes > MAX_BODY_BYTES
      ) {
        return errorResponse(new AppError("PAYLOAD_TOO_LARGE"), requestId);
      }
    }

    const body = await readBodyWithLimit(request);
    if (!body.ok) {
      return errorResponse(new AppError("PAYLOAD_TOO_LARGE"), requestId);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body.text);
    } catch {
      return errorResponse(new AppError("INVALID_PAYLOAD"), requestId);
    }

    const parsed = uploadRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return errorResponse(new AppError("INVALID_PAYLOAD"), requestId);
    }

    const input = parsed.data;
    const filename = sanitizeFilename(input.filename);
    const { reportHash } = prepareReport(input.pages);
    const resolved = await resolveUploadTarget(
      sessionId,
      reportHash,
      requestId,
    );

    if (resolved.type === "reused") {
      logEvent({
        requestId,
        route: "upload",
        stage: "dedupe",
        durationMs: Date.now() - startedAt,
        pageCount: resolved.report.pageCount,
        chunkCount: resolved.report.chunkCount,
        reused: true,
      });

      return ndjsonLineResponse({
        type: "done",
        report: resolved.report,
        reused: true,
      });
    }

    return createUploadStream({
      request,
      requestId,
      startedAt,
      sessionId,
      reportHash,
      filename,
      fileSize: input.fileSize,
      pageCount: input.pageCount,
      pages: input.pages,
      target: resolved.target,
    });
  } catch (error) {
    const appError = isAppError(error) ? error : mapProviderError(error);

    if (appError.code === "UPLOAD_IN_PROGRESS") {
      logWarning({
        requestId,
        route: "upload",
        stage: "dedupe",
        errorCode: appError.code,
        durationMs: Date.now() - startedAt,
      });
    } else {
      logError({
        requestId,
        route: "upload",
        stage: "request",
        errorCode: appError.code,
        durationMs: Date.now() - startedAt,
      });
    }

    return errorResponse(appError, requestId);
  }
}
