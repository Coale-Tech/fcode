/**
 * Unit tests for the `isComposerModelReady` pure function.
 *
 * Cases:
 *   1. Native (pi-native) session — gates on capabilities.canPrompt
 *   2. Session with a valid Fcode provider + model — ready
 *   3. Session with a disabled provider — not ready
 *   4. Session with a provider missing its secret — not ready
 *   5. Session with an image-generation model selected — not ready
 *   6. Existing session with no Fcode provider, ompFallbackReady=true — ready (kanban/omp case)
 *   7. Brand-new draft (no session → ompFallbackReady absent) — not ready, preserves add-provider CTA
 */
import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { isComposerModelReady } = await import("../src/features/chat/composer/model.ts");

// ── helpers ────────────────────────────────────────────────────────────────────

const noImages = [];
const withImageModel = [{ providerId: "p1", modelId: "image-gen-v1" }];

function provider(overrides = {}) {
  return {
    id: "p1",
    enabled: true,
    hasSecret: true,
    authKind: "apikey",
    ...overrides,
  };
}

// ── 1. Native session ──────────────────────────────────────────────────────────

test("native session: ready when canPrompt=true", () => {
  assert.equal(
    isComposerModelReady({
      nativeSession: true,
      canPrompt: true,
      imageGenerationCandidates: noImages,
    }),
    true,
  );
});

test("native session: not ready when canPrompt=false", () => {
  assert.equal(
    isComposerModelReady({
      nativeSession: true,
      canPrompt: false,
      imageGenerationCandidates: noImages,
    }),
    false,
  );
});

test("native session: not ready when canPrompt is absent", () => {
  assert.equal(
    isComposerModelReady({
      nativeSession: true,
      imageGenerationCandidates: noImages,
    }),
    false,
  );
});

// ── 2. Valid Fcode provider ───────────────────────────────────────────────────

test("Fcode provider + model: ready", () => {
  assert.equal(
    isComposerModelReady({
      nativeSession: false,
      provider: provider(),
      modelId: "claude-opus-4-6",
      imageGenerationCandidates: noImages,
    }),
    true,
  );
});

test("provider with authKind=none (no secret required): ready", () => {
  assert.equal(
    isComposerModelReady({
      nativeSession: false,
      provider: provider({ hasSecret: false, authKind: "none" }),
      modelId: "local-model",
      imageGenerationCandidates: noImages,
    }),
    true,
  );
});

// ── 3. Disabled provider ──────────────────────────────────────────────────────

test("disabled provider: not ready even if secret present", () => {
  assert.equal(
    isComposerModelReady({
      nativeSession: false,
      provider: provider({ enabled: false }),
      modelId: "claude-opus-4-6",
      imageGenerationCandidates: noImages,
    }),
    false,
  );
});

// ── 4. Provider missing secret ────────────────────────────────────────────────

test("provider with no secret and authKind!=none: not ready", () => {
  assert.equal(
    isComposerModelReady({
      nativeSession: false,
      provider: provider({ hasSecret: false, authKind: "apikey" }),
      modelId: "claude-opus-4-6",
      imageGenerationCandidates: noImages,
    }),
    false,
  );
});

// ── 5. Image-generation model ─────────────────────────────────────────────────

test("image-generation model selected: not ready", () => {
  assert.equal(
    isComposerModelReady({
      nativeSession: false,
      provider: provider(),
      modelId: "image-gen-v1",
      imageGenerationCandidates: withImageModel,
    }),
    false,
  );
});

// ── 6. omp-resolved session (kanban worker) ───────────────────────────────────

test("existing session with no Fcode provider and ompFallbackReady=true: ready", () => {
  assert.equal(
    isComposerModelReady({
      nativeSession: false,
      provider: undefined,
      ompFallbackReady: true,
      imageGenerationCandidates: noImages,
    }),
    true,
  );
});

test("existing session with no Fcode provider and ompFallbackReady=false: not ready", () => {
  assert.equal(
    isComposerModelReady({
      nativeSession: false,
      provider: undefined,
      ompFallbackReady: false,
      imageGenerationCandidates: noImages,
    }),
    false,
  );
});

// ── 7. Brand-new draft (no session) ──────────────────────────────────────────

test("brand-new draft with no provider and no ompFallbackReady: not ready (shows add-provider)", () => {
  // When there is no active session, activeSessionSummary is undefined, so
  // ompFallbackReady is also undefined — preserving the add-provider CTA.
  assert.equal(
    isComposerModelReady({
      nativeSession: false,
      provider: undefined,
      ompFallbackReady: undefined,
      imageGenerationCandidates: noImages,
    }),
    false,
  );
});
