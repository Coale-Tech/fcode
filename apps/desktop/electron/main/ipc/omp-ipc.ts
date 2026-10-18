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
  OmpBashResult,
  OmpCommandsListResult,
  OmpHistoricalStatsResult,
  OmpInstalledSkillsListResult,
  OmpLoginProvidersResult,
  OmpLoginStartResult,
  OmpModelsListResult,
  OmpModelsSetResult,
  OmpSessionBranchResult,
  OmpSessionExportHtmlResult,
  OmpSessionLastAssistantTextResult,
  OmpSessionHandoffResult,
  OmpSessionSetTodosResult,
  OmpSessionEntriesResult,
  OmpSessionBranchMessagesResult,
  OmpTodoPhase,
  OmpSessionStatsResult,
  OmpShareResult,
  OmpStateResult,
  OmpSubagentListResult,
  OmpSubagentMessagesResult,
  OmpThinkingLevelsResult,
  OmpWorktreeListResult,
  OmpWorktreeClearResult,
  OmpWorktreePruneResult,
  OmpWorktreeAddResult,
  OmpUserProfileGetResult,
  OmpUserProfileSetResult,
  OmpAgentListResult,
  OmpAgentSource,
  OmpSessionGetTreeResult,
  OmpSessionMessagesResult,
  OmpSessionMessagesPageResult,
  OmpNewSessionResult,
  OmpSwitchSessionResult,
} from "@pi-desktop/shared";
import type { OmpSkillCuratorStatusResult, OmpSkillCuratorMutateResult, OmpSkillProposalListResult, OmpSkillProposalActResult, OmpSkillJourneyResult } from "@pi-desktop/shared";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { shell } from "electron";
import type { AgentSidecar } from "../agent-sidecar";
import { desktopDataDir } from "../data-paths.ts";
import { ompAgentDir } from "../omp-agent-dir.js";
import { resolveOmpBin, ompChildEnv, appResourcesPath } from "../omp-binary";
import { skillPackDiscard, skillPackOpenPr, skillPackStatus } from "../skill-packs";
import { curatorPin, curatorRestore, curatorStatus } from "../skill-curator.ts";
import { approveProposal, getJourneyEvents, listPendingProposals, rejectProposal } from "../skill-review.ts";
import type { OmpLspListResult, OmpLspSaveInput } from "@pi-desktop/shared";
import { listLspServers, removeLspServer, saveLspServer } from "../omp-lsp-config";
import type { IpcRegistrar } from "./types";

const execFileP = promisify(execFile);

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

/**
 * Returns true when the git worktree at `dir` has uncommitted changes.
 * Returns false on any error (not a git repo, git not available, etc.).
 * Exported for unit testing.
 */
export async function checkWorktreeDirty(
  dir: string,
  runGitStatus = async (d: string) => {
    const { stdout } = await execFileP("git", ["-C", d, "status", "--porcelain"], {
      timeout: 10_000,
    });
    return stdout;
  },
): Promise<boolean> {
  try {
    const out = await runGitStatus(dir);
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

export type OmpIpcDependencies = {
  registrar: IpcRegistrar;
  getSidecar: () => AgentSidecar | null;
  /** Native save dialog; resolves null when cancelled. Injected so this module stays electron-free. */
  pickExportPath?: () => Promise<string | null>;
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

const USER_PROFILE_MAX_CHARS = 1024;
const USER_PROFILE_FILE = "USER.md";

/**
 * Read the user profile from `<agentDir>/USER.md`.
 * Returns empty string when the file is absent or unreadable.
 * Exported for unit testing.
 */
export async function readUserProfile(
  agentDir: string,
  read: (path: string) => Promise<string> = (p) => readFile(p, "utf8"),
): Promise<string> {
  try {
    return (await read(join(agentDir, USER_PROFILE_FILE))).trim();
  } catch {
    return "";
  }
}

/**
 * Write the user profile to `<agentDir>/USER.md` atomically (temp+rename).
 * Content is truncated to USER_PROFILE_MAX_CHARS before writing.
 * Returns `{ ok: true }` on success; `{ ok: false, error }` otherwise.
 * Exported for unit testing (injected write/rename for atomicity testing).
 */
export async function writeUserProfile(
  agentDir: string,
  text: string,
  write: (path: string, data: string) => Promise<void> = (p, d) => writeFile(p, d, "utf8"),
  ren:   (src: string, dest: string) => Promise<void>  = rename,
): Promise<OmpUserProfileSetResult> {
  const raw = text.slice(0, USER_PROFILE_MAX_CHARS);
  const dest = join(agentDir, USER_PROFILE_FILE);
  const tmp  = `${dest}.tmp.${Date.now()}`;
  try {
    await write(tmp, raw);
    await ren(tmp, dest);
    return { ok: true };
  } catch (e) {
    rm(tmp, { force: true }).catch(() => { /* ignore */ });
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const PROJECT_MEMORY_MAX_CHARS = 16 * 1024; // 16 KiB — larger than USER.md
const PROJECT_MEMORY_FILE = "MEMORY.md";
const PROJECT_MEMORY_DIR = ".omp";

/**
 * Write project memory to `<workspaceDir>/.omp/MEMORY.md` atomically (temp+rename).
 * Creates `.omp/` if absent. Content truncated to PROJECT_MEMORY_MAX_CHARS.
 */
async function writeProjectMemory(
  workspaceDir: string,
  text: string,
): Promise<OmpUserProfileSetResult> {
  const ompDir = join(workspaceDir, PROJECT_MEMORY_DIR);
  const dest   = join(ompDir, PROJECT_MEMORY_FILE);
  const tmp    = `${dest}.tmp.${Date.now()}`;
  try {
    await mkdir(ompDir, { recursive: true });
    await writeFile(tmp, text.slice(0, PROJECT_MEMORY_MAX_CHARS), "utf8");
    await rename(tmp, dest);
    return { ok: true };
  } catch (e) {
    rm(tmp, { force: true }).catch(() => { /* ignore */ });
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
// ── Agent list (F1: effective agent list across all sources) ──────────────────

/** omp's five bundled agents; descriptions from omp/packages/coding-agent/src/task/agents.ts. */
const OMP_BUNDLED_AGENTS: ReadonlyArray<{ name: string; description: string; tools: string[]; model?: string }> = [
  { name: "task",             description: "General-purpose subagent with full capabilities for delegated multi-step tasks", tools: [], model: "@task" },
  { name: "sonic",            description: "Low-reasoning agent for strictly mechanical updates or data collection only", tools: [], model: "@smol" },
  { name: "scout",            description: "MUST be used for exploratory codebase research, rapid code analysis, and broad pattern searches. Fast read-only scout returning compressed context for handoff.", tools: ["read", "find", "grep", "glob", "web_search"], model: "@smol" },
  { name: "reviewer",         description: "Code review specialist for quality/security analysis", tools: ["read", "find", "grep", "glob", "bash", "lsp", "web_search", "ast_grep"] },
  { name: "security-reviewer", description: "Read-only security specialist for evidence-backed repository vulnerability discovery", tools: ["read", "find", "grep", "glob", "lsp", "ast_grep"] },
];

/** Minimal YAML frontmatter parser — mirrors fcode-agents.test.mjs parseFrontmatter. */
function parseFrontmatterFields(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const yaml = match[1]!;
  const result: Record<string, unknown> = {};
  let currentList: string[] | null = null;
  for (const line of yaml.split(/\r?\n/)) {
    const listItem = line.match(/^[ \t]+-[ \t]+(.+)$/);
    if (listItem && currentList !== null) {
      currentList.push(listItem[1]!.trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    const inlineArr = line.match(/^(\w[\w-]*):\s*\[([^\]]*)\]\s*$/);
    if (inlineArr) {
      currentList = null;
      result[inlineArr[1]!] = inlineArr[2]!.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
      continue;
    }
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) {
      currentList = null;
      const val = kv[2]!.trim();
      if (val === "") { result[kv[1]!] = []; currentList = result[kv[1]!] as string[]; }
      else { result[kv[1]!] = val.replace(/^["']|["']$/g, ""); }
    }
  }
  return result;
}

/** Read all .md agent files from a directory; returns [] when dir is absent. */
async function readAgentDir(dir: string, source: OmpAgentSource): Promise<OmpAgentListResult["agents"]> {
  let files: string[];
  try { files = (await readdir(dir)).filter((f) => f.endsWith(".md")); }
  catch { return []; }
  const agents: OmpAgentListResult["agents"] = [];
  for (const file of files) {
    try {
      const content = await readFile(join(dir, file), "utf8");
      const fm = parseFrontmatterFields(content);
      if (!fm) continue;
      const name = typeof fm["name"] === "string" ? fm["name"].trim() : "";
      if (!name) continue;
      const description = typeof fm["description"] === "string" ? fm["description"].trim() : "";
      const tools = Array.isArray(fm["autoloadSkills"]) ? [] :
        Array.isArray(fm["tools"]) ? fm["tools"] as string[] : [];
      const model = typeof fm["model"] === "string" ? fm["model"].trim() : undefined;
      agents.push({ name, description, tools, ...(model ? { model } : {}), source });
    } catch { /* skip unreadable files */ }
  }
  return agents;
}

/**
 * Build the effective agent list across all four sources.
 * Precedence: project > user > fcode > omp bundled.
 * Agents with the same name from lower-priority sources are marked `shadowed`.
 */
export async function listEffectiveAgents(projectPath: string | null): Promise<OmpAgentListResult> {
  const fcodeAgentsDir = join(appResourcesPath(), "fcode-agents", "agents");

  const [projectAgents, userAgents, fcodeAgents] = await Promise.all([
    projectPath ? readAgentDir(join(projectPath, ".omp", "agents"), "project") : Promise.resolve([]),
    readAgentDir(join(ompAgentDir(), "agents"), "user"),
    readAgentDir(fcodeAgentsDir, "fcode"),
  ]);

  const ompAgents: OmpAgentListResult["agents"] = OMP_BUNDLED_AGENTS.map((a) => ({ ...a, source: "omp" as OmpAgentSource }));

  // All agents in precedence order; first occurrence of a name wins.
  const all = [...projectAgents, ...userAgents, ...fcodeAgents, ...ompAgents];
  const seen = new Set<string>();
  return {
    agents: all.map((agent) => {
      if (seen.has(agent.name)) return { ...agent, shadowed: true };
      seen.add(agent.name);
      return agent;
    }),
  };
}

/**
 * Add a git worktree under ~/.omp/wt/. With `create` (kanban workers) it is idempotent per branch:
 * a live worktree already on `branch` is reused, else the worktree is added, creating the branch
 * if missing — so a retried card resumes its own worktree instead of colliding with it.
 */
export async function addWorktree(repoPath: string, branch: string, create = false): Promise<OmpWorktreeAddResult> {
  try {
    if (create) {
      const { stdout } = await execFileP("git", ["-C", repoPath, "worktree", "list", "--porcelain"], { timeout: 10_000 });
      for (const block of stdout.split("\n\n")) {
        const lines = block.split("\n");
        const live = lines.includes(`branch refs/heads/${branch}`) && !lines.some((l) => l.startsWith("prunable"));
        const existing = live ? lines.find((l) => l.startsWith("worktree "))?.slice(9) : undefined;
        if (existing) return { ok: true, path: existing };
      }
    }
    const wtPath = join(homedir(), ".omp", "wt", `${branch.replace(/[^a-zA-Z0-9._-]/g, "-")}-${Date.now()}`);
    const branchExists = !create || await execFileP("git", ["-C", repoPath, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).then(() => true, () => false);
    await execFileP("git", ["-C", repoPath, "worktree", "add", ...(branchExists ? [wtPath, branch] : ["-b", branch, wtPath])], { timeout: 30_000 });
    return { ok: true, path: wtPath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}


/** Register all omp IPC channels. */
export function registerOmpIpc({ registrar, getSidecar, pickExportPath }: OmpIpcDependencies): void {
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

  // ── omp.session.exportHtml ─────────────────────────────────────────────────
  handle(IPC.invoke.ompSessionExportHtml, async () => {
    const sidecar = getSidecar() ?? unavailable();
    const outputPath = pickExportPath ? await pickExportPath() : null;
    if (!outputPath) return null;
    return sidecar.call<OmpSessionExportHtmlResult>("omp.session.exportHtml", { outputPath });
  });

  // ── omp.session.lastAssistantText ──────────────────────────────────────────
  handle(IPC.invoke.ompSessionLastAssistantText, async () => {
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpSessionLastAssistantTextResult>("omp.session.lastAssistantText");
  });

  // ── omp.session.handoff ────────────────────────────────────────────────────
  handle(IPC.invoke.ompSessionHandoff, async (input: { customInstructions?: unknown } = {}) => {
    const sidecar = getSidecar() ?? unavailable();
    const params: Record<string, unknown> = {};
    if (typeof input.customInstructions === "string" && input.customInstructions)
      params.customInstructions = input.customInstructions;
    return sidecar.call<OmpSessionHandoffResult>("omp.session.handoff", params);
  });

  // ── omp.session.setTodos ───────────────────────────────────────────────────
  handle(IPC.invoke.ompSessionSetTodos, async (input: { phases?: unknown } = {}) => {
    if (!Array.isArray(input?.phases)) invalid("phases (array) required");
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpSessionSetTodosResult>("omp.session.setTodos", {
      phases: input.phases as OmpTodoPhase[],
    });
  });

  // ── omp.session.entries ────────────────────────────────────────────────────
  handle(IPC.invoke.ompSessionEntries, async (input: { since?: unknown } = {}) => {
    const sidecar = getSidecar() ?? unavailable();
    const params: Record<string, unknown> = {};
    if (typeof input.since === "string" && input.since) params.since = input.since;
    return sidecar.call<OmpSessionEntriesResult>("omp.session.entries", params);
  });

  // ── omp.session.branchMessages ─────────────────────────────────────────────
  handle(IPC.invoke.ompSessionBranchMessages, async () => {
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpSessionBranchMessagesResult>("omp.session.branchMessages");
  });

  // ── omp.session.getTree ────────────────────────────────────────────────────
  handle(IPC.invoke.ompSessionGetTree, async () => {
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpSessionGetTreeResult>("omp.session.getTree");
  });

  // ── omp.session.getMessages ────────────────────────────────────────────────
  handle(IPC.invoke.ompSessionGetMessages, async () => {
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpSessionMessagesResult>("omp.session.getMessages");
  });

  // ── omp.session.getMessagesPage ────────────────────────────────────────────
  handle(IPC.invoke.ompSessionGetMessagesPage, async (input: { cursor?: unknown; limit?: unknown } = {}) => {
    const sidecar = getSidecar() ?? unavailable();
    const params: Record<string, unknown> = {};
    if (typeof input.cursor === "string" && input.cursor) params.cursor = input.cursor;
    if (typeof input.limit === "number" && input.limit > 0) params.limit = Math.floor(input.limit);
    return sidecar.call<OmpSessionMessagesPageResult>("omp.session.getMessagesPage", params);
  });

  // ── omp.session.newSession ─────────────────────────────────────────────────
  handle(IPC.invoke.ompNewSession, async (input: { parentSession?: unknown } = {}) => {
    const sidecar = getSidecar() ?? unavailable();
    const params: Record<string, unknown> = {};
    if (typeof input.parentSession === "string" && input.parentSession) params.parentSession = input.parentSession;
    return sidecar.call<OmpNewSessionResult>("omp.session.newSession", params);
  });

  // ── omp.session.switchSession ──────────────────────────────────────────────
  handle(IPC.invoke.ompSwitchSession, async (input: { sessionPath?: unknown } = {}) => {
    const sessionPath = typeof input?.sessionPath === "string" ? input.sessionPath.trim() : "";
    if (!sessionPath) invalid("sessionPath required");
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpSwitchSessionResult>("omp.session.switchSession", { sessionPath });
  });

  // ── omp.skills.installed.list ──────────────────────────────────────────────
  // Reads <agentDir>/skills.json + skills.lock.json directly — no omp RPC.
  handle(IPC.invoke.ompInstalledSkillsList, async (): Promise<OmpInstalledSkillsListResult> => {
    const agentDir = ompAgentDir();
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

  // ── self-improving skill pack (local git clone, see ../skill-packs.ts) ─────
  handle(IPC.invoke.ompSkillPackStatus, () => skillPackStatus());
  handle(IPC.invoke.ompSkillPackOpenPr, async () => {
    const pr = await skillPackOpenPr();
    if (pr.url.startsWith("https://github.com/")) void shell.openExternal(pr.url);
    return pr;
  });
  handle(IPC.invoke.ompSkillPackDiscard, () => skillPackDiscard());

  // ── skill curator (usage tracking, archive, restore, pin) ──────────────────
  handle(IPC.invoke.ompSkillCuratorStatus, async () => curatorStatus(desktopDataDir()));
  handle(IPC.invoke.ompSkillCuratorRestore, async (input: { name?: unknown } = {}) => {
    if (typeof input?.name !== "string") invalid("name required");
    return curatorRestore(desktopDataDir(), input.name);
  });
  handle(IPC.invoke.ompSkillCuratorPin, async (input: { name?: unknown; pinned?: unknown } = {}) => {
    if (typeof input?.name !== "string") invalid("name required");
    return curatorPin(desktopDataDir(), input.name, input.pinned === true);
  });

  // ── skill approval gate (pending proposals: list / approve / reject) ────────
  handle(IPC.invoke.ompSkillProposalList, async (): Promise<OmpSkillProposalListResult> => {
    return { proposals: listPendingProposals(desktopDataDir()) };
  });
  handle(IPC.invoke.ompSkillProposalApprove, async (input: { id?: unknown } = {}): Promise<OmpSkillProposalActResult> => {
    if (typeof input?.id !== "string" || !input.id) invalid("id (string) required");
    await approveProposal(desktopDataDir(), input.id as string);
    return { ok: true };
  });
  handle(IPC.invoke.ompSkillProposalReject, async (input: { id?: unknown } = {}): Promise<OmpSkillProposalActResult> => {
    if (typeof input?.id !== "string" || !input.id) invalid("id (string) required");
    rejectProposal(desktopDataDir(), input.id as string);
    return { ok: true };
  });

  // ── skill journey timeline ──────────────────────────────────────────────────
  handle(IPC.invoke.ompSkillJourney, async (): Promise<OmpSkillJourneyResult> => {
    return { events: await getJourneyEvents(desktopDataDir()) };
  });

  // ── omp.stats.historical ───────────────────────────────────────────────────
  // Shells out to `omp stats --json` and returns a compact subset.
  handle(IPC.invoke.ompHistoricalStats, async (): Promise<OmpHistoricalStatsResult> => {
    const bin = resolveOmpBin();
    const { stdout } = await execFileP(bin, ["stats", "--json"], { timeout: 30_000, env: ompChildEnv() });
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

  // ── omp.worktrees.clear ────────────────────────────────────────────────────
  // Removes a specific worktree directory. Refuses if dirty unless force=true.
  handle(IPC.invoke.ompWorktreeClear, async (
    input: { path?: unknown; force?: unknown } = {},
  ): Promise<OmpWorktreeClearResult> => {
    const wtPath = typeof input?.path === "string" ? input.path.trim() : "";
    const force = input?.force === true;
    if (!wtPath) invalid("path required");
    if (!force && (await checkWorktreeDirty(wtPath))) {
      return { ok: false, error: "dirty" };
    }
    try {
      await rm(wtPath, { recursive: true, force: true });
      // Best-effort: prune dead entries from any parent repo.
      try {
        const gitFile = join(wtPath, ".git");
        const head = await readFile(gitFile, "utf8").catch(() => "");
        const m = /gitdir:\s*(.+)/.exec(head.trim());
        if (m) {
          const parentRepo = m[1].trim().replace(/\/\.git\/worktrees\/.+$/, "");
          await execFileP("git", ["-C", parentRepo, "worktree", "prune"], {
            timeout: 10_000,
          }).catch(() => { /* best-effort */ });
        }
      } catch { /* best-effort */ }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // ── omp.worktrees.prune ────────────────────────────────────────────────────
  // Prune all orphaned (empty / stray) worktrees under ~/.omp/wt/.
  // Refuses dirty worktrees unless force=true.
  handle(IPC.invoke.ompWorktreePrune, async (
    input: { force?: unknown } = {},
  ): Promise<OmpWorktreePruneResult> => {
    const force = input?.force === true;
    const wtRoot = join(homedir(), ".omp", "wt");
    let topLevel: string[];
    try { topLevel = await readdir(wtRoot); } catch { return { ok: true, pruned: [] }; }
    const pruned: string[] = [];
    const errors: string[] = [];
    for (const name of topLevel) {
      const dir = join(wtRoot, name);
      const s = await stat(dir).catch(() => null);
      if (!s?.isDirectory()) continue;
      const entry = await classifyWorktreeDir(dir);
      // Only prune orphaned (null classified) or empty/stray entries
      if (entry && entry.kind !== "empty" && entry.kind !== "stray") continue;
      if (!force && (await checkWorktreeDirty(dir))) {
        errors.push(`dirty:${dir}`);
        continue;
      }
      try {
        await rm(dir, { recursive: true, force: true });
        pruned.push(dir);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    if (errors.length > 0 && pruned.length === 0) {
      return { ok: false, pruned, error: errors.join("; ") };
    }
    return { ok: true, pruned };
  });

  // ── omp.worktrees.add ──────────────────────────────────────────────────────
  // Creates a new git worktree under ~/.omp/wt/ for a given repo + branch.
  handle(IPC.invoke.ompWorktreeAdd, async (
    input: { repoPath?: unknown; branch?: unknown } = {},
  ): Promise<OmpWorktreeAddResult> => {
    const repoPath = typeof input?.repoPath === "string" ? input.repoPath.trim() : "";
    const branch   = typeof input?.branch   === "string" ? input.branch.trim()   : "";
    if (!repoPath) invalid("repoPath required");
    if (!branch)   invalid("branch required");
    return addWorktree(repoPath, branch);
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

  // ── omp.bash ───────────────────────────────────────────────────────────────
  // Runs a shell command in omp's session cwd. The bridge emits the output as
  // a system transcript block and returns { ok: true } on success.
  handle(IPC.invoke.ompBash, async (input: { command?: unknown } = {}) => {
    const command = typeof input?.command === "string" ? input.command.trim() : "";
    if (!command) invalid("command required");
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpBashResult>("omp.bash", { command });
  });

  // ── omp.abort_bash ─────────────────────────────────────────────────────────
  handle(IPC.invoke.ompAbortBash, async () => {
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<void>("omp.abort_bash");
  });

  // ── omp.set_event_filter ───────────────────────────────────────────────────
  // null = all events; string[] = allowlist of event type names.
  handle(IPC.invoke.ompSetEventFilter, async (input: { events?: unknown } = {}) => {
    const events = Array.isArray(input?.events) ? (input.events as string[]) : null;
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<void>("omp.set_event_filter", { events });
  });

  // ── omp.user-profile.get ──────────────────────────────────────────────────
  // Reads <agentDir>/USER.md; returns empty string when absent.
  handle(IPC.invoke.ompUserProfileGet, async (): Promise<OmpUserProfileGetResult> => {
    const text = await readUserProfile(ompAgentDir());
    return { text };
  });

  // ── omp.user-profile.set ──────────────────────────────────────────────────
  // Writes <agentDir>/USER.md atomically (temp+rename); caps at 1024 chars.
  handle(IPC.invoke.ompUserProfileSet, async (
    input: { text?: unknown } = {},
  ): Promise<OmpUserProfileSetResult> => {
    if (typeof input?.text !== "string") invalid("text (string) required");
    return writeUserProfile(ompAgentDir(), input.text as string);
  });

  // ── omp.lsp.* ─────────────────────────────────────────────────────────────
  // Settings → LSP: built-in + user servers (~/.omp/agent/lsp.json), add/override, remove.
  handle(IPC.invoke.ompLspList, async (): Promise<OmpLspListResult> => listLspServers());
  handle(IPC.invoke.ompLspSave, async (input?: Partial<OmpLspSaveInput>) => {
    if (typeof input?.name !== "string") invalid("name (string) required");
    return saveLspServer(input as OmpLspSaveInput);
  });
  handle(IPC.invoke.ompLspRemove, async (input?: { name?: unknown }) => {
    if (typeof input?.name !== "string") invalid("name (string) required");
    return removeLspServer(input.name);
  });

  // ── omp.project-memory.get ────────────────────────────────────────────────
  // Reads <workspace>/.omp/MEMORY.md; returns empty string when absent.
  handle(IPC.invoke.ompProjectMemoryGet, async (
    input: { workspacePath?: unknown } = {},
  ): Promise<OmpUserProfileGetResult> => {
    if (typeof input?.workspacePath !== "string" || !input.workspacePath) return { text: "" };
    try {
      const text = await readFile(
        join(input.workspacePath as string, PROJECT_MEMORY_DIR, PROJECT_MEMORY_FILE),
        "utf8",
      );
      return { text: text.trim() };
    } catch {
      return { text: "" };
    }
  });

  // ── omp.project-memory.set ────────────────────────────────────────────────
  // Writes <workspace>/.omp/MEMORY.md atomically; caps at 16 KiB.
  handle(IPC.invoke.ompProjectMemorySet, async (
    input: { workspacePath?: unknown; text?: unknown } = {},
  ): Promise<OmpUserProfileSetResult> => {
    if (typeof input?.workspacePath !== "string" || !input.workspacePath) invalid("workspacePath (string) required");
    if (typeof input?.text !== "string") invalid("text (string) required");
    return writeProjectMemory(input.workspacePath as string, input.text as string);
  });

  // ── omp.agents.list ──────────────────────────────────────────────────────
  // Reads agent .md files from all four sources, applies precedence ordering
  // (project > user > fcode > omp bundled), and marks shadowed entries.
  handle(IPC.invoke.ompAgentList, async (
    input: { projectPath?: unknown } = {},
  ): Promise<OmpAgentListResult> => {
    const projectPath = typeof input?.projectPath === "string" ? input.projectPath.trim() : "";
    return listEffectiveAgents(projectPath || null);
  });
}
