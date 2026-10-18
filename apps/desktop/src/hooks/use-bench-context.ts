import { useEffect, useState } from "react";
/** IPC channel key — inline to keep this hook free of @pi-desktop/shared (SSR-safe). */
const BENCH_STATUS_IPC = "pi-desktop/bench/status" as const;
import {
  formatWorkspaceBarState,
  type BenchStatusInput,
  type WorkspaceBarState,
} from "../lib/workspace-bar-state";

/** Poll IPC.invoke.benchStatus every 3 s; pause when tab is hidden.
 * Capture override: set `window.__PI_BENCH_OVERRIDE__` to a bench-status data object. */
export function useBenchContext(): WorkspaceBarState {
  const [state, setState] = useState<WorkspaceBarState>(() => {
    const override = typeof window !== "undefined" && window.__PI_CAPTURE__
      ? window.__PI_BENCH_OVERRIDE__ ?? undefined
      : undefined;
    return override ? formatWorkspaceBarState(override) : { kind: "empty" };
  });

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | undefined;

    // Capture rig re-applies the override after a layout remount; the poll
    // below skips while the override global is set, so it cannot reset it.
    const onOverride = (e: Event) => {
      const ev = e as CustomEvent<BenchStatusInput>; // Event→CustomEvent: unexpressible DOM library type
      setState(formatWorkspaceBarState(ev.detail));
    };
    if (window.__PI_CAPTURE__) window.addEventListener("pi-bench-override", onOverride);

    const poll = async () => {
      if (cancelled) return;
      // Capture-rig override: runs even when document.hidden so CDP-driven
      // screenshots always see bench state regardless of OS window visibility.
      if (window.__PI_CAPTURE__) {
        const override = window.__PI_BENCH_OVERRIDE__ ?? undefined;
        if (override !== undefined) {
          setState(formatWorkspaceBarState(override));
          return;
        }
      }
      if (document.hidden) return;
      const bridge = window.piDesktop;
      if (!bridge?.invoke) return;
      try {
        const result = await bridge.invoke<BenchStatusInput>(BENCH_STATUS_IPC);
        if (!cancelled && result.ok) {
          setState(formatWorkspaceBarState(result.data));
        }
      } catch { /* ignore IPC failures */ }
    };

    void poll();
    intervalId = window.setInterval(() => void poll(), 3000);
    const onVisible = () => { if (!document.hidden) void poll(); };
    const onBenchUpdate = () => { void poll(); };
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("pi:bench-update", onBenchUpdate);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("pi:bench-update", onBenchUpdate);
      if (window.__PI_CAPTURE__) window.removeEventListener("pi-bench-override", onOverride);
    };
  }, []);

  return state;
}
