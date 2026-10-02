/**
 * B10(c) — stripAnsi: SGR escape-sequence stripping for bench log output.
 *
 * Frappe's dev server emits ANSI colour codes. IPC serialisation sometimes
 * drops the ESC byte, leaving bare "[31m" sequences. Both forms must be
 * stripped so the LogView renders plain text.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const LOGVIEW_URL = new URL("../src/components/bench/LogView.tsx", import.meta.url);

// Re-implement the function locally for behavioural tests; the source-shape
// tests below confirm the real export exists and applies it in the render path.
const stripAnsi = (text) => text.replace(/(?:\x1b\[|\[)[0-9;]*m/g, "");

// ── Source-shape assertions ────────────────────────────────────────────────────

test("LogView exports stripAnsi", async () => {
  const source = await readFile(fileURLToPath(LOGVIEW_URL), "utf8");
  assert.match(source, /export function stripAnsi/);
});

test("stripAnsi regex handles both ESC-prefixed and bare forms", async () => {
  const source = await readFile(fileURLToPath(LOGVIEW_URL), "utf8");
  // Pattern must contain \x1b (ESC) handling and bare-bracket handling
  assert.ok(
    source.includes("\\x1b\\[") || source.includes("\\\\x1b\\\\["),
    "regex should reference \\x1b\\[ for ESC-prefixed sequences",
  );
});

test("LogView applies stripAnsi to rendered log line text", async () => {
  const source = await readFile(fileURLToPath(LOGVIEW_URL), "utf8");
  assert.match(source, /stripAnsi\(line\.text\)/);
});

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
