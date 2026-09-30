/**
 * use-bench-status — shared hook + pure helpers for bench state (B8 fix).
 *
 * Polls IPC bench/status every 2 s while mounted.
 * Pure functions are exported for direct testing without JSX.
 */
import { useEffect, useRef, useState } from "react";

export type BenchStatus = "stopped" | "starting" | "running" | "failed";

export interface BenchStatusSnapshot {
  status: BenchStatus;
  benchPath: string | null;
  site: string | null;
}

/**
 * Maps a bench status to a display label and CSS modifier class.
 * Pure — no side effects; testable without React or a DOM.
 *
 * Note: chat-shell.css only defines `.is-running` and `.is-stopped` on
 * `.workspace-bar-run-state`. "starting" and "failed" map to is-stopped
 * visually; the text label conveys the semantic difference.
 * ponytail: add is-starting/is-failed tokens if visual differentiation is needed.
 */
export function benchStatusDisplay(status: BenchStatus): { label: string; cls: string } {
  switch (status) {
    case "running":  return { label: "running",   cls: "is-running" };
    case "starting": return { label: "starting…", cls: "is-stopped" };
    case "failed":   return { label: "failed",    cls: "is-stopped" };
    default:         return { label: "stopped",   cls: "is-stopped" };
  }
}

/**
 * Derives whether each bench onboarding step is done.
 * Pure — testable without React or a DOM.
 *
 * bench.select: done when a bench is active (benchPath set) OR a project workspace is set.
 * bench.start:  done when status is "running".
 */
export function deriveBenchOnboarding(
  status: BenchStatus,
  benchPath: string | null,
  workspace: unknown,
): { select: boolean; start: boolean } {
  return {
    select: benchPath !== null || workspace != null,
    start: status === "running",
  };
}

// Channel string mirrors IPC.invoke.benchStatus from @pi-desktop/shared/protocol.ts.
// Using a literal avoids importing the shared package (its dist may not be built yet
// in test environments that import this file directly).
const BENCH_STATUS_CHANNEL = "pi-desktop/bench/status" as const;
const POLL_MS = 2000;

async function pollOnce(): Promise<BenchStatusSnapshot | null> {
  const bridge = window.piDesktop;
  if (!bridge) return null;
  const result = await bridge.invoke<{
    status: BenchStatus;
    benchPath: string | null;
    site: string | null;
    // startedAt and logs are present per shared contract but deliberately ignored here
    // to avoid storing potentially 5000-line log arrays in React state.
  }>(BENCH_STATUS_CHANNEL);
  if (!result.ok) return null;
  const { status, benchPath, site } = result.data;
  return { status, benchPath, site };
}

/** Polls IPC bench/status every 2 s; stops when the component unmounts. */
export function useBenchStatus(): BenchStatusSnapshot {
  const [snap, setSnap] = useState<BenchStatusSnapshot>({
    status: "stopped",
    benchPath: null,
    site: null,
  });
  // Ref so the closure inside setInterval always sees the latest value without
  // needing to re-register the interval on every state change.
  const snapRef = useRef(snap);
  snapRef.current = snap;

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (!alive) return;
      const next = await pollOnce().catch(() => null);
      if (!alive || !next) return;
      const cur = snapRef.current;
      // Compare before set to avoid needless re-renders.
      if (
        next.status !== cur.status ||
        next.benchPath !== cur.benchPath ||
        next.site !== cur.site
      ) {
        setSnap(next);
      }
    };
    void poll();
    const id = setInterval(() => { void poll(); }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return snap;
}
