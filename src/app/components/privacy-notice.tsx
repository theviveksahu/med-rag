import { ChevronDown, ShieldCheck } from "lucide-react";

export const PRIVACY_COPY =
  "Your PDF is read in your browser and never uploaded. Only its extracted text is sent to our server and the AI provider for this session, then deleted when you refresh or close the tab.";

interface PrivacyNoticeProps {
  className?: string;
}

export function PrivacyNotice({ className }: PrivacyNoticeProps) {
  return (
    <details className={`group ${className ?? ""}`}>
      <summary className="no-marker inline-flex cursor-pointer items-center gap-1.5 rounded-sm text-xs text-(--foreground-muted) transition-colors hover:text-(--foreground) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--background-secondary)">
        <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} />
        How your data is handled
        <ChevronDown
          className="h-3 w-3 transition-transform group-open:rotate-180"
          strokeWidth={1.8}
        />
      </summary>
      <p className="mt-2 max-w-prose text-xs leading-5 text-(--foreground-muted)">
        {PRIVACY_COPY}
      </p>
    </details>
  );
}
