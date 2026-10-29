import "server-only";

export type LogRoute = "upload" | "chat" | "session" | "setup";

/**
 * Safe, explicit log fields. Never add session ids, filenames, report text,
 * questions, answers, embeddings, or provider payloads here.
 */
export interface LogFields {
  requestId: string;
  route: LogRoute;
  stage?: string;
  durationMs?: number;
  errorCode?: string;
  status?: number;
  resultCount?: number;
  batch?: number;
  total?: number;
  pageCount?: number;
  chunkCount?: number;
  reused?: boolean;
}

type LogLevel = "info" | "warn" | "error";

function writeLog(level: LogLevel, fields: LogFields): void {
  const {
    requestId,
    route,
    stage,
    durationMs,
    errorCode,
    status,
    resultCount,
    batch,
    total,
    pageCount,
    chunkCount,
    reused,
  } = fields;

  const line = JSON.stringify({
    level,
    ts: new Date().toISOString(),
    requestId,
    route,
    ...(stage !== undefined ? { stage } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(errorCode !== undefined ? { errorCode } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(resultCount !== undefined ? { resultCount } : {}),
    ...(batch !== undefined ? { batch } : {}),
    ...(total !== undefined ? { total } : {}),
    ...(pageCount !== undefined ? { pageCount } : {}),
    ...(chunkCount !== undefined ? { chunkCount } : {}),
    ...(reused !== undefined ? { reused } : {}),
  });

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export function logEvent(fields: LogFields): void {
  writeLog("info", fields);
}

export function logWarning(fields: LogFields): void {
  writeLog("warn", fields);
}

export function logError(fields: LogFields): void {
  writeLog("error", fields);
}

export function newRequestId(): string {
  return crypto.randomUUID();
}
