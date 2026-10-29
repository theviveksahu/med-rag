import type { UIMessage } from "ai";

export type SessionStatus = "processing" | "ready" | "error";

/**
 * Report information returned by the upload stream and shown in the chat
 * header. The server-only session document also carries the hash/index time.
 */
export interface ReportSummary {
  filename: string;
  pageCount: number;
  chunkCount: number;
  sizeBytes: number;
}

export interface SessionReport extends ReportSummary {
  sha256: string;
  indexedAt: string;
}

export interface SessionDoc {
  _id: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  report: SessionReport | null;
  error: { code: string; message: string } | null;
  questionCount: number;
}

/**
 * Upload progress stages. "reading" is emitted by the browser; the rest are
 * emitted by /api/upload.
 */
export type UploadStage =
  | "reading"
  | "preparing"
  | "splitting"
  | "embedding"
  | "indexing"
  | "finalizing"
  | "ready";

export interface UploadStageEvent {
  type: "stage";
  stage: UploadStage;
  message: string;
  current?: number;
  total?: number;
  /** Integer 0–100, only when current/total is known. */
  progress?: number;
}

export interface UploadDoneEvent {
  type: "done";
  report: ReportSummary;
  reused: boolean;
}

export interface UploadErrorEvent {
  type: "error";
  code: string;
  message: string;
  requestId: string;
}

export type UploadEvent = UploadStageEvent | UploadDoneEvent | UploadErrorEvent;

/**
 * Chat workflow stage emitted by the agent's search tool and the stream
 * adapter. `startedAt`/`durationMs` are epoch milliseconds.
 */
export interface StageData {
  id: string;
  stage: "searching" | "analyzing" | "writing" | "done";
  message: string;
  startedAt: number;
  durationMs?: number;
  current?: number;
  total?: number;
}

/**
 * Safe, visible trace data. Never include raw chunks or chain-of-thought.
 */
export type TraceData =
  | {
      type: "search";
      query: string;
      pages: number[];
      scores?: number[];
      chunkCount: number;
      durationMs: number;
    }
  | {
      type: "stage";
      stage: string;
      durationMs: number;
    }
  | {
      type: "tool";
      name: string;
      state: "start" | "end";
      input?: unknown;
      outputPreview?: string;
    };

export interface AppErrorData {
  code: string;
  message: string;
  retryable: boolean;
  requestId?: string;
}

export type CustomDataTypes = {
  stage: StageData;
  trace: TraceData;
  error: AppErrorData;
};

export type AgentTools = {
  search_report: {
    input: { query: string };
    output: string;
  };
};

export type CustomDataMessage = UIMessage<
  unknown,
  CustomDataTypes,
  AgentTools
>;

export interface ChatRequestBody {
  messages: UIMessage[];
}

export type UploadStageStatus = "pending" | "active" | "done" | "error";
