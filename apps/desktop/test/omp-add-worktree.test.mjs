/**
 * addWorktree(create) backs the Kanban dispatcher's 2nd+ worker per project. A retried card must
 * resume its own worktree instead of colliding with the branch it created on the first attempt.
 * Runs against a real throwaway git repo; HOME is redirected so ~/.omp/wt stays inside the temp dir.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { register, registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const electronStub = `data:text/javascript,${encodeURIComponent("export const shell = {};")}`;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "electron") return { url: electronStub, shortCircuit: true };
    return next(specifier, context);
  },
});
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { addWorktree } = await import("../electron/main/ipc/omp-ipc.ts");

const root = mkdtempSync(join(tmpdir(), "add-worktree-"));
process.env.HOME = join(root, "home");
const repo = join(root, "repo");
const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
execFileSync("git", ["init", "-q", "-b", "main", repo]);
git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");

test.after(() => rmSync(root, { recursive: true, force: true }));

test("create adds the worktree on a new branch, then reuses it on retry", async () => {
  const first = await addWorktree(repo, "kanban/abcd1234", true);
  assert.equal(first.ok, true, first.error);
  assert.ok(existsSync(first.path));
  assert.equal(execFileSync("git", ["-C", first.path, "branch", "--show-current"], { encoding: "utf8" }).trim(), "kanban/abcd1234");

  const retry = await addWorktree(repo, "kanban/abcd1234", true);
  assert.equal(retry.ok, true, retry.error);
  assert.equal(realpathSync(retry.path), realpathSync(first.path)); // git reports the canonical path
  assert.equal(git("worktree", "list").split("\n").length, 2); // main + one worktree
});

test("create reuses the existing branch once its worktree directory is gone", async () => {
  const first = await addWorktree(repo, "kanban/gone0001", true);
  rmSync(first.path, { recursive: true, force: true });
  git("worktree", "prune");

  const again = await addWorktree(repo, "kanban/gone0001", true);
  assert.equal(again.ok, true, again.error);
  assert.notEqual(again.path, first.path);
  assert.equal(execFileSync("git", ["-C", again.path, "branch", "--show-current"], { encoding: "utf8" }).trim(), "kanban/gone0001");
});

test("a non-repository folder fails with the git error and no path", async () => {
  const res = await addWorktree(join(root, "plain"), "kanban/none0001", true);
  assert.equal(res.ok, false);
  assert.equal(res.path, undefined);
  assert.ok(res.error);
});
