/**
 * Boundary tests for the omp collab state reducer (feat/collab-panel).
 *
 * Covers: state transitions, URL extraction, idempotency, no-op paths.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { ompCollabReducer, OMP_COLLAB_INITIAL, extractShareUrl } =
  await import("../src/lib/omp-collab.ts");

// ─── initial state ────────────────────────────────────────────────────────────

test("initial state is idle", () => {
  assert.equal(OMP_COLLAB_INITIAL.phase, "idle");
  assert.equal(OMP_COLLAB_INITIAL.url, null);
  assert.equal(OMP_COLLAB_INITIAL.error, null);
});

// ─── share_requested ──────────────────────────────────────────────────────────

test("share_requested moves idle to loading", () => {
  const next = ompCollabReducer(OMP_COLLAB_INITIAL, { type: "share_requested" });
  assert.equal(next.phase, "loading");
});

test("share_requested from loading is a no-op (same reference)", () => {
  const loading = ompCollabReducer(OMP_COLLAB_INITIAL, { type: "share_requested" });
  const again = ompCollabReducer(loading, { type: "share_requested" });
  assert.equal(again, loading);
});

test("share_requested clears prior url and error", () => {
  const withUrl = ompCollabReducer(OMP_COLLAB_INITIAL, {
    type: "share_success",
    url: "https://example.com/s/abc",
    text: "Share URL: https://example.com/s/abc",
  });
  const reloading = ompCollabReducer(withUrl, { type: "share_requested" });
  assert.equal(reloading.phase, "loading");
  assert.equal(reloading.url, null);
  assert.equal(reloading.error, null);
});

// ─── share_success ────────────────────────────────────────────────────────────

test("share_success with url moves to url phase", () => {
  const loading = ompCollabReducer(OMP_COLLAB_INITIAL, { type: "share_requested" });
  const next = ompCollabReducer(loading, {
    type: "share_success",
    url: "https://example.com/s/abc",
    text: "Share URL: https://example.com/s/abc",
  });
  assert.equal(next.phase, "url");
  assert.equal(next.url, "https://example.com/s/abc");
  assert.equal(next.error, null);
});

test("share_success with null url moves to error phase", () => {
  const loading = ompCollabReducer(OMP_COLLAB_INITIAL, { type: "share_requested" });
  const next = ompCollabReducer(loading, {
    type: "share_success",
    url: null,
    text: "some error output",
  });
  assert.equal(next.phase, "error");
  assert.ok(next.error);
  assert.equal(next.url, null);
});

// ─── share_error ──────────────────────────────────────────────────────────────

test("share_error moves to error phase with message", () => {
  const loading = ompCollabReducer(OMP_COLLAB_INITIAL, { type: "share_requested" });
  const next = ompCollabReducer(loading, {
    type: "share_error",
    error: "omp sidecar unavailable",
  });
  assert.equal(next.phase, "error");
  assert.equal(next.error, "omp sidecar unavailable");
  assert.equal(next.url, null);
});

// ─── reset ────────────────────────────────────────────────────────────────────

test("reset from url returns to idle", () => {
  const withUrl = ompCollabReducer(OMP_COLLAB_INITIAL, {
    type: "share_success",
    url: "https://example.com/s/abc",
    text: "Share URL: https://example.com/s/abc",
  });
  const reset = ompCollabReducer(withUrl, { type: "reset" });
  assert.equal(reset.phase, "idle");
  assert.equal(reset.url, null);
  assert.equal(reset.error, null);
});

test("reset from error returns to idle", () => {
  const withErr = ompCollabReducer(OMP_COLLAB_INITIAL, {
    type: "share_error",
    error: "network error",
  });
  const reset = ompCollabReducer(withErr, { type: "reset" });
  assert.equal(reset.phase, "idle");
});

// ─── extractShareUrl ──────────────────────────────────────────────────────────

test("extractShareUrl parses standard output", () => {
  const url = extractShareUrl("Share URL: https://example.com/s/abc123");
  assert.equal(url, "https://example.com/s/abc123");
});

test("extractShareUrl handles extra whitespace", () => {
  const url = extractShareUrl("Share URL:  https://example.com/s/abc");
  assert.equal(url, "https://example.com/s/abc");
});

test("extractShareUrl with multi-line output (with gist)", () => {
  const text = "Share URL: https://example.com/s/abc\nGist: https://gist.github.com/x";
  const url = extractShareUrl(text);
  assert.equal(url, "https://example.com/s/abc");
});

test("extractShareUrl returns null when no URL present", () => {
  assert.equal(extractShareUrl("Failed to upload"), null);
  assert.equal(extractShareUrl(""), null);
});

test("extractShareUrl returns null for truncation notice without URL", () => {
  assert.equal(extractShareUrl("Note: large content was trimmed"), null);
});
