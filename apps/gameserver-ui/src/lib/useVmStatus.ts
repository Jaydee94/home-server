"use client";
import { useEffect, useState } from "react";

export interface VmStatus {
  runStrategy: string; printableStatus: string;
  vmiPhase: string | null; ipAddress: string | null; runningSince: string | null;
}

export function useVmStatus(intervalMs = 5000) {
  const [status, setStatus] = useState<VmStatus | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const res = await fetch("/api/vm");
      if (res.ok && alive) { setStatus(await res.json()); setUpdatedAt(Date.now()); }
    };
    tick();
    const t = setInterval(tick, intervalMs);
    return () => { alive = false; clearInterval(t); };
  }, [intervalMs]);
  const running = status?.vmiPhase === "Running";
  return { status, running, updatedAt };
}
