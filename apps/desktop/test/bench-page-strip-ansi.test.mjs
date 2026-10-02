/**
 * B10(c) — stripAnsi: SGR escape-sequence stripping for bench log output.
 *
 * Frappe's dev server emits ANSI colour codes. IPC serialisation sometimes
 * drops the ESC byte, leaving bare "[31m" sequences. Both forms must be
 * stripped so the LogView renders plain text.
 */
import assert from "node:assert/strict";
import test from "node:test";

const stripAnsi = (text) => text.replace(/(?:\x1b\[|\[)[0-9;]*m/g, "");

// ── Behavioural tests ─────────────────────────────────────────────────────────

test("stripAnsi: no-op on clean text", () => {
  assert.equal(stripAnsi("hello world"), "hello world");
});

test("stripAnsi: removes ESC-prefixed red colour", () => {
  assert.equal(stripAnsi("\x1b[31mERROR\x1b[0m"), "ERROR");
});

test("stripAnsi: removes bare [31m (ESC byte dropped in IPC)", () => {
  assert.equal(stripAnsi("[31mERROR[0m"), "ERROR");
});

test("stripAnsi: removes bold + colour compound sequence", () => {
  assert.equal(stripAnsi("\x1b[1;32mOK\x1b[0m"), "OK");
});

test("stripAnsi: removes SGR reset alone", () => {
  assert.equal(stripAnsi("\x1b[0m"), "");
});

test("stripAnsi: preserves surrounding text", () => {
  assert.equal(stripAnsi("Starting [32mserver[0m on port 8034"), "Starting server on port 8034");
});

test("stripAnsi: multiple sequences in one line", () => {
  assert.equal(
    stripAnsi("[1mBold[0m normal [31mred[0m"),
    "Bold normal red",
  );
});
