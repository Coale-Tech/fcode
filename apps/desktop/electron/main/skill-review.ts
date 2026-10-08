/**
 * Desktop-main view of the skill review approval gate and journey timeline.
 *
 * The omp-bridge runs in a subprocess and cannot be imported here. All logic
 * mirrors `packages/omp-bridge/src/skill-review.ts` (path constants, proposal
 * shape) and `packages/omp-bridge/src/skill-journey.ts` (timeline sort).
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lintSkillContent } from "@pi-desktop/shared";
import type { OmpJourneyEvent, OmpSkillProposal } from "@pi-desktop/shared";
import { desktopDataDir } from "./data-paths.ts";

const run = promisify(execFile);

// ── Mirrored path sub-paths (match omp-bridge constants) ──────────────────────
// Not tiny-function helpers — domain constants used by multiple exported fns.
const PENDING_REVIEW_SUBPATH = join("skills", ".review", "pending");
const REVIEW_LEDGER_SUBPATH  = join("skills", ".review", "ledger.jsonl");
const CURATOR_LEDGER_SUBPATH = join("skills", ".curator", "ledger.jsonl");
const FRAPPESKILLS_SUBPATH   = join("skills", "frappeskills");
const SELF_IMPROVE_BRANCH    = "fcode/self-improve";

// ── Git helper ────────────────────────────────────────────────────────────────

async function git(cwd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  try {
    const { stdout } = await run("git", args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } as NodeJS.ProcessEnv,
      timeout: 30_000,
    });
    return { ok: true, out: stdout.trim() };
  } catch (e) {
    return { ok: false, out: String((e as Error).message ?? e) };
  }
}

// ── Proposal helpers ──────────────────────────────────────────────────────────

function readProposal(dataDir: string, id: string): OmpSkillProposal {
  const file = join(dataDir, PENDING_REVIEW_SUBPATH, `${id}.json`);
  if (!existsSync(file)) throw new Error(`Proposal "${id}" not found`);
  return JSON.parse(readFileSync(file, "utf8")) as OmpSkillProposal;
}

function appendReviewLedger(
  dataDir: string,
  entry: { ts: string; action: "approved" | "rejected"; id: string; skill: string },
): void {
  try {
    mkdirSync(join(dataDir, "skills", ".review"), { recursive: true });
    appendFileSync(join(dataDir, REVIEW_LEDGER_SUBPATH), JSON.stringify(entry) + "\n");
  } catch { /* never throw */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** List all pending proposals, newest first. Silently skips unreadable files. */
export function listPendingProposals(dataDir: string): OmpSkillProposal[] {
  const dir = join(dataDir, PENDING_REVIEW_SUBPATH);
  if (!existsSync(dir)) return [];
  const proposals: OmpSkillProposal[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const p = JSON.parse(readFileSync(join(dir, entry.name), "utf8")) as OmpSkillProposal;
      if (p.id && p.name && p.body) proposals.push(p);
    } catch { /* skip corrupt */ }
  }
  return proposals.sort((a, b) => b.stagedAt.localeCompare(a.stagedAt));
}

/**
 * Approve a pending proposal: lint the body, write SKILL.md, commit on
 * fcode/self-improve, delete the pending file, append to the review ledger.
 */
export async function approveProposal(dataDir: string, id: string): Promise<void> {
  const proposal = readProposal(dataDir, id);
  const content = `---\nname: ${proposal.name}\ndescription: ${proposal.description}\n---\n\n${proposal.body}\n`;
  const { errors } = lintSkillContent(content);
  if (errors.length > 0) throw new Error(`Skill "${proposal.name}" has lint errors: ${errors.join("; ")}`);

  const repoDir = join(dataDir, FRAPPESKILLS_SUBPATH);
  if (!existsSync(join(repoDir, ".git"))) throw new Error("frappeskills is not cloned");

  const skillDir = join(repoDir, proposal.name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), content, "utf8");

  const addResult = await git(repoDir, ["add", join(proposal.name, "SKILL.md")]);
  if (!addResult.ok) throw new Error(`git add failed: ${addResult.out}`);

  const commitResult = await git(repoDir, [
    "commit", "-m", `Fcode: review — ${proposal.name}`,
  ]);
  if (!commitResult.ok && !commitResult.out.includes("nothing to commit")) {
    throw new Error(`git commit failed: ${commitResult.out}`);
  }

  try { unlinkSync(join(dataDir, PENDING_REVIEW_SUBPATH, `${id}.json`)); } catch { /* already gone */ }
  appendReviewLedger(dataDir, { ts: new Date().toISOString(), action: "approved", id, skill: proposal.name });
}

/** Reject a pending proposal: delete the pending file and append to the review ledger. */
export function rejectProposal(dataDir: string, id: string): void {
  let name = id;
  try {
    const p = readProposal(dataDir, id);
    name = p.name;
  } catch { /* name unknown, use id */ }
  try { unlinkSync(join(dataDir, PENDING_REVIEW_SUBPATH, `${id}.json`)); } catch { /* already gone */ }
  appendReviewLedger(dataDir, { ts: new Date().toISOString(), action: "rejected", id, skill: name });
}

// ── Journey timeline ──────────────────────────────────────────────────────────

/** Read the curator ledger JSONL and return parsed events. */
function readCuratorLedger(dataDir: string): OmpJourneyEvent[] {
  const file = join(dataDir, CURATOR_LEDGER_SUBPATH);
  if (!existsSync(file)) return [];
  const events: OmpJourneyEvent[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as { ts: string; actor: string; action: string; skill: string };
      if (e.ts && e.action && e.skill) {
        events.push({ type: "curator", ts: e.ts, actor: e.actor ?? "curator", action: e.action, skill: e.skill });
      }
    } catch { /* skip malformed */ }
  }
  return events;
}

/** Read the review ledger JSONL (approved/rejected proposals). */
function readReviewLedger(dataDir: string): OmpJourneyEvent[] {
  const file = join(dataDir, REVIEW_LEDGER_SUBPATH);
  if (!existsSync(file)) return [];
  const events: OmpJourneyEvent[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as { ts: string; action: "approved" | "rejected"; id: string; skill: string };
      if (e.ts && e.action && e.id && e.skill) {
        events.push({
          type: e.action === "approved" ? "proposal-approved" : "proposal-rejected",
          ts: e.ts,
          skill: e.skill,
          id: e.id,
        });
      }
    } catch { /* skip malformed */ }
  }
  return events;
}

/** Read recent commits on fcode/self-improve from the frappeskills repo. */
async function readGitCommits(dataDir: string): Promise<OmpJourneyEvent[]> {
  const repoDir = join(dataDir, FRAPPESKILLS_SUBPATH);
  if (!existsSync(join(repoDir, ".git"))) return [];
  const result = await git(repoDir, [
    "log", SELF_IMPROVE_BRANCH,
    "--format=%H%x09%aI%x09%s",
    "--max-count=100",
  ]);
  if (!result.ok || !result.out) return [];
  const events: OmpJourneyEvent[] = [];
  for (const line of result.out.split("\n")) {
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const [hash, ts, ...messageParts] = parts;
    const message = messageParts.join("\t");
    // Extract skill name from commit message "Fcode: review — <skill>"
    const skill = message.replace(/^Fcode:\s*review\s*[—-]\s*/i, "").trim() || message;
    events.push({ type: "git-commit", ts, hash, skill, message });
  }
  return events;
}

/**
 * Build the full journey timeline: curator events + git commits + proposal decisions,
 * sorted newest first. Exported for the IPC handler.
 */
export async function getJourneyEvents(dataDir: string): Promise<OmpJourneyEvent[]> {
  const [commits, curatorEvents, proposalEvents] = await Promise.all([
    readGitCommits(dataDir),
    Promise.resolve(readCuratorLedger(dataDir)),
    Promise.resolve(readReviewLedger(dataDir)),
  ]);
  const all = [...commits, ...curatorEvents, ...proposalEvents];
  return all.sort((a, b) => (b.ts < a.ts ? -1 : b.ts > a.ts ? 1 : 0));
}
