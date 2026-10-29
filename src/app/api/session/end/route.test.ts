import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  endSessionBestEffort: vi.fn(),
}));

vi.mock("@/lib/server/session", () => ({
  endSessionBestEffort: mocks.endSessionBestEffort,
}));

vi.mock("@/lib/server/log", () => ({
  logError: vi.fn(),
  logEvent: vi.fn(),
  newRequestId: () => "req-end-test",
}));

import { POST } from "./route";

const sessionId = "123e4567-e89b-42d3-a456-426614174000";

function endRequest(
  body: string,
  options: { header?: string } = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.header) headers["x-session-id"] = options.header;

  return new Request("http://localhost/api/session/end", {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.endSessionBestEffort.mockResolvedValue(undefined);
});

describe("POST /api/session/end", () => {
  it("deletes the session from a JSON body and returns 204", async () => {
    const response = await POST(
      endRequest(JSON.stringify({ sessionId })),
    );

    expect(response.status).toBe(204);
    expect(mocks.endSessionBestEffort).toHaveBeenCalledWith(
      sessionId,
      "req-end-test",
    );
  });

  it("accepts a session id header", async () => {
    const response = await POST(
      endRequest("", { header: sessionId }),
    );

    expect(response.status).toBe(204);
    expect(mocks.endSessionBestEffort).toHaveBeenCalledWith(
      sessionId,
      "req-end-test",
    );
  });

  it("silently accepts malformed or missing ids without probing", async () => {
    const malformed = await POST(endRequest("{"));
    const missing = await POST(endRequest(JSON.stringify({ sessionId: "nope" })));

    expect(malformed.status).toBe(204);
    expect(missing.status).toBe(204);
    expect(mocks.endSessionBestEffort).not.toHaveBeenCalled();
  });

  it("still returns 204 if best-effort deletion throws", async () => {
    mocks.endSessionBestEffort.mockRejectedValue(new Error("db down"));

    const response = await POST(
      endRequest(JSON.stringify({ sessionId })),
    );

    expect(response.status).toBe(204);
  });
});
