"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, MoreHorizontal } from "lucide-react";
import { middleEllipsis } from "@/lib/client/format";
import type { ReportSummary } from "@/lib/shared/types";

interface ReportHeaderProps {
  report: ReportSummary;
  onRequestReset: () => void;
}

const actionClass =
  "rounded-md border border-(--border) bg-(--surface-raised) px-2.5 py-1.5 font-medium text-(--foreground-secondary) transition-colors hover:border-(--accent) hover:text-(--foreground) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--background-secondary)";

export function ReportHeader({ report, onRequestReset }: ReportHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  function requestReset() {
    setMenuOpen(false);
    onRequestReset();
  }

  return (
    <header className="flex shrink-0 items-start justify-between gap-3 border-b border-(--border) px-4 py-3 sm:items-center sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-(--border) bg-(--accent-soft) text-(--accent)">
          <FileText className="h-4 w-4" strokeWidth={1.8} />
        </span>

        <div className="min-w-0">
          <p
            className="truncate text-sm font-medium text-(--foreground)"
            title={report.filename}
          >
            {middleEllipsis(report.filename, 52)}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-(--foreground-muted)">
            {report.pageCount} {report.pageCount === 1 ? "page" : "pages"} ·{" "}
            {report.chunkCount}{" "}
            {report.chunkCount === 1 ? "section" : "sections"}
          </p>
          <p className="mt-0.5 text-[11px] text-(--foreground-muted)">
            Private session · ends when this tab closes
          </p>
        </div>
      </div>

      <div className="hidden shrink-0 items-center gap-2 text-[11px] sm:flex">
        <button type="button" onClick={requestReset} className={actionClass}>
          Analyze another
        </button>
      </div>

      <div ref={menuRef} className="relative shrink-0 sm:hidden">
        <button
          type="button"
          aria-label="Report actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-(--border) bg-(--surface-raised) text-(--foreground-secondary) transition-colors hover:border-(--accent) hover:text-(--foreground) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--background-secondary)"
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-lg border border-(--border-strong) bg-(--surface-raised) py-1 shadow-xl shadow-black/40"
          >
            <button
              type="button"
              role="menuitem"
              onClick={requestReset}
              className="block w-full px-3 py-2 text-left text-xs text-(--foreground-secondary) transition-colors hover:bg-(--surface-soft) hover:text-(--foreground) focus-visible:bg-(--surface-soft) focus-visible:outline-none"
            >
              Analyze another
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
