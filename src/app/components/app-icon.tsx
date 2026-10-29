interface AppIconProps {
  className?: string;
}

/**
 * The waveform mark from the approved UI preview. Keep the path in sync with
 * `src/app/icon.svg`, which is the browser/favicon version.
 */
export function AppIcon({ className }: AppIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 12h4l2.2-5.5L13 17l2.1-5H21" />
    </svg>
  );
}
