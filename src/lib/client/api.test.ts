import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  chatFetch,
  readNdjson,
  toAppErrorData,
} from "./api";
import { encodeNdjson } from "@/lib/server/stream";
import { AppError } from "@/lib/shared/errors";

function responseFromChunks(chunks: string[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    }),
    { status: 200 },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readNdjson", () => {
  it("parses events across chunk boundaries and a final line without a newline", async () => {
    const events: Array<{ type: string; value?: number }> = [];
    const body = `${JSON.stringify({ type: "stage", value: 1 })}\n${JSON.stringify(
      { type: "done", value: 2 },
    )}`;

    await readNdjson<{ type: string; value?: number }>(
      responseFromChunks([body.slice(0, 12), body.slice(12)]),
      (event) => {
        events.push(event);
      },
    );

    expect(events).toEqual([
      { type: "stage", value: 1 },
      { type: "done", value: 2 },
    ]);
  });

  it("rejects malformed NDJSON with a safe API error", async () => {
    await expect(
      readNdjson(responseFromChunks(["{not json}\n"]), () => undefined),
    ).rejects.toMatchObject({
      name: "ApiError",
      code: "INTERNAL",
      retryable: true,
    });
  });

  it("rejects a response with no body", async () => {
    const response = new Response(null, { status: 204 });
    await expect(readNdjson(response, () => undefined)).rejects.toMatchObject({
      code: "INTERNAL",
    });
  });

  it("accepts a server-generated NDJSON line", async () => {
    const events: unknown[] = [];
    const response = new Response(
      encodeNdjson({ type: "done" }).buffer as ArrayBuffer,
      { status: 200 },
    );

    await readNdjson<unknown>(response, (event) => {
      events.push(event);
    });

    expect(events).toEqual([{ type: "done" }]);
  });
});

describe("chatFetch", () => {
  it("returns successful responses unchanged", async () => {
    const response = new Response("ok", { status: 200 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(chatFetch("/api/chat")).resolves.toBe(response);
  });

  it("maps non-2xx JSON errors to ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "QUOTA_EXHAUSTED",
              message: "Daily quota exhausted.",
              retryable: false,
              requestId: "req-1",
            },
          }),
          { status: 429, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(chatFetch("/api/chat")).rejects.toMatchObject({
      name: "ApiError",
      code: "QUOTA_EXHAUSTED",
      message: "Daily quota exhausted.",
      requestId: "req-1",
      retryable: false,
      status: 429,
    });
  });

  it("maps an unreadable error response to INTERNAL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not json", { status: 502 })),
    );

    await expect(chatFetch("/api/chat")).rejects.toMatchObject({
      code: "INTERNAL",
      status: 502,
    });
  });

  it("maps network failures to NETWORK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(chatFetch("/api/chat")).rejects.toMatchObject({
      code: "NETWORK",
      retryable: true,
      status: 0,
    });
  });

  it("does not hide an aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    const abortError = new DOMException("Aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(
      chatFetch("/api/chat", { signal: controller.signal }),
    ).rejects.toBe(abortError);
  });
});

describe("toAppErrorData", () => {
  it("preserves ApiError and AppError details", () => {
    expect(
      toAppErrorData(
        new ApiError({
          code: "RATE_LIMITED",
          message: "Too many requests.",
          retryable: true,
          status: 429,
          requestId: "req-2",
        }),
      ),
    ).toEqual({
      code: "RATE_LIMITED",
      message: "Too many requests.",
      retryable: true,
      requestId: "req-2",
    });

    expect(toAppErrorData(new AppError("SESSION_ENDED"))).toEqual({
      code: "SESSION_ENDED",
      message: "This session has ended. Start a new session.",
      retryable: false,
    });
  });

  it("never leaks unknown errors", () => {
    expect(toAppErrorData(new Error("raw provider text"))).toEqual({
      code: "INTERNAL",
      message: "Something went wrong. Please try again.",
      retryable: true,
    });
  });
});
