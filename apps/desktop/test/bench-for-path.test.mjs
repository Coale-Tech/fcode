/**
 * Unit tests for benchForPath().
 *
 * Runs against real temporary directories; no mocks that echo themselves.
 * A git worktree inside a bench dir resolves to the bench via the parent-repo
 * walk-up fallback.  HOME is redirected so nothing leaks to the real ~/.omp/wt.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { benchForPath } = await import("../electron/main/bench/bench-for-path.ts");

const root = realpathSync(mkdtempSync(join(tmpdir(), "bench-for-path-"))); // git reports canonical paths
process.env.HOME = join(root, "home");

test.after(() => rmSync(root, { recursive: true, force: true }));

// Helper: create a minimal bench dir (apps/ + sites/) under a given parent.
function makeBench(parent, name) {
  const benchDir = join(parent, name);
  mkdirSync(join(benchDir, "apps"), { recursive: true });
  mkdirSync(join(benchDir, "sites"), { recursive: true });
  return benchDir;
}

// Helper: init a bare git repo with one commit.
function initRepo(dir) {
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t",
    "commit", "-q", "--allow-empty", "-m", "init"]);
}

test("path directly inside a bench resolves to that bench", async () => {
  const bench = makeBench(root, "bench-a");
  mkdirSync(join(bench, "apps", "frappe"), { recursive: true });
  const result = await benchForPath(join(bench, "apps", "frappe"));
  assert.equal(result, bench);
});

test("the bench root itself resolves to itself", async () => {
  const bench = makeBench(root, "bench-b");
  const result = await benchForPath(bench);
  assert.equal(result, bench);
});

test("path nested several levels deep inside a bench resolves to the bench", async () => {
  const bench = makeBench(root, "bench-c");
  const deep = join(bench, "apps", "myapp", "myapp", "public", "js");
  mkdirSync(deep, { recursive: true });
  const result = await benchForPath(deep);
  assert.equal(result, bench);
});

test("path outside any bench returns null", async () => {
  const outside = join(root, "not-a-bench");
  mkdirSync(outside, { recursive: true });
  const result = await benchForPath(outside);
  assert.equal(result, null);
});

test("nonexistent path returns null without throwing", async () => {
  const result = await benchForPath(join(root, "does-not-exist", "at-all"));
  assert.equal(result, null);
});

test("a dir with only apps/ (no sites/) returns null", async () => {
  const partial = join(root, "partial-bench");
  mkdirSync(join(partial, "apps"), { recursive: true });
  const result = await benchForPath(join(partial, "apps", "something"));
  assert.equal(result, null);
});

test("git worktree of a repo inside a bench resolves to the bench via parent-repo fallback", async () => {
  const bench = makeBench(root, "bench-wt");
  // Put the main repo inside the bench's apps/ directory (simulates a dev setup).
  const mainRepo = join(bench, "apps", "myapp");
  initRepo(mainRepo);

  // Create a worktree somewhere outside the bench
  const wtDir = join(root, "worktrees", "feature-x");
  mkdirSync(join(root, "worktrees"), { recursive: true });
  execFileSync("git", ["-C", mainRepo, "worktree", "add", "-b", "feature-x", wtDir]);

  // The worktree itself is outside the bench, but its parent repo is inside.
  const result = await benchForPath(wtDir);
  assert.equal(result, bench, `expected bench dir, got: ${result}`);
});

test("git worktree of a repo NOT inside any bench returns null", async () => {
  const standaloneRepo = join(root, "standalone-repo");
  initRepo(standaloneRepo);

  const wtDir = join(root, "standalone-wt");
  mkdirSync(wtDir, { recursive: true });
  execFileSync("git", ["-C", standaloneRepo, "worktree", "add", "-b", "feat-y", wtDir]);

  const result = await benchForPath(wtDir);
  assert.equal(result, null);
});

test("regular git repo inside a bench (not a worktree) resolves to the bench", async () => {
  const bench = makeBench(root, "bench-repo");
  const repo = join(bench, "apps", "custom");
  initRepo(repo);
  const result = await benchForPath(repo);
  assert.equal(result, bench);
});
