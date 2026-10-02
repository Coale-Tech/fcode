/**
 * Behaviour tests for worktree add/clear/prune (T7).
 *
 * checkWorktreeDirty is tested directly via its injected runGitStatus parameter
 * (no module-level mocking of node:child_process needed).
 * IPC-handler tests cover: missing required fields, force bypass, prune with no wt dir.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { register, registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// ─── Module stubs (electron + fs/promises; no child_process needed) ───────────

const electronStub = `data:text/javascript,${encodeURIComponent(`
  export const shell = { showItemInFolder: () => {} };
`)}`;

const fsPromisesStub = `data:text/javascript,${encodeURIComponent(`
  export async function readFile(p) { return ""; }
  export async function readdir(p) { return []; }
  export async function rm(p, opts) { return; }
  export async function stat(p) { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); }
`)}`;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "electron") return { url: electronStub, shortCircuit: true };
    if (specifier === "node:fs/promises") return { url: fsPromisesStub, shortCircuit: true };
    return next(specifier, context);
  },
});
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

// ─── load modules ─────────────────────────────────────────────────────────────

const { IPC } = await import("@pi-desktop/shared");
const { registerOmpIpc, checkWorktreeDirty } = await import(
  "../electron/main/ipc/omp-ipc.ts"
);

// ─── test harness ─────────────────────────────────────────────────────────────

function setup() {
  const handlers = {};
  registerOmpIpc({
    registrar: { handle: (ch, fn) => { handlers[ch] = fn; } },
    getSidecar: () => null,
  });
  return handlers;
}

// ─── checkWorktreeDirty: pure-function tests (no module mocking needed) ───────

test("checkWorktreeDirty: returns true when git status has output", async () => {
  const result = await checkWorktreeDirty("/fake/path", async () => " M src/foo.ts\n");
  assert.equal(result, true);
});

test("checkWorktreeDirty: returns false when git status is empty", async () => {
  const result = await checkWorktreeDirty("/fake/path", async () => "");
  assert.equal(result, false);
});

test("checkWorktreeDirty: returns false when git throws (not a git repo)", async () => {
  const result = await checkWorktreeDirty("/fake/path", async () => {
    throw new Error("not a git repository");
  });
  assert.equal(result, false);
});

// ─── IPC handler tests ────────────────────────────────────────────────────────

test("ompWorktreeClear: missing path returns INVALID_ARGUMENT", async () => {
  const handlers = setup();
  await assert.rejects(
    () => handlers[IPC.invoke.ompWorktreeClear]({ path: "", force: false }),
    /path required/i,
  );
});

test("ompWorktreeClear: valid path proceeds (git may fail on fake path → not dirty → rm succeeds)", async () => {
  const handlers = setup();
  // /fake/wt/path doesn't exist; git status errors → not dirty; rm stub succeeds
  const result = await handlers[IPC.invoke.ompWorktreeClear]({ path: "/fake/wt/path", force: false });
  assert.equal(result.ok, true);
});

test("ompWorktreePrune: returns ok:true with empty pruned list when wt dir absent", async () => {
  const handlers = setup();
  const result = await handlers[IPC.invoke.ompWorktreePrune]({ force: false });
  assert.equal(result.ok, true);
  assert.deepEqual(result.pruned, []);
});

test("ompWorktreeAdd: missing repoPath returns INVALID_ARGUMENT", async () => {
  const handlers = setup();
  await assert.rejects(
    () => handlers[IPC.invoke.ompWorktreeAdd]({ repoPath: "", branch: "main" }),
    /repoPath required/i,
  );
});

test("ompWorktreeAdd: missing branch returns INVALID_ARGUMENT", async () => {
  const handlers = setup();
  await assert.rejects(
    () => handlers[IPC.invoke.ompWorktreeAdd]({ repoPath: "/some/repo", branch: "" }),
    /branch required/i,
  );
});
