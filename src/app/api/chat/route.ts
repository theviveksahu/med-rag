import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
  type InferUIMessageChunk,
  type UIMessage,
} from "ai";
import { toBaseMessages, toUIMessageStream } from "@ai-sdk/langchain";

import { AppError, toErrorPayload } from "@/lib/shared/errors";
import { isRecord } from "@/lib/shared/guards";
import { MAX_CHAT_MESSAGES } from "@/lib/shared/limits";
import { sessionIdSchema } from "@/lib/shared/schemas";
import type {
  AppErrorData,
  CustomDataMessage,
} from "@/lib/shared/types";
import { buildAgent } from "@/lib/server/agent";
import { mapProviderError } from "@/lib/server/errors";
import { logError, logEvent, newRequestId } from "@/lib/server/log";
import type { EmitData } from "@/lib/server/search-tool";
import {
  getSession,
  incrementQuestionCount,
} from "@/lib/server/session";

export const maxDuration = 300;

const MAX_BODY_BYTES = 1_000_000;

function jsonError(
  error: AppError,
  requestId: string,
): Response {
  return Response.json(toErrorPayload(error, error.code, requestId), {
    status: error.status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function appErrorData(error: unknown, requestId: string): AppErrorData {
  const appError = mapProviderError(error);

  return {
    code: appError.code,
    message: appError.message,
    retryable: appError.retryable,
    requestId: appError.requestId ?? requestId,
  };
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new AppError("INVALID_MESSAGES");
  }

  if (!request.body) {
    throw new AppError("INVALID_MESSAGES");
  }

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
        throw new AppError("INVALID_MESSAGES");
      }

      text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("INVALID_MESSAGES");
  }
}

const VISIBLE_TOOL_NAMES = new Set(["search_report", "task"]);

function extractContentValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return undefined;

  for (const part of value) {
    if (typeof part === "string") return part;
    if (
      isRecord(part) &&
      part.type === "text" &&
      typeof part.text === "string"
    ) {
      return part.text;
    }
  }

  return undefined;
}

function extractToolContent(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return undefined;

  const kwargs = value.kwargs;
  if (isRecord(kwargs)) {
    const content = extractContentValue(kwargs.content);
    if (content) return content;
  }

  return extractContentValue(value.content);
}

function taskSummary(output: unknown): string {
  if (isRecord(output) && Array.isArray(output.messages)) {
    for (let index = output.messages.length - 1; index >= 0; index -= 1) {
      const summary = extractToolContent(output.messages[index]);
      if (summary) return summary;
    }
  }

  return extractToolContent(output) ?? "Analysis completed.";
}

function searchSummary(output: unknown): string {
  return extractToolContent(output) ?? "Search completed.";
}

function safeErrorMessage(errorText: string): string {
  return mapProviderError(new Error(errorText)).message;
}

function hasUserText(message: UIMessage): boolean {
  return message.parts.some(
    (part) => part.type === "text" && part.text.trim().length > 0,
  );
}

/**
 * Keep only model-relevant parts. Data parts are UI trace/error state, and
 * file/source parts are not accepted from the client because the report is
 * already indexed. Tool parts remain so the conversation can be replayed.
 */
function stripUiOnlyParts(message: UIMessage): UIMessage {
  return {
    ...message,
    parts: message.parts.filter(
      (part) =>
        part.type === "text" ||
        part.type.startsWith("tool-") ||
        part.type === "dynamic-tool",
    ),
  };
}

export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();
  const startedAt = Date.now();

  try {
    const sessionIdResult = sessionIdSchema.safeParse(
      request.headers.get("x-session-id"),
    );
    if (!sessionIdResult.success) {
      throw new AppError("INVALID_SESSION_ID");
    }
    const sessionId = sessionIdResult.data;

    const session = await getSession(sessionId);
    if (!session) {
      throw new AppError("SESSION_ENDED");
    }
    if (session.status !== "ready" || !session.report) {
      throw new AppError("SESSION_NOT_READY");
    }

    const body = await readJsonBody(request);
    if (!isRecord(body) || !Array.isArray(body.messages)) {
      throw new AppError("INVALID_MESSAGES");
    }
    if (body.messages.length === 0) {
      throw new AppError("INVALID_MESSAGES");
    }
    if (body.messages.length > MAX_CHAT_MESSAGES) {
      throw new AppError("CONVERSATION_TOO_LONG");
    }

    const validated = await safeValidateUIMessages({
      messages: body.messages,
    });
    if (!validated.success) {
      throw new AppError("INVALID_MESSAGES");
    }

    if (
      validated.data.some(
        (message) => message.role !== "user" && message.role !== "assistant",
      )
    ) {
      throw new AppError("INVALID_MESSAGES");
    }

    const history = validated.data
      .map(stripUiOnlyParts)
      .filter((message) => message.parts.length > 0);

    const lastMessage = history.at(-1);
    if (
      !lastMessage ||
      lastMessage.role !== "user" ||
      !hasUserText(lastMessage)
    ) {
      throw new AppError("INVALID_MESSAGES");
    }

    let langchainMessages: Awaited<ReturnType<typeof toBaseMessages>>;
    try {
      langchainMessages = await toBaseMessages(history);
    } catch {
      throw new AppError("INVALID_MESSAGES");
    }

    // The count is informational only; there is no per-session question cap.
    await incrementQuestionCount(sessionId);
    logEvent({ requestId, route: "chat", stage: "start" });

    const stream = createUIMessageStream<CustomDataMessage>({
      execute: async ({ writer }) => {
        const emit: EmitData = (part) => writer.write(part);

        try {
          const agent = buildAgent({
            sessionId,
            emit,
            signal: request.signal,
          });
          const agentStream = await agent.stream(
            { messages: langchainMessages },
            {
              streamMode: ["values", "messages", "tools"],
              signal: request.signal,
            },
          );

          let mappedStreamError: AppError | undefined;
          const uiStream = toUIMessageStream(agentStream, {
            onError: (error) => {
              mappedStreamError = mapProviderError(error);
              logError({
                requestId,
                route: "chat",
                stage: "stream",
                errorCode: mappedStreamError.code,
              });
              emit({
                type: "data-error",
                data: appErrorData(mappedStreamError, requestId),
              });
            },
          }) as ReadableStream<InferUIMessageChunk<CustomDataMessage>>;

          let writingEmitted = false;
          const toolNamesByCallId = new Map<string, string>();
          const emittedToolOutputs = new Set<string>();
          const emittedToolInputs = new Set<string>();
          const seenToolInputStarts = new Set<string>();
          const pendingTaskCalls = new Set<string>();
          const suppressedTextIds = new Set<string>();

          const safeStream = uiStream.pipeThrough(
            new TransformStream<
              InferUIMessageChunk<CustomDataMessage>,
              InferUIMessageChunk<CustomDataMessage>
            >({
              transform(chunk, controller) {
                if (chunk.type === "error") {
                  const appError =
                    mappedStreamError ??
                    mapProviderError(new Error(chunk.errorText));
                  controller.enqueue({
                    type: "error",
                    errorText: appError.message,
                  });
                  return;
                }

                // The model's private reasoning is not part of the product.
                if (
                  chunk.type === "reasoning-start" ||
                  chunk.type === "reasoning-delta" ||
                  chunk.type === "reasoning-end" ||
                  chunk.type === "reasoning-file"
                ) {
                  return;
                }

                // No citations or file/source parts in the answer stream.
                if (
                  chunk.type === "source-url" ||
                  chunk.type === "source-document" ||
                  chunk.type === "file"
                ) {
                  return;
                }

                if (chunk.type === "tool-input-start") {
                  toolNamesByCallId.set(chunk.toolCallId, chunk.toolName);
                  if (chunk.toolName === "task") {
                    if (!emittedToolOutputs.has(chunk.toolCallId)) {
                      pendingTaskCalls.add(chunk.toolCallId);
                    }
                  }
                  if (seenToolInputStarts.has(chunk.toolCallId)) return;
                  seenToolInputStarts.add(chunk.toolCallId);
                  if (!VISIBLE_TOOL_NAMES.has(chunk.toolName)) return;
                  controller.enqueue(chunk);
                  return;
                }

                if (chunk.type === "tool-input-delta") {
                  const name = toolNamesByCallId.get(chunk.toolCallId);
                  if (!name || !VISIBLE_TOOL_NAMES.has(name)) return;
                  if (emittedToolInputs.has(chunk.toolCallId)) return;
                  controller.enqueue(chunk);
                  return;
                }

                if (chunk.type === "tool-input-available") {
                  toolNamesByCallId.set(chunk.toolCallId, chunk.toolName);
                  if (chunk.toolName === "task") {
                    if (!emittedToolOutputs.has(chunk.toolCallId)) {
                      pendingTaskCalls.add(chunk.toolCallId);
                    }
                  }
                  if (emittedToolInputs.has(chunk.toolCallId)) return;
                  emittedToolInputs.add(chunk.toolCallId);
                  if (!VISIBLE_TOOL_NAMES.has(chunk.toolName)) return;
                  controller.enqueue(chunk);
                  return;
                }

                if (chunk.type === "tool-input-error") {
                  toolNamesByCallId.set(chunk.toolCallId, chunk.toolName);
                  if (chunk.toolName === "task") {
                    pendingTaskCalls.delete(chunk.toolCallId);
                  }
                  if (!VISIBLE_TOOL_NAMES.has(chunk.toolName)) return;
                  controller.enqueue({
                    ...chunk,
                    errorText: safeErrorMessage(chunk.errorText),
                  });
                  return;
                }

                if (chunk.type === "tool-output-available") {
                  const name = toolNamesByCallId.get(chunk.toolCallId);
                  pendingTaskCalls.delete(chunk.toolCallId);
                  if (!name || !VISIBLE_TOOL_NAMES.has(name)) return;
                  if (emittedToolOutputs.has(chunk.toolCallId)) return;

                  emittedToolOutputs.add(chunk.toolCallId);
                  controller.enqueue({
                    ...chunk,
                    output:
                      name === "task"
                        ? taskSummary(chunk.output)
                        : searchSummary(chunk.output),
                  });
                  return;
                }

                if (chunk.type === "tool-output-error") {
                  const name = toolNamesByCallId.get(chunk.toolCallId);
                  pendingTaskCalls.delete(chunk.toolCallId);
                  if (!name || !VISIBLE_TOOL_NAMES.has(name)) return;
                  controller.enqueue({
                    ...chunk,
                    errorText: safeErrorMessage(chunk.errorText),
                  });
                  return;
                }

                if (chunk.type === "tool-output-denied") {
                  const name = toolNamesByCallId.get(chunk.toolCallId);
                  pendingTaskCalls.delete(chunk.toolCallId);
                  if (!name || !VISIBLE_TOOL_NAMES.has(name)) return;
                  controller.enqueue(chunk);
                  return;
                }

                if (
                  chunk.type === "tool-approval-request" ||
                  chunk.type === "tool-approval-response"
                ) {
                  return;
                }

                if (chunk.type === "text-start" && pendingTaskCalls.size > 0) {
                  suppressedTextIds.add(chunk.id);
                  return;
                }

                if (
                  (chunk.type === "text-delta" || chunk.type === "text-end") &&
                  suppressedTextIds.has(chunk.id)
                ) {
                  return;
                }

                if (chunk.type === "text-delta" && pendingTaskCalls.size > 0) {
                  suppressedTextIds.add(chunk.id);
                  return;
                }

                if (
                  !writingEmitted &&
                  chunk.type === "text-delta" &&
                  chunk.delta
                ) {
                  writingEmitted = true;
                  emit({
                    type: "data-stage",
                    data: {
                      id: "writing",
                      stage: "writing",
                      message: "Writing answer…",
                      startedAt: Date.now(),
                    },
                  });
                }

                controller.enqueue(chunk);
              },
            }),
          );

          writer.merge(safeStream);
        } catch (error) {
          if (request.signal.aborted) throw error;

          const appError = mapProviderError(error);
          logError({
            requestId,
            route: "chat",
            stage: "execute",
            errorCode: appError.code,
          });
          emit({
            type: "data-error",
            data: appErrorData(appError, requestId),
          });
          throw appError;
        }
      },
      onError: (error) => mapProviderError(error).message,
      onEnd: () => {
        logEvent({
          requestId,
          route: "chat",
          stage: "end",
          durationMs: Date.now() - startedAt,
        });
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    const appError = mapProviderError(error);
    logError({
      requestId,
      route: "chat",
      stage: "preflight",
      errorCode: appError.code,
      status: appError.status,
    });

    return jsonError(appError, requestId);
  }
}
