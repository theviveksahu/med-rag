"use client";

import { useCallback, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { ReportSummary } from "@/lib/shared/types";
import { AppShell } from "./components/shell/app-shell";
import { UploadScreen } from "./components/upload/upload-screen";
import { ProcessingScreen } from "./components/processing/processing-screen";
import { ChatScreen } from "./components/chat/chat-screen";
import { useSession } from "./hooks/use-session";
import { useUpload } from "./hooks/use-upload";

type AppState =
  | { phase: "loading" }
  | { phase: "upload" }
  | { phase: "processing"; file: File }
  | { phase: "chat"; report: ReportSummary };

function LoadingScreen() {
  return (
    <div className="flex min-h-full items-center justify-center px-6 py-12">
      <div
        role="status"
        className="flex items-center gap-2 text-xs text-(--foreground-muted)"
      >
        <LoaderCircle
          className="h-4 w-4 animate-spin text-(--accent)"
          strokeWidth={2}
        />
        Starting a private session…
      </div>
    </div>
  );
}

export default function Home() {
  const { sessionId, newSession } = useSession();
  const [appState, setAppState] = useState<AppState>({ phase: "loading" });

  const handleReady = useCallback((report: ReportSummary) => {
    setAppState({ phase: "chat", report });
  }, []);

  const upload = useUpload({
    sessionId,
    newSession,
    onReady: handleReady,
  });

  function handleAnalyze(file: File) {
    setAppState({ phase: "processing", file });
    void upload.start(file);
  }

  async function handleCancel() {
    await upload.cancel();
    setAppState({ phase: "upload" });
  }

  async function handleStartOver() {
    await upload.cancel();
    setAppState({ phase: "upload" });
  }

  async function handleNewSession() {
    await newSession();
    setAppState({ phase: "upload" });
  }

  return (
    <AppShell>
      {appState.phase === "loading" && !sessionId && <LoadingScreen />}

      {(appState.phase === "upload" ||
        (appState.phase === "loading" && sessionId)) && (
        <UploadScreen onAnalyze={handleAnalyze} />
      )}

      {appState.phase === "processing" && (
        <ProcessingScreen
          file={{
            name: appState.file.name,
            size: appState.file.size,
          }}
          state={upload.state}
          onCancel={() => void handleCancel()}
          onRetry={() => void upload.retry()}
          onStartOver={() => void handleStartOver()}
        />
      )}

      {appState.phase === "chat" && sessionId && (
        <ChatScreen
          sessionId={sessionId}
          report={appState.report}
          onStartOver={handleNewSession}
        />
      )}

      {appState.phase === "chat" && !sessionId && <LoadingScreen />}
    </AppShell>
  );
}
