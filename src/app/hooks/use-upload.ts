"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, postUpload, toAppErrorData } from "@/lib/client/api";
import {
  extractPdf,
  type ExtractedReport,
} from "@/lib/client/extract-pdf";
import {
  ERROR_CATALOG,
  isAppError,
  type ErrorCode,
} from "@/lib/shared/errors";
import type {
  AppErrorData,
  ReportSummary,
  UploadEvent,
  UploadStageStatus,
} from "@/lib/shared/types";

export type UploadPhase = "idle" | "processing" | "ready" | "error";

export type UploadStageId =
  | "reading"
  | "preparing"
  | "embedding"
  | "finalizing";

export interface UploadStageView {
  id: UploadStageId;
  label: string;
  status: UploadStageStatus;
  detail?: string;
  progress?: number;
}

export interface UploadState {
  phase: UploadPhase;
  file: { name: string; size: number } | null;
  pageCount: number | null;
  stages: UploadStageView[];
  startedAt: number | null;
  error: AppErrorData | null;
  report: ReportSummary | null;
}

const STAGE_DEFINITIONS: Array<{
  id: UploadStageId;
  label: string;
}> = [
  { id: "reading", label: "Reading your PDF" },
  { id: "preparing", label: "Splitting into sections" },
  { id: "embedding", label: "Building the search index" },
  { id: "finalizing", label: "Finishing up" },
];

function createStages(): UploadStageView[] {
  return STAGE_DEFINITIONS.map((stage) => ({
    ...stage,
    status: "pending",
  }));
}

function createInitialState(): UploadState {
  return {
    phase: "idle",
    file: null,
    pageCount: null,
    stages: createStages(),
    startedAt: null,
    error: null,
    report: null,
  };
}

function updateStage(
  stages: UploadStageView[],
  id: UploadStageId,
  patch: Partial<UploadStageView>,
): UploadStageView[] {
  return stages.map((stage) =>
    stage.id === id ? { ...stage, ...patch } : stage,
  );
}

function stagesAfterParse(): UploadStageView[] {
  return createStages().map((stage) => {
    if (stage.id === "reading") {
      return { ...stage, status: "done", progress: 100 };
    }
    if (stage.id === "preparing") {
      return { ...stage, status: "active", detail: "Splitting…" };
    }
    return stage;
  });
}

function markActiveError(stages: UploadStageView[]): UploadStageView[] {
  const active =
    stages.find((stage) => stage.status === "active") ??
    stages.find((stage) => stage.status === "pending") ??
    stages[stages.length - 1];

  return stages.map((stage) =>
    stage.id === active.id ? { ...stage, status: "error" } : stage,
  );
}

function markAllDone(stages: UploadStageView[]): UploadStageView[] {
  return stages.map((stage) => ({
    ...stage,
    status: "done",
    ...(stage.progress !== undefined ? { progress: 100 } : {}),
  }));
}

export interface UseUploadOptions {
  sessionId: string | null;
  newSession: () => Promise<string>;
  onReady: (report: ReportSummary) => void;
}

export interface UseUploadResult {
  state: UploadState;
  start: (file: File) => Promise<void>;
  cancel: () => Promise<void>;
  retry: () => Promise<void>;
}

export function useUpload({
  sessionId,
  newSession,
  onReady,
}: UseUploadOptions): UseUploadResult {
  const [state, setState] = useState<UploadState>(createInitialState);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<File | null>(null);
  const payloadRef = useRef<ExtractedReport | null>(null);
  const readyTimerRef = useRef<number | null>(null);

  const clearReadyTimer = useCallback(() => {
    if (readyTimerRef.current !== null) {
      window.clearTimeout(readyTimerRef.current);
      readyTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearReadyTimer();
      abortRef.current?.abort();
    };
  }, [clearReadyTimer]);

  const runUpload = useCallback(
    async (
      payload: ExtractedReport,
      file: File,
      controller: AbortController,
      startedAt: number,
    ) => {
      if (!sessionId) {
        setState((previous) => ({
          ...previous,
          phase: "error",
          error: {
            code: "INVALID_SESSION_ID",
            message: ERROR_CATALOG.INVALID_SESSION_ID.message,
            retryable: false,
          },
          stages: markActiveError(previous.stages),
        }));
        return;
      }

      setState((previous) => ({
        ...previous,
        phase: "processing",
        file: { name: file.name, size: file.size },
        pageCount: payload.pageCount,
        stages: stagesAfterParse(),
        startedAt,
        error: null,
        report: null,
      }));

      let terminal = false;

      const handleEvent = (event: UploadEvent) => {
        if (controller.signal.aborted) return;

        if (event.type === "stage") {
          if (event.stage === "preparing") {
            const count = event.current ?? event.total;
            setState((previous) => ({
              ...previous,
              stages: previous.stages.map((stage) => {
                if (stage.id === "reading") {
                  return { ...stage, status: "done", progress: 100 };
                }
                if (stage.id === "preparing") {
                  return {
                    ...stage,
                    status: "done",
                    detail: count
                      ? `${count} ${count === 1 ? "section" : "sections"}`
                      : event.message,
                  };
                }
                if (stage.id === "embedding") {
                  return {
                    ...stage,
                    status: "active",
                    detail: event.total ? `0 of ${event.total}` : undefined,
                    progress: event.total ? 0 : undefined,
                  };
                }
                return stage;
              }),
            }));
            return;
          }

          if (event.stage === "embedding") {
            const detail =
              event.current !== undefined && event.total !== undefined
                ? `${event.current} of ${event.total} ${
                    event.total === 1 ? "section" : "sections"
                  }`
                : event.message;

            setState((previous) => ({
              ...previous,
              stages: previous.stages.map((stage) => {
                if (stage.id === "reading" || stage.id === "preparing") {
                  return { ...stage, status: "done" };
                }
                if (stage.id === "embedding") {
                  return {
                    ...stage,
                    status: "active",
                    detail,
                    progress: event.progress,
                  };
                }
                return stage;
              }),
            }));
            return;
          }

          if (event.stage === "finalizing") {
            setState((previous) => ({
              ...previous,
              stages: previous.stages.map((stage) => {
                if (
                  stage.id === "reading" ||
                  stage.id === "preparing" ||
                  stage.id === "embedding"
                ) {
                  return { ...stage, status: "done" };
                }
                if (stage.id === "finalizing") {
                  return {
                    ...stage,
                    status: "active",
                    detail: event.message,
                  };
                }
                return stage;
              }),
            }));
          }
          return;
        }

        if (event.type === "error") {
          terminal = true;
          const definition = ERROR_CATALOG[event.code as ErrorCode];

          setState((previous) => ({
            ...previous,
            phase: "error",
            error: {
              code: event.code,
              message: event.message,
              requestId: event.requestId,
              retryable: definition?.retryable ?? true,
            },
            stages: markActiveError(previous.stages),
          }));
          return;
        }

        terminal = true;
        clearReadyTimer();
        setState((previous) => ({
          ...previous,
          phase: "ready",
          stages: markAllDone(previous.stages),
          report: event.report,
          error: null,
        }));

        readyTimerRef.current = window.setTimeout(() => {
          readyTimerRef.current = null;
          onReady(event.report);
        }, 700);
      };

      try {
        await postUpload({
          sessionId,
          payload,
          signal: controller.signal,
          onEvent: handleEvent,
        });

        if (!terminal && !controller.signal.aborted) {
          throw new ApiError({
            code: "INTERNAL",
            message:
              "The connection closed before indexing finished. Please try again.",
            retryable: true,
            status: 0,
          });
        }
      } catch (error) {
        if (controller.signal.aborted || terminal) return;
        if (isAppError(error) && error.code === "PDF_ABORTED") return;

        setState((previous) => ({
          ...previous,
          phase: "error",
          error: toAppErrorData(error),
          stages: markActiveError(previous.stages),
        }));
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [clearReadyTimer, onReady, sessionId],
  );

  const start = useCallback(
    async (file: File) => {
      clearReadyTimer();
      abortRef.current?.abort();

      const controller = new AbortController();
      const startedAt = Date.now();
      abortRef.current = controller;
      fileRef.current = file;
      payloadRef.current = null;

      setState({
        ...createInitialState(),
        phase: "processing",
        file: { name: file.name, size: file.size },
        startedAt,
        stages: updateStage(createStages(), "reading", {
          status: "active",
          detail: "Opening the PDF…",
        }),
      });

      try {
        const payload = await extractPdf(file, {
          signal: controller.signal,
          onProgress: (page, total) => {
            if (controller.signal.aborted) return;

            setState((previous) => ({
              ...previous,
              pageCount: total,
              stages: updateStage(previous.stages, "reading", {
                status: "active",
                detail: `Page ${page} of ${total}`,
                progress:
                  total > 0 ? Math.round((page / total) * 100) : undefined,
              }),
            }));
          },
        });

        if (controller.signal.aborted) return;

        payloadRef.current = payload;
        await runUpload(payload, file, controller, startedAt);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (isAppError(error) && error.code === "PDF_ABORTED") return;

        setState((previous) => ({
          ...previous,
          phase: "error",
          error: toAppErrorData(error),
          stages: markActiveError(previous.stages),
        }));
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [clearReadyTimer, runUpload],
  );

  const retry = useCallback(async () => {
    const file = fileRef.current;
    const payload = payloadRef.current;

    if (!file) return;

    clearReadyTimer();
    abortRef.current?.abort();

    if (!payload) {
      await start(file);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    await runUpload(payload, file, controller, Date.now());
  }, [clearReadyTimer, runUpload, start]);

  const cancel = useCallback(async () => {
    clearReadyTimer();
    abortRef.current?.abort();
    abortRef.current = null;
    fileRef.current = null;
    payloadRef.current = null;

    try {
      await newSession();
    } catch {
      // The page still returns to Upload; the TTL covers any leftover data.
    } finally {
      setState(createInitialState());
    }
  }, [clearReadyTimer, newSession]);

  return { state, start, cancel, retry };
}
