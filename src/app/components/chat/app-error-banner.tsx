import { AlertCircle, RotateCcw } from "lucide-react";
import type { AppErrorData } from "@/lib/shared/types";

interface AppErrorBannerProps {
  error: AppErrorData;
  onRetry: () => void;
}

function isWarning(error: AppErrorData): boolean {
  return (
    error.code === "QUOTA_EXHAUSTED" ||
    error.code === "RATE_LIMITED" ||
    error.code === "PROVIDER_ERROR" ||
    error.code === "TIMEOUT"
  );
}

function titleFor(error: AppErrorData): string {
  if (error.code === "QUOTA_EXHAUSTED" || error.code === "RATE_LIMITED") {
    return "The demo is busy";
  }
  if (error.code === "PROVIDER_ERROR" || error.code === "TIMEOUT") {
    return "The answer didn't finish";
  }
  if (error.code === "PROVIDER_AUTH" || error.code === "PROVIDER_CREDITS") {
    return "The AI provider is unavailable";
  }
  if (error.code === "NETWORK") {
    return "We couldn't reach the server";
  }
  return "We couldn't finish that answer";
}

export function AppErrorBanner({ error, onRetry }: AppErrorBannerProps) {
  const warning = isWarning(error);
  const color = warning ? "var(--warning)" : "var(--error)";

  return (
    <div
      role="alert"
      className={`rounded-lg border p-3 ${
        warning
          ? "border-(--warning)/30 bg-(--warning)/8"
          : "border-(--error)/30 bg-(--error)/8"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle
          className="mt-0.5 h-4 w-4 shrink-0"
          style={{ color }}
          strokeWidth={2}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-(--foreground)">
            {titleFor(error)}
          </p>
          <p className="mt-1 text-xs leading-5 text-(--foreground-secondary)">
            {error.message}
          </p>
        </div>
        {error.retryable && (
          <button
            type="button"
            onClick={onRetry}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-(--border-strong) bg-(--surface-raised) px-2.5 py-1.5 text-[11px] font-medium text-(--foreground-secondary) transition-colors hover:border-(--accent) hover:text-(--foreground) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface)"
          >
            <RotateCcw className="h-3 w-3" strokeWidth={2} />
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
