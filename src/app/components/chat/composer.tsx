"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { LoaderCircle, SendHorizontal } from "lucide-react";
import type { ChatStatus } from "ai";

interface ChatComposerProps {
  onSend: (text: string) => void;
  status: ChatStatus;
  disabled?: boolean;
}

export function ChatComposer({
  onSend,
  status,
  disabled = false,
}: ChatComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const busy = status === "submitted" || status === "streaming";
  const isDisabled = disabled || busy;
  const canSend = !isDisabled && value.trim().length > 0;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [value]);

  function submit() {
    const text = value.trim();
    if (!text || isDisabled) return;

    setValue("");
    onSend(text);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div>
      <div className="flex items-end gap-2 rounded-xl border border-(--border) bg-(--surface-raised) p-2 pl-3 transition-colors focus-within:border-(--accent)">
        <label htmlFor="chat-question" className="sr-only">
          Ask about your report
        </label>
        <textarea
          ref={textareaRef}
          id="chat-question"
          rows={1}
          value={value}
          disabled={isDisabled}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={busy ? "Writing answer…" : "Ask about your report…"}
          className="max-h-36 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm leading-6 text-(--foreground) outline-none placeholder:text-(--foreground-muted) disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label="Send question"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-(--accent) text-(--background) transition-colors hover:bg-(--accent-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface-raised) disabled:cursor-not-allowed disabled:opacity-35"
        >
          {busy ? (
            <LoaderCircle
              className="h-4 w-4 animate-spin"
              strokeWidth={2}
            />
          ) : (
            <SendHorizontal className="h-4 w-4" strokeWidth={2} />
          )}
        </button>
      </div>

      <p
        aria-live="polite"
        className="mt-2 text-center text-[10px] text-(--foreground-muted)"
      >
        {status === "submitted"
          ? "Preparing your answer…"
          : status === "streaming"
            ? "Writing answer…"
            : "Enter to send · Shift+Enter for a new line"}
      </p>
    </div>
  );
}
