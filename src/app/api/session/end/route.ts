import { isAppError } from "@/lib/shared/errors";
import { sessionIdSchema } from "@/lib/shared/schemas";
import { logError, logEvent, newRequestId } from "@/lib/server/log";
import { endSessionBestEffort } from "@/lib/server/session";

// Next 16 with `cacheComponents` rejects the `runtime`/`dynamic` segment
// config for route handlers. Route handlers use the Node.js runtime by default.
export const maxDuration = 30;

const MAX_BODY_BYTES = 8_192;

function noContent(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

async function readSmallBody(request: Request): Promise<string | null> {
  if (!request.body) return null;

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
        await reader.cancel();
        return null;
      }

      text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

function sessionIdFromBody(body: string): unknown {
  try {
    const parsed: unknown = JSON.parse(body);

    if (parsed && typeof parsed === "object" && "sessionId" in parsed) {
      return (parsed as { sessionId?: unknown }).sessionId;
    }
  } catch {
    // Invalid JSON is treated as an invalid session id: still a 204.
  }

  return undefined;
}

/**
 * Best-effort session deletion for refresh, tab close, and explicit resets.
 * Invalid or missing ids are accepted silently so the endpoint cannot be used
 * to probe for sessions.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();

  try {
    const header = request.headers.get("x-session-id");
    let raw: unknown = header ?? undefined;

    if (!sessionIdSchema.safeParse(raw).success) {
      const body = await readSmallBody(request);
      if (body) raw = sessionIdFromBody(body);
    }

    const parsed = sessionIdSchema.safeParse(raw);
    if (!parsed.success) {
      return noContent();
    }

    await endSessionBestEffort(parsed.data, requestId);
    logEvent({ requestId, route: "session", stage: "end" });

    return noContent();
  } catch (error) {
    logError({
      requestId,
      route: "session",
      stage: "end",
      errorCode: isAppError(error) ? error.code : "INTERNAL",
    });

    return noContent();
  }
}
