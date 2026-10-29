/**
 * Narrow an unknown value to a plain object with string keys. Shared by client
 * and server boundary code so the object-shape guard lives in one place.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
