/**
 * Pure formatter for the WorkspaceBar status strip.
 * No React, no IPC — testable as plain Node.
 */

export type WorkspaceBarState =
  | { kind: "empty" }
  | { kind: "stopped"; benchName: string; site: string | null; siteCount: number }
  | { kind: "running"; benchName: string; site: string | null; siteCount: number };

function lastSegment(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export type BenchStatusInput = {
  benchPath: string | null;
  site: string | null;
  status: string;
  /** Number of sites on this bench; defaults to 1 when site is set, 0 otherwise. */
  siteCount?: number;
};

export function formatWorkspaceBarState(opts: BenchStatusInput): WorkspaceBarState {
  if (!opts.benchPath) return { kind: "empty" };
  const benchName = lastSegment(opts.benchPath);
  const siteCount = opts.siteCount ?? (opts.site ? 1 : 0);
  if (opts.status === "running") return { kind: "running", benchName, site: opts.site, siteCount };
  return { kind: "stopped", benchName, site: opts.site, siteCount };
}
