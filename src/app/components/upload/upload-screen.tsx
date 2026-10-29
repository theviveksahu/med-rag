"use client";

import { useState } from "react";
import {
  ArrowRight,
  LockKeyhole,
  MonitorSmartphone,
  Trash2,
} from "lucide-react";
import { ERROR_CATALOG } from "@/lib/shared/errors";
import { MAX_PDF_BYTES } from "@/lib/shared/limits";
import { Dropzone } from "./dropzone";

interface UploadScreenProps {
  onAnalyze: (file: File) => void;
}

function validateFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return ERROR_CATALOG.PDF_UNSUPPORTED_TYPE.message;
  }
  if (file.size > MAX_PDF_BYTES) {
    return ERROR_CATALOG.PDF_TOO_LARGE.message;
  }
  if (file.size === 0) {
    return ERROR_CATALOG.PDF_INVALID.message;
  }
  return null;
}

export function UploadScreen({ onAnalyze }: UploadScreenProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(next: File | null) {
    if (!next) {
      setFile(null);
      setError(null);
      return;
    }

    setFile(next);
    setError(validateFile(next));
  }

  const canAnalyze = file !== null && error === null;

  return (
    <div className="upload-hero-glow relative flex min-h-full flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="dot-pattern pointer-events-none absolute inset-0 opacity-50"
      />

      <div className="relative mx-auto flex w-full max-w-280 flex-1 items-center px-5 py-10 sm:px-8 lg:px-12 lg:py-16">
        <div className="grid w-full gap-10 lg:grid-cols-12 lg:gap-14">
          <section className="flex flex-col justify-center lg:col-span-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
              Medical report analyser
            </p>
            <h1 className="mt-4 text-balance font-display text-4xl leading-[1.02] tracking-[-0.02em] text-(--foreground) sm:text-5xl lg:text-[3.4rem]">
              Your report,
              <span className="block italic">in plain language.</span>
            </h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-(--foreground-secondary) sm:text-[15px]">
              Ask questions about your lab or diagnostic report. Answers come
              only from the pages you provide.
            </p>

            <ul className="mt-7 space-y-3">
              <li className="flex items-start gap-2.5 text-sm text-(--foreground-secondary)">
                <MonitorSmartphone
                  className="mt-0.5 h-4 w-4 shrink-0 text-(--accent)"
                  strokeWidth={1.7}
                />
                Read in your browser
              </li>
              <li className="flex items-start gap-2.5 text-sm text-(--foreground-secondary)">
                <LockKeyhole
                  className="mt-0.5 h-4 w-4 shrink-0 text-(--accent)"
                  strokeWidth={1.7}
                />
                No account needed
              </li>
              <li className="flex items-start gap-2.5 text-sm text-(--foreground-secondary)">
                <Trash2
                  className="mt-0.5 h-4 w-4 shrink-0 text-(--accent)"
                  strokeWidth={1.7}
                />
                Deleted when you leave
              </li>
            </ul>
          </section>

          <section className="flex flex-col justify-center lg:col-span-7">
            <div className="rounded-xl border border-(--border) bg-(--surface) p-4 shadow-2xl shadow-black/20 sm:p-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-medium text-(--foreground)">
                    Upload a report
                  </h2>
                </div>
                <span className="rounded-full border border-(--border) px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-(--foreground-muted)">
                  PDF
                </span>
              </div>

              <Dropzone file={file} error={error} onFile={handleFile} />

              <button
                type="button"
                onClick={() => {
                  if (file && canAnalyze) onAnalyze(file);
                }}
                disabled={!canAnalyze}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-(--accent) px-4 py-3 text-sm font-semibold text-(--background) transition-colors hover:bg-(--accent-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface) disabled:cursor-not-allowed disabled:opacity-45"
              >
                Analyze report
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
