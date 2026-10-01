/**
 * Pure formatter for the WorkspaceBar status strip.
 * No React, no IPC — testable as plain Node.
 */

export type WorkspaceBarState =
  | { kind: "empty" }
  | { kind: "stopped"; benchName: string; site: string | null }
  | { kind: "running"; benchName: string; site: string | null };

function lastSegment(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function formatWorkspaceBarState(opts: {
  benchPath: string | null;
  site: string | null;
  status: string;
}): WorkspaceBarState {
  if (!opts.benchPath) return { kind: "empty" };
  const benchName = lastSegment(opts.benchPath);
  if (opts.status === "running") return { kind: "running", benchName, site: opts.site };
  return { kind: "stopped", benchName, site: opts.site };
}
