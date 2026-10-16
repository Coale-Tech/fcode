import { useEffect, useState } from "react";
import { IPC } from "@pi-desktop/shared";
import { formatWorkspaceBarState, type WorkspaceBarState } from "../lib/workspace-bar-state";

type BenchStatus = "stopped" | "starting" | "running" | "failed";

/** Poll IPC.invoke.benchStatus every 3 s; pause when tab is hidden.
 * Capture override: set `window.__PI_BENCH_OVERRIDE__` to a bench-status data object. */
export function useBenchContext(): WorkspaceBarState {
  const override = (window as unknown as { __PI_BENCH_OVERRIDE__?: { status: string; benchPath: string; site: string } }).__PI_BENCH_OVERRIDE__;
  const [state, setState] = useState<WorkspaceBarState>(() =>
    override ? formatWorkspaceBarState(override as Parameters<typeof formatWorkspaceBarState>[0]) : { kind: "empty" }
  );

  useEffect(() => {
    if (override) {
      setState(formatWorkspaceBarState(override as Parameters<typeof formatWorkspaceBarState>[0]));
    }

    let cancelled = false;
    let intervalId: number | undefined;

    // Capture override via custom event — dispatched from CDP in capture mode.
    // Also clears the polling interval so the poll can't reset the override.
    const onOverride = (e: Event) => {
      setState(formatWorkspaceBarState((e as CustomEvent).detail));
      clearInterval(intervalId);
      intervalId = undefined;
    };
    window.addEventListener("pi-bench-override", onOverride);

    const poll = async () => {
      // Skip if cancelled, tab hidden, or a capture override is active.
      if (document.hidden || cancelled) return;
      if ((window as unknown as { __PI_BENCH_OVERRIDE__?: unknown }).__PI_BENCH_OVERRIDE__) return;
      const bridge = window.piDesktop;
      if (!bridge?.invoke) return;
      try {
        const result = await bridge.invoke<{
          status: string;
          benchPath: string | null;
          site: string | null;
        }>(IPC.invoke.benchStatus);
        if (!cancelled && result.ok) {
          setState(formatWorkspaceBarState(result.data));
        }
      } catch { /* ignore IPC failures */ }
    };

    void poll();
    intervalId = setInterval(() => void poll(), 3000);
    const onVisible = () => { if (!document.hidden) void poll(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pi-bench-override", onOverride);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
