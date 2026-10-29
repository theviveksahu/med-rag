import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildAgent: vi.fn(),
  getSession: vi.fn(),
  incrementQuestionCount: vi.fn(),
}));

vi.mock("@/lib/server/agent", () => ({
  buildAgent: mocks.buildAgent,
}));

vi.mock("@/lib/server/session", () => ({
  getSession: mocks.getSession,
  incrementQuestionCount: mocks.incrementQuestionCount,
}));

vi.mock("@/lib/server/log", () => ({
  logError: vi.fn(),
  logEvent: vi.fn(),
  newRequestId: () => "req-chat-test",
}));

import { POST } from "./route";

const sessionId = "123e4567-e89b-42d3-a456-426614174000";
const now = new Date("2026-10-28T00:00:00.000Z");
const expiresAt = new Date("2026-10-29T00:00:00.000Z");

const readySession = {
  _id: sessionId,
  status: "ready",
  createdAt: now,
  updatedAt: now,
  expiresAt,
  report: {
    filename: "synthetic.pdf",
    pageCount: 1,
    chunkCount: 1,
    sizeBytes: 100,
    sha256: "a".repeat(64),
    indexedAt: now,
  },
  error: null,
  questionCount: 0,
};

const userMessage = {
  id: "m1",
  role: "user",
  parts: [{ type: "text", text: "What does hemoglobin mean?" }],
};

function chatRequest(
  body: unknown,
  options: { sessionId?: string | null; rawBody?: string } = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.sessionId !== null) {
    headers["x-session-id"] = options.sessionId ?? sessionId;
  }

  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers,
    body: options.rawBody ?? JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(readySession);
  mocks.incrementQuestionCount.mockResolvedValue(1);
});

describe("POST /api/chat preflight", () => {
  it("rejects an invalid session id", async () => {
    const response = await POST(
      chatRequest({ messages: [userMessage] }, { sessionId: "not-a-uuid" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_SESSION_ID", requestId: "req-chat-test" },
    });
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("returns 410 when the session is missing or expired", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await POST(chatRequest({ messages: [userMessage] }));

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SESSION_ENDED" },
    });
  });

  it("returns 409 until the report is ready", async () => {
    mocks.getSession.mockResolvedValue({
      ...readySession,
      status: "processing",
      report: null,
    });

    const response = await POST(chatRequest({ messages: [userMessage] }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SESSION_NOT_READY" },
    });
  });

  it("rejects malformed JSON and non-message bodies", async () => {
    const malformed = await POST(
      chatRequest(null, { rawBody: "{" }),
    );
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({
      error: { code: "INVALID_MESSAGES" },
    });

    const invalid = await POST(chatRequest({ messages: [] }));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: "INVALID_MESSAGES" },
    });
  });

  it("enforces the conversation length cap before agent construction", async () => {
    const messages = Array.from({ length: 41 }, (_, index) => ({
      id: `m${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      parts: [{ type: "text", text: `message ${index}` }],
    }));

    const response = await POST(chatRequest({ messages }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CONVERSATION_TOO_LONG" },
    });
    expect(mocks.buildAgent).not.toHaveBeenCalled();
  });

  it("requires the last message to be user text", async () => {
    const response = await POST(
      chatRequest({
        messages: [
          userMessage,
          {
            id: "m2",
            role: "assistant",
            parts: [{ type: "text", text: "A previous answer." }],
          },
        ],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_MESSAGES" },
    });
    expect(mocks.incrementQuestionCount).not.toHaveBeenCalled();
    expect(mocks.buildAgent).not.toHaveBeenCalled();
  });
});
