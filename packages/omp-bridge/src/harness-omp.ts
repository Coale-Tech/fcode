/**
 * harness-omp.ts — Real runners that drive omp -p for harness probe loops.
 *
 * Three factories:
 *   makeOmpRollout    — isolates a task run in a scratch git repo (Rollout)
 *   makeOmpProposer   — edits harness files in an evidence directory (Proposer)
 *   makeOmpModelCall  — plain one-shot completion (for selector/reflector)
 *
 * TOOL ALLOWLIST:
 *   omp supports `--tools <comma-list>` as an explicit allowlist (grounded in
 *   omp/packages/coding-agent/src/main.ts:1619-1621 and cli/flag-tables.ts:190).
 *   Rollout and proposer runs use `--tools read,write,edit,glob,grep,find` to
 *   exclude `bash`, `web_search`, and all other network/shell tools.
 *   This means probe replays CANNOT run arbitrary shell commands and will NOT
 *   touch Frappe benches or the real project tree.
 *
 *   NOTE: omp does not expose a deny-list; the allowlist is the only mechanism.
 *   If the task legitimately needs bash during a rollout (e.g. running tests),
 *   callers may override ROLLOUT_TOOL_ALLOWLIST; document the choice.
 *
 * SCRATCH ISOLATION:
 *   Each rollout materialises its harness into a fresh temp directory, runs omp
 *   there with --cwd, and removes the scratch dir in finally.  The real project
 *   tree is never written to.
 */

import { execFile, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { HarnessTree } from "@pi-desktop/shared";
import type { Proposer, ProposalResult, RolloutFn, RunView } from "./harness-recursion.js";
import type { ModelCall } from "./harness-select.js";

const execFileAsync = promisify(execFile);

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tool allowlist for rollout and proposer runs.
 * Excludes bash, web_search, task (sub-agents), eval, and all memory tools so
 * probe replays cannot reach outside the scratch directory.
 */
export const ROLLOUT_TOOL_ALLOWLIST = "read,write,edit,glob,grep,find";

const DEFAULT_TIMEOUT_MS = 5 * 60_000; // 5 minutes per run

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

export interface OmpRunConfig {
  /** Path to the omp binary. */
  ompBinary: string;
  /** Fcode data dir (for overlay + agent dir). */
  dataDir: string;
  /** Model to use; empty string = omp default. */
  model?: string;
  /** Per-run timeout in ms. */
  timeoutMs?: number;
  /** Tool allowlist override.  Default: ROLLOUT_TOOL_ALLOWLIST. */
  toolsAllowlist?: string;
  /**
   * Real project git repo for rollout isolation.
   * Required by makeOmpRollout (a git worktree is added from here).
   * Ignored by makeOmpProposer and makeOmpModelCall.
   */
  cwd?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-level omp runner (same pattern as skill-review.ts runOmpCompletion)
// ─────────────────────────────────────────────────────────────────────────────

/** Spawn omp -p with a prompt on stdin; return stdout.  Never throws on exit code. */
function runOmpP(
  ompBinary: string,
  args: string[],
  prompt: string,
  cwd: string,
  timeoutMs: number,
  env?: NodeJS.ProcessEnv,
): Promise<{ stdout: string; ok: boolean }> {
  const { promise, resolve } = Promise.withResolvers<{ stdout: string; ok: boolean }>();
  const child = spawn(ompBinary, args, {
    cwd,
    env: env ?? process.env as NodeJS.ProcessEnv,
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
  });
  let stdout = "";
  child.stdout?.on("data", (d: Buffer) => { stdout += d.toString("utf8"); });
  child.stderr?.on("data", () => undefined); // swallow startup noise

  const timer = setTimeout(() => {
    child.kill("SIGTERM");
    resolve({ stdout, ok: false });
  }, timeoutMs);

  child.on("error", () => { clearTimeout(timer); resolve({ stdout, ok: false }); });
  child.on("close", (code) => {
    clearTimeout(timer);
    resolve({ stdout, ok: code === 0 || stdout.trim().length > 0 });
  });

  child.stdin?.write(prompt, "utf8");
  child.stdin?.end();
  return promise;
}

/** Build the standard overlay path used for harness runs (memory off, no LSP). */
function harnessOverlayPath(dataDir: string): string {
  const path = join(dataDir, "harness-run-overlay.yml");
  if (!existsSync(path)) {
    writeFileSync(path, "memory:\n  backend: off\n", "utf8");
  }
  return path;
}

/**
 * Args for proposer/model-call runs: no skills loaded (proposer edits the harness,
 * it doesn't use the candidate skills).
 */
function proposerArgs(dataDir: string, model: string, toolsAllowlist: string): string[] {
  return [
    "-p",
    "--no-session",
    "--no-skills",
    "--no-rules",
    "--no-extensions",
    "--no-title",
    "--no-lsp",
    "--tools",
    toolsAllowlist,
    "--config",
    harnessOverlayPath(dataDir),
    ...(model ? ["--model", model] : []),
  ];
}

/**
 * Args for rollout runs: skills ARE loaded (the candidate harness is the point of the
 * test — we need to see how the agent behaves with those skills active).
 * Global skills and memory are isolated via the HOME/PI_CODING_AGENT_DIR env override
 * in makeIsolationEnv(); project skills come from the candidate harness overlay.
 */
function rolloutArgs(dataDir: string, model: string, toolsAllowlist: string): string[] {
  return [
    "-p",
    "--no-session",
    "--no-rules",
    "--no-extensions",
    "--no-title",
    "--no-lsp",
    "--tools",
    toolsAllowlist,
    "--config",
    harnessOverlayPath(dataDir),
    ...(model ? ["--model", model] : []),
  ];
}

/**
 * Create an isolated env for rollout subprocess calls.
 *
 * Sets HOME and PI_CODING_AGENT_DIR to empty temp dirs to prevent global skills
 * (~/.claude/skills) and session memory from leaking into probe runs.
 *
 * Auth: copies agent.db from the real agent dir so provider credentials still work.
 * API-key-based auth (ANTHROPIC_API_KEY etc.) is inherited via process.env spread.
 *
 * Returns { env, cleanup } — caller MUST call cleanup() in a finally block.
 */
function makeIsolationEnv(): { env: NodeJS.ProcessEnv; cleanup: () => void } {
  const tmpHome = mkdtempSync(join(tmpdir(), "fcode-rollout-env-"));
  const tmpAgentDir = join(tmpHome, ".omp", "agent");
  mkdirSync(tmpAgentDir, { recursive: true });

  // Copy agent.db for OAuth/stored-credential auth (env-var keys work without this)
  const realAgentDir = process.env["PI_CODING_AGENT_DIR"] ?? join(homedir(), ".omp", "agent");
  const authDb = join(realAgentDir, "agent.db");
  if (existsSync(authDb)) {
    try { copyFileSync(authDb, join(tmpAgentDir, "agent.db")); } catch { /* env-var auth still works */ }
  }

  const env = { ...process.env, HOME: tmpHome, PI_CODING_AGENT_DIR: tmpAgentDir } as NodeJS.ProcessEnv;
  return { env, cleanup: () => rmSync(tmpHome, { recursive: true, force: true }) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Harness tree materialisation helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the project harness from the real project directory into a HarnessTree.
 *
 * Mapping: omp discovers project skills at `<cwd>/.claude/skills/<name>/SKILL.md`
 * (grounded in omp/packages/coding-agent/src/discovery/claude.ts).
 * Tree keys use the HarnessTree convention: `<name>/SKILL.md` (skillDir = "").
 *
 * Returns an empty tree if cwd has no harness files.
 */
export function readProjectHarness(cwd: string): HarnessTree {
  const tree: HarnessTree = {};

  // Always-on files at project root
  for (const name of ["AGENTS.md", "CLAUDE.md"]) {
    try { tree[name] = readFileSync(join(cwd, name), "utf8"); } catch { /* absent */ }
  }

  // Skills: .claude/skills/<name>/SKILL.md → <name>/SKILL.md
  const skillsRoot = join(cwd, ".claude", "skills");
  if (existsSync(skillsRoot)) {
    try {
      for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        try {
          const content = readFileSync(join(skillsRoot, entry.name, "SKILL.md"), "utf8");
          tree[`${entry.name}/SKILL.md`] = content;
        } catch { /* skip */ }
      }
    } catch { /* ignore */ }
  }

  return tree;
}

/**
 * Apply a HarnessTree as an overlay onto a git worktree directory.
 *
 * Path mapping (inverse of readProjectHarness):
 *   AGENTS.md / CLAUDE.md → <worktreeRoot>/AGENTS.md / CLAUDE.md
 *   <name>/SKILL.md        → <worktreeRoot>/.claude/skills/<name>/SKILL.md
 *
 * Skills present in the worktree but absent from the tree are removed so the
 * candidate harness fully replaces the project's skill set.
 * Files absent from the tree (AGENTS.md etc.) are removed from the worktree.
 */
function applyHarnessToWorktree(tree: HarnessTree, worktreeRoot: string): void {
  // Always-on files
  for (const rel of ["AGENTS.md", "CLAUDE.md"]) {
    const dest = join(worktreeRoot, rel);
    if (rel in tree) {
      writeFileSync(dest, tree[rel]!, "utf8");
    } else {
      try { unlinkSync(dest); } catch { /* absent is fine */ }
    }
  }

  // Skills
  const skillsRoot = join(worktreeRoot, ".claude", "skills");
  const treeSkills = new Set(
    Object.keys(tree)
      .filter(k => k.endsWith("/SKILL.md") && k.split("/").length === 2)
      .map(k => k.split("/")[0]!),
  );

  // Remove skills not in the new tree (from the git HEAD checkout)
  if (existsSync(skillsRoot)) {
    try {
      for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
        if (entry.isDirectory() && !treeSkills.has(entry.name)) {
          rmSync(join(skillsRoot, entry.name), { recursive: true, force: true });
        }
      }
    } catch { /* ignore */ }
  }

  // Write new/updated skills
  for (const name of treeSkills) {
    const dest = join(skillsRoot, name, "SKILL.md");
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, tree[`${name}/SKILL.md`]!, "utf8");
  }
}

/**
 * Read back a harness tree from a directory (used by makeOmpProposer after a run).
 * Only surface-allowed paths are included.
 */
export function readHarnessTree(dir: string, relativeTo = dir): HarnessTree {
  const tree: HarnessTree = {};
  _walkDir(dir, (absPath) => {
    const rel = absPath.slice(relativeTo.length).replace(/^[\\/]/, "").replace(/\\/g, "/");
    if (_isAllowed(rel)) {
      try { tree[rel] = readFileSync(absPath, "utf8"); } catch { /* skip unreadable */ }
    }
  });
  return tree;
}

/** Surface allow-check ported from harness2 tree.py isAllowed. */
function _isAllowed(rel: string): boolean {
  if (rel === "AGENTS.md" || rel === "CLAUDE.md") return true;
  if (rel.endsWith("/SKILL.md") && rel.split("/").length === 2) return true;
  if (/^scripts\/[^/]+\.py$/.test(rel)) return true;
  if (/^[^/]+\/scripts\/[^/]+\.py$/.test(rel)) return true; // skill-local scripts
  return false;
}

function _walkDir(dir: string, cb: (absPath: string) => void): void {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) _walkDir(full, cb);
      else cb(full);
    }
  } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rollout runner (real-project git worktree + omp -p)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a RolloutFn that runs each harness in an isolated git worktree of the
 * real project.
 *
 * Isolation:
 *   • `git worktree add --detach <scratch>` creates a clean checkout of HEAD.
 *     Uncommitted changes in cwd are NOT included.
 *   • The candidate harness tree is overlaid onto the worktree
 *     (AGENTS.md/CLAUDE.md at root; skills at .claude/skills/<name>/SKILL.md).
 *   • omp runs there with HOME and PI_CODING_AGENT_DIR overridden to empty
 *     temp dirs, blocking global skills (~/.claude/skills) and session memory.
 *     Only agent.db (provider auth) is copied from the real agent dir.
 *   • `git worktree remove --force` + prune cleans up in finally.
 *     The project working tree is never written.
 *
 * Requires config.cwd to be a git repository with at least one commit.
 * Throws synchronously if config.cwd is absent.
 */
export function makeOmpRollout(config: OmpRunConfig, task: string): RolloutFn {
  if (!config.cwd) throw new Error("makeOmpRollout: config.cwd (git repo path) is required");
  const cwd = config.cwd;

  return async (tree: HarnessTree | null, label: string): Promise<RunView> => {
    // Verify git repo at call time so the error surfaces clearly
    const isGit = await execFileAsync("git", ["rev-parse", "--git-dir"], { cwd })
      .then(() => true, () => false);
    if (!isGit) throw new Error(`makeOmpRollout: cwd is not a git repository: ${cwd}`);

    // Generate unique scratch path WITHOUT creating it (git worktree add creates it)
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const safeLabel = label.slice(0, 20).replace(/[^a-z0-9]/gi, "-");
    const scratchDir = join(tmpdir(), `fcode-rollout-${safeLabel}-${id}`);

    const isolation = makeIsolationEnv();
    try {
      // Uncommitted changes in cwd are NOT included; worktree checks out HEAD
      await execFileAsync("git", ["worktree", "add", "--detach", scratchDir], { cwd });
      applyHarnessToWorktree(tree ?? {}, scratchDir);

      const args = [
        ...rolloutArgs(config.dataDir, config.model ?? "", config.toolsAllowlist ?? ROLLOUT_TOOL_ALLOWLIST),
        "--cwd",
        scratchDir,
      ];

      const { stdout } = await runOmpP(
        config.ompBinary,
        args,
        task,
        scratchDir,
        config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        isolation.env,
      );
      return { label, trajectory: stdout, ok: stdout.trim().length > 0 };
    } catch (e) {
      return { label, trajectory: "", ok: false, error: String(e) };
    } finally {
      isolation.cleanup();
      await execFileAsync("git", ["worktree", "remove", "--force", scratchDir], { cwd }).catch(() => undefined);
      rmSync(scratchDir, { recursive: true, force: true });
      await execFileAsync("git", ["worktree", "prune"], { cwd }).catch(() => undefined);
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Proposer (runs omp as harness editor in evidence directory)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a Proposer that runs omp in the evidence directory and harvests the
 * edited harness tree from `<evidenceDir>/harness/`.
 *
 * The evidence directory is built by harness-recursion.ts before the proposer
 * is called.  The session edits files in `<evidenceDir>/harness/` in place;
 * those edits are read back after the run.
 *
 * Off-surface paths written by the session are silently rejected (isAllowed).
 */
export function makeOmpProposer(config: OmpRunConfig): Proposer {
  return async (evidenceDir, label, mission, fallback) => {
    const harnessDir = join(evidenceDir, "harness");
    mkdirSync(harnessDir, { recursive: true });

    const args = proposerArgs(config.dataDir, config.model ?? "", config.toolsAllowlist ?? ROLLOUT_TOOL_ALLOWLIST);

    const { stdout } = await runOmpP(
      config.ompBinary,
      args,
      mission,
      evidenceDir,
      config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    // Harvest harness tree from disk (only surface-allowed paths)
    const tree = readHarnessTree(harnessDir, harnessDir);
    const hasEdits = Object.keys(tree).length > 0;

    // Extract <notes> tag from model output
    const notesMatch = /<notes>(.*?)<\/notes>/s.exec(stdout);
    const notes = notesMatch ? notesMatch[1].trim() : stdout.trim().slice(0, 400);

    if (!hasEdits) {
      return { tree: fallback, notes, cost: 0, attempts: 1, cached: false, error: "harness directory empty after session" };
    }

    return { tree, notes, cost: 0, attempts: 1, cached: false };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Plain model call (for selector and reflector)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a ModelCall that runs omp -p --no-tools for a single completion.
 * Used by selectBlind and the reflection step (no file editing needed).
 */
export function makeOmpModelCall(config: OmpRunConfig): ModelCall {
  const args = [
    "-p",
    "--no-session",
    "--no-tools",
    "--no-skills",
    "--no-rules",
    "--no-extensions",
    "--no-title",
    "--no-lsp",
    "--config",
    harnessOverlayPath(config.dataDir),
    ...(config.model ? ["--model", config.model] : []),
  ];
  return async (prompt: string) => {
    const { stdout, ok } = await runOmpP(
      config.ompBinary,
      args,
      prompt,
      tmpdir(),
      config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    if (!ok && !stdout.trim()) throw new Error("omp model call returned no output");
    return stdout;
  };
}
