"use client";

import { useCallback, useEffect, useState } from "react";
import { postSessionEnd } from "@/lib/client/api";
import { sessionIdSchema } from "@/lib/shared/schemas";

const SESSION_KEY = "medrag.session.id";

let bootPromise: Promise<string> | null = null;
let currentSessionId: string | null = null;
let pagehideInstalled = false;

function timeoutSignal(ms: number): AbortSignal | undefined {
  try {
    return AbortSignal.timeout(ms);
  } catch {
    return undefined;
  }
}

function readStoredSessionId(): string | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const parsed = sessionIdSchema.safeParse(raw);
    if (!parsed.success) {
      window.sessionStorage.removeItem(SESSION_KEY);
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
}

function writeStoredSessionId(sessionId: string): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, sessionId);
  } catch {
    // Private mode / disabled storage: the id stays in memory.
  }
}

function clearStoredSessionId(): void {
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}

function mintSessionId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");

    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join("-");
  }

  throw new Error("Secure random values are unavailable.");
}

function installPagehideHandler(): void {
  if (pagehideInstalled || typeof window === "undefined") return;
  pagehideInstalled = true;

  window.addEventListener("pagehide", () => {
    const sessionId = currentSessionId;
    if (!sessionId) return;

    const body = JSON.stringify({ sessionId });

    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(
        "/api/session/end",
        new Blob([body], { type: "application/json" }),
      );
      return;
    }

    void fetch("/api/session/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  });
}

function boot(): Promise<string> {
  if (currentSessionId) return Promise.resolve(currentSessionId);
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    const staleSessionId = readStoredSessionId();

    if (staleSessionId) {
      clearStoredSessionId();
      void postSessionEnd(staleSessionId, {
        keepalive: true,
        signal: timeoutSignal(3_000),
      });
    }

    const sessionId = mintSessionId();
    currentSessionId = sessionId;
    writeStoredSessionId(sessionId);
    installPagehideHandler();

    return sessionId;
  })().catch((error: unknown) => {
    bootPromise = null;
    throw error;
  });

  return bootPromise;
}

export interface UseSessionResult {
  sessionId: string | null;
  endSession: () => Promise<void>;
  newSession: () => Promise<string>;
}

export function useSession(): UseSessionResult {
  const [sessionId, setSessionId] = useState<string | null>(
    () => currentSessionId,
  );

  useEffect(() => {
    let active = true;

    void boot().then(
      (id) => {
        if (active) setSessionId(id);
      },
      () => {
        if (active) setSessionId(null);
      },
    );

    return () => {
      active = false;
    };
  }, []);

  const endSession = useCallback(async () => {
    const id = currentSessionId;

    // Start the best-effort deletion before clearing the module-level id.
    // The React Compiler may inline this local alias; clearing first would
    // make the guard false and skip the request.
    if (id) {
      void postSessionEnd(id, {
        keepalive: true,
        signal: timeoutSignal(3_000),
      });
    }

    currentSessionId = null;
    bootPromise = null;
    clearStoredSessionId();
    setSessionId(null);
  }, []);

  const newSession = useCallback(async () => {
    await endSession();

    const id = mintSessionId();
    currentSessionId = id;
    writeStoredSessionId(id);
    installPagehideHandler();
    setSessionId(id);

    return id;
  }, [endSession]);

  return { sessionId, endSession, newSession };
}
