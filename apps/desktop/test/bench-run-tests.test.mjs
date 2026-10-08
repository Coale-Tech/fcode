/**
 * Tests for bench/run-tests.ts. Fixtures under fixtures/bench-run-tests/ are
 * real `bench --site coale run-tests` transcripts (frappe 16.35, piped, so no
 * colour) of a throwaway module with one pass, one failure, one error, one skip.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { buildRunTestsArgs, parseRunTestsOutput, runTestsReport, SITE_RE } = await import("../electron/main/bench/run-tests.ts");

const fixture = (name) => readFileSync(join(here, "fixtures/bench-run-tests", `${name}.txt`), "utf8");

// ── buildRunTestsArgs ─────────────────────────────────────────────────────────

test("builds a fixed argv from structured input", () => {
  assert.deepEqual(
    buildRunTestsArgs({ command: "run-tests", site: "coale", app: "frappe", module: "frappe.tests.test_utils", test: "test_ok", failfast: true, test_category: "unit" }),
    { ok: true, args: ["--app=frappe", "--module=frappe.tests.test_utils", "--test=test_ok", "--failfast", "--test-category=unit"] },
  );
  assert.deepEqual(buildRunTestsArgs({ doctype: "Sales Order" }), { ok: true, args: ["--doctype=Sales Order"] });
  assert.deepEqual(buildRunTestsArgs({ failfast: false, args: [] }), { ok: true, args: [] });
});

test("rejects shell metacharacters and flag injection in every string option", () => {
  const bad = ["x; rm -rf /", "x && id", "$(id)", "`id`", "a|b", "a\nb", "--site=other", "-x", "x y", "../etc", ""];
  for (const key of ["app", "module", "test"]) {
    for (const value of bad) assert.equal(buildRunTestsArgs({ [key]: value }).ok, false, `${key}=${JSON.stringify(value)}`);
  }
  for (const value of bad.filter((v) => v !== "x y")) assert.equal(buildRunTestsArgs({ doctype: value }).ok, false, `doctype=${JSON.stringify(value)}`);
  assert.equal(buildRunTestsArgs({ module: "frappe..x" }).ok, false);
  assert.equal(buildRunTestsArgs({ app: ["a"] }).ok, false);
  assert.equal(buildRunTestsArgs({ test: 5 }).ok, false);
});

test("rejects free-form args, --site override, unknown and deprecated flags", () => {
  assert.equal(buildRunTestsArgs({ args: ["--site", "other"] }).ok, false);
  assert.equal(buildRunTestsArgs({ args: ["--debug"] }).ok, false);
  for (const key of ["debug", "coverage", "profile", "junit_xml_output", "skip_test_records", "doctype_list_path", "constructor", "__proto__", "--site"]) {
    assert.equal(buildRunTestsArgs({ [key]: "x" }).ok, false, key);
  }
  assert.equal(buildRunTestsArgs({ failfast: "yes" }).ok, false);
  assert.equal(buildRunTestsArgs({ test_category: "all" }).ok, false);
  assert.equal(buildRunTestsArgs({ test_category: "constructor" }).ok, false);
});

test("module and doctype are mutually exclusive (frappe raises UsageError)", () => {
  assert.equal(buildRunTestsArgs({ module: "a.b", doctype: "User" }).ok, false);
});

test("site name regex rejects flags and metacharacters", () => {
  assert.ok(SITE_RE.test("gardatest.local"));
  for (const s of ["--site", "-x", "a b", "a;b", "", "a/b"]) assert.ok(!SITE_RE.test(s), s);
});

// ── parseRunTestsOutput ───────────────────────────────────────────────────────

test("mixed run: counts, failures, messages, duration", () => {
  const s = parseRunTestsOutput(fixture("mixed"), 1);
  assert.equal(s.status, "failed");
  assert.deepEqual([s.passed, s.failed, s.errors, s.skipped, s.durationMs], [2, 1, 1, 1, 21]);
  assert.deepEqual(s.failures, [
    { kind: "ERROR", test: "test_error (fcode_sample_tests.TestSample.test_error)", message: "KeyError: 'missing'" },
    { kind: "FAIL", test: "test_fail (fcode_sample_tests.TestSample.test_fail)", message: "AssertionError: 2 != 3 : math is broken" },
  ]);
  assert.equal(s.omitted, 0);
});

test("passing run with a skip is passed", () => {
  const s = parseRunTestsOutput(fixture("passed"), 0);
  assert.equal(s.status, "passed");
  assert.deepEqual([s.passed, s.failed, s.errors, s.skipped, s.durationMs, s.failures.length], [1, 0, 0, 1, 2, 0]);
});

test("failfast stops early: only the tests actually run are counted", () => {
  const s = parseRunTestsOutput(fixture("failfast"), 1);
  assert.equal(s.status, "failed");
  assert.deepEqual([s.passed, s.errors, s.failed], [1, 1, 0]);
});

test("'Testing is disabled' exits 0 but must not read as a pass", () => {
  const s = parseRunTestsOutput(fixture("disabled"), 0);
  assert.equal(s.status, "disabled");
  assert.match(s.error, /allow_tests/);
});

test("discovery crash reports the final error line", () => {
  const s = parseRunTestsOutput(fixture("crashed-discovery"), 1);
  assert.equal(s.status, "crashed");
  assert.match(s.error, /No module named 'fcode_nonexistent'/);
});

test("no output and exit 0 means nothing ran", () => {
  assert.equal(parseRunTestsOutput("", 0).status, "no_tests");
});

test("ANSI colour is ignored", () => {
  const coloured = fixture("mixed").replace(/ERROR|FAIL(?= test_fail)/g, (m) => `\u001b[41m${m}\u001b[0m`).replace(/✖/g, "\u001b[31m✖\u001b[0m");
  assert.deepEqual(parseRunTestsOutput(coloured, 1), parseRunTestsOutput(fixture("mixed"), 1));
});

test("several categories (unit + integration) are summed", () => {
  const s = parseRunTestsOutput(`${fixture("passed")}\n${fixture("mixed")}`, 1);
  assert.deepEqual([s.passed, s.failed, s.errors, s.skipped, s.durationMs, s.failures.length], [3, 1, 1, 2, 23, 2]);
});

test("a chained exception reports the final one; multiline messages are capped", () => {
  const sep = "=".repeat(70);
  const dash = "-".repeat(70);
  const long = "x".repeat(900);
  const out = [
    sep, " ERROR test_a (m.T.test_a)", dash,
    "Traceback (most recent call last):", "  File \"a.py\", line 1, in test_a", "    boom()", "KeyError: 'first'", "",
    "During handling of the above exception, another exception occurred:", "",
    "Traceback (most recent call last):", "  File \"a.py\", line 3, in test_a", "    fail()", `ValueError: ${long}`, "",
    dash, "Ran 1 test in 0.5s", "", "FAILED (errors=1)",
  ].join("\n");
  const s = parseRunTestsOutput(out, 1);
  assert.equal(s.failures.length, 1);
  assert.ok(s.failures[0].message.startsWith("ValueError: xxx"));
  assert.ok(s.failures[0].message.length <= 501);
  assert.equal(s.durationMs, 500);
});

test("more than 20 failures are truncated with an omitted count", () => {
  const sep = "=".repeat(70);
  const dash = "-".repeat(70);
  const blocks = Array.from({ length: 25 }, (_, i) => [sep, ` FAIL test_${i} (m.T.test_${i})`, dash, "Traceback (most recent call last):", "  File \"a.py\", line 1", "AssertionError: no", ""].join("\n"));
  const out = `${blocks.join("\n")}\n${dash}\nRan 25 tests in 1.000s\n\nFAILED (failures=25)`;
  const s = parseRunTestsOutput(out, 1);
  assert.equal(s.failures.length, 20);
  assert.equal(s.omitted, 5);
  assert.equal(s.failed, 25);
});

test("runTestsReport: JSON with summary and a bounded raw tail", () => {
  const { summary, content } = runTestsReport(fixture("mixed") + "y".repeat(5000), 1);
  const parsed = JSON.parse(content);
  assert.equal(parsed.status, summary.status);
  assert.equal(parsed.errors, 1);
  assert.equal(parsed.tail.length, 2000);
});
