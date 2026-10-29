"use client";

import { useEffect, useState } from "react";

/** Elapsed wall-clock time for a running operation. */
export function useElapsed(startedAt: number | null, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null || !active) return;

    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active, startedAt]);

  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}
