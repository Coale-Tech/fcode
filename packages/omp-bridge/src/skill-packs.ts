/**
 * Frappe skill packs: two upstream git repos whose skills Fcode always loads.
 *
 *  - frappe/skills            read-only upstream, fast-forwarded on every launch
 *  - Coale-Tech/frappeskills  writable clone; the agent commits improvements to
 *                             the local `fcode/self-improve` branch, a PR is
 *                             opened only when the user approves
 *
 * A snapshot of both ships in `<resources>/skill-packs` and is used until the
 * first clone lands (offline first run), so the skills are never missing.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CuratorConfig } from "./skill-curator.js";
import { DEFAULT_CURATOR_CONFIG, readCuratorState, runCurator, shouldRunCurator, writeCuratorState } from "./skill-curator.js";

export const SELF_IMPROVE_BRANCH = "fcode/self-improve";

export interface SkillPack {
  /** Folder name under `<dataDir>/skills` and `<resources>/skill-packs`. */
  name: string;
  url: string;
  /** Sub-directory of the repo that holds `<skill>/SKILL.md` folders. */
  skillsSubdir: string;
}

export const SKILL_PACKS: readonly SkillPack[] = [
  { name: "frappe-skills", url: "https://github.com/frappe/skills.git", skillsSubdir: "skills" },
  { name: "frappeskills", url: "https://github.com/Coale-Tech/frappeskills.git", skillsSubdir: "" },
];

/** Live clone when present, else the bundled snapshot, else null. */
export function resolveSkillPackDirs(dataDir: string, resourcesPath: string): string[] {
  const dirs: string[] = [];
  for (const pack of SKILL_PACKS) {
    const clone = join(dataDir, "skills", pack.name);
    const root = existsSync(join(clone, ".git")) ? clone : join(resourcesPath, "skill-packs", pack.name);
    const dir = resolve(join(root, pack.skillsSubdir));
    if (existsSync(dir)) dirs.push(dir);
  }
  return dirs;
}

export function git(cwd: string, args: string[], timeoutMs = 120_000): Promise<{ ok: boolean; out: string }> {
  const { promise, resolve: done } = Promise.withResolvers<{ ok: boolean; out: string }>();
  const child = spawn("git", args, { cwd, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  let out = "";
  const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
  const collect = (c: unknown) => { out += String(c); };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);
  child.on("error", () => { clearTimeout(timer); done({ ok: false, out: "git unavailable" }); });
  child.on("close", (code) => { clearTimeout(timer); done({ ok: code === 0, out: out.trim() }); });
  return promise;
}

/** Clone or update one pack. Never overwrites local work; never throws. */
export async function syncSkillPack(dataDir: string, pack: SkillPack): Promise<string> {
  const parent = join(dataDir, "skills");
  const dir = join(parent, pack.name);
  mkdirSync(parent, { recursive: true });
  if (!existsSync(join(dir, ".git"))) {
    const r = await git(parent, ["clone", "--depth", "1", pack.url, pack.name]);
    return r.ok ? "cloned" : `clone failed: ${r.out}`;
  }
  const fetched = await git(dir, ["fetch", "--quiet", "origin"]);
  if (!fetched.ok) return `fetch failed: ${fetched.out}`;
  const head = (await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"])).out;
  if (head === SELF_IMPROVE_BRANCH) {
    // Carry local improvements onto the new upstream; back out on conflict.
    const r = await git(dir, ["rebase", "--autostash", "origin/HEAD"]);
    if (r.ok) return "rebased";
    await git(dir, ["rebase", "--abort"]);
    return `rebase conflict, left as is: ${r.out}`;
  }
  const r = await git(dir, ["merge", "--ff-only", "@{upstream}"]);
  return r.ok ? "updated" : `not fast-forwardable, left as is: ${r.out}`;
}

/**
 * Make the self-improvement clone ready: full history is not needed, but the
 * branch and a committer identity must exist so the agent can just `git commit`.
 */
export async function prepareSelfImprovement(dataDir: string): Promise<void> {
  const dir = join(dataDir, "skills", "frappeskills");
  if (!existsSync(join(dir, ".git"))) return;
  const has = await git(dir, ["rev-parse", "--verify", "--quiet", SELF_IMPROVE_BRANCH]);
  if (!has.ok) await git(dir, ["checkout", "-b", SELF_IMPROVE_BRANCH]);
  else if ((await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"])).out !== SELF_IMPROVE_BRANCH) {
    await git(dir, ["checkout", SELF_IMPROVE_BRANCH]);
  }
  if (!(await git(dir, ["config", "user.email"])).out) {
    await git(dir, ["config", "user.email", "fcode@localhost"]);
    await git(dir, ["config", "user.name", "Fcode"]);
  }
}

/** Re-sync while the app stays open; launch alone would let a week-long session go stale. */
export const SKILL_PACK_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;


export interface SkillPackSyncOpts {
  /** Returns the timestamp (ms) of the last user activity for idle gating. */
  getLastActivity?: () => number;
  /** Curator config; uses defaults when absent. */
  curatorCfg?: CuratorConfig;
}

/** Fire-and-forget: sync every pack now and every few hours, then ready the self-improvement branch. */
export function syncSkillPacksInBackground(
  dataDir: string,
  log: (line: string) => void,
  opts?: SkillPackSyncOpts,
): NodeJS.Timeout {
  const cfg = opts?.curatorCfg ?? DEFAULT_CURATOR_CONFIG;
  const pass = () =>
    (async () => {
      for (const pack of SKILL_PACKS) log(`skill-pack ${pack.name}: ${await syncSkillPack(dataDir, pack)}`);
      await prepareSelfImprovement(dataDir);

      // Skill curator pass — only when enabled and gating conditions are met.
      if (cfg.enabled) {
        let state = readCuratorState(dataDir);
        const now = Date.now();
        if (!state.firstSeen) {
          writeCuratorState(dataDir, { firstSeen: new Date().toISOString() });
        } else if (shouldRunCurator(state, now, opts?.getLastActivity?.() ?? 0, cfg)) {
          await runCurator(dataDir, cfg);
          state = readCuratorState(dataDir);
          writeCuratorState(dataDir, { ...state, lastRun: new Date().toISOString() });
          log("skill-curator: pass complete");
        }
      }
    })().catch((e) => log(`skill-pack sync error: ${String(e)}`));
  void pass();
  return setInterval(() => void pass(), SKILL_PACK_SYNC_INTERVAL_MS).unref();
}
