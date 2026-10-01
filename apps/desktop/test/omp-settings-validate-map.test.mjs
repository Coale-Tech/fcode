/**
 * Boundary test: omp settings validate → map (validateOmpSettings + makeOmpOverlay).
 * Covers: reject unknown key, out-of-range number, wrong type, valid passthrough,
 * and overlay YAML generation for all four groups.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { validateOmpSettings } = await import(
  "../electron/main/omp-settings-config.ts"
);
const { makeOmpOverlay } = await import(
  "../../../packages/omp-bridge/src/bridge.ts"
);

const BASE_OPTS = {
  dataDir: "/tmp/fcode-test",
  resourcesPath: "/tmp/resources",
  screenshotsDir: "/tmp/fcode-test/screenshots",
};

// ─── Validation: rejection cases ───────────────────────────────────────────

test("validateOmpSettings rejects unknown key", () => {
  assert.throws(
    () => validateOmpSettings({ "task.nonExistent": true }),
    /unknown omp setting key/,
  );
});

test("validateOmpSettings rejects wrong type: string for boolean", () => {
  assert.throws(
    () => validateOmpSettings({ "task.isolation.enabled": "yes" }),
    /expected boolean/,
  );
});

test("validateOmpSettings rejects wrong type: string for number", () => {
  assert.throws(
    () => validateOmpSettings({ "task.maxConcurrency": "8" }),
    /expected number/,
  );
});

test("validateOmpSettings rejects out-of-range number (too high)", () => {
  assert.throws(
    () => validateOmpSettings({ "task.maxConcurrency": 999 }),
    /out of range/,
  );
});

test("validateOmpSettings rejects out-of-range number (too low)", () => {
  assert.throws(
    () => validateOmpSettings({ "task.maxRecursionDepth": -5 }),
    /out of range/,
  );
});

test("validateOmpSettings rejects invalid enum value", () => {
  assert.throws(
    () => validateOmpSettings({ "isolation.backend": "magic" }),
    /invalid value/,
  );
});

test("validateOmpSettings rejects invalid collab.autoStart enum", () => {
  assert.throws(
    () => validateOmpSettings({ "collab.autoStart": "always" }),
    /invalid value/,
  );
});

// ─── Validation: acceptance cases ──────────────────────────────────────────

test("validateOmpSettings accepts valid boolean", () => {
  const out = validateOmpSettings({ "task.isolation.enabled": false });
  assert.equal(out["task.isolation.enabled"], false);
});

test("validateOmpSettings accepts boundary number values", () => {
  assert.equal(validateOmpSettings({ "task.maxConcurrency": 0 })["task.maxConcurrency"], 0);
  assert.equal(validateOmpSettings({ "task.maxConcurrency": 256 })["task.maxConcurrency"], 256);
  assert.equal(validateOmpSettings({ "task.maxRecursionDepth": -1 })["task.maxRecursionDepth"], -1);
});

test("validateOmpSettings accepts all isolation backend enum values", () => {
  for (const v of ["auto", "apfs", "btrfs", "zfs", "reflink", "overlayfs", "projfs", "block-clone", "rcopy"]) {
    const out = validateOmpSettings({ "isolation.backend": v });
    assert.equal(out["isolation.backend"], v);
  }
});

test("validateOmpSettings accepts python.kernelMode enum", () => {
  assert.equal(validateOmpSettings({ "python.kernelMode": "session" })["python.kernelMode"], "session");
  assert.equal(validateOmpSettings({ "python.kernelMode": "per-call" })["python.kernelMode"], "per-call");
});

test("validateOmpSettings silently drops null/undefined values", () => {
  const out = validateOmpSettings({ "eval.py": undefined, "eval.js": null });
  assert.equal(Object.keys(out).length, 0);
});

// ─── Overlay YAML generation ─────────────────────────────────────────────

test("makeOmpOverlay emits task section with isolation when set", () => {
  const yaml = makeOmpOverlay({
    ...BASE_OPTS,
    ompSettings: { "task.isolation.enabled": true, "task.maxConcurrency": 8 },
  });
  assert.ok(yaml.includes("task:"), "task section present");
  assert.ok(yaml.includes("isolation:"), "isolation subsection present");
  assert.ok(yaml.includes("enabled: true"), "isolation enabled");
  assert.ok(yaml.includes("maxConcurrency: 8"), "maxConcurrency correct");
});

test("makeOmpOverlay emits eval section", () => {
  const yaml = makeOmpOverlay({
    ...BASE_OPTS,
    ompSettings: { "eval.py": false, "eval.tools.enabled": true },
  });
  assert.ok(yaml.includes("eval:"), "eval section present");
  assert.ok(yaml.includes("py: false"), "py disabled");
  assert.ok(yaml.includes("tools:"), "tools subsection");
  assert.ok(yaml.includes("enabled: true"), "tools enabled");
});

test("makeOmpOverlay merges browser user settings onto defaults", () => {
  const yaml = makeOmpOverlay({
    ...BASE_OPTS,
    ompSettings: { "browser.headless": false, "browser.cdpUrl": "ws://127.0.0.1:9222" },
  });
  assert.ok(yaml.includes("headless: false"), "headless overridden to false");
  assert.ok(yaml.includes('cdpUrl: "ws://127.0.0.1:9222"'), "cdpUrl present");
  assert.ok(yaml.includes("enabled: true"), "enabled kept at default true");
});

test("makeOmpOverlay emits collab section", () => {
  const yaml = makeOmpOverlay({
    ...BASE_OPTS,
    ompSettings: { "collab.autoStart": "view", "collab.displayName": "Alice" },
  });
  assert.ok(yaml.includes("collab:"), "collab section present");
  assert.ok(yaml.includes("autoStart: view"), "autoStart correct");
  assert.ok(yaml.includes('"Alice"'), "displayName present");
});

test("makeOmpOverlay does not emit new sections when ompSettings is empty", () => {
  const yaml = makeOmpOverlay({ ...BASE_OPTS, ompSettings: {} });
  // Task/eval/collab sections must be absent from an empty settings object
  assert.ok(!yaml.includes("\ntask:"), "no task section");
  assert.ok(!yaml.includes("\neval:"), "no eval section");
  assert.ok(!yaml.includes("\ncollab:"), "no collab section");
});

// ─── task.agentModelOverrides boundary tests ──────────────────────────────

test("validateOmpSettings accepts agentModelOverrides with unknown agent name", () => {
  // Any agent name (including non-bundled custom agents) must be accepted
  const out = validateOmpSettings({
    "task.agentModelOverrides": { "my-custom-agent": "anthropic/claude-sonnet-4-5" },
  });
  assert.deepEqual(out["task.agentModelOverrides"], { "my-custom-agent": "anthropic/claude-sonnet-4-5" });
});

test("validateOmpSettings: empty string value clears that agent entry", () => {
  // Empty string → entry is silently dropped (clear semantics)
  const out = validateOmpSettings({
    "task.agentModelOverrides": { task: "anthropic/claude-sonnet-4-5", sonic: "" },
  });
  assert.deepEqual(out["task.agentModelOverrides"], { task: "anthropic/claude-sonnet-4-5" });
});

test("validateOmpSettings: empty object clears all overrides", () => {
  const out = validateOmpSettings({ "task.agentModelOverrides": {} });
  assert.deepEqual(out["task.agentModelOverrides"], {});
});

test("validateOmpSettings rejects non-string model id in agentModelOverrides", () => {
  assert.throws(
    () => validateOmpSettings({ "task.agentModelOverrides": { task: 42 } }),
    /expected string model id/,
  );
});

test("validateOmpSettings rejects array as agentModelOverrides value", () => {
  assert.throws(
    () => validateOmpSettings({ "task.agentModelOverrides": ["task", "model"] }),
    /expected object/,
  );
});

test("validateOmpSettings rejects string as agentModelOverrides value", () => {
  assert.throws(
    () => validateOmpSettings({ "task.agentModelOverrides": "task=model" }),
    /expected object/,
  );
});

test("makeOmpOverlay emits agentModelOverrides under task section", () => {
  const yaml = makeOmpOverlay({
    ...BASE_OPTS,
    ompSettings: {
      "task.agentModelOverrides": { task: "anthropic/claude-sonnet-4-5", sonic: "openai/gpt-4o" },
    },
  });
  assert.ok(yaml.includes("task:"), "task section present");
  assert.ok(yaml.includes("agentModelOverrides:"), "agentModelOverrides subsection present");
  assert.ok(yaml.includes('"anthropic/claude-sonnet-4-5"'), "task model present");
  assert.ok(yaml.includes('"openai/gpt-4o"'), "sonic model present");
});

test("makeOmpOverlay does not emit agentModelOverrides when record is empty", () => {
  const yaml = makeOmpOverlay({
    ...BASE_OPTS,
    ompSettings: { "task.agentModelOverrides": {} },
  });
  // Empty record → task section may not appear (no other task settings)
  assert.ok(!yaml.includes("agentModelOverrides:"), "no agentModelOverrides for empty record");
});
