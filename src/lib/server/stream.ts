import "server-only";

const encoder = new TextEncoder();

const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export function encodeNdjson(event: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

export function ndjsonResponse(
  stream: ReadableStream<Uint8Array>,
): Response {
  return new Response(stream, {
    status: 200,
    headers: NDJSON_HEADERS,
  });
}

/** A one-event NDJSON response, used by the de-duplicated upload path. */
export function ndjsonLineResponse(event: unknown): Response {
  const body = encodeNdjson(event);
  return new Response(body.buffer as ArrayBuffer, {
    status: 200,
    headers: NDJSON_HEADERS,
  });
}
