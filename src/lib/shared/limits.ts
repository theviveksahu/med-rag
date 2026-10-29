/**
 * Shared, public limits used by the browser and the server.
 *
 * Keep these values in sync with docs/SPEC.md §4.2. They contain no secrets and
 * are safe to import from client components.
 */

export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_PAGES = 30;
export const MIN_TEXT_CHARS = 200;
export const MAX_TEXT_CHARS = 1_000_000;
export const MAX_PAGE_CHARS = 100_000;
export const MAX_REPORT_FILENAME_CHARS = 255;
export const MAX_CHUNKS = 200;

export const CHUNK_SIZE = 1_000;
export const CHUNK_OVERLAP = 200;
export const EMBED_BATCH_SIZE = 16;
export const EMBEDDING_DIMENSIONS = 4_096;
export const VECTOR_INDEX_NAME = "vector_index";

export const TOP_K = 4;
export const MAX_DELEGATED_CHUNKS = 3;
export const MAX_SEARCHES_PER_TURN = 3;

export const MAX_CHAT_MESSAGES = 40;

/**
 * Crash-safety backstop only. Refresh, tab close, replace, and new-session
 * delete explicitly; this short window catches a failed unload request.
 */
export const SESSION_TTL_MS = 30 * 60 * 1_000;
export const UPLOAD_BODY_LIMIT_BYTES = 4_000_000;
export const INDEX_LAG_MS = 2_000;
export const STALE_UPLOAD_MS = 10 * 60 * 1_000;
