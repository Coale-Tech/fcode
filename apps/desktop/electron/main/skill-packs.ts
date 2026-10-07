/**
 * Main-process view of the self-improving skill pack clone that the bridge keeps
 * in `<dataDir>/skills/frappeskills` (packages/omp-bridge/src/skill-packs.ts).
 * Everything here is plain git/gh; nothing leaves the machine except `openPr`.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { lintSkillContent, type OmpSkillLintResult, type OmpSkillPackStatus } from "@pi-desktop/shared";
import { desktopDataDir } from "./data-paths.ts";

const run = promisify(execFile);
const BRANCH = "fcode/self-improve";
const REPO = "Coale-Tech/frappeskills";

const cloneDir = () => join(desktopDataDir(), "skills", "frappeskills");

async function cmd(bin: string, args: string[], cwd: string, raw = false): Promise<string> {
  try {
    const { stdout } = await run(bin, args, { cwd, timeout: 120_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
    return raw ? stdout : stdout.trim();
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    throw new Error((err.stderr || err.message).trim());
  }
}

export async function skillPackStatus(): Promise<OmpSkillPackStatus> {
  const dir = cloneDir();
  if (!existsSync(join(dir, ".git"))) return { cloned: false, branch: "", commits: [], files: [], dirty: false, lint: [] };
  const git = (...a: string[]) => cmd("git", a, dir);
  // porcelain lines start with a significant space (" M file"), so keep stdout untrimmed.
  const [branch, log, committed, porcelain] = await Promise.all([
    git("rev-parse", "--abbrev-ref", "HEAD"),
    git("log", "origin/HEAD..HEAD", "--format=%h\t%s"),
    git("diff", "--name-only", "origin/HEAD...HEAD"),
    cmd("git", ["status", "--porcelain"], dir, true),
  ]);
  const uncommitted = porcelain.split("\n").filter(Boolean).map((l) => l.slice(3));
  const files = [...new Set([...committed.split("\n").filter(Boolean), ...uncommitted])].sort();
  const lint: OmpSkillLintResult[] = [];
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    try {
      const content = await readFile(join(dir, file), "utf8");
      const { errors, warnings } = lintSkillContent(content);
      lint.push({ skill: file, errors, warnings });
    } catch {
      // deleted file — no lint needed
    }
  }
  return {
    cloned: true,
    branch,
    commits: log.split("\n").filter(Boolean).map((l) => {
      const [sha, ...rest] = l.split("\t");
      return { sha, subject: rest.join("\t") };
    }),
    files,
    dirty: uncommitted.length > 0,
    lint,
  };
}

/** Push the branch and open (or find) the PR. Refuses when any changed skill has lint errors. */
export async function skillPackOpenPr(): Promise<{ url: string }> {
  const dir = cloneDir();
  const status = await skillPackStatus();
  if (!status.cloned) throw new Error("Skill pack is not cloned yet");
  if (status.branch !== BRANCH) throw new Error(`Expected branch ${BRANCH}, found ${status.branch}`);
  const blocking = status.lint.filter((r) => r.errors.length > 0);
  if (blocking.length > 0) {
    const summary = blocking.map((r) => `${r.skill}: ${r.errors[0]}`).join("; ");
    throw new Error(`Lint errors must be fixed before opening a PR — ${summary}`);
  }
  if (status.dirty) {
    await cmd("git", ["add", "-A"], dir);
    await cmd("git", ["commit", "-qm", "Fcode: skill improvements"], dir);
  }
  const after = await skillPackStatus();
  if (after.commits.length === 0) throw new Error("No local skill improvements to submit");
  await cmd("git", ["push", "-u", "--force-with-lease", "origin", BRANCH], dir);
  const existing = await cmd("gh", ["pr", "list", "--repo", REPO, "--head", BRANCH, "--state", "open", "--json", "url", "-q", ".[0].url"], dir);
  if (existing) return { url: existing };
  const body = ["Lessons recorded by the Fcode agent, one per commit:", "", ...after.commits.map((c) => `- ${c.subject}`)].join("\n");
  const title = after.commits.length === 1 ? after.commits[0].subject : `Fcode skill improvements (${after.commits.length})`;
  const url = await cmd("gh", ["pr", "create", "--repo", REPO, "--base", "main", "--head", BRANCH, "--title", title, "--body", body], dir);
  return { url: url.split("\n").pop() ?? url };
}

/** Reject every local self-improvement: back to upstream. */
export async function skillPackDiscard(): Promise<OmpSkillPackStatus> {
  const dir = cloneDir();
  if (!existsSync(join(dir, ".git"))) return skillPackStatus();
  await cmd("git", ["reset", "--hard", "origin/HEAD"], dir);
  await cmd("git", ["clean", "-fdq"], dir);
  return skillPackStatus();
}
