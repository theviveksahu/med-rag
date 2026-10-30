"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { LoaderCircle } from "lucide-react";
import { chatFetch, toAppErrorData } from "@/lib/client/api";
import type {
  AppErrorData,
  CustomDataMessage,
  ReportSummary,
} from "@/lib/shared/types";
import { ConfirmDialog } from "../shell/confirm-dialog";
import { AppErrorBanner } from "./app-error-banner";
import { ChatComposer } from "./composer";
import { ChatMessage } from "./chat-message";
import { EmptyChat } from "./empty-chat";
import { ReportHeader } from "./report-header";

interface ChatScreenProps {
  sessionId: string;
  report: ReportSummary;
  onStartOver: () => Promise<void>;
}

const BLOCKED_CODES = new Set([
  "SESSION_ENDED",
  "INVALID_SESSION_ID",
  "CONVERSATION_TOO_LONG",
]);

function PendingAnswer() {
  return (
    <article className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-lg border border-(--border) bg-(--surface-raised) px-3 py-2.5 text-[11px] text-(--foreground-secondary) sm:px-4">
        <LoaderCircle
          className="h-3.5 w-3.5 animate-spin text-(--accent)"
          strokeWidth={2}
        />
        <span>Preparing your answer…</span>
      </div>
      <div className="max-w-[72ch]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-(--accent)">
          From your report
        </p>
        <span
          role="status"
          aria-label="Preparing your answer"
          className="mt-3 inline-flex items-center gap-1"
        >
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--accent)"
              style={{ animationDelay: `${index * 160}ms` }}
            />
          ))}
        </span>
      </div>
    </article>
  );
}

interface BlockedComposerProps {
  error: AppErrorData;
  onStartOver: () => void;
}

function BlockedComposer({ error, onStartOver }: BlockedComposerProps) {
  const title =
    error.code === "CONVERSATION_TOO_LONG"
      ? "Conversation limit reached"
      : "Report unavailable";

  return (
    <div
      role="alert"
      className="rounded-xl border border-(--border-strong) bg-(--surface-raised) p-4"
    >
      <p className="text-sm font-medium text-(--foreground)">{title}</p>
      <p className="mt-1 text-xs leading-5 text-(--foreground-secondary)">
        {error.message}
      </p>
      <button
        type="button"
        onClick={onStartOver}
        className="mt-3 rounded-md bg-(--accent) px-3.5 py-2 text-xs font-semibold text-(--background) transition-colors hover:bg-(--accent-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface-raised)"
      >
        Start new session
      </button>
    </div>
  );
}

export function ChatScreen({
  sessionId,
  report,
  onStartOver,
}: ChatScreenProps) {
  const [streamError, setStreamError] = useState<AppErrorData | null>(null);
  const [timings, setTimings] = useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const requestStartedAtRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<CustomDataMessage>({
        api: "/api/chat",
        headers: { "x-session-id": sessionId },
        fetch: chatFetch,
      }),
    [sessionId],
  );

  const { messages, sendMessage, regenerate, stop, status, error, clearError } =
    useChat<CustomDataMessage>({
      id: `medrag-${sessionId}`,
      transport,
      throttle: 50,
      onData: (part) => {
        if (part.type === "data-error") {
          setStreamError(part.data);
        }
      },
      onError: (nextError) => {
        setStreamError((previous) => previous ?? toAppErrorData(nextError));
        requestStartedAtRef.current = null;
      },
      onFinish: ({ message }) => {
        const startedAt = requestStartedAtRef.current;
        if (startedAt !== null) {
          const elapsed = Date.now() - startedAt;
          setTimings((previous) => ({
            ...previous,
            [message.id]: elapsed,
          }));
        }
        requestStartedAtRef.current = null;
      },
    });

  const chatError = streamError ?? (error ? toAppErrorData(error) : null);
  const blocked = chatError ? BLOCKED_CODES.has(chatError.code) : false;

  const lastMessage = messages[messages.length - 1];
  const awaitingAssistant =
    (status === "submitted" || status === "streaming") &&
    lastMessage?.role === "user";

  const lastAssistantId = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")?.id;

  useEffect(() => {
    const list = listRef.current;
    if (!list || !stickToBottomRef.current) return;

    list.scrollTop = list.scrollHeight;
  }, [messages, status]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || blocked) return;

      setStreamError(null);
      clearError();
      requestStartedAtRef.current = Date.now();
      stickToBottomRef.current = true;

      void sendMessage({ text: trimmed }).catch((nextError) => {
        setStreamError((previous) => previous ?? toAppErrorData(nextError));
        requestStartedAtRef.current = null;
      });
    },
    [blocked, clearError, sendMessage],
  );

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;

    stickToBottomRef.current =
      list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  }

  function handleRetry() {
    if (blocked) return;

    setStreamError(null);
    clearError();
    requestStartedAtRef.current = Date.now();
    stickToBottomRef.current = true;

    void regenerate().catch((nextError) => {
      setStreamError((previous) => previous ?? toAppErrorData(nextError));
      requestStartedAtRef.current = null;
    });
  }

  async function handleReset() {
    setConfirmOpen(false);

    try {
      await stop();
    } finally {
      await onStartOver();
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ReportHeader
        report={report}
        onRequestReset={() => setConfirmOpen(true)}
      />

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {messages.length === 0 && !awaitingAssistant ? (
          <EmptyChat onSelect={send} disabled={blocked} />
        ) : (
          <div className="mx-auto w-full max-w-205 space-y-7 px-4 py-6 sm:px-6 sm:py-8">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                streaming={
                  message.role === "assistant" &&
                  message.id === lastAssistantId &&
                  (status === "submitted" || status === "streaming")
                }
                durationMs={timings[message.id]}
              />
            ))}

            {awaitingAssistant && <PendingAnswer />}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-(--border) bg-(--background-secondary) pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-205 px-4 pt-3 sm:px-6">
          {chatError && !blocked && (
            <AppErrorBanner error={chatError} onRetry={handleRetry} />
          )}
        </div>

        <div className="mx-auto w-full max-w-205 px-4 pt-3 sm:px-6">
          {blocked && chatError ? (
            <BlockedComposer
              error={chatError}
              onStartOver={() => void handleReset()}
            />
          ) : (
            <ChatComposer onSend={send} status={status} disabled={blocked} />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Replace this report?"
        description="Your current report and conversation will be deleted. This cannot be undone."
        confirmLabel="Delete and start over"
        onConfirm={() => void handleReset()}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
