/**
 * Skill curator — tracks usage of agent-created skills and deterministically
 * marks or archives them when idle, mirroring Hermes' curator design.
 *
 * Curated set:
 *   - Skills added on the fcode/self-improve branch of frappeskills
 *     (<dataDir>/skills/frappeskills dirs not present on origin/HEAD)
 *   - Skills in ~/.omp/agent/managed-skills
 *
 * Data files (under <dataDir>/skills/.curator/):
 *   usage.json    — per-skill { uses, lastUsed, createdAt, status }
 *   state.json    — { firstSeen, lastRun }
 *   ledger.jsonl  — append-only audit log
 *   archive/      — archived skill dirs
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SkillStatus = "active" | "stale" | "archived" | "pinned";

export interface SkillUsageEntry {
  uses: number;
  lastUsed: string;    // ISO timestamp (createdAt if never used)
  createdAt: string;   // ISO timestamp of first observation
  status: SkillStatus;
}

export type UsageMap = Record<string, SkillUsageEntry>;

export interface CuratorState {
  firstSeen?: string;  // ISO — when curator was first initialised
  lastRun?: string;    // ISO — last time runCurator executed
}

export interface CuratorConfig {
  enabled: boolean;
  staleDays: number;
  archiveDays: number;
  minIdleHours: number;
  intervalHours: number;
}

export const DEFAULT_CURATOR_CONFIG: CuratorConfig = {
  enabled: true,
  staleDays: 14,
  archiveDays: 30,
  minIdleHours: 2,
  intervalHours: 168, // 7 days
};

// ── Paths (stable domain contracts) ──────────────────────────────────────────

export const curatorDir  = (d: string) => join(d, "skills", ".curator");
export const usagePath   = (d: string) => join(d, "skills", ".curator", "usage.json");
export const statePath   = (d: string) => join(d, "skills", ".curator", "state.json");
export const ledgerPath  = (d: string) => join(d, "skills", ".curator", "ledger.jsonl");
export const archivePath = (d: string) => join(d, "skills", ".curator", "archive");

const FRAPPESKILLS_CLONE_NAME = "frappeskills"; // pack name under <dataDir>/skills/
const ompManagedSkillsDir = () => join(homedir(), ".omp", "agent", "managed-skills");

// ── JSON helpers ──────────────────────────────────────────────────────────────

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(readFileSync(file, "utf8")) as T; } catch { return fallback; }
}

function writeJsonAtomic(file: string, data: unknown): void {
  mkdirSync(join(file, ".."), { recursive: true });
  const tmp = `${file}.tmp.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, file);
}

// ── Usage tracking (debounced, safe from event path) ─────────────────────────

// ponytail: Map for dynamic key lifecycle (dataDir → pending flush)
const _pendingFlushes = new Map<string, { timer: NodeJS.Timeout; usage: UsageMap }>();

/**
 * Record one skill use. Debounced 2 s; never throws; safe to call from the
 * hot event path.
 */
export function recordSkillUse(dataDir: string, skillName: string): void {
  if (!skillName) return;
  mkdirSync(curatorDir(dataDir), { recursive: true });
  const existing = _pendingFlushes.get(dataDir);
  const usage: UsageMap = existing?.usage ?? readJson<UsageMap>(usagePath(dataDir), {});
  const now = new Date().toISOString();
  const prev = usage[skillName];
  // Preserve pinned status; restore archived back to active on re-use
  const status: SkillStatus =
    prev?.status === "pinned" ? "pinned" : "active";
  usage[skillName] = {
    uses: (prev?.uses ?? 0) + 1,
    lastUsed: now,
    createdAt: prev?.createdAt ?? now,
    status,
  };
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    _pendingFlushes.delete(dataDir);
    try { writeJsonAtomic(usagePath(dataDir), usage); } catch { /* never throw */ }
  }, 2_000).unref();
  _pendingFlushes.set(dataDir, { timer, usage });
}

/** Skills that keep their full description in omp's compact skill list: pinned, or used within `withinDays`. */
export function promptPinnedSkills(dataDir: string, withinDays: number, now = Date.now()): string[] {
  const usage = readJson<UsageMap>(usagePath(dataDir), {});
  return Object.entries(usage)
    .filter(([, e]) => e.status === "pinned"
      || (e.status !== "archived" && e.uses > 0 && now - Date.parse(e.lastUsed) < withinDays * 86_400_000))
    .map(([name]) => name);
}

// ── Curated skill discovery ───────────────────────────────────────────────────

function gitLines(cwd: string, args: string[]): string[] {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 15_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    }).split("\n").map((l) => l.trim()).filter(Boolean);
  } catch { return []; }
}

/**
 * Skills added on the fcode/self-improve branch in frappeskills
 * (dirs under the clone root that appear in the git diff vs origin/HEAD).
 * frappeskills has skillsSubdir="" so skill dirs are at the repo root.
 */
function frappeskillsAgentSkills(dataDir: string): string[] {
  const cloneDir = join(dataDir, "skills", FRAPPESKILLS_CLONE_NAME);
  if (!existsSync(join(cloneDir, ".git"))) return [];
  const changed = gitLines(cloneDir, ["diff", "--name-only", "origin/HEAD..HEAD"]);
  const names = new Set<string>();
  for (const file of changed) {
    const topLevel = file.split("/")[0];
    if (topLevel && !topLevel.startsWith(".")) names.add(topLevel);
  }
  return [...names];
}

/** Skills in ~/.omp/agent/managed-skills (omp autolearn). */
function managedSkillNames(): string[] {
  const dir = ompManagedSkillsDir();
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch { return []; }
}

/** All curated (agent-created) skill names, deduplicated. */
export function curatedSkillNames(dataDir: string): string[] {
  return [...new Set([...frappeskillsAgentSkills(dataDir), ...managedSkillNames()])];
}

// ── Curator state ─────────────────────────────────────────────────────────────

export function readCuratorState(dataDir: string): CuratorState {
  return readJson<CuratorState>(statePath(dataDir), {});
}

export function writeCuratorState(dataDir: string, state: CuratorState): void {
  mkdirSync(curatorDir(dataDir), { recursive: true });
  writeJsonAtomic(statePath(dataDir), state);
}

// ── shouldRunCurator (pure, no I/O) ──────────────────────────────────────────

/**
 * Pure gate: should the curator pass run right now?
 *
 * Idle gate  — app must have been idle for >= minIdleHours.
 * Interval   — must be >= intervalHours since lastRun.
 * First-run  — if firstSeen is set but lastRun is not, wait one full interval
 *              from firstSeen (deferred first run).
 * Uninit     — if firstSeen is absent, caller should initialise it; returns false.
 */
export function shouldRunCurator(
  state: CuratorState,
  now: number,
  lastActivityMs: number,
  cfg: Pick<CuratorConfig, "minIdleHours" | "intervalHours">,
): boolean {
  if (now - lastActivityMs < cfg.minIdleHours * 3_600_000) return false;
  if (!state.firstSeen) return false;
  if (!state.lastRun) {
    return now - new Date(state.firstSeen).getTime() >= cfg.intervalHours * 3_600_000;
  }
  return now - new Date(state.lastRun).getTime() >= cfg.intervalHours * 3_600_000;
}

// ── Ledger ────────────────────────────────────────────────────────────────────

interface LedgerEntry {
  ts: string;
  actor: "curator" | "user";
  action: string;
  skill: string;
  from?: string;
  to?: string;
  sha256_before?: string;
}

function appendLedger(dataDir: string, entry: LedgerEntry): void {
  try {
    mkdirSync(curatorDir(dataDir), { recursive: true });
    appendFileSync(ledgerPath(dataDir), JSON.stringify(entry) + "\n");
  } catch { /* never throw */ }
}

function sha256OfDir(dir: string): string {
  try {
    const h = createHash("sha256");
    for (const f of readdirSync(dir)) {
      try { h.update(readFileSync(join(dir, f))); } catch { /* skip unreadable */ }
    }
    return h.digest("hex");
  } catch { return ""; }
}

// ── runCurator ────────────────────────────────────────────────────────────────

/** Sidecar for archived skill: records original path so restore can replace it. */
const ORIGIN_FILE = "_origin";

/**
 * Deterministic curator pass. Never deletes; only moves stale dirs to archive.
 *
 * `_namesOverride` injects skill names for tests (avoids needing a real git repo
 * or ~/.omp path in the test environment — test seam).
 */
export async function runCurator(
  dataDir: string,
  cfg: CuratorConfig,
  _namesOverride?: string[],
): Promise<void> {
  const now = Date.now();
  const usage: UsageMap = readJson<UsageMap>(usagePath(dataDir), {});
  const names = _namesOverride ?? curatedSkillNames(dataDir);

  // Ensure every curated skill has a first-seen entry
  for (const name of names) {
    if (!usage[name]) {
      const ts = new Date().toISOString();
      usage[name] = { uses: 0, lastUsed: ts, createdAt: ts, status: "active" };
    }
  }

  let dirty = false;

  for (const name of names) {
    const entry = usage[name];
    if (!entry || entry.status === "pinned" || entry.status === "archived") continue;

    // Grace floor: max(lastUsed, createdAt) prevents instant-archive on first-seen
    const floorMs = Math.max(
      new Date(entry.lastUsed).getTime(),
      new Date(entry.createdAt).getTime(),
    );
    const ageDays = (now - floorMs) / 86_400_000;

    if (ageDays >= cfg.archiveDays) {
      const archiveDest = join(archivePath(dataDir), `${name}-${Date.now()}`);
      mkdirSync(archivePath(dataDir), { recursive: true });

      const srcDir =
        existsSync(join(dataDir, "skills", FRAPPESKILLS_CLONE_NAME, name))
          ? join(dataDir, "skills", FRAPPESKILLS_CLONE_NAME, name)
          : existsSync(join(ompManagedSkillsDir(), name))
            ? join(ompManagedSkillsDir(), name)
            : null;

      const sha = srcDir ? sha256OfDir(srcDir) : "";
      if (srcDir) {
        try {
          renameSync(srcDir, archiveDest);
          writeFileSync(join(archiveDest, ORIGIN_FILE), srcDir);
        } catch { /* leave on disk if move fails (cross-device); still mark archived */ }
      }
      entry.status = "archived";
      dirty = true;
      appendLedger(dataDir, {
        ts: new Date().toISOString(), actor: "curator", action: "archive",
        skill: name, from: srcDir ?? "", to: archiveDest, sha256_before: sha,
      });
    } else if (ageDays >= cfg.staleDays) {
      if (entry.status !== "stale") {
        entry.status = "stale";
        dirty = true;
        appendLedger(dataDir, {
          ts: new Date().toISOString(), actor: "curator", action: "mark_stale", skill: name,
        });
      }
    } else if (entry.status === "stale") {
      entry.status = "active";
      dirty = true;
    }
  }

  if (dirty) writeJsonAtomic(usagePath(dataDir), usage);
}

// ── restoreSkill ──────────────────────────────────────────────────────────────

/** Move an archived skill back to its original location and mark it active. */
export async function restoreSkill(dataDir: string, name: string): Promise<void> {
  const usage: UsageMap = readJson<UsageMap>(usagePath(dataDir), {});
  const arch = archivePath(dataDir);
  if (!existsSync(arch)) throw new Error(`No archive directory`);

  // Newest archive dir for this skill
  const match = readdirSync(arch, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith(`${name}-`))
    .map((e) => e.name)
    .sort()
    .at(-1);
  if (!match) throw new Error(`No archive for skill "${name}"`);

  const archiveDir = join(arch, match);
  let dest: string;
  try {
    dest = readFileSync(join(archiveDir, ORIGIN_FILE), "utf8").trim();
  } catch {
    dest = join(ompManagedSkillsDir(), name); // fallback
  }

  mkdirSync(join(dest, ".."), { recursive: true });
  renameSync(archiveDir, dest);

  const now = new Date().toISOString();
  if (usage[name]) { usage[name].status = "active"; usage[name].lastUsed = now; }
  writeJsonAtomic(usagePath(dataDir), usage);
  appendLedger(dataDir, {
    ts: now, actor: "user", action: "restore", skill: name, from: archiveDir, to: dest,
  });
}

// ── pin / unpin ───────────────────────────────────────────────────────────────

export function pinSkill(dataDir: string, name: string): void {
  const usage: UsageMap = readJson<UsageMap>(usagePath(dataDir), {});
  const now = new Date().toISOString();
  usage[name] = {
    uses: usage[name]?.uses ?? 0,
    lastUsed: usage[name]?.lastUsed ?? now,
    createdAt: usage[name]?.createdAt ?? now,
    status: "pinned",
  };
  writeJsonAtomic(usagePath(dataDir), usage);
  appendLedger(dataDir, { ts: now, actor: "user", action: "pin", skill: name });
}

export function unpinSkill(dataDir: string, name: string): void {
  const usage: UsageMap = readJson<UsageMap>(usagePath(dataDir), {});
  if (!usage[name]) return;
  usage[name].status = "active";
  writeJsonAtomic(usagePath(dataDir), usage);
  appendLedger(dataDir, { ts: new Date().toISOString(), actor: "user", action: "unpin", skill: name });
}

// ── extractSkillName ──────────────────────────────────────────────────────────

/**
 * Parse a skill name from a tool-call path argument. Returns null when the path
 * doesn't look like a skill read.
 *
 * Matches:
 *   skill://<name>[/...]
 *   .../<name>/SKILL.md  (any depth)
 */
export function extractSkillName(path: string): string | null {
  if (!path) return null;
  if (path.startsWith("skill://")) {
    return path.slice(8).split("/")[0] || null;
  }
  if (path.includes("/SKILL.md")) {
    const parts = path.split("/");
    const idx = parts.lastIndexOf("SKILL.md");
    if (idx > 0) return parts[idx - 1] || null;
  }
  return null;
}
