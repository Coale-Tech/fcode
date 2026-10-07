import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSkillPackDirs, SELF_IMPROVE_BRANCH, syncSkillPack, prepareSelfImprovement } from "./skill-packs.js";

// Real git subprocesses; the default 5s is too tight on a loaded CI box.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

describe("skill packs", () => {
  let root: string;
  let origin: string;
  const pack = { name: "frappeskills", url: "", skillsSubdir: "" };

  /** Upstream work tree that pushes to the bare "origin" the clone follows. */
  const upstream = (file: string, text: string) => {
    const w = join(root, "work");
    writeFileSync(join(w, file), text);
    sh(w, "add", "-A");
    sh(w, "-c", "user.email=a@b", "-c", "user.name=a", "commit", "-qm", file);
    sh(w, "push", "-q", "origin", "HEAD:main");
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "skillpacks-"));
    origin = join(root, "origin.git");
    sh(root, "init", "-q", "--bare", "-b", "main", origin);
    sh(root, "clone", "-q", origin, "work");
    pack.url = `file://${origin}`;
    upstream("a.md", "one");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("prefers the live clone over the bundled snapshot", () => {
    const res = join(root, "res");
    mkdirSync(join(res, "skill-packs", "frappeskills"), { recursive: true });
    mkdirSync(join(res, "skill-packs", "frappe-skills", "skills"), { recursive: true });
    expect(resolveSkillPackDirs(root, res)).toEqual([
      join(res, "skill-packs", "frappe-skills", "skills"),
      join(res, "skill-packs", "frappeskills"),
    ]);
    mkdirSync(join(root, "skills", "frappeskills", ".git"), { recursive: true });
    expect(resolveSkillPackDirs(root, res)[1]).toBe(join(root, "skills", "frappeskills"));
  });

  it("clones, fast-forwards, and keeps local improvements on rebase", async () => {
    expect(await syncSkillPack(root, pack)).toBe("cloned");
    const clone = join(root, "skills", "frappeskills");
    upstream("b.md", "two");
    expect(await syncSkillPack(root, pack)).toBe("updated");
    expect(existsSync(join(clone, "b.md"))).toBe(true);

    await prepareSelfImprovement(root);
    // prepareSelfImprovement only targets the real pack name, which this test reuses.
    expect(sh(clone, "rev-parse", "--abbrev-ref", "HEAD")).toBe(SELF_IMPROVE_BRANCH);
    writeFileSync(join(clone, "mine.md"), "lesson");
    sh(clone, "add", "-A");
    sh(clone, "commit", "-qm", "mine");

    upstream("c.md", "three");
    expect(await syncSkillPack(root, pack)).toBe("rebased");
    expect(existsSync(join(clone, "c.md"))).toBe(true);
    expect(readFileSync(join(clone, "mine.md"), "utf8")).toBe("lesson");
  });

  it("leaves a conflicting rebase untouched", async () => {
    await syncSkillPack(root, pack);
    const clone = join(root, "skills", "frappeskills");
    await prepareSelfImprovement(root);
    writeFileSync(join(clone, "a.md"), "mine");
    sh(clone, "add", "-A");
    sh(clone, "commit", "-qm", "mine");
    upstream("a.md", "theirs");
    expect(await syncSkillPack(root, pack)).toMatch(/^rebase conflict/);
    expect(readFileSync(join(clone, "a.md"), "utf8")).toBe("mine");
    expect(sh(clone, "status", "--porcelain")).toBe("");
  });

  it("reports a failed clone instead of throwing", async () => {
    expect(await syncSkillPack(root, { ...pack, url: `file://${root}/nope.git` })).toMatch(/^clone failed/);
  });
});
