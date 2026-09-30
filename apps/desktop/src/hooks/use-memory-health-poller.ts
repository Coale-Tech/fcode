import { useEffect } from "react";
import { useAppStore } from "../stores/app-store";

/** Mount once (in AppShell). Polls omp memory status at 15 s while the Memory
 *  settings tab is open, 60 s otherwise. Stores result in the app store so any
 *  component can read `memoryStatus` / derive health without a second poller. */
export function useMemoryHealthPoller() {
  const page = useAppStore((s) => s.page);
  const settingsTab = useAppStore((s) => s.settingsTab);
  const refresh = useAppStore((s) => s.refreshMemoryStatus);
  const intervalMs = page === "settings" && settingsTab === "memory" ? 15_000 : 60_000;

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);
}
