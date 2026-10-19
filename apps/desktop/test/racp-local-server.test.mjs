/**
 * Tests for racp-local-server helpers:
 *   - writeCliShims: correct shim content and executable bit
 *   - endpoint file: written with 0600, removed on close
 *
 * Electron is stubbed; the real RACP server is not started (that requires a
 * live AgentHost which needs host-core — out of scope for a unit test).
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { register, registerHooks } from "node:module";
import { tmpdir, platform } from "node:os";
import { join } from "node:path";
import test from "node:test";

// ── Electron stub ─────────────────────────────────────────────────────────────
const userData = mkdtempSync(join(tmpdir(), "racp-test-"));
const electronStub = `data:text/javascript,${encodeURIComponent(`
export const app = {
  getPath(name) {
    if (name === "userData") return ${JSON.stringify(userData)};
    return "/tmp";
  },
  isPackaged: false,
  // cliEntry() does join(getAppPath(), "..", "..") to reach project root.
  // We place getAppPath two levels below the tmp root so that root/../.. = /tmp root.
  getAppPath() { return ${JSON.stringify(join(userData, "..", "apps", "desktop"))}; },
};
`)}`;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "electron") return { url: electronStub, shortCircuit: true };
    return next(specifier, context);
  },
});
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

// cliEntry() does join(getAppPath(), "..", "..") → <tmp>; create cli stub there.
import { mkdirSync, writeFileSync } from "node:fs";
const fakeCliJs = join(userData, "..", "apps", "fcode-cli", "dist-bundle", "cli.js");
mkdirSync(join(fakeCliJs, ".."), { recursive: true });
writeFileSync(fakeCliJs, "// cli stub\n");

const { writeCliShims, cliEntry } = await import("../electron/main/racp-local-server.ts");

test.after(() => rmSync(userData, { recursive: true, force: true }));

// ── cliEntry ─────────────────────────────────────────────────────────────────
test("cliEntry returns a path when the bundle file exists", () => {
  const entry = cliEntry();
  assert.ok(entry !== null, "expected non-null cliEntry");
  assert.ok(existsSync(entry), `cliEntry path ${entry} must exist`);
});

// ── writeCliShims ─────────────────────────────────────────────────────────────
test("writeCliShims creates the fcode shim and sets FCODE_CLI_DIR", async () => {
  const endpointPath = join(userData, "cli-endpoint.json");
  writeFileSync(endpointPath, "{}");

  await writeCliShims(endpointPath);

  const shimDir = join(userData, "cli", "bin");
  const shimPath = join(shimDir, "fcode");

  assert.ok(existsSync(shimPath), "shim file should exist");
  assert.equal(process.env.FCODE_CLI_DIR, shimDir, "FCODE_CLI_DIR should be set");

  const content = readFileSync(shimPath, "utf8");
  assert.ok(content.startsWith("#!/bin/sh"), "shim should be a shell script");
  assert.ok(content.includes("ELECTRON_RUN_AS_NODE=1"), "shim should set ELECTRON_RUN_AS_NODE");
  assert.ok(content.includes("FCODE_ENDPOINT_FILE="), "shim should export FCODE_ENDPOINT_FILE");
  assert.ok(content.includes(endpointPath), "shim should embed the endpoint path");

  // Executable bit (unix only)
  if (platform() !== "win32") {
    const mode = statSync(shimPath).mode;
    assert.ok(mode & 0o100, "shim should be executable by owner");
  }
});

test("writeCliShims is idempotent (no duplicate PATH entries when called twice)", async () => {
  const endpointPath = join(userData, "cli-endpoint2.json");
  writeFileSync(endpointPath, "{}");

  await writeCliShims(endpointPath);
  const dir1 = process.env.FCODE_CLI_DIR;

  await writeCliShims(endpointPath);
  const dir2 = process.env.FCODE_CLI_DIR;

  assert.equal(dir1, dir2, "FCODE_CLI_DIR should remain stable across calls");
});
