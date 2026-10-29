"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  FileText,
  UploadCloud,
  X,
} from "lucide-react";
import { formatBytes } from "@/lib/client/format";
import { MAX_PAGES, MAX_PDF_BYTES } from "@/lib/shared/limits";

interface DropzoneProps {
  file: File | null;
  error: string | null;
  onFile: (file: File | null) => void;
  disabled?: boolean;
}

export function Dropzone({
  file,
  error,
  onFile,
  disabled = false,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function openPicker() {
    if (!disabled) inputRef.current?.click();
  }

  function handleInput(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    if (next) onFile(next);
    event.target.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);

    if (disabled) return;

    const next = event.dataTransfer.files?.[0];
    if (next) onFile(next);
  }

  function handleDragOver(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    if (!disabled) setDragging(true);
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={handleInput}
        tabIndex={-1}
        aria-label="Choose a PDF report"
      />

      {file ? (
        <div
          className="rounded-lg border border-(--border-strong) bg-(--surface-raised) p-4 transition-colors"
          onDragOver={handleDragOver}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-(--border) bg-(--accent-soft) text-(--accent)">
              <FileText className="h-5 w-5" strokeWidth={1.7} />
            </span>

            <div className="min-w-0 flex-1">
              <p
                className="truncate text-sm font-medium text-(--foreground)"
                title={file.name}
              >
                {file.name}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-(--foreground-muted)">
                {formatBytes(file.size)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onFile(null)}
              disabled={disabled}
              aria-label="Remove selected file"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-(--foreground-muted) transition-colors hover:bg-(--surface-soft) hover:text-(--foreground) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) disabled:pointer-events-none disabled:opacity-40"
            >
              <X className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-(--border) pt-3">
            <span className="text-[11px] text-(--foreground-muted)">
              {error ? "This file can’t be used" : "Ready to analyze"}
            </span>
            <button
              type="button"
              onClick={openPicker}
              disabled={disabled}
              className="rounded-sm text-[11px] font-medium text-(--accent) underline-offset-4 transition-colors hover:text-(--accent-hover) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) disabled:pointer-events-none disabled:opacity-40"
            >
              Choose a different file
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          aria-describedby="upload-constraints"
          className={`flex w-full flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface) disabled:cursor-not-allowed disabled:opacity-60 ${
            dragging
              ? "border-(--accent) bg-(--accent-soft)"
              : "border-(--border-strong) bg-(--surface-raised) hover:border-(--accent) hover:bg-(--accent-soft)"
          }`}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-(--border-strong) bg-(--surface) text-(--accent)">
            <UploadCloud className="h-5 w-5" strokeWidth={1.7} />
          </span>
          <span className="mt-4 text-sm font-medium text-(--foreground)">
            Drop your PDF here
          </span>
          <span className="mt-1 text-xs text-(--foreground-secondary)">
            or <span className="text-(--accent)">browse files</span>
          </span>
          <span
            id="upload-constraints"
            className="mt-4 text-[11px] text-(--foreground-muted)"
          >
            PDF only · {formatBytes(MAX_PDF_BYTES)} max · {MAX_PAGES} pages max
          </span>
        </button>
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 text-xs leading-5 text-(--error)"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
