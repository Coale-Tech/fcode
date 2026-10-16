import { useEffect, useState } from "react";
import { IPC } from "@pi-desktop/shared";
import { formatWorkspaceBarState, type WorkspaceBarState } from "../lib/workspace-bar-state";
// BenchStatusOverride is declared on Window in renderer-api; re-import the type for guard use.
import type { BenchStatusOverride } from "../capture/renderer-api";

type BenchStatus = "stopped" | "starting" | "running" | "failed";

/** Poll IPC.invoke.benchStatus every 3 s; pause when tab is hidden. */
export function useBenchContext(): WorkspaceBarState {
  const [state, setState] = useState<WorkspaceBarState>({ kind: "empty" });

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (document.hidden || cancelled) return;
      // Capture-rig override (active only when __PI_CAPTURE__ is set by the
      // capture suite): skip real IPC and use seeded data from seedBenchStatus.
      if (window.__PI_CAPTURE__) {
        const override: BenchStatusOverride = window.__PI_BENCH_OVERRIDE__ ?? null;
        if (override !== null && !cancelled) {
          setState(formatWorkspaceBarState(override));
          return;
        }
      }
      const bridge = window.piDesktop;
      if (!bridge?.invoke) return;
      try {
        const result = await bridge.invoke<{
          status: BenchStatus;
          benchPath: string | null;
          site: string | null;
        }>(IPC.invoke.benchStatus);
        if (!cancelled && result.ok) {
          setState(formatWorkspaceBarState(result.data));
        }
      } catch { /* ignore IPC failures */ }
    };

    void poll();
    const id = setInterval(() => void poll(), 3000);
    const onVisible = () => { if (!document.hidden) void poll(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return state;
}
