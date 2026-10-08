import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const sh = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

test("skill pack status lists local improvements and discard returns to upstream", async () => {
  const root = mkdtempSync(join(tmpdir(), "skillpack-ui-"));
  try {
    const origin = join(root, "origin.git");
    sh(root, "init", "-q", "--bare", "-b", "main", origin);
    sh(root, "clone", "-q", origin, "seed");
    writeFileSync(join(root, "seed", "a.md"), "one");
    sh(join(root, "seed"), "add", "-A");
    sh(join(root, "seed"), "-c", "user.email=a@b", "-c", "user.name=a", "commit", "-qm", "init");
    sh(join(root, "seed"), "push", "-q", "origin", "HEAD:main");
    mkdirSync(join(root, "skills"));
    sh(join(root, "skills"), "clone", "-q", origin, "frappeskills");
    const clone = join(root, "skills", "frappeskills");
    sh(clone, "remote", "set-head", "origin", "main");
    sh(clone, "checkout", "-qb", "fcode/self-improve");

    process.env.PI_DESKTOP_DATA_DIR = root;
    const { skillPackStatus, skillPackDiscard } = await import("../electron/main/skill-packs.ts");

    assert.deepEqual(await skillPackStatus(), { cloned: true, branch: "fcode/self-improve", commits: [], files: [], dirty: false, lint: [] });

    writeFileSync(join(clone, "b.md"), "lesson");
    sh(clone, "add", "-A");
    sh(clone, "-c", "user.email=a@b", "-c", "user.name=a", "commit", "-qm", "frappe-testing: lesson");
    writeFileSync(join(clone, "a.md"), "edited");

    const s = await skillPackStatus();
    assert.equal(s.commits.length, 1);
    assert.equal(s.commits[0].subject, "frappe-testing: lesson");
    assert.deepEqual(s.files, ["a.md", "b.md"]);
    assert.equal(s.dirty, true);

    const after = await skillPackDiscard();
    assert.deepEqual(after, { cloned: true, branch: "fcode/self-improve", commits: [], files: [], dirty: false, lint: [] });
  } finally {
    delete process.env.PI_DESKTOP_DATA_DIR;
    rmSync(root, { recursive: true, force: true });
  }
});

test("skill pack status reports not cloned", async () => {
  const root = mkdtempSync(join(tmpdir(), "skillpack-ui-"));
  try {
    process.env.PI_DESKTOP_DATA_DIR = root;
    const { skillPackStatus } = await import("../electron/main/skill-packs.ts");
    assert.equal((await skillPackStatus()).cloned, false);
  } finally {
    delete process.env.PI_DESKTOP_DATA_DIR;
    rmSync(root, { recursive: true, force: true });
  }
});
