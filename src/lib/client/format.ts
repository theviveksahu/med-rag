/** Small, presentation-only formatters shared by the client screens. */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  const precision = exponent === 0 || value >= 10 ? 0 : 1;

  return `${value.toFixed(precision)} ${units[exponent]}`;
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Short duration for agent summaries: "1.2s", "8.4s", or "01:12". */
export function formatShortDuration(milliseconds: number): string {
  const safe = Math.max(0, milliseconds);
  const seconds = safe / 1_000;

  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Math.round(seconds)}s`;

  return formatDuration(safe);
}

export function middleEllipsis(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;

  const keep = Math.max(3, maxLength - 1);
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);

  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
