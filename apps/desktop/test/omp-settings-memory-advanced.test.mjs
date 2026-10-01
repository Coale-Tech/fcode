/**
 * Boundary tests for the memory-advanced omp settings introduced in fix/audit-memory-settings.
 * Covers: validateOmpSettings type/range/enum checks; makeOmpOverlay YAML correctness.
 */
import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { validateOmpSettings } = await import("../electron/main/omp-settings-config.ts");
const { makeOmpOverlay } = await import("../../../packages/omp-bridge/src/bridge.ts");

// ─── validateOmpSettings: new keys accepted ───────────────────────────────────

test("validateOmpSettings accepts valid mnemopi advanced settings", () => {
  const result = validateOmpSettings({
    "mnemopi.scoping": "per-project",
    "mnemopi.dbPath": "/tmp/test.db",
    "mnemopi.bank": "my-bank",
    "mnemopi.embeddingVariant": "multilingual",
    "mnemopi.autoRecall": true,
    "mnemopi.autoRetain": false,
    "mnemopi.polyphonicRecall": true,
    "mnemopi.enhancedRecall": false,
    "mnemopi.proactiveLinking": true,
    "mnemopi.noEmbeddings": false,
    "mnemopi.embeddingModel": "bge-base-en",
    "mnemopi.embeddingApiUrl": "https://embed.example.com",
    "mnemopi.llmBaseUrl": "https://llm.example.com",
    "mnemopi.llmModel": "gpt-4o-mini",
    "mnemopi.retainEveryNTurns": 5,
    "mnemopi.recallLimit": 10,
    "mnemopi.recallContextTurns": 3,
    "mnemopi.recallMaxQueryChars": 3000,
    "mnemopi.injectionTokenLimit": 4000,
    "mnemopi.debug": true,
  });
  assert.equal(result["mnemopi.scoping"], "per-project");
  assert.equal(result["mnemopi.embeddingVariant"], "multilingual");
  assert.equal(result["mnemopi.retainEveryNTurns"], 5);
  assert.equal(result["mnemopi.debug"], true);
});

test("validateOmpSettings accepts valid hindsight advanced settings", () => {
  const result = validateOmpSettings({
    "hindsight.scoping": "global",
    "hindsight.bankIdPrefix": "proj-",
    "hindsight.retainEveryNTurns": 4,
    "hindsight.retainOverlapTurns": 1,
    "hindsight.recallBudget": "high",
    "hindsight.recallMaxTokens": 2048,
    "hindsight.recallContextTurns": 2,
    "hindsight.recallMaxQueryChars": 600,
    "hindsight.debug": false,
    "hindsight.requestTimeoutMs": 60000,
    "hindsight.reflectTimeoutMs": 180000,
    "hindsight.recallTimeoutMs": 45000,
    "hindsight.retainTimeoutMs": 90000,
    "hindsight.mentalModelMaxRenderChars": 20000,
  });
  assert.equal(result["hindsight.scoping"], "global");
  assert.equal(result["hindsight.recallBudget"], "high");
  assert.equal(result["hindsight.requestTimeoutMs"], 60000);
});

test("validateOmpSettings accepts valid sharpshooter settings", () => {
  const result = validateOmpSettings({
    "sharpshooter.model": "gpt-4o-mini",
    "sharpshooter.intervalMinutes": 10,
    "sharpshooter.injectionTokenLimit": 12000,
  });
  assert.equal(result["sharpshooter.model"], "gpt-4o-mini");
  assert.equal(result["sharpshooter.intervalMinutes"], 10);
  assert.equal(result["sharpshooter.injectionTokenLimit"], 12000);
});

test("validateOmpSettings accepts valid memories pipeline settings", () => {
  const result = validateOmpSettings({
    "memories.maxRolloutsPerStartup": 32,
    "memories.maxRolloutAgeDays": 14,
    "memories.minRolloutIdleHours": 6,
    "memories.summaryInjectionTokenLimit": 3000,
  });
  assert.equal(result["memories.maxRolloutsPerStartup"], 32);
  assert.equal(result["memories.maxRolloutAgeDays"], 14);
});

// ─── validateOmpSettings: enum rejection ──────────────────────────────────────

test("validateOmpSettings rejects invalid mnemopi.scoping", () => {
  assert.throws(
    () => validateOmpSettings({ "mnemopi.scoping": "unknown" }),
    /mnemopi\.scoping/,
  );
});

test("validateOmpSettings rejects invalid hindsight.scoping", () => {
  assert.throws(
    () => validateOmpSettings({ "hindsight.scoping": "workspace" }),
    /hindsight\.scoping/,
  );
});

test("validateOmpSettings rejects invalid hindsight.recallBudget", () => {
  assert.throws(
    () => validateOmpSettings({ "hindsight.recallBudget": "ultra" }),
    /hindsight\.recallBudget/,
  );
});

test("validateOmpSettings rejects invalid mnemopi.embeddingVariant", () => {
  assert.throws(
    () => validateOmpSettings({ "mnemopi.embeddingVariant": "spanish" }),
    /mnemopi\.embeddingVariant/,
  );
});

// ─── validateOmpSettings: range rejection ─────────────────────────────────────

test("validateOmpSettings rejects mnemopi.retainEveryNTurns out of range", () => {
  assert.throws(() => validateOmpSettings({ "mnemopi.retainEveryNTurns": 0 }), /out of range/);
  assert.throws(() => validateOmpSettings({ "mnemopi.retainEveryNTurns": 200 }), /out of range/);
});

test("validateOmpSettings rejects hindsight.requestTimeoutMs out of range", () => {
  assert.throws(() => validateOmpSettings({ "hindsight.requestTimeoutMs": 500 }), /out of range/);
});

test("validateOmpSettings rejects sharpshooter.intervalMinutes out of range", () => {
  assert.throws(() => validateOmpSettings({ "sharpshooter.intervalMinutes": 0 }), /out of range/);
});

test("validateOmpSettings rejects memories.maxRolloutAgeDays out of range", () => {
  assert.throws(() => validateOmpSettings({ "memories.maxRolloutAgeDays": 400 }), /out of range/);
});

// ─── makeOmpOverlay: YAML contains new mnemopi keys ──────────────────────────

test("makeOmpOverlay includes mnemopi advanced settings in overlay", () => {
  const yaml = makeOmpOverlay({
    dataDir: "/tmp",
    resourcesPath: "/tmp",
    screenshotsDir: "/tmp/screenshots",
    memory: { backend: "mnemopi" },
    ompSettings: {
      "mnemopi.scoping": "global",
      "mnemopi.autoRecall": false,
      "mnemopi.polyphonicRecall": true,
      "mnemopi.noEmbeddings": true,
      "mnemopi.retainEveryNTurns": 6,
      "mnemopi.recallLimit": 12,
      "mnemopi.injectionTokenLimit": 8000,
      "mnemopi.debug": true,
    },
  });
  assert.ok(yaml.includes("scoping: global"), `Expected 'scoping: global' in:\n${yaml}`);
  assert.ok(yaml.includes("autoRecall: false"), `Expected 'autoRecall: false' in:\n${yaml}`);
  assert.ok(yaml.includes("polyphonicRecall: true"), `Expected 'polyphonicRecall: true' in:\n${yaml}`);
  assert.ok(yaml.includes("noEmbeddings: true"), `Expected 'noEmbeddings: true' in:\n${yaml}`);
  assert.ok(yaml.includes("retainEveryNTurns: 6"), `Expected 'retainEveryNTurns: 6' in:\n${yaml}`);
  assert.ok(yaml.includes("recallLimit: 12"), `Expected 'recallLimit: 12' in:\n${yaml}`);
  assert.ok(yaml.includes("injectionTokenLimit: 8000"), `Expected 'injectionTokenLimit: 8000' in:\n${yaml}`);
  assert.ok(yaml.includes("debug: true"), `Expected 'debug: true' in:\n${yaml}`);
  // mnemopi.llmMode must always be session (bridge-forced)
  assert.ok(yaml.includes("llmMode: session"), `Expected 'llmMode: session' forced in:\n${yaml}`);
});

test("makeOmpOverlay includes hindsight advanced settings in overlay", () => {
  const yaml = makeOmpOverlay({
    dataDir: "/tmp",
    resourcesPath: "/tmp",
    screenshotsDir: "/tmp/screenshots",
    memory: { backend: "hindsight", hindsightUrl: "http://localhost:8888" },
    ompSettings: {
      "hindsight.scoping": "per-project",
      "hindsight.retainEveryNTurns": 5,
      "hindsight.recallBudget": "low",
      "hindsight.requestTimeoutMs": 45000,
      "hindsight.mentalModelMaxRenderChars": 12000,
    },
  });
  assert.ok(yaml.includes("scoping: per-project"), `Expected 'scoping: per-project' in:\n${yaml}`);
  assert.ok(yaml.includes("retainEveryNTurns: 5"), `Expected 'retainEveryNTurns: 5' in:\n${yaml}`);
  assert.ok(yaml.includes("recallBudget: low"), `Expected 'recallBudget: low' in:\n${yaml}`);
  assert.ok(yaml.includes("requestTimeoutMs: 45000"), `Expected 'requestTimeoutMs: 45000' in:\n${yaml}`);
  assert.ok(yaml.includes("mentalModelMaxRenderChars: 12000"), `Expected 'mentalModelMaxRenderChars: 12000' in:\n${yaml}`);
});

test("makeOmpOverlay includes sharpshooter section in overlay", () => {
  const yaml = makeOmpOverlay({
    dataDir: "/tmp",
    resourcesPath: "/tmp",
    screenshotsDir: "/tmp/screenshots",
    memory: { backend: "sharpshooter" },
    ompSettings: {
      "sharpshooter.model": "gpt-4o-mini",
      "sharpshooter.intervalMinutes": 10,
      "sharpshooter.injectionTokenLimit": 12000,
    },
  });
  assert.ok(yaml.includes("\nsharpshooter:"), `Expected 'sharpshooter:' section in:\n${yaml}`);
  assert.ok(yaml.includes('model: "gpt-4o-mini"'), `Expected sharpshooter model in:\n${yaml}`);
  assert.ok(yaml.includes("intervalMinutes: 10"), `Expected intervalMinutes in:\n${yaml}`);
  assert.ok(yaml.includes("injectionTokenLimit: 12000"), `Expected injectionTokenLimit in:\n${yaml}`);
  // backend must be passed correctly
  assert.ok(yaml.includes("backend: sharpshooter"), `Expected 'backend: sharpshooter' in:\n${yaml}`);
});

test("makeOmpOverlay includes memories section in overlay", () => {
  const yaml = makeOmpOverlay({
    dataDir: "/tmp",
    resourcesPath: "/tmp",
    screenshotsDir: "/tmp/screenshots",
    memory: { backend: "local" },
    ompSettings: {
      "memories.maxRolloutsPerStartup": 32,
      "memories.maxRolloutAgeDays": 14,
      "memories.minRolloutIdleHours": 6,
      "memories.summaryInjectionTokenLimit": 3000,
    },
  });
  assert.ok(yaml.includes("\nmemories:"), `Expected 'memories:' section in:\n${yaml}`);
  assert.ok(yaml.includes("maxRolloutsPerStartup: 32"), `Expected maxRolloutsPerStartup in:\n${yaml}`);
  assert.ok(yaml.includes("maxRolloutAgeDays: 14"), `Expected maxRolloutAgeDays in:\n${yaml}`);
  assert.ok(yaml.includes("minRolloutIdleHours: 6"), `Expected minRolloutIdleHours in:\n${yaml}`);
  assert.ok(yaml.includes("summaryInjectionTokenLimit: 3000"), `Expected summaryInjectionTokenLimit in:\n${yaml}`);
  assert.ok(yaml.includes("backend: local"), `Expected 'backend: local' in:\n${yaml}`);
});

test("makeOmpOverlay does not emit duplicate section keys", () => {
  const yaml = makeOmpOverlay({
    dataDir: "/tmp",
    resourcesPath: "/tmp",
    screenshotsDir: "/tmp/screenshots",
    memory: { backend: "mnemopi" },
    ompSettings: {
      "mnemopi.scoping": "global",
      "hindsight.scoping": "per-project",
    },
  });
  // Count top-level section occurrences
  const mnemopiCount = (yaml.match(/^mnemopi:/gm) ?? []).length;
  const hindsightCount = (yaml.match(/^hindsight:/gm) ?? []).length;
  assert.equal(mnemopiCount, 1, `mnemopi: section appeared ${mnemopiCount} times`);
  assert.equal(hindsightCount, 1, `hindsight: section appeared ${hindsightCount} times`);
});
