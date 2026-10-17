/**
 * Bench detail (benchDetail IPC): installed apps with versions, Procfile
 * process names, webserver port and per-process PIDs. Shared by the Bench
 * detail view and the Build tab hero card; capture mode reads the seeded copy.
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

export async function fetchBenchDetail(benchPath: string): Promise<BenchDetail> {
  if (window.__PI_CAPTURE__ && window.__PI_CAPTURE_BENCH_DETAIL__) return window.__PI_CAPTURE_BENCH_DETAIL__;
  const bridge = window.piDesktop;
  if (!bridge) throw new Error("piDesktop bridge unavailable");
  const result: Result<BenchDetail> = await bridge.invoke<BenchDetail>(IPC.invoke.benchDetail, { benchPath });
  if (!result.ok) throw new Error(result.error.message ?? "IPC call failed");
  return result.data;
}

/** Frappe's release branch for an app version: "v16.8.2" / "16.8.2" → "version-16". */
export function releaseBranch(version: string | undefined): string | null {
  const major = /^v?(\d+)\./.exec(version?.trim() ?? "")?.[1];
  return major ? `version-${major}` : null;
}
