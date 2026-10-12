/**
 * Bench allow-list (shared by the desktop BenchSupervisor and pi-host) and a
 * supervisor-free one-shot runner for pi-host's fcode_bench_* / fcode_studio tools.
 */
import { spawn } from "node:child_process";

/** Verbs the fcode_bench_run host tool may invoke. "start" stays in BenchPage. */
export const ALLOWED_BENCH_VERBS = new Set([
  "migrate",
  "clear-cache",
  "build",
  "build-studio-app",
  "list-apps",
  "install-app",
]);

/** Returns true when the verb is safe for the fcode_bench_run host tool. */
export function shouldAutoApproveVerb(verb: string): boolean {
  return ALLOWED_BENCH_VERBS.has(verb);
}

export type OneShotResult = { exitCode: number; output: string };

/**
 * Run a single bench command (no watcher, no supervisor). The caller must verify
 * the verb is in ALLOWED_BENCH_VERBS or "run-tests" before calling.
 */
export async function runBenchOneShot(
  benchPath: string,
  site: string | null,
  verb: string,
  args: string[] = [],
): Promise<OneShotResult> {
  const argv = site ? ["--site", site, verb, ...args] : [verb, ...args];
  // ponytail: new Promise because Promise.withResolvers() needs the ES2024 lib,
  // which the base tsconfig does not include.
  return new Promise<OneShotResult>((resolve) => {
    const chunks: string[] = [];
    const child = spawn("bench", argv, { cwd: benchPath, env: { ...process.env }, shell: false, windowsHide: true });
    const onData = (chunk: Buffer | string) => chunks.push(String(chunk));
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("close", (code) => resolve({ exitCode: code ?? 1, output: chunks.join("") }));
    child.on("error", (err) => resolve({ exitCode: 1, output: err.message }));
  });
}
