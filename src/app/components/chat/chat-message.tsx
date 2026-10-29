"use client";

import {
  isDataUIPart,
  isTextUIPart,
  isToolUIPart,
} from "ai";
import type { CustomDataMessage, StageData, TraceData } from "@/lib/shared/types";
import { AgentSummary } from "./agent-summary";
import { RichText } from "./rich-text";
import type { MessageActivity, ToolActivity } from "./types";

function extractActivity(message: CustomDataMessage): MessageActivity {
  const stagesById = new Map<string, StageData>();
  const traces: TraceData[] = [];
  const tasksById = new Map<string, ToolActivity>();

  for (const part of message.parts) {
    if (isDataUIPart(part)) {
      if (part.type === "data-stage") {
        const previous = stagesById.get(part.data.id);
        stagesById.set(part.data.id, { ...previous, ...part.data });
      } else if (part.type === "data-trace") {
        traces.push(part.data);
      }
      continue;
    }

    if (!isToolUIPart(part)) continue;

    const name =
      part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
    if (name !== "task") continue;

    tasksById.set(part.toolCallId, {
      toolCallId: part.toolCallId,
      name,
      state: part.state,
      input: part.input,
      output: part.output,
      errorText: part.errorText,
    });
  }

  const stages = Array.from(stagesById.values()).sort(
    (a, b) => a.startedAt - b.startedAt,
  );
  const activeStage = [...stages]
    .reverse()
    .find((stage) => stage.durationMs === undefined);

  const sections = traces.reduce(
    (total, trace) =>
      trace.type === "search" ? total + trace.chunkCount : total,
    0,
  );

  return {
    stages,
    traces,
    tasks: Array.from(tasksById.values()),
    activeStage,
    sections,
    analystCount: tasksById.size,
    hasActivity: stages.length > 0 || traces.length > 0 || tasksById.size > 0,
  };
}

function ThinkingDots() {
  return (
    <span
      role="status"
      aria-label="Preparing your answer"
      className="inline-flex items-center gap-1 py-1"
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--accent)"
          style={{ animationDelay: `${index * 160}ms` }}
        />
      ))}
    </span>
  );
}

interface ChatMessageProps {
  message: CustomDataMessage;
  streaming: boolean;
  durationMs?: number;
}

export function ChatMessage({
  message,
  streaming,
  durationMs,
}: ChatMessageProps) {
  const textParts = message.parts.filter(isTextUIPart);

  if (message.role === "user") {
    const text = textParts.map((part) => part.text).join("\n");

    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-xl border border-(--border) bg-(--accent-soft) px-4 py-2.5 text-sm leading-6 text-(--foreground)">
          {text}
        </div>
      </div>
    );
  }

  const activity = extractActivity(message);
  const hasAnswer = textParts.some((part) => part.text.trim().length > 0);
  const showAnswer = hasAnswer || streaming;

  if (!showAnswer && !activity.hasActivity) return null;

  return (
    <article className="flex flex-col gap-3">
      {(activity.hasActivity || streaming) && (
        <AgentSummary
          activity={activity}
          streaming={streaming}
          hasAnswer={hasAnswer}
          durationMs={streaming ? undefined : durationMs}
        />
      )}

      {showAnswer && (
        <div className="max-w-[72ch]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-(--accent)">
            From your report
          </p>
          <div className="mt-2 space-y-4 text-[15px] leading-7 text-(--foreground-secondary)">
            {textParts.map((part, index) =>
              part.text.trim() ? (
                <RichText key={`${message.id}-text-${index}`} text={part.text} />
              ) : null,
            )}
            {streaming && !hasAnswer && <ThinkingDots />}
          </div>
        </div>
      )}
    </article>
  );
}
