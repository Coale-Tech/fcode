/**
 * Desktop-main view of the skill curator.
 * Reads the curator's data files directly (omp-bridge is a separate subprocess
 * and cannot be imported here). Provides status, restore, and pin operations.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OmpSkillCuratorEntry, OmpSkillCuratorMutateResult, OmpSkillCuratorStatusResult } from "@pi-desktop/shared";

// ── Path helpers (mirror skill-curator.ts in omp-bridge) ─────────────────────

const curatorDir  = (d: string) => join(d, "skills", ".curator");
const usagePath   = (d: string) => join(d, "skills", ".curator", "usage.json");
const ledgerPath  = (d: string) => join(d, "skills", ".curator", "ledger.jsonl");
const archivePath = (d: string) => join(d, "skills", ".curator", "archive");

type SkillStatus = "active" | "stale" | "archived" | "pinned";
interface UsageEntry { uses: number; lastUsed: string; createdAt: string; status: SkillStatus }
type UsageMap = Record<string, UsageEntry>;

function readUsage(dataDir: string): UsageMap {
  try { return JSON.parse(readFileSync(usagePath(dataDir), "utf8")) as UsageMap; } catch { return {}; }
}

function writeUsage(dataDir: string, data: UsageMap): void {
  mkdirSync(curatorDir(dataDir), { recursive: true });
  const tmp = `${usagePath(dataDir)}.tmp.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, usagePath(dataDir));
}

function addLedger(dataDir: string, entry: Record<string, unknown>): void {
  try {
    mkdirSync(curatorDir(dataDir), { recursive: true });
    appendFileSync(ledgerPath(dataDir), JSON.stringify(entry) + "\n");
  } catch { /* never throw */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Return all tracked skills with their current status. */
export function curatorStatus(dataDir: string): OmpSkillCuratorStatusResult {
  const usage = readUsage(dataDir);
  const skills: OmpSkillCuratorEntry[] = Object.entries(usage)
    .map(([name, e]) => ({
      name,
      uses: e.uses,
      lastUsed: e.lastUsed ?? null,
      status: e.status,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { skills };
}

/** Restore a skill from the archive back to its original location. */
export async function curatorRestore(dataDir: string, name: string): Promise<OmpSkillCuratorMutateResult> {
  const arch = archivePath(dataDir);
  if (!existsSync(arch)) return { ok: false };

  const match = readdirSync(arch, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith(`${name}-`))
    .map((e) => e.name)
    .sort()
    .at(-1);
  if (!match) return { ok: false };

  const archiveDir = join(arch, match);
  let dest: string;
  try {
    dest = readFileSync(join(archiveDir, "_origin"), "utf8").trim();
  } catch {
    // Fallback: restore to managed-skills (safe default)
    dest = join(homedir(), ".omp", "agent", "managed-skills", name);
  }

  try {
    mkdirSync(join(dest, ".."), { recursive: true });
    renameSync(archiveDir, dest);
  } catch {
    return { ok: false };
  }

  const usage = readUsage(dataDir);
  if (usage[name]) { usage[name].status = "active"; usage[name].lastUsed = new Date().toISOString(); }
  writeUsage(dataDir, usage);
  addLedger(dataDir, {
    ts: new Date().toISOString(), actor: "user", action: "restore",
    skill: name, from: archiveDir, to: dest,
  });
  return { ok: true };
}

/** Pin or unpin a skill. Pinned skills are never marked stale or archived. */
export function curatorPin(dataDir: string, name: string, pinned: boolean): OmpSkillCuratorMutateResult {
  const usage = readUsage(dataDir);
  if (!usage[name]) {
    const now = new Date().toISOString();
    usage[name] = { uses: 0, lastUsed: now, createdAt: now, status: pinned ? "pinned" : "active" };
  } else {
    usage[name].status = pinned ? "pinned" : "active";
  }
  writeUsage(dataDir, usage);
  addLedger(dataDir, {
    ts: new Date().toISOString(), actor: "user",
    action: pinned ? "pin" : "unpin", skill: name,
  });
  return { ok: true };
}
