import { ERROR_CATALOG, isAppError } from "@/lib/shared/errors";
import type { UploadRequest } from "@/lib/shared/schemas";
import type { AppErrorData, UploadEvent } from "@/lib/shared/types";

export interface ApiErrorInit {
  code: string;
  message: string;
  requestId?: string;
  retryable: boolean;
  status: number;
}

export class ApiError extends Error {
  readonly code: string;
  readonly requestId: string | undefined;
  readonly retryable: boolean;
  readonly status: number;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = "ApiError";
    this.code = init.code;
    this.requestId = init.requestId;
    this.retryable = init.retryable;
    this.status = init.status;
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }

    const error = isRecord(payload) ? payload.error : undefined;

    if (isRecord(error)) {
      return new ApiError({
        code: typeof error.code === "string" ? error.code : "INTERNAL",
        message:
          typeof error.message === "string"
            ? error.message
            : ERROR_CATALOG.INTERNAL.message,
        requestId:
          typeof error.requestId === "string" ? error.requestId : undefined,
        retryable:
          typeof error.retryable === "boolean"
            ? error.retryable
            : ERROR_CATALOG.INTERNAL.retryable,
        status: response.status,
      });
    }

    return new ApiError({
      code: "INTERNAL",
      message: ERROR_CATALOG.INTERNAL.message,
      retryable: ERROR_CATALOG.INTERNAL.retryable,
      status: response.status,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function toAppErrorData(error: unknown): AppErrorData {
  if (error instanceof ApiError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.requestId ? { requestId: error.requestId } : {}),
    };
  }

  if (isAppError(error)) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.requestId ? { requestId: error.requestId } : {}),
    };
  }

  return {
    code: "INTERNAL",
    message: ERROR_CATALOG.INTERNAL.message,
    retryable: ERROR_CATALOG.INTERNAL.retryable,
  };
}

/**
 * Read an NDJSON response incrementally. The upload route returns a single
 * done event for a reused report and a stream for a fresh ingest.
 */
export async function readNdjson<T>(
  response: Response,
  onEvent: (event: T) => void,
): Promise<void> {
  if (!response.body) {
    throw new ApiError({
      code: "INTERNAL",
      message: "The server returned an empty response. Please try again.",
      retryable: true,
      status: response.status,
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);

        if (line) parseLine(line, onEvent);
        newline = buffer.indexOf("\n");
      }
    }

    buffer += decoder.decode();
    const finalLine = buffer.trim();
    if (finalLine) parseLine(finalLine, onEvent);
  } finally {
    reader.releaseLock();
  }
}

function parseLine<T>(line: string, onEvent: (event: T) => void): void {
  try {
    onEvent(JSON.parse(line) as T);
  } catch (error) {
    if (error instanceof ApiError) throw error;

    throw new ApiError({
      code: "INTERNAL",
      message: "We couldn't read the upload progress. Please try again.",
      retryable: true,
      status: 502,
    });
  }
}

/**
 * Fetch wrapper for the chat transport. Non-2xx responses are parsed into the
 * same safe ApiError shape used by upload, so useChat can show a useful banner
 * without exposing provider payloads.
 */
export const chatFetch: typeof fetch = async (input, init) => {
  let response: Response;

  try {
    response = await fetch(input, init);
  } catch (error) {
    if (init?.signal?.aborted) throw error;

    throw new ApiError({
      code: "NETWORK",
      message: ERROR_CATALOG.NETWORK.message,
      retryable: true,
      status: 0,
    });
  }

  if (!response.ok) {
    throw await ApiError.fromResponse(response);
  }

  return response;
};

export async function postUpload(options: {
  sessionId: string;
  payload: UploadRequest;
  signal?: AbortSignal;
  onEvent: (event: UploadEvent) => void;
}): Promise<void> {
  let response: Response;

  try {
    response = await fetch("/api/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": options.sessionId,
      },
      body: JSON.stringify(options.payload),
      cache: "no-store",
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;

    throw new ApiError({
      code: "NETWORK",
      message: ERROR_CATALOG.NETWORK.message,
      retryable: true,
      status: 0,
    });
  }

  if (!response.ok) {
    throw await ApiError.fromResponse(response);
  }

  await readNdjson<UploadEvent>(response, options.onEvent);
}

/** Best-effort session deletion; the server's short TTL is the backstop. */
export async function postSessionEnd(
  sessionId: string,
  options: { keepalive?: boolean; signal?: AbortSignal } = {},
): Promise<void> {
  try {
    await fetch("/api/session/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
      cache: "no-store",
      keepalive: options.keepalive,
      signal: options.signal,
    });
  } catch {
    // Best effort. Never surface session ids or network details to the UI.
  }
}
