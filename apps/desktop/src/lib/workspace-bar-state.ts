/**
 * Pure formatter for the WorkspaceBar status strip.
 * No React, no IPC — testable as plain Node.
 */

export type WorkspaceBarState =
  | { kind: "empty" }
  | { kind: "stopped"; benchName: string; site: string | null; siteCount?: number }
  | { kind: "running"; benchName: string; site: string | null; siteCount?: number };

function lastSegment(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function formatWorkspaceBarState(opts: {
  benchPath: string | null;
  site: string | null;
  status: string;
  siteCount?: number;
}): WorkspaceBarState {
  if (!opts.benchPath) return { kind: "empty" };
  const benchName = lastSegment(opts.benchPath);
  const siteCount = opts.siteCount;
  if (opts.status === "running") return { kind: "running", benchName, site: opts.site, siteCount };
  return { kind: "stopped", benchName, site: opts.site, siteCount };
}
