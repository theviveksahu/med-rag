/**
 * Shared application error catalog.
 *
 * The HTTP status is used by route handlers; client-only PDF codes carry a
 * status too so every AppError has a consistent shape. User-facing messages
 * must never contain report text, filenames, session ids, or provider payloads.
 */

export interface ErrorDefinition {
  status: number;
  message: string;
  retryable: boolean;
}

export const ERROR_CATALOG = {
  // Session / request validation
  INVALID_SESSION_ID: {
    status: 400,
    message: "Your session is invalid. Refresh to start over.",
    retryable: false,
  },
  INVALID_PAYLOAD: {
    status: 400,
    message: "We couldn't read the report data. Please try again.",
    retryable: true,
  },
  INVALID_MESSAGES: {
    status: 400,
    message: "We couldn't read that message. Please try again.",
    retryable: true,
  },
  CONVERSATION_TOO_LONG: {
    status: 400,
    message: "This conversation is too long. Start a new session.",
    retryable: false,
  },
  SESSION_ENDED: {
    status: 410,
    message: "This session has ended. Start a new session.",
    retryable: false,
  },
  SESSION_NOT_READY: {
    status: 409,
    message: "Your report is still being indexed. Please wait.",
    retryable: true,
  },
  UPLOAD_IN_PROGRESS: {
    status: 409,
    message: "An upload is already in progress for this session.",
    retryable: true,
  },

  // Upload / report bounds
  PAYLOAD_TOO_LARGE: {
    status: 413,
    message: "This report's extracted text is too large.",
    retryable: false,
  },
  UNSUPPORTED_FILE_TYPE: {
    status: 415,
    message: "Please choose a PDF file.",
    retryable: false,
  },
  TOO_MANY_PAGES: {
    status: 422,
    message: "This report has more than 30 pages.",
    retryable: false,
  },
  SCANNED_PDF: {
    status: 422,
    message: "This PDF has no selectable text. Scanned PDFs aren't supported.",
    retryable: false,
  },
  EMPTY_REPORT: {
    status: 422,
    message: "We couldn't find any text to index.",
    retryable: false,
  },
  REPORT_TOO_LARGE: {
    status: 422,
    message: "This report is too large to index. Try a shorter report.",
    retryable: false,
  },

  // Provider / quota
  QUOTA_EXHAUSTED: {
    status: 429,
    message: "The demo's daily AI quota is exhausted. It resets at 00:00 UTC.",
    retryable: false,
  },
  RATE_LIMITED: {
    status: 429,
    message: "Too many requests right now. Try again in a minute.",
    retryable: true,
  },
  PROVIDER_AUTH: {
    status: 502,
    message:
      "The demo's AI provider rejected the request. Please try again later.",
    retryable: false,
  },
  PROVIDER_CREDITS: {
    status: 502,
    message: "The demo's AI credits are exhausted. Please try again later.",
    retryable: false,
  },
  PROVIDER_ERROR: {
    status: 502,
    message: "The AI provider is unavailable. Please try again.",
    retryable: true,
  },
  TIMEOUT: {
    status: 504,
    message: "The request took too long. Please try again.",
    retryable: true,
  },
  INTERNAL: {
    status: 500,
    message: "Something went wrong. Please try again.",
    retryable: true,
  },

  // Client-only network / PDF extraction codes
  NETWORK: {
    status: 0,
    message: "We couldn't reach the server. Check your connection and try again.",
    retryable: true,
  },
  PDF_UNSUPPORTED_TYPE: {
    status: 415,
    message: "Please choose a PDF file.",
    retryable: false,
  },
  PDF_TOO_LARGE: {
    status: 413,
    message: "This PDF is larger than 25 MB.",
    retryable: false,
  },
  PDF_TEXT_TOO_LARGE: {
    status: 422,
    message: "This report has too much text to index.",
    retryable: false,
  },
  PDF_TOO_MANY_PAGES: {
    status: 422,
    message: "This report has more than 30 pages.",
    retryable: false,
  },
  PDF_PASSWORD_PROTECTED: {
    status: 422,
    message: "This PDF is password-protected. Upload an unlocked copy.",
    retryable: false,
  },
  PDF_SCANNED: {
    status: 422,
    message: "This PDF has no selectable text. Scanned PDFs aren't supported.",
    retryable: false,
  },
  PDF_INVALID: {
    status: 422,
    message: "We couldn't read this PDF. It may be corrupted.",
    retryable: false,
  },
  PDF_WORKER_FAILED: {
    status: 500,
    message: "The PDF reader failed to start. Refresh and try again.",
    retryable: true,
  },
  PDF_ABORTED: {
    status: 499,
    message: "PDF reading was cancelled.",
    retryable: false,
  },
  PDF_PARSE_FAILED: {
    status: 422,
    message:
      "We couldn't extract text from this PDF. Try another text-based PDF.",
    retryable: false,
  },
} as const satisfies Record<string, ErrorDefinition>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export interface ErrorOptions {
  message?: string;
  status?: number;
  retryable?: boolean;
  requestId?: string;
  cause?: unknown;
}

/**
 * Error with a stable code, HTTP status, user-safe message, and retry flag.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly requestId?: string;

  constructor(code: ErrorCode, options: ErrorOptions = {}) {
    const definition = ERROR_CATALOG[code];

    super(options.message ?? definition.message, {
      cause: options.cause,
    });

    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? definition.status;
    this.retryable = options.retryable ?? definition.retryable;
    this.requestId = options.requestId;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function getErrorDefinition(code: ErrorCode): ErrorDefinition {
  return ERROR_CATALOG[code];
}

export interface ErrorPayload {
  error: {
    code: ErrorCode;
    message: string;
    requestId?: string;
    retryable?: boolean;
  };
}

export function toErrorPayload(
  error: unknown,
  fallbackCode: ErrorCode = "INTERNAL",
  requestId?: string,
): ErrorPayload {
  const appError = isAppError(error) ? error : new AppError(fallbackCode);
  const resolvedRequestId = appError.requestId ?? requestId;

  return {
    error: {
      code: appError.code,
      message: appError.message,
      retryable: appError.retryable,
      ...(resolvedRequestId ? { requestId: resolvedRequestId } : {}),
    },
  };
}
