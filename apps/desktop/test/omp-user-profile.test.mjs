/**
 * Behaviour tests for the user-profile read/write helpers (I.2).
 *
 * readUserProfile: missing file returns empty; present file returns trimmed text.
 * writeUserProfile: cap enforced at 1024 chars; atomic (rename called after write);
 *   when rename throws, old dest file is untouched.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { register, registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// ─── Module stubs ─────────────────────────────────────────────────────────────

const electronStub = `data:text/javascript,${encodeURIComponent(`
  export const shell = { showItemInFolder: () => {} };
`)}`;

const fsPromisesStub = `data:text/javascript,${encodeURIComponent(`
  export async function readFile(p) { return ""; }
  export async function readdir(p) { return []; }
  export async function rm(p, opts) { return; }
  export async function rename(src, dst) { return; }
  export async function writeFile(p, d, enc) { return; }
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

// ─── load module ──────────────────────────────────────────────────────────────

const { readUserProfile, writeUserProfile } = await import(
  "../electron/main/ipc/omp-ipc.ts"
);

// ─── readUserProfile ──────────────────────────────────────────────────────────

test("readUserProfile: missing file (read throws) returns empty string", async () => {
  const result = await readUserProfile("/fake/agent", async () => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  });
  assert.equal(result, "");
});

test("readUserProfile: returns trimmed content from file", async () => {
  const result = await readUserProfile("/fake/agent", async () => "  Hello world  \n");
  assert.equal(result, "Hello world");
});

test("readUserProfile: returns empty string for blank file", async () => {
  const result = await readUserProfile("/fake/agent", async () => "   \n");
  assert.equal(result, "");
});

// ─── writeUserProfile ─────────────────────────────────────────────────────────

test("writeUserProfile: cap enforced — input > 1024 chars is truncated to exactly 1024", async () => {
  const long = "x".repeat(2000);
  let written = "";
  await writeUserProfile(
    "/fake/agent",
    long,
    async (_p, data) => { written = data; },
    async () => { /* rename succeeds */ },
  );
  assert.equal(written.length, 1024);
});

test("writeUserProfile: short input is written unchanged", async () => {
  const text = "I am a developer who prefers TypeScript.";
  let written = "";
  await writeUserProfile(
    "/fake/agent",
    text,
    async (_p, data) => { written = data; },
    async () => { /* rename succeeds */ },
  );
  assert.equal(written, text);
});

test("writeUserProfile: rename called after write (atomic order)", async () => {
  const events = [];
  await writeUserProfile(
    "/fake/agent",
    "profile",
    async () => { events.push("write"); },
    async () => { events.push("rename"); },
  );
  assert.deepEqual(events, ["write", "rename"]);
});

test("writeUserProfile: returns ok:true on success", async () => {
  const result = await writeUserProfile(
    "/fake/agent",
    "text",
    async () => { /* write ok */ },
    async () => { /* rename ok */ },
  );
  assert.equal(result.ok, true);
});

test("writeUserProfile: when rename throws, returns ok:false and error message", async () => {
  const result = await writeUserProfile(
    "/fake/agent",
    "text",
    async () => { /* write ok */ },
    async () => { throw new Error("disk full"); },
  );
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /disk full/);
});

test("writeUserProfile: old dest file not modified on rename failure (write to tmp only)", async () => {
  // We verify that write is called with a tmp path (not dest), and rename (to dest) fails.
  // If dest were written directly, a partial write would corrupt it.
  const writtenPaths = [];
  const result = await writeUserProfile(
    "/fake/agent",
    "new content",
    async (p) => { writtenPaths.push(p); },
    async () => { throw new Error("rename failed"); },
  );
  // write goes to tmp, not to USER.md directly
  assert.ok(writtenPaths.every((p) => p !== "/fake/agent/USER.md"), "should not write directly to dest");
  assert.equal(result.ok, false);
});

// ─── IPC handler integration ──────────────────────────────────────────────────

const { IPC } = await import("@pi-desktop/shared");
const { registerOmpIpc } = await import("../electron/main/ipc/omp-ipc.ts");

function setupHandlers() {
  const handlers = {};
  registerOmpIpc({
    registrar: { handle: (ch, fn) => { handlers[ch] = fn; } },
    getSidecar: () => null,
  });
  return handlers;
}

test("ompUserProfileSet IPC: missing text throws INVALID_ARGUMENT", async () => {
  const handlers = setupHandlers();
  await assert.rejects(
    () => handlers[IPC.invoke.ompUserProfileSet]({}),
    /text.*required/i,
  );
});
