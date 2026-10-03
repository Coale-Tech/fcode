/**
 * Behaviour tests for update-mode.ts (resolveUpdateMode + isMacAppSigned).
 *
 * Imports the TypeScript source directly via the ts-import-hooks loader so
 * no build step is required and no electron/electron-updater module is pulled
 * in (update-mode.ts has zero electron imports).
 */
import assert from "node:assert/strict";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { resolveUpdateMode, isMacAppSigned } = await import(
  "../electron/main/update-mode.ts"
);

// ── Fake spawnSync runners ────────────────────────────────────────────────────

/** Developer ID signature — codesign exits 0, no adhoc marker. */
const developerIdRunner = () => ({
  status: 0,
  stdout: "Identifier=com.coaletech.fcode\nDeveloper ID Application: CoaleTech",
  stderr: "Format=app bundle with Mach-O thin (arm64)",
  pid: 0,
  signal: null,
  output: [],
  error: undefined,
});

/** Ad-hoc signature — codesign exits 0 but "Signature=adhoc" in output. */
const adhocRunner = () => ({
  status: 0,
  stdout: "",
  stderr: "Signature=adhoc",
  pid: 0,
  signal: null,
  output: [],
  error: undefined,
});

/** codesign exits 1 (e.g. unsigned or corrupted bundle). */
const exitOneRunner = () => ({
  status: 1,
  stdout: "",
  stderr: "code object is not signed at all",
  pid: 0,
  signal: null,
  output: [],
  error: undefined,
});

/** ENOENT — codesign not on PATH or binary missing; spawnSync returns null status. */
const enoentRunner = () => ({
  status: null,
  stdout: "",
  stderr: "",
  pid: -1,
  signal: null,
  output: [],
  error: Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
});

/** Timeout — codesign hangs beyond timeout; spawnSync returns null status. */
const timeoutRunner = () => ({
  status: null,
  stdout: "",
  stderr: "",
  pid: 0,
  signal: "SIGTERM",
  output: [],
  error: Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" }),
});

// ── isMacAppSigned: 4 injected-runner outcomes ────────────────────────────────

test("isMacAppSigned: Developer ID exit 0 → signed (true)", () => {
  assert.equal(isMacAppSigned(developerIdRunner), true);
});

test("isMacAppSigned: Signature=adhoc in output → unsigned (false)", () => {
  assert.equal(isMacAppSigned(adhocRunner), false);
});

test("isMacAppSigned: exit 1 → unsigned (false)", () => {
  assert.equal(isMacAppSigned(exitOneRunner), false);
});

test("isMacAppSigned: ENOENT (null status) → unsigned (false)", () => {
  assert.equal(isMacAppSigned(enoentRunner), false);
});

test("isMacAppSigned: timeout (null status) → unsigned (false)", () => {
  assert.equal(isMacAppSigned(timeoutRunner), false);
});

// ── Integration: isMacAppSigned → resolveUpdateMode("darwin") ─────────────────
// Inverting isMacAppSigned must flip the mode. If someone swaps the
// return value of isMacAppSigned, one of these two tests will fail.

test("darwin + Developer ID → in-app update mode", () => {
  const mode = resolveUpdateMode(
    "darwin",
    true,
    {},
    undefined,
    isMacAppSigned(developerIdRunner),
  );
  assert.equal(mode, "in-app");
});

test("darwin + adhoc signature → manual update mode", () => {
  const mode = resolveUpdateMode(
    "darwin",
    true,
    {},
    undefined,
    isMacAppSigned(adhocRunner),
  );
  assert.equal(mode, "manual");
});

// ── resolveUpdateMode: all platform branches ──────────────────────────────────

test("resolveUpdateMode: unpackaged (dev) → disabled", () => {
  assert.equal(resolveUpdateMode("darwin", false), "disabled");
  assert.equal(resolveUpdateMode("win32", false), "disabled");
  assert.equal(resolveUpdateMode("linux", false), "disabled");
});

test("resolveUpdateMode: win32 NSIS → in-app", () => {
  assert.equal(resolveUpdateMode("win32", true, {}), "in-app");
});

test("resolveUpdateMode: win32 portable (PORTABLE_EXECUTABLE_FILE) → manual", () => {
  assert.equal(
    resolveUpdateMode("win32", true, { PORTABLE_EXECUTABLE_FILE: "/tmp/fcode.exe" }),
    "manual",
  );
});

test("resolveUpdateMode: win32 zip distribution → manual", () => {
  assert.equal(resolveUpdateMode("win32", true, {}, "zip"), "manual");
});

test("resolveUpdateMode: darwin signed → in-app", () => {
  assert.equal(resolveUpdateMode("darwin", true, {}, undefined, true), "in-app");
});

test("resolveUpdateMode: darwin unsigned → manual", () => {
  assert.equal(resolveUpdateMode("darwin", true, {}, undefined, false), "manual");
});

test("resolveUpdateMode: linux AppImage → in-app", () => {
  assert.equal(
    resolveUpdateMode("linux", true, { APPIMAGE: "/tmp/fcode.AppImage" }),
    "in-app",
  );
});

test("resolveUpdateMode: linux deb (no APPIMAGE) → manual", () => {
  assert.equal(resolveUpdateMode("linux", true, {}), "manual");
});
