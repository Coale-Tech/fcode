import { useEffect, useState } from "react";
import { IPC } from "@pi-desktop/shared";
import {
  formatWorkspaceBarState,
  type BenchStatusInput,
  type WorkspaceBarState,
} from "../lib/workspace-bar-state";

/** Capture-only bench status set by the capture rig before a shot. */
function captureBenchOverride(): BenchStatusInput | undefined {
  return (window as unknown as { __PI_BENCH_OVERRIDE__?: BenchStatusInput }).__PI_BENCH_OVERRIDE__;
}

/** Poll IPC.invoke.benchStatus every 3 s; pause when tab is hidden.
 * Capture override: set `window.__PI_BENCH_OVERRIDE__` to a bench-status data object. */
export function useBenchContext(): WorkspaceBarState {
  const [state, setState] = useState<WorkspaceBarState>(() => {
    const override = captureBenchOverride();
    return override ? formatWorkspaceBarState(override) : { kind: "empty" };
  });

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | undefined;

    // Capture rig re-applies the override after a layout remount; the poll
    // below skips while the override global is set, so it cannot reset it.
    const onOverride = (e: Event) => {
      setState(formatWorkspaceBarState((e as CustomEvent<BenchStatusInput>).detail));
    };
    window.addEventListener("pi-bench-override", onOverride);

    const poll = async () => {
      // Skip if cancelled, tab hidden, or a capture override is active.
      if (document.hidden || cancelled) return;
      if (captureBenchOverride()) return;
      const bridge = window.piDesktop;
      if (!bridge?.invoke) return;
      try {
        const result = await bridge.invoke<BenchStatusInput>(IPC.invoke.benchStatus);
        if (!cancelled && result.ok) {
          setState(formatWorkspaceBarState(result.data));
        }
      } catch { /* ignore IPC failures */ }
    };

    void poll();
    intervalId = window.setInterval(() => void poll(), 3000);
    const onVisible = () => { if (!document.hidden) void poll(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pi-bench-override", onOverride);
    };
  }, []);

  return state;
}
