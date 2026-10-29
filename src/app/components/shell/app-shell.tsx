import type { ReactNode } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { AppIcon } from "../app-icon";
import { PRIVACY_COPY } from "../privacy-notice";

interface AppShellProps {
  children: ReactNode;
}

function PrivacyDisclosure() {
  return (
    <details className="group relative">
      <summary className="no-marker inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-(--border) bg-(--surface-raised) px-2.5 py-1.5 text-[11px] text-(--foreground-secondary) transition-colors hover:border-(--border-strong) hover:text-(--foreground) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--background-secondary)">
        <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} />
        Privacy
        <ChevronDown
          className="h-3 w-3 transition-transform group-open:rotate-180"
          strokeWidth={1.8}
        />
      </summary>
      <div className="absolute right-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-(--border-strong) bg-(--surface-raised) p-4 shadow-xl shadow-black/30">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-(--accent)">
          Private by default
        </p>
        <p className="mt-2 text-xs leading-5 text-(--foreground-secondary)">
          {PRIVACY_COPY}
        </p>
      </div>
    </details>
  );
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-(--border) px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-(--border-strong) bg-(--accent-soft) text-(--accent)">
              <AppIcon className="h-4.75 w-4.75" />
            </span>
            <span className="truncate text-sm font-semibold tracking-tight text-(--foreground)">
              Med-RAG
            </span>
          </div>

          <PrivacyDisclosure />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

      <footer className="shrink-0 border-t border-(--border) px-4 py-2.5 text-[11px] leading-4 text-(--foreground-muted) sm:px-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <span>Not medical advice.</span>
          <span className="shrink-0">
            Your report is deleted when you leave
          </span>
        </div>
      </footer>
    </div>
  );
}
