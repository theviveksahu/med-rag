"use client";

import { AlertCircle, Check, Circle, LoaderCircle } from "lucide-react";
import { formatBytes, formatDuration } from "@/lib/client/format";
import type { UploadStageView, UploadState } from "@/app/hooks/use-upload";
import { useElapsed } from "@/app/hooks/use-elapsed";
import type { UploadStageStatus } from "@/lib/shared/types";

interface ProcessingScreenProps {
  file: { name: string; size: number };
  state: UploadState;
  onCancel: () => void;
  onRetry: () => void;
  onStartOver: () => void;
}

function StageIcon({ status }: { status: UploadStageStatus }) {
  if (status === "done") {
    return <Check className="h-4 w-4 text-(--success)" strokeWidth={2.2} />;
  }
  if (status === "active") {
    return (
      <LoaderCircle
        className="h-4 w-4 animate-spin text-(--accent)"
        strokeWidth={2}
      />
    );
  }
  if (status === "error") {
    return <AlertCircle className="h-4 w-4 text-(--error)" strokeWidth={2} />;
  }
  return (
    <Circle className="h-4 w-4 text-(--foreground-muted)" strokeWidth={1.6} />
  );
}

function stageLabelClass(status: UploadStageStatus): string {
  if (status === "active") return "text-(--foreground)";
  if (status === "done") return "text-(--foreground-secondary)";
  if (status === "error") return "text-(--error)";
  return "text-(--foreground-muted)";
}

function StageRow({ stage }: { stage: UploadStageView }) {
  const progress =
    stage.progress === undefined
      ? undefined
      : Math.min(100, Math.max(0, stage.progress));

  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
        <StageIcon status={stage.status} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span
            className={`text-sm font-medium ${stageLabelClass(stage.status)}`}
          >
            {stage.label}
          </span>
          {stage.detail && (
            <span className="font-mono text-[11px] text-(--foreground-muted)">
              {stage.detail}
            </span>
          )}
        </div>

        {progress !== undefined && stage.status !== "pending" && (
          <div
            role="progressbar"
            aria-label={stage.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-(--surface-soft)"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${
                stage.status === "error"
                  ? "bg-(--error)"
                  : stage.status === "done"
                    ? "bg-(--success)"
                    : "bg-(--accent)"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </li>
  );
}

export function ProcessingScreen({
  file,
  state,
  onCancel,
  onRetry,
  onStartOver,
}: ProcessingScreenProps) {
  const elapsed = useElapsed(state.startedAt, state.phase === "processing");
  const meta = [
    state.pageCount
      ? `${state.pageCount} ${state.pageCount === 1 ? "page" : "pages"}`
      : null,
    formatBytes(file.size),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="upload-hero-glow relative flex min-h-full flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="dot-pattern pointer-events-none absolute inset-0 opacity-35"
      />

      <div className="relative mx-auto flex w-full max-w-280 flex-1 items-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto w-full max-w-160">
          <div
            aria-busy={state.phase === "processing"}
            className="rounded-xl border border-(--border) bg-(--surface) p-5 shadow-2xl shadow-black/20 sm:p-7"
          >
            <div className="flex items-start gap-3">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-(--border) ${
                  state.phase === "error"
                    ? "bg-(--error)/10 text-(--error)"
                    : "bg-(--accent-soft) text-(--accent)"
                }`}
              >
                {state.phase === "error" ? (
                  <AlertCircle className="h-5 w-5" strokeWidth={1.8} />
                ) : state.phase === "ready" ? (
                  <Check className="h-5 w-5" strokeWidth={2.2} />
                ) : (
                  <LoaderCircle
                    className="h-5 w-5 animate-spin"
                    strokeWidth={1.8}
                  />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-medium text-(--foreground)"
                  title={file.name}
                >
                  {file.name}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-(--foreground-muted)">
                  {meta}
                </p>
              </div>

              <span className="shrink-0 font-mono text-[11px] text-(--foreground-muted)">
                {formatDuration(elapsed)}
              </span>
            </div>

            <div className="mt-6 border-t border-(--border) pt-5">
              <ol aria-live="polite" className="space-y-4">
                {state.stages.map((stage) => (
                  <StageRow key={stage.id} stage={stage} />
                ))}
              </ol>
            </div>

            {state.phase === "error" && state.error ? (
              <div role="alert" className="panel-error mt-6 rounded-lg p-4">
                <div className="flex items-start gap-2.5">
                  <AlertCircle
                    className="mt-0.5 h-4 w-4 shrink-0 text-(--error)"
                    strokeWidth={2}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-(--foreground)">
                      We couldn&apos;t process this report
                    </p>
                    <p className="mt-1 text-xs leading-5 text-(--foreground-secondary)">
                      {state.error.message}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {state.error.retryable && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="rounded-md bg-(--accent) px-3 py-2 text-xs font-semibold text-(--background) transition-colors hover:bg-(--accent-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface)"
                    >
                      Try again
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onStartOver}
                    className="rounded-md border border-(--border-strong) bg-(--surface-raised) px-3 py-2 text-xs font-medium text-(--foreground-secondary) transition-colors hover:border-(--accent) hover:text-(--foreground) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface)"
                  >
                    Start over
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-(--border) pt-4">
                <p className="text-[11px] leading-5 text-(--foreground-muted)">
                  This usually takes under a minute.
                </p>
                {state.phase !== "ready" && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-sm text-[11px] font-medium text-(--foreground-muted) underline-offset-4 transition-colors hover:text-(--foreground) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}

            {state.phase === "ready" && (
              <p
                role="status"
                className="mt-4 flex items-center gap-2 text-xs text-(--success)"
              >
                <Check className="h-4 w-4" strokeWidth={2.2} />
                Report ready. Opening your chat…
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
