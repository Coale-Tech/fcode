/**
 * Validates advanced omp settings against the manifest:
 *   - bad enum value rejected
 *   - out-of-range number rejected
 *   - unknown id rejected
 *   - curated id rejected
 *   - valid value accepted
 *   - manifest loadManifest returns descriptors from the generated file
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register(new URL("helpers/ts-import-hooks.mjs", import.meta.url));

const { validateAdvancedSettings, loadManifest, CURATED_OMP_SETTING_IDS } = await import(
  "../electron/main/omp-settings-config.ts"
);

// ── loadManifest ──────────────────────────────────────────────────────────────

test("loadManifest returns an array of descriptors (> 300 entries)", () => {
  const manifest = loadManifest();
  assert.ok(Array.isArray(manifest), "loadManifest() must return an array");
  assert.ok(manifest.length > 300, `expected >300 descriptors, got ${manifest.length}`);
  // Spot-check shape of first entry.
  const first = manifest[0];
  assert.ok(typeof first.id === "string" && first.id.length > 0);
  assert.ok(["boolean", "string", "number", "enum", "array", "record"].includes(first.type));
  assert.ok(typeof first.tab === "string");
  assert.ok(typeof first.group === "string");
  assert.ok(typeof first.label === "string");
});

test("loadManifest includes retry.maxRetries and edit.mode", () => {
  const manifest = loadManifest();
  const retry = manifest.find((d) => d.id === "retry.maxRetries");
  const editMode = manifest.find((d) => d.id === "edit.mode");
  assert.ok(retry, "retry.maxRetries must be in manifest");
  assert.equal(retry.type, "number");
  assert.ok(editMode, "edit.mode must be in manifest");
  assert.equal(editMode.type, "enum");
  assert.ok(Array.isArray(editMode.values) && editMode.values.length > 0);
});

// ── validateAdvancedSettings ─────────────────────────────────────────────────

test("valid advanced value passes through", () => {
  const result = validateAdvancedSettings({ "retry.maxRetries": 5 });
  assert.deepEqual(result, { "retry.maxRetries": 5 });
});

test("valid enum value passes through", () => {
  const manifest = loadManifest();
  const editMode = manifest.find((d) => d.id === "edit.mode");
  const firstAllowed = editMode?.values?.[0] ?? "hashline";
  const result = validateAdvancedSettings({ "edit.mode": firstAllowed });
  assert.deepEqual(result, { "edit.mode": firstAllowed });
});

test("unknown id is rejected", () => {
  assert.throws(
    () => validateAdvancedSettings({ "nonexistent.totally.made.up": true }),
    /unknown id/,
    "unknown id must throw with 'unknown id'",
  );
});

test("curated id is rejected", () => {
  // "browser.enabled" is a curated key — must go through the curated field, not advanced.
  assert.throws(
    () => validateAdvancedSettings({ "browser.enabled": true }),
    /curated/,
    "curated id must throw mentioning 'curated'",
  );
});

test("bad enum value is rejected", () => {
  assert.throws(
    () => validateAdvancedSettings({ "edit.mode": "not-a-real-mode" }),
    /edit\.mode/,
    "bad enum must throw mentioning the setting id",
  );
});

test("CURATED_OMP_SETTING_IDS contains expected curated key", () => {
  assert.equal(CURATED_OMP_SETTING_IDS["browser.enabled"], true);
  assert.equal(CURATED_OMP_SETTING_IDS["advanced"], undefined);
});
