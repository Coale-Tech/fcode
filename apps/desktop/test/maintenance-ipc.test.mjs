/**
 * Tests for maintenance-ipc pure helpers (slice E2).
 *
 * Covers arg building including hostile request strings, error parsing, and
 * autoresearch message construction.  No process is spawned.
 *
 * Run with: node --test test/maintenance-ipc.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { buildCleanseArgs, parseCleanseError, buildAutoresearchMessage } = await import(
  "../electron/main/ipc/maintenance-ipc.ts"
);

// ── buildCleanseArgs ──────────────────────────────────────────────────────────

describe("buildCleanseArgs — argv construction", () => {
  it("bare call → ['cleanse']", () => {
    assert.deepEqual(buildCleanseArgs({}), ["cleanse"]);
  });

  it("all=true → prepends --all before request", () => {
    assert.deepEqual(buildCleanseArgs({ all: true }), ["cleanse", "--all"]);
  });

  it("request only → appended", () => {
    assert.deepEqual(buildCleanseArgs({ request: "ts errors" }), ["cleanse", "ts errors"]);
  });

  it("all + request → --all then request", () => {
    assert.deepEqual(buildCleanseArgs({ all: true, request: "ts errors" }), [
      "cleanse",
      "--all",
      "ts errors",
    ]);
  });

  it("whitespace-only request → ignored (no extra element)", () => {
    assert.deepEqual(buildCleanseArgs({ request: "   " }), ["cleanse"]);
  });

  it("hostile request string with spaces passes through verbatim (execFile, not shell)", () => {
    // execFile doesn't invoke a shell, so shell metacharacters are inert argv elements.
    const hostile = "foo; rm -rf /";
    assert.deepEqual(buildCleanseArgs({ request: hostile }), ["cleanse", hostile]);
  });

  it("request with leading/trailing whitespace is trimmed", () => {
    assert.deepEqual(buildCleanseArgs({ request: "  lint  " }), ["cleanse", "lint"]);
  });
});

// ── parseCleanseError ─────────────────────────────────────────────────────────

describe("parseCleanseError — error extraction", () => {
  it("plain Error → .message", () => {
    const r = parseCleanseError(new Error("oops"));
    assert.equal(r.ok, false);
    assert.equal(r.output, "oops");
  });

  it("execFile rejection with stderr → stderr wins over message", () => {
    const r = parseCleanseError({ message: "Command failed", stderr: "no tests found" });
    assert.equal(r.output, "no tests found");
  });

  it("execFile rejection with stdout + stderr → concatenated", () => {
    const r = parseCleanseError({ message: "x", stdout: "partial", stderr: "error detail" });
    assert.equal(r.output, "partial\nerror detail");
  });

  it("empty stdout + stderr → falls back to message", () => {
    const r = parseCleanseError({ message: "fallback", stdout: "", stderr: "" });
    assert.equal(r.output, "fallback");
  });

  it("non-Error primitive → stringified", () => {
    const r = parseCleanseError(42);
    assert.equal(r.output, "42");
  });
});

// ── buildAutoresearchMessage ──────────────────────────────────────────────────

describe("buildAutoresearchMessage — slash-command text", () => {
  it("no goal → '/autoresearch'", () => {
    assert.equal(buildAutoresearchMessage(), "/autoresearch");
  });

  it("empty string → '/autoresearch'", () => {
    assert.equal(buildAutoresearchMessage(""), "/autoresearch");
  });

  it("'off' → '/autoresearch off' (disable path)", () => {
    assert.equal(buildAutoresearchMessage("off"), "/autoresearch off");
  });

  it("goal string → prefixed", () => {
    assert.equal(
      buildAutoresearchMessage("optimize inference speed"),
      "/autoresearch optimize inference speed",
    );
  });

  it("whitespace-padded goal is trimmed", () => {
    assert.equal(buildAutoresearchMessage("  my goal  "), "/autoresearch my goal");
  });
});
