/**
 * Pure formatter for the WorkspaceBar status strip.
 * No React, no IPC — testable as plain Node.
 */

export type WorkspaceBarState =
  | { kind: "empty" }
  | { kind: "stopped"; benchName: string; site: string | null; siteCount: number }
  | { kind: "running"; benchName: string; site: string | null; siteCount: number };


export type BenchStatusInput = {
  benchPath: string | null;
  site: string | null;
  status: string;
  /** Number of sites on this bench; defaults to 1 when site is set, 0 otherwise. */
  siteCount?: number;
};

export function formatWorkspaceBarState(opts: BenchStatusInput): WorkspaceBarState {
  if (!opts.benchPath) return { kind: "empty" };
  const benchName = opts.benchPath.split(/[\\/]/).filter(Boolean).pop() ?? opts.benchPath;
  const siteCount = opts.siteCount ?? (opts.site ? 1 : 0);
  if (opts.status === "running") return { kind: "running", benchName, site: opts.site, siteCount };
  return { kind: "stopped", benchName, site: opts.site, siteCount };
}

export type StatusPermissionMode = "ask" | "accept-edits" | "auto";

type AgentConfig = { modelId?: string; providerId?: string; permissionMode?: string } | undefined;

function globalMode(value: unknown): StatusPermissionMode | null {
  return value === "ask" || value === "accept-edits" || value === "auto" ? value : null;
}

/**
 * Effective model + permission mode for the status bar's right cluster, resolved
 * the way the Composer does: the active session (or the draft when no session is
 * open), then the global defaults. `inherit` falls back to the global mode.
 */
export function resolveStatusAgent(input: {
  session?: AgentConfig;
  draft?: AgentConfig;
  settings?: { defaultModelId?: string; defaultProviderId?: string; defaultPermissionMode?: string } | null;
  providers: ReadonlyArray<{ id: string; defaultModelId?: string; models?: ReadonlyArray<{ id: string }> }>;
}): { modelId: string | null; mode: StatusPermissionMode } {
  const source = input.session ?? input.draft;
  const providerId = source?.providerId ?? input.settings?.defaultProviderId;
  const provider = input.providers.find((candidate) => candidate.id === providerId);
  const modelId =
    source?.modelId?.trim() ||
    input.settings?.defaultModelId?.trim() ||
    provider?.models?.[0]?.id ||
    provider?.defaultModelId ||
    null;
  const mode =
    globalMode(source?.permissionMode) ?? globalMode(input.settings?.defaultPermissionMode) ?? "ask";
  return { modelId, mode };
}
