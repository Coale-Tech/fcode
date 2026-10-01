/**
 * Boundary test: approval mode → omp overlay mapping (makeOmpOverlay).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { makeOmpOverlay } = await import(
  "../../../packages/omp-bridge/src/bridge.ts"
);

const BASE_OPTS = {
  dataDir: "/tmp/fcode-test",
  resourcesPath: "/tmp/resources",
  screenshotsDir: "/tmp/fcode-test/screenshots",
};

test("makeOmpOverlay defaults to always-ask when no approvalMode given", () => {
  const yaml = makeOmpOverlay(BASE_OPTS);
  assert.ok(yaml.includes("approval_mode: always-ask"), "default must be always-ask");
});

test("makeOmpOverlay uses provided approvalMode for all three modes", () => {
  for (const mode of ["always-ask", "write", "yolo"]) {
    const yaml = makeOmpOverlay({ ...BASE_OPTS, approvalMode: mode });
    assert.ok(yaml.includes(`approval_mode: ${mode}`), `mode=${mode} must appear in overlay`);
  }
});

test("FCODE_TOOL_APPROVAL_MODE guard: only write/yolo pass through, all others become always-ask", () => {
  // Replicate the inline guard from bridge.ts main()
  function resolveMode(raw) {
    return raw === "write" || raw === "yolo" ? raw : "always-ask";
  }
  assert.equal(resolveMode("yolo"), "yolo");
  assert.equal(resolveMode("write"), "write");
  assert.equal(resolveMode("always-ask"), "always-ask");
  assert.equal(resolveMode("evil"), "always-ask");
  assert.equal(resolveMode(undefined), "always-ask");
  assert.equal(resolveMode(""), "always-ask");
});
