import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/client/api";
import type { ExtractedReport } from "@/lib/client/extract-pdf";
import type { UploadEvent } from "@/lib/shared/types";
import { useUpload } from "./use-upload";

const mocks = vi.hoisted(() => ({
  extractPdf: vi.fn(),
  postUpload: vi.fn(),
}));

vi.mock("@/lib/client/extract-pdf", () => ({
  extractPdf: mocks.extractPdf,
}));

vi.mock("@/lib/client/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/client/api")>();
  return {
    ...actual,
    postUpload: mocks.postUpload,
  };
});

const sessionId = "123e4567-e89b-42d3-a456-426614174000";
const report = {
  filename: "synthetic-report.pdf",
  pageCount: 1,
  chunkCount: 4,
  sizeBytes: 1_400,
};
const payload: ExtractedReport = {
  filename: report.filename,
  fileSize: report.sizeBytes,
  pageCount: 1,
  pages: [{ page: 1, text: "Synthetic text ".repeat(20) }],
};

function makeFile(): File {
  return new File(["%PDF-1.7"], report.filename, {
    type: "application/pdf",
  });
}

function successfulUpload() {
  mocks.postUpload.mockImplementation(
    async ({ onEvent }: { onEvent: (event: UploadEvent) => void }) => {
      onEvent({
        type: "stage",
        stage: "preparing",
        message: "Splitting into sections",
        current: 1,
        total: 1,
      });
      onEvent({
        type: "stage",
        stage: "embedding",
        message: "Building the search index",
        current: 1,
        total: 1,
        progress: 100,
      });
      onEvent({
        type: "stage",
        stage: "finalizing",
        message: "Finishing up",
      });
      onEvent({ type: "done", report, reused: false });
    },
  );
}

beforeEach(() => {
  mocks.extractPdf.mockReset();
  mocks.postUpload.mockReset();
  mocks.extractPdf.mockResolvedValue(payload);
});

describe("useUpload", () => {
  it("moves from parsing through indexing to ready", async () => {
    successfulUpload();
    const onReady = vi.fn();
    const { result } = renderHook(() =>
      useUpload({
        sessionId,
        newSession: vi.fn(),
        onReady,
      }),
    );

    await act(async () => {
      await result.current.start(makeFile());
    });

    expect(result.current.state.phase).toBe("ready");
    expect(result.current.state.report).toEqual(report);
    expect(result.current.state.stages.every((stage) => stage.status === "done")).toBe(
      true,
    );
    expect(result.current.state.stages[1]?.detail).toBe("1 section");
    expect(result.current.state.stages[2]?.progress).toBe(100);

    await waitFor(() => expect(onReady).toHaveBeenCalledWith(report), {
      timeout: 2_000,
    });
  });

  it("surfaces a safe upload error and keeps the parsed payload for retry", async () => {
    mocks.postUpload.mockRejectedValueOnce(
      new ApiError({
        code: "QUOTA_EXHAUSTED",
        message: "The demo's daily AI quota is exhausted.",
        retryable: false,
        status: 429,
      }),
    );
    const onReady = vi.fn();
    const { result } = renderHook(() =>
      useUpload({ sessionId, newSession: vi.fn(), onReady }),
    );

    await act(async () => {
      await result.current.start(makeFile());
    });

    await waitFor(() =>
      expect(result.current.state.phase).toBe("error"),
    );
    expect(result.current.state.error?.code).toBe("QUOTA_EXHAUSTED");
    expect(result.current.state.error?.retryable).toBe(false);
    expect(onReady).not.toHaveBeenCalled();

    successfulUpload();
    await act(async () => {
      await result.current.retry();
    });

    await waitFor(() =>
      expect(result.current.state.phase).toBe("ready"),
    );
    expect(mocks.extractPdf).toHaveBeenCalledTimes(1);
    expect(mocks.postUpload).toHaveBeenCalledTimes(2);
  });

  it("returns an invalid-session error without calling the upload route", async () => {
    const { result } = renderHook(() =>
      useUpload({ sessionId: null, newSession: vi.fn(), onReady: vi.fn() }),
    );

    await act(async () => {
      await result.current.start(makeFile());
    });

    await waitFor(() =>
      expect(result.current.state.phase).toBe("error"),
    );
    expect(result.current.state.error?.code).toBe("INVALID_SESSION_ID");
    expect(mocks.postUpload).not.toHaveBeenCalled();
  });

  it("cancels by ending the session and resetting state", async () => {
    const newSession = vi.fn().mockResolvedValue(sessionId);
    const { result } = renderHook(() =>
      useUpload({ sessionId, newSession, onReady: vi.fn() }),
    );

    await act(async () => {
      await result.current.cancel();
    });

    expect(newSession).toHaveBeenCalledTimes(1);
    expect(result.current.state.phase).toBe("idle");
    expect(result.current.state.report).toBeNull();
  });
});
