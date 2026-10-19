/**
 * Behaviour tests for provisionWorktree().
 *
 * Exercises against a real throwaway git repo so that `git check-ignore` gives
 * genuine answers. HOME is redirected inside the temp dir so no real ~/.omp/wt
 * is touched.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { register, registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const electronStub = `data:text/javascript,${encodeURIComponent("export const shell = {};")}`;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "electron") return { url: electronStub, shortCircuit: true };
    return next(specifier, context);
  },
});
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { provisionWorktree } = await import("../electron/main/worktree-provision.ts");

// ─── shared temp fixture ───────────────────────────────────────────────────────

const root = mkdtempSync(join(tmpdir(), "wt-provision-"));
process.env.HOME = join(root, "home");
mkdirSync(process.env.HOME, { recursive: true });

const repo = join(root, "repo");
const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

execFileSync("git", ["init", "-q", "-b", "main", repo]);
git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");

// .gitignore: ignore .env and node_modules/
writeFileSync(join(repo, ".gitignore"), ".env\nnode_modules/\n");
// A tracked file (must be refused as "not gitignored")
writeFileSync(join(repo, "tracked.txt"), "hello");
git("add", ".gitignore", "tracked.txt");
git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "add tracked files");

// Gitignored source files
writeFileSync(join(repo, ".env"), "SECRET=1");
mkdirSync(join(repo, "node_modules"), { recursive: true });
writeFileSync(join(repo, "node_modules", "pkg.js"), "// dep");

test.after(() => rmSync(root, { recursive: true, force: true }));

// ─── tests ────────────────────────────────────────────────────────────────────

test(".worktreeinclude copies a gitignored file", async () => {
  writeFileSync(join(repo, ".worktreeinclude"), ".env\n");
  const wt = join(root, "wt-copy");
  mkdirSync(wt);

  const entries = await provisionWorktree(repo, wt);

  const e = entries.find((entry) => entry.path === ".env");
  assert.ok(e, "entry for .env should exist");
  assert.equal(e.status, "done");
  assert.equal(e.mode, "copy");
  // Must be a regular file, not a symlink
  assert.ok(!lstatSync(join(wt, ".env")).isSymbolicLink(), ".env should be a regular file");
  assert.equal(readFileSync(join(wt, ".env"), "utf8"), "SECRET=1");
});

test(".worktreeshare symlinks a gitignored directory", async () => {
  writeFileSync(join(repo, ".worktreeshare"), "node_modules\n");
  const wt = join(root, "wt-link");
  mkdirSync(wt);

  const entries = await provisionWorktree(repo, wt);

  const e = entries.find((entry) => entry.path === "node_modules");
  assert.ok(e, "entry for node_modules should exist");
  assert.equal(e.status, "done");
  assert.equal(e.mode, "link");
  assert.ok(lstatSync(join(wt, "node_modules")).isSymbolicLink(), "node_modules should be a symlink");
  // Symlink target must resolve into the source repo
  assert.equal(
    realpathSync(join(wt, "node_modules")),
    realpathSync(join(repo, "node_modules")),
  );
});

test("path-traversal entry is skipped with a reason", async () => {
  writeFileSync(join(repo, ".worktreeinclude"), "../escape.txt\n");
  const wt = join(root, "wt-traverse");
  mkdirSync(wt);

  const entries = await provisionWorktree(repo, wt);

  const e = entries.find((entry) => entry.path === "../escape.txt");
  assert.ok(e, "traversal entry should appear in results");
  assert.equal(e.status, "skipped");
  assert.ok(e.reason, "should have a reason");
});

test("existing destination is not overwritten", async () => {
  writeFileSync(join(repo, ".worktreeinclude"), ".env\n");
  const wt = join(root, "wt-exists");
  mkdirSync(wt);
  writeFileSync(join(wt, ".env"), "ORIGINAL=1");   // pre-create the destination

  const entries = await provisionWorktree(repo, wt);

  const e = entries.find((entry) => entry.path === ".env");
  assert.ok(e);
  assert.equal(e.status, "skipped");
  assert.match(e.reason ?? "", /exists/i);
  assert.equal(readFileSync(join(wt, ".env"), "utf8"), "ORIGINAL=1");
});

test("missing source is skipped", async () => {
  writeFileSync(join(repo, ".worktreeinclude"), "does-not-exist.txt\n");
  const wt = join(root, "wt-missing");
  mkdirSync(wt);

  const entries = await provisionWorktree(repo, wt);

  const e = entries.find((entry) => entry.path === "does-not-exist.txt");
  assert.ok(e, "entry should appear in results");
  assert.equal(e.status, "skipped");
  assert.match(e.reason ?? "", /missing/i);
});

test("tracked (non-ignored) file is skipped with 'not gitignored' reason", async () => {
  writeFileSync(join(repo, ".worktreeinclude"), "tracked.txt\n");
  const wt = join(root, "wt-tracked");
  mkdirSync(wt);

  const entries = await provisionWorktree(repo, wt);

  const e = entries.find((entry) => entry.path === "tracked.txt");
  assert.ok(e);
  assert.equal(e.status, "skipped");
  assert.match(e.reason ?? "", /not gitignored/i);
});

test("no rule files returns empty array", async () => {
  try { rmSync(join(repo, ".worktreeinclude")); } catch { /* may not exist */ }
  try { rmSync(join(repo, ".worktreeshare")); } catch { /* may not exist */ }
  const wt = join(root, "wt-empty-manifest");
  mkdirSync(wt);

  const entries = await provisionWorktree(repo, wt);

  assert.deepEqual(entries, [], "should return empty array when no manifests");
});
