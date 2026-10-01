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

// ─── New groups: validation ──────────────────────────────────────────────────

test("validateOmpSettings accepts lsp.enabled boolean", () => {
  assert.equal(validateOmpSettings({ "lsp.enabled": false })["lsp.enabled"], false);
});

test("validateOmpSettings rejects lsp.enabled non-boolean", () => {
  assert.throws(() => validateOmpSettings({ "lsp.enabled": "yes" }), /expected boolean/);
});

test("validateOmpSettings accepts hindsight.retainMode enum", () => {
  assert.equal(validateOmpSettings({ "hindsight.retainMode": "full-session" })["hindsight.retainMode"], "full-session");
  assert.equal(validateOmpSettings({ "hindsight.retainMode": "last-turn" })["hindsight.retainMode"], "last-turn");
});

test("validateOmpSettings rejects invalid hindsight.retainMode", () => {
  assert.throws(() => validateOmpSettings({ "hindsight.retainMode": "chunked" }), /invalid value/);
});

test("validateOmpSettings accepts skills.customDirectories string[]", () => {
  const out = validateOmpSettings({ "skills.customDirectories": ["/a", "/b"] });
  assert.deepEqual(out["skills.customDirectories"], ["/a", "/b"]);
});

test("validateOmpSettings rejects skills.customDirectories with non-string item", () => {
  assert.throws(() => validateOmpSettings({ "skills.customDirectories": ["/a", 42] }), /expected string\[\]/);
});

test("validateOmpSettings rejects skills.customDirectories non-array", () => {
  assert.throws(() => validateOmpSettings({ "skills.customDirectories": "/a:/b" }), /expected string\[\]/);
});

test("validateOmpSettings accepts empty skills.customDirectories", () => {
  const out = validateOmpSettings({ "skills.customDirectories": [] });
  assert.deepEqual(out["skills.customDirectories"], []);
});

// ─── Overlay: new sections ───────────────────────────────────────────────────

test("makeOmpOverlay emits lsp section", () => {
  const yaml = makeOmpOverlay({ ...BASE_OPTS, ompSettings: { "lsp.enabled": false, "lsp.formatOnWrite": true } });
  assert.ok(yaml.includes("\nlsp:"), "lsp section present");
  assert.ok(yaml.includes("enabled: false"), "lsp disabled");
  assert.ok(yaml.includes("formatOnWrite: true"), "formatOnWrite set");
});

test("makeOmpOverlay emits mcp section", () => {
  const yaml = makeOmpOverlay({ ...BASE_OPTS, ompSettings: { "mcp.enableProjectConfig": false, "mcp.notifications": true } });
  assert.ok(yaml.includes("\nmcp:"), "mcp section present");
  assert.ok(yaml.includes("enableProjectConfig: false"), "project config disabled");
  assert.ok(yaml.includes("notifications: true"), "notifications enabled");
});

test("makeOmpOverlay emits ida section", () => {
  const yaml = makeOmpOverlay({ ...BASE_OPTS, ompSettings: { "ida.enabled": true, "ida.installDir": "/opt/ida" } });
  assert.ok(yaml.includes("\nida:"), "ida section present");
  assert.ok(yaml.includes("enabled: true"), "ida enabled");
  assert.ok(yaml.includes('"/opt/ida"'), "installDir present");
});

test("makeOmpOverlay emits commands section", () => {
  const yaml = makeOmpOverlay({ ...BASE_OPTS, ompSettings: { "commands.enableClaudeUser": true } });
  assert.ok(yaml.includes("\ncommands:"), "commands section present");
  assert.ok(yaml.includes("enableClaudeUser: true"), "enableClaudeUser set");
});

test("makeOmpOverlay appends user skill dirs to base skills block", () => {
  const yaml = makeOmpOverlay({ ...BASE_OPTS, ompSettings: { "skills.customDirectories": ["/my/skills"] } });
  const skillsIdx = yaml.indexOf("\nskills:");
  const userDirIdx = yaml.indexOf('"/my/skills"');
  assert.ok(skillsIdx >= 0, "skills section present");
  assert.ok(userDirIdx > skillsIdx, "user dir after skills header");
  // No second skills: block
  assert.equal(yaml.indexOf("\nskills:", skillsIdx + 1), -1, "no duplicate skills: block");
});

test("makeOmpOverlay emits single hindsight block with behavioral settings", () => {
  const yaml = makeOmpOverlay({
    ...BASE_OPTS,
    memory: { backend: "hindsight", hindsightUrl: "http://localhost:3000", hindsightBank: "my-bank" },
    ompSettings: { "hindsight.autoRecall": false, "hindsight.retainMode": "last-turn" },
  });
  // Should have exactly one hindsight: block
  const firstIdx = yaml.indexOf("\nhindsight:");
  assert.ok(firstIdx >= 0, "hindsight block present");
  assert.equal(yaml.indexOf("\nhindsight:", firstIdx + 1), -1, "no duplicate hindsight: block");
  assert.ok(yaml.includes("autoRecall: false"), "autoRecall present");
  assert.ok(yaml.includes("retainMode: last-turn"), "retainMode present");
  assert.ok(yaml.includes("http://localhost:3000"), "apiUrl present");
});

test("makeOmpOverlay emits hindsight behavioral settings even without memory config", () => {
  const yaml = makeOmpOverlay({ ...BASE_OPTS, ompSettings: { "hindsight.mentalModelsEnabled": false } });
  assert.ok(yaml.includes("\nhindsight:"), "hindsight block present even without memory config");
  assert.ok(yaml.includes("mentalModelsEnabled: false"), "mentalModelsEnabled set");
});
