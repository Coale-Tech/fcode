/**
 * T14: Fetch real bench detail (installed apps with versions, procfile entries,
 * webserver port, per-process PIDs) via the benchDetail IPC channel.
 *
 * `fetchBenchDetail` is called by BenchDetail in BenchPage.tsx; in capture mode
 * it returns the fixture seeded via `window.__PI_CAPTURE_BENCH_DETAIL__`.
 */
import { IPC, type Result } from "@pi-desktop/shared";

export type AppWithVersion = { name: string; version: string };

export type BenchDetail = {
  apps: AppWithVersion[];
  procfileEntries: string[];
  port: number | null;
  mainPid: number | null;
  workerPids: Record<string, number | null>;
};

/** Release branch string from the active bench path, e.g. "version-16". */
export function releaseBranch(benchPath: string): string | null {
  const m = benchPath.match(/v(\d+)/) ?? benchPath.match(/version[_-]?(\d+)/i);
  return m ? `version-${m[1]}` : null;
}

export async function fetchBenchDetail(benchPath: string): Promise<BenchDetail> {
  if (window.__PI_CAPTURE__ && window.__PI_CAPTURE_BENCH_DETAIL__) {
    return window.__PI_CAPTURE_BENCH_DETAIL__;
  }
  const bridge = window.piDesktop;
  if (!bridge) throw new Error("piDesktop bridge unavailable");
  const result: Result<BenchDetail> = await bridge.invoke<BenchDetail>(IPC.invoke.benchDetail, { benchPath });
  if (!result.ok) throw new Error(result.error.message ?? "benchDetail IPC failed");
  return result.data;
}
