/**
 * Electron fuses are flipped in the packaged binary by electron-builder from
 * `build.electronFuses`. Pin them so a builder or Electron bump that drops the
 * block fails here instead of in a signed build.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("hardening fuses are set", () => {
  const fuses = pkg.build.electronFuses;
  assert.equal(fuses.onlyLoadAppFromAsar, true);
  assert.equal(fuses.enableNodeCliInspectArguments, false);
  // Encrypts the Raven / work-browser cookie stores at rest.
  assert.equal(fuses.enableCookieEncryption, true);
});

test("fuses the agent sidecar and custom CAs depend on stay enabled", () => {
  const fuses = pkg.build.electronFuses;
  // agent-sidecar.ts runs fcode's own binary with ELECTRON_RUN_AS_NODE=1.
  assert.notEqual(fuses.runAsNode, false);
  // NODE_EXTRA_CA_CERTS is governed by the NodeOptions fuse.
  assert.notEqual(fuses.enableNodeOptionsEnvironmentVariable, false);
});
