import { Fragment, useId, useState } from "react";
import {
  Check,
  ChevronDown,
  Circle,
  LoaderCircle,
} from "lucide-react";
import { formatShortDuration } from "@/lib/client/format";
import { isRecord } from "@/lib/shared/guards";
import type { MessageActivity, ToolActivity } from "./types";

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}

function pagesLabel(pages: number[]): string {
  const unique = Array.from(new Set(pages)).sort((a, b) => a - b);
  if (unique.length === 0) return "";
  if (unique.length === 1) return `page ${unique[0]}`;
  return `pages ${unique.join(", ")}`;
}

function taskDetail(task: ToolActivity): string {
  if (task.state === "output-available" && typeof task.output === "string") {
    if (task.output !== "Analysis completed.") {
      return truncate(task.output, 280);
    }
  }

  if (isRecord(task.input) && typeof task.input.description === "string") {
    return truncate(task.input.description, 180);
  }

  if (task.state === "output-error" && task.errorText) {
    return truncate(task.errorText, 180);
  }

  return "Analyzed a retrieved section.";
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

interface AgentTraceProps {
  id: string;
  activity: MessageActivity;
  hasAnswer: boolean;
}

export function AgentTrace({ id, activity, hasAnswer }: AgentTraceProps) {
  const searchTraces = activity.traces.filter(
    (trace) => trace.type === "search",
  );

  return (
    <div
      id={id}
      className="border-t border-(--border) px-3 py-3 text-xs sm:px-4"
    >
      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[8.5rem_1fr]">
        {searchTraces.map((trace, index) => {
          const pages = pagesLabel(trace.pages);
          const value = [
            plural(trace.chunkCount, "section", "sections"),
            pages,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <Fragment key={`search-${index}`}>
              <dt className="text-(--foreground-muted)">Search query</dt>
              <dd className="text-(--foreground-secondary)">
                “{trace.query}”
              </dd>
              <dt className="text-(--foreground-muted)">
                Sections retrieved
              </dt>
              <dd className="text-(--foreground-secondary)">{value}</dd>
            </Fragment>
          );
        })}

        {activity.tasks.map((task, index) => (
          <Fragment key={task.toolCallId}>
            <dt className="text-(--foreground-muted)">
              Analyst {index + 1}
            </dt>
            <dd className="text-(--foreground-secondary)">
              {taskDetail(task)}
            </dd>
          </Fragment>
        ))}

        {hasAnswer && (
          <>
            <dt className="text-(--foreground-muted)">Synthesis</dt>
            <dd className="text-(--foreground-secondary)">
              Combined the analyst findings into the answer.
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

interface AgentSummaryProps {
  activity: MessageActivity;
  streaming: boolean;
  hasAnswer: boolean;
  durationMs?: number;
}

export function AgentSummary({
  activity,
  streaming,
  hasAnswer,
  durationMs,
}: AgentSummaryProps) {
  const [open, setOpen] = useState(false);
  const traceId = useId();
  const canExpand =
    activity.traces.length > 0 || activity.tasks.length > 0;

  let summary: string;

  if (streaming) {
    summary =
      activity.activeStage?.message ??
      (hasAnswer ? "Writing answer…" : "Preparing your answer…");
  } else {
    const parts: string[] = [];

    if (activity.sections > 0) {
      parts.push(
        `Searched ${plural(activity.sections, "section", "sections")}`,
      );
    } else if (activity.traces.length > 0) {
      parts.push("Searched your report");
    }

    if (activity.analystCount > 0) {
      parts.push(
        plural(activity.analystCount, "analyst", "analysts"),
      );
    }

    if (durationMs !== undefined && durationMs >= 100) {
      parts.push(formatShortDuration(durationMs));
    }

    summary = parts.length > 0 ? parts.join(" · ") : "Answered from your report";
  }

  const icon = streaming ? (
    <LoaderCircle
      className="h-3.5 w-3.5 shrink-0 animate-spin text-(--accent)"
      strokeWidth={2}
    />
  ) : activity.hasActivity ? (
    <Check
      className="h-3.5 w-3.5 shrink-0 text-(--success)"
      strokeWidth={2.2}
    />
  ) : (
    <Circle
      className="h-3.5 w-3.5 shrink-0 text-(--foreground-muted)"
      strokeWidth={2}
    />
  );

  return (
    <div className="overflow-hidden rounded-lg border border-(--border) bg-(--surface-raised)">
      {canExpand ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={traceId}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[11px] text-(--foreground-secondary) transition-colors hover:bg-(--surface-soft) sm:px-4"
        >
          {icon}
          <span className="min-w-0 flex-1">{summary}</span>
          <span className="shrink-0 text-(--foreground-muted)">
            {open ? "Hide agent trace" : "Show agent trace"}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-(--foreground-muted) transition-transform ${
              open ? "rotate-180" : ""
            }`}
            strokeWidth={1.8}
          />
        </button>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2.5 text-[11px] text-(--foreground-secondary) sm:px-4">
          {icon}
          <span className="min-w-0 flex-1">{summary}</span>
        </div>
      )}

      {canExpand && open && (
        <AgentTrace id={traceId} activity={activity} hasAnswer={hasAnswer} />
      )}
    </div>
  );
}
