import { ArrowUpRight } from "lucide-react";

const SUGGESTIONS = [
  "What are the most important results in this report?",
  "Explain my cholesterol results in plain language.",
  "Which results are outside the reference range?",
] as const;

interface EmptyChatProps {
  onSelect: (question: string) => void;
  disabled?: boolean;
}

export function EmptyChat({ onSelect, disabled = false }: EmptyChatProps) {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pt-8 sm:px-6 sm:pt-12">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-(--accent)">
        Ask about your report
      </p>
      <h2 className="mt-2 text-balance font-display text-3xl tracking-[-0.01em] text-(--foreground) sm:text-4xl">
        What would you like to know?
      </h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-(--foreground-secondary)">
        Answers come only from the pages you uploaded.
      </p>

      <div className="mt-6 space-y-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(suggestion)}
            className="group flex w-full items-center justify-between gap-4 rounded-lg border border-(--border) bg-(--surface) px-4 py-3 text-left text-sm text-(--foreground-secondary) transition-colors hover:border-(--accent) hover:bg-(--surface-raised) hover:text-(--foreground) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--background-secondary) disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span>{suggestion}</span>
            <ArrowUpRight
              className="h-4 w-4 shrink-0 text-(--foreground-muted) transition-colors group-hover:text-(--accent)"
              strokeWidth={1.8}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
