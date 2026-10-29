import "server-only";

import { AppError } from "@/lib/shared/errors";
import { isRecord } from "@/lib/shared/guards";

/**
 * Turn a provider SDK/fetch error into a safe application error. The raw
 * provider body is only inspected for classification; it never reaches a
 * response, log, or trace.
 */
export function mapProviderError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const status = readStatus(error);
  const detail = readDetail(error);

  if (status === 429) {
    const dailySpecific =
      /free-models-per-day|per[- ]day|\bdaily\b|quota.{0,40}(?:exhaust|exceed)/i.test(
        detail,
      );
    const minuteSpecific =
      /free-models-per-min|per[- ]minute|per[- ]min\b/i.test(detail);

    if (dailySpecific && !minuteSpecific) {
      return new AppError("QUOTA_EXHAUSTED", { cause: error });
    }

    return new AppError("RATE_LIMITED", { cause: error });
  }

  if (status === 401 || status === 403) {
    return new AppError("PROVIDER_AUTH", { cause: error });
  }

  if (status === 402) {
    return new AppError("PROVIDER_CREDITS", { cause: error });
  }

  if (status !== undefined && status >= 500) {
    return new AppError("PROVIDER_ERROR", { cause: error });
  }

  const name = readName(error);
  if (
    name === "AbortError" ||
    name === "TimeoutError" ||
    name === "APIConnectionTimeoutError" ||
    /timed? out|timeout/i.test(detail)
  ) {
    return new AppError("TIMEOUT", { cause: error });
  }

  return new AppError("INTERNAL", { cause: error });
}

function readStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;

  for (const key of ["status", "statusCode"] as const) {
    const value = error[key];
    if (typeof value === "number" && Number.isInteger(value)) {
      return value;
    }
  }

  const response = error.response;
  if (isRecord(response)) {
    const value = response.status ?? response.statusCode;
    if (typeof value === "number" && Number.isInteger(value)) {
      return value;
    }
  }

  return undefined;
}

function readName(error: unknown): string {
  if (!isRecord(error)) return "";
  return typeof error.name === "string" ? error.name : "";
}

function readDetail(error: unknown): string {
  if (!isRecord(error)) return error instanceof Error ? error.message : "";

  const parts: string[] = [];
  const message = error.message;
  if (typeof message === "string") parts.push(message);

  const code = error.code;
  if (typeof code === "string") parts.push(code);

  const providerError = error.error;
  if (typeof providerError === "string") {
    parts.push(providerError);
  } else if (isRecord(providerError)) {
    const providerMessage = providerError.message;
    if (typeof providerMessage === "string") parts.push(providerMessage);
    const providerCode = providerError.code;
    if (typeof providerCode === "string") parts.push(providerCode);
  }

  const response = error.response;
  if (isRecord(response)) {
    const data = response.data;
    if (typeof data === "string") {
      parts.push(data);
    } else if (isRecord(data)) {
      const dataError = data.error;
      if (typeof dataError === "string") {
        parts.push(dataError);
      } else if (isRecord(dataError) && typeof dataError.message === "string") {
        parts.push(dataError.message);
      }
    }
  }

  return parts.join(" ").slice(0, 4_000);
}
