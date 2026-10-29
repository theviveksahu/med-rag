"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * A native <dialog> confirmation. The platform supplies the focus trap,
 * initial focus, Escape handling, and focus restoration on close.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Keep chatting",
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      if (open) onClose();
    };

    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [open, onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-(--border-strong) bg-(--surface) p-0 text-(--foreground) shadow-2xl shadow-black/50 backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="p-5">
        <h2
          id={titleId}
          className="font-display text-2xl tracking-[-0.01em] text-(--foreground)"
        >
          {title}
        </h2>
        <div
          id={descriptionId}
          className="mt-2 text-sm leading-6 text-(--foreground-secondary)"
        >
          {description}
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="rounded-md border border-(--border-strong) bg-(--surface-raised) px-3.5 py-2 text-xs font-medium text-(--foreground-secondary) transition-colors hover:border-(--accent) hover:text-(--foreground) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface)"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-(--error) px-3.5 py-2 text-xs font-semibold text-(--background) transition-colors hover:bg-[#f6a49a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--error) focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface)"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
