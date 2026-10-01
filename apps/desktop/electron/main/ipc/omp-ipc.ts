/**
 * OMP IPC — registers all `pi-desktop/omp/*` channels (DX14 / plan §9).
 *
 * Each handler validates its inputs at the main-process trust boundary and
 * forwards the call to the omp sidecar via `sidecar.call("omp.*", params)`.
 * The bridge's `ompCallAndForward` resolves with the `data` field of the omp
 * RPC response and rejects with an error on failure.
 *
 * The `open_url` notification emitted by the bridge during `omp.login.start`
 * is handled in `runtime/sidecar.ts` (wireSidecar), not here.
 */
import { ErrorCodes, IPC } from "@pi-desktop/shared";
import type {
  OmpCommandsListResult,
  OmpHistoricalStatsResult,
  OmpInstalledSkillsListResult,
  OmpLoginProvidersResult,
  OmpLoginStartResult,
  OmpModelsListResult,
  OmpModelsSetResult,
  OmpSessionBranchResult,
  OmpSessionStatsResult,
  OmpShareResult,
  OmpStateResult,
  OmpSubagentListResult,
  OmpSubagentMessagesResult,
  OmpThinkingLevelsResult,
  OmpWorktreeListResult,
} from "@pi-desktop/shared";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { shell } from "electron";
import type { AgentSidecar } from "../agent-sidecar";
import type { IpcRegistrar } from "./types";

const execFileP = promisify(execFile);

/**
 * Resolve the omp binary path using the same priority order as the bridge:
 * OMP_BIN env → <resourcesPath>/bin/omp → "omp" on PATH.
 */
function resolveOmpBin(): string {
  if (process.env.OMP_BIN) return process.env.OMP_BIN;
  const rp = process.resourcesPath ?? "";
  for (const p of [join(rp, "bin", "omp"), join(rp, "bin", "omp.exe")]) {
    if (existsSync(p)) return p;
  }
  return "omp";
}

/** Parse a skills.json; returns empty record on missing/invalid file. */
async function readSkillsManifest(file: string): Promise<Record<string, string>> {
  try {
    const raw = JSON.parse(await readFile(file, "utf8")) as { skills?: Record<string, string> };
    return raw?.skills ?? {};
  } catch {
    return {};
  }
}

/** Parse a skills.lock.json; returns empty record on missing/invalid file. */
async function readSkillsLock(
  file: string,
): Promise<Record<string, { version: string; integrity: string }>> {
  try {
    const raw = JSON.parse(await readFile(file, "utf8")) as {
      skills?: Record<string, { version: string; integrity: string }>;
    };
    return raw?.skills ?? {};
  } catch {
    return {};
  }
}

/**
 * Classify one directory under ~/.omp/wt/ as a WorktreeEntry.
 * Returns null when the dir has no recognizable worktree markers.
 */
async function classifyWorktreeDir(
  dir: string,
): Promise<OmpWorktreeListResult["worktrees"][number] | null> {
  const gitEntry = join(dir, ".git");
  try {
    const gs = await stat(gitEntry);
    if (gs.isFile()) {
      // Git worktree — read HEAD to get branch name
      let branch: string | undefined;
      try {
        const head = await readFile(join(dir, ".git"), "utf8");
        const m = /gitdir:\s*(.+)/.exec(head.trim());
        if (m) {
          const headFile = join(m[1].trim(), "HEAD");
          const headContent = await readFile(headFile, "utf8").catch(() => "");
          const bm = /^ref: refs\/heads\/(.+)/.exec(headContent.trim());
          if (bm) branch = bm[1];
        }
      } catch { /* branch stays undefined */ }
      return { path: dir, kind: "pr-checkout", branch };
    }
  } catch { /* .git not present */ }
  // Check for task-isolation markers (m/ or merged/ subdirs)
  for (const sub of ["m", "merged"]) {
    const s = await stat(join(dir, sub)).catch(() => null);
    if (s?.isDirectory()) return { path: dir, kind: "task-isolation" };
  }
  return null;
}

export type OmpIpcDependencies = {
  registrar: IpcRegistrar;
  getSidecar: () => AgentSidecar | null;
};

/** Throw a typed INVALID_ARGUMENT error. */
function invalid(message: string): never {
  throw Object.assign(new Error(message), { errorCode: ErrorCodes.INVALID_ARGUMENT });
}

/** Throw a typed AGENT_UNAVAILABLE error. */
function unavailable(): never {
  throw Object.assign(new Error("omp sidecar unavailable"), {
    errorCode: ErrorCodes.AGENT_UNAVAILABLE,
  });
}

/** Register all omp IPC channels. */
export function registerOmpIpc({ registrar, getSidecar }: OmpIpcDependencies): void {
  const { handle } = registrar;

  // ── omp.models.list ────────────────────────────────────────────────────────
  handle(IPC.invoke.ompModelsList, async () => {
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpModelsListResult>("omp.models.list");
  });

  // ── omp.models.set ─────────────────────────────────────────────────────────
  handle(IPC.invoke.ompModelsSet, async (input: { provider?: unknown; modelId?: unknown } = {}) => {
    const provider = typeof input?.provider === "string" ? input.provider.trim() : "";
    const modelId = typeof input?.modelId === "string" ? input.modelId.trim() : "";
    if (!provider) invalid("provider required");
    if (!modelId) invalid("modelId required");
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpModelsSetResult>("omp.models.set", { provider, modelId });
  });

  // ── omp.thinking.levels ────────────────────────────────────────────────────
  handle(IPC.invoke.ompThinkingLevels, async () => {
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpThinkingLevelsResult>("omp.thinking.levels");
  });

  // ── omp.thinking.set ───────────────────────────────────────────────────────
  handle(IPC.invoke.ompThinkingSet, async (input: { level?: unknown } = {}) => {
    const level = typeof input?.level === "string" ? input.level.trim() : "";
    if (!level) invalid("level required");
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<void>("omp.thinking.set", { level });
  });

  // ── omp.commands.list ──────────────────────────────────────────────────────
  handle(IPC.invoke.ompCommandsList, async () => {
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpCommandsListResult>("omp.commands.list");
  });

  // ── omp.state ──────────────────────────────────────────────────────────────
  handle(IPC.invoke.ompState, async () => {
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpStateResult>("omp.state");
  });

  // ── omp.login.providers ────────────────────────────────────────────────────
  handle(IPC.invoke.ompLoginProviders, async () => {
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpLoginProvidersResult>("omp.login.providers");
  });

  // ── omp.login.start ────────────────────────────────────────────────────────
  handle(IPC.invoke.ompLoginStart, async (input: { providerId?: unknown } = {}) => {
    const providerId = typeof input?.providerId === "string" ? input.providerId.trim() : "";
    if (!providerId) invalid("providerId required");
    const sidecar = getSidecar() ?? unavailable();
    // The bridge may emit a `sidecar.notification { type: "open_url" }` during
    // this call; that notification is handled in runtime/sidecar.ts wireSidecar.
    return sidecar.call<OmpLoginStartResult>("omp.login.start", { providerId });
  });

  // ── omp.session.branch ─────────────────────────────────────────────────────
  handle(IPC.invoke.ompSessionBranch, async (input: { entryId?: unknown } = {}) => {
    const entryId = typeof input?.entryId === "string" ? input.entryId.trim() : "";
    if (!entryId) invalid("entryId required");
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpSessionBranchResult>("omp.session.branch", { entryId });
  });

  // ── omp.session.rename ─────────────────────────────────────────────────────
  handle(IPC.invoke.ompSessionRename, async (input: { name?: unknown } = {}) => {
    const name = typeof input?.name === "string" ? input.name.trim() : "";
    if (!name) invalid("name required");
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<void>("omp.session.rename", { name });
  });

  // ── omp.session.stats ──────────────────────────────────────────────────────
  handle(IPC.invoke.ompSessionStats, async () => {
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpSessionStatsResult>("omp.session.stats");
  });

  // ── omp.auto-compaction.set ────────────────────────────────────────────────
  handle(IPC.invoke.ompAutoCompactionSet, async (input: { enabled?: unknown } = {}) => {
    if (typeof input?.enabled !== "boolean") invalid("enabled (boolean) required");
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<void>("omp.auto-compaction.set", { enabled: input.enabled });
  });

  // ── omp.subagents.list ─────────────────────────────────────────────────────
  handle(IPC.invoke.ompSubagentList, async () => {
    const sidecar = getSidecar();
    if (!sidecar) unavailable();
    return sidecar.call<OmpSubagentListResult>("omp.subagents.list", {});
  });

  // ── omp.subagents.messages ─────────────────────────────────────────────────
  handle(
    IPC.invoke.ompSubagentMessages,
    async (input: { subagentId?: unknown; sessionFile?: unknown; fromByte?: unknown } = {}) => {
      const sidecar = getSidecar();
      if (!sidecar) unavailable();
      const params: Record<string, unknown> = {};
      if (typeof input.subagentId === "string" && input.subagentId) params.subagentId = input.subagentId;
      if (typeof input.sessionFile === "string" && input.sessionFile) params.sessionFile = input.sessionFile;
      if (typeof input.fromByte === "number") params.fromByte = input.fromByte;
      return sidecar.call<OmpSubagentMessagesResult>("omp.subagents.messages", params);
    },
  );

  // ── omp.skills.installed.list ──────────────────────────────────────────────
  // Reads ~/.omp/agent/skills.json + skills.lock.json directly — no omp RPC.
  handle(IPC.invoke.ompInstalledSkillsList, async (): Promise<OmpInstalledSkillsListResult> => {
    const agentDir = join(homedir(), ".omp", "agent");
    const [manifest, lock] = await Promise.all([
      readSkillsManifest(join(agentDir, "skills.json")),
      readSkillsLock(join(agentDir, "skills.lock.json")),
    ]);
    const ids = new Set([...Object.keys(manifest), ...Object.keys(lock)]);
    const skills = [...ids].sort().map((id) => ({
      id,
      scope: "user" as const,
      version: lock[id]?.version,
      range: manifest[id],
      stored: lock[id] !== undefined,
    }));
    return { skills };
  });

  // ── omp.stats.historical ───────────────────────────────────────────────────
  // Shells out to `omp stats --json` and returns a compact subset.
  handle(IPC.invoke.ompHistoricalStats, async (): Promise<OmpHistoricalStatsResult> => {
    const bin = resolveOmpBin();
    const { stdout } = await execFileP(bin, ["stats", "--json"], { timeout: 30_000 });
    // omp stats --json emits one JSON object to stdout after syncing sessions.
    // It may also write sync progress to stderr; we ignore that.
    const raw = JSON.parse(stdout.trim()) as {
      overall?: {
        totalRequests?: number;
        totalCost?: number;
        totalInputTokens?: number;
        totalOutputTokens?: number;
        cacheRate?: number;
      };
    };
    const o = raw?.overall ?? {};
    return {
      totalRequests: o.totalRequests ?? 0,
      totalCost: o.totalCost ?? 0,
      totalInputTokens: o.totalInputTokens ?? 0,
      totalOutputTokens: o.totalOutputTokens ?? 0,
      cacheRate: o.cacheRate ?? 0,
      collectedAt: new Date().toISOString(),
    };
  });

  // ── omp.worktrees.list ─────────────────────────────────────────────────────
  // Reads ~/.omp/wt/ directly — same logic as omp worktree list --json.
  handle(IPC.invoke.ompWorktreeList, async (): Promise<OmpWorktreeListResult> => {
    const wtRoot = join(homedir(), ".omp", "wt");
    let topLevel: string[];
    try {
      topLevel = await readdir(wtRoot);
    } catch {
      return { worktrees: [] };
    }
    const worktrees: OmpWorktreeListResult["worktrees"] = [];
    for (const name of topLevel) {
      const dir = join(wtRoot, name);
      const s = await stat(dir).catch(() => null);
      if (!s?.isDirectory()) continue;
      const entry = await classifyWorktreeDir(dir);
      if (entry) {
        worktrees.push(entry);
        continue;
      }
      // legacy nesting: ~/.omp/wt/<encoded-project>/<branch-or-id>
      let children: string[];
      try { children = await readdir(dir); } catch { continue; }
      let nested = 0;
      for (const child of children) {
        const childDir = join(dir, child);
        const cs = await stat(childDir).catch(() => null);
        if (!cs?.isDirectory()) continue;
        const ce = await classifyWorktreeDir(childDir);
        if (ce) { worktrees.push(ce); nested++; }
      }
      if (nested === 0) {
        worktrees.push({
          path: dir,
          kind: children.length === 0 ? "empty" : "stray",
          orphanReason: children.length === 0 ? "empty directory" : "no recognizable worktree contents",
        });
      }
    }
    return { worktrees };
  });

  // ── omp.skills.reveal ──────────────────────────────────────────────────────
  // Takes @scope/name id + version and shows the omp skillshare store dir.
  handle(IPC.invoke.ompSkillReveal, async (input: { id?: unknown; version?: unknown } = {}) => {
    const id = typeof input?.id === "string" ? input.id.trim() : "";
    const version = typeof input?.version === "string" ? input.version.trim() : "";
    if (!id || !version) invalid("id and version required");
    const m = /^@([^/]+)\/(.+)$/.exec(id);
    if (!m) invalid("id must be @scope/name");
    const [, scope, name] = m;
    const storePath = join(homedir(), ".omp", "skillshare", scope!, name!, version);
    shell.showItemInFolder(storePath);
    return { ok: true };
  });


  // ── omp.modes.setSteeringMode ──────────────────────────────────────────────
  handle(IPC.invoke.ompModesSetSteeringMode, async (input: { mode?: unknown } = {}) => {
    const mode = typeof input?.mode === "string" ? input.mode.trim() : "";
    if (mode !== "all" && mode !== "one-at-a-time") invalid("mode must be 'all' or 'one-at-a-time'");
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<void>("omp.modes.setSteeringMode", { mode });
  });

  // ── omp.modes.setFollowUpMode ──────────────────────────────────────────────
  handle(IPC.invoke.ompModesSetFollowUpMode, async (input: { mode?: unknown } = {}) => {
    const mode = typeof input?.mode === "string" ? input.mode.trim() : "";
    if (mode !== "all" && mode !== "one-at-a-time") invalid("mode must be 'all' or 'one-at-a-time'");
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<void>("omp.modes.setFollowUpMode", { mode });
  });

  // ── omp.modes.setInterruptMode ─────────────────────────────────────────────
  handle(IPC.invoke.ompModesSetInterruptMode, async (input: { mode?: unknown } = {}) => {
    const mode = typeof input?.mode === "string" ? input.mode.trim() : "";
    if (mode !== "immediate" && mode !== "wait") invalid("mode must be 'immediate' or 'wait'");
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<void>("omp.modes.setInterruptMode", { mode });
  });

  // ── omp.fast.set ──────────────────────────────────────────────────────────
  handle(IPC.invoke.ompFastSet, async (input: { enabled?: unknown } = {}) => {
    if (typeof input?.enabled !== "boolean") invalid("enabled (boolean) required");
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<void>("omp.fast.set", { enabled: input.enabled });
  });

  // ── omp.retry.setAutoRetry ─────────────────────────────────────────────────
  handle(IPC.invoke.ompRetrySetAutoRetry, async (input: { enabled?: unknown } = {}) => {
    if (typeof input?.enabled !== "boolean") invalid("enabled (boolean) required");
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<void>("omp.retry.setAutoRetry", { enabled: input.enabled });
  });

  // ── omp.retry.abort ───────────────────────────────────────────────────────
  handle(IPC.invoke.ompRetryAbort, async () => {
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<void>("omp.retry.abort");
  });

  // ── agent.followUp ────────────────────────────────────────────────────────
  handle(IPC.invoke.agentFollowUp, async (input: { sessionId?: unknown; content?: unknown } = {}) => {
    const sessionId = typeof input?.sessionId === "string" ? input.sessionId.trim() : "";
    const content   = typeof input?.content   === "string" ? input.content          : "";
    if (!sessionId) invalid("sessionId required");
    if (!content)   invalid("content required");
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<{ accepted: boolean }>("agent.followUp", { sessionId, content });
  });

  // ── agent.abortAndPrompt ──────────────────────────────────────────────────
  handle(IPC.invoke.agentAbortAndPrompt, async (input: { sessionId?: unknown; content?: unknown } = {}) => {
    const sessionId = typeof input?.sessionId === "string" ? input.sessionId.trim() : "";
    const content   = typeof input?.content   === "string" ? input.content          : "";
    if (!sessionId) invalid("sessionId required");
    if (!content)   invalid("content required");
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<{ accepted: boolean }>("agent.abortAndPrompt", { sessionId, content });
  });

  // ── omp.models.cycle ──────────────────────────────────────────────────────
  handle(IPC.invoke.ompCycleModel, async () => {
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<void>("omp.models.cycle");
  });

  // ── omp.thinking.cycle ────────────────────────────────────────────────────
  handle(IPC.invoke.ompCycleThinkingLevel, async () => {
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<void>("omp.thinking.cycle");
  });

  // ── omp.share ──────────────────────────────────────────────────────────────
  handle(IPC.invoke.ompShare, async () => {
    const sidecar = getSidecar();
    if (!sidecar) unavailable();
    return sidecar.call<OmpShareResult>("omp.share");
  });
}
