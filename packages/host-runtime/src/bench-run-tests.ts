/**
 * `bench --site <site> run-tests` for the `fcode_bench_run` host tool.
 *
 * Two pure pieces: `buildRunTestsArgs` turns structured tool input into a fixed
 * argv (no free-form flags, `--opt=value` so a value can never be read as a
 * flag), and `parseRunTestsOutput` squeezes the runner transcript into a small
 * summary so the model does not read pages of tracebacks.
 *
 * Flags and output format verified against frappe 16.35 `commands/testing.py`
 * and `testing/result.py` (Frappe's `TestResult` prints `✔`/`✖`/`=` per test,
 * then unittest's `Ran N tests in Xs` + `OK`/`FAILED (...)` footer).
 */

const IDENT = "[A-Za-z_][A-Za-z0-9_]*";
const APP_RE = new RegExp(`^${IDENT}$`);
const MODULE_RE = new RegExp(`^${IDENT}(?:\\.${IDENT})*$`);
const TEST_RE = APP_RE;
// DocType names allow spaces and dashes; never a leading dash (flag lookalike).
const DOCTYPE_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,139}$/;
export const SITE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,139}$/;

const STRING_OPTS: Record<string, { flag: string; re: RegExp }> = {
  app: { flag: "--app", re: APP_RE },
  module: { flag: "--module", re: MODULE_RE },
  doctype: { flag: "--doctype", re: DOCTYPE_RE },
  test: { flag: "--test", re: TEST_RE },
};
const BOOL_OPTS: Record<string, string> = {
  failfast: "--failfast",
  skip_before_tests: "--skip-before-tests",
};
const TEST_CATEGORIES: Record<string, true> = { unit: true, integration: true };
/** Keys that belong to the tool envelope, not to run-tests. */
const ENVELOPE_KEYS: Record<string, true> = { command: true, site: true };

export type BuiltRunTests = { ok: true; args: string[] } | { ok: false; error: string };

export function buildRunTestsArgs(input: Record<string, unknown>): BuiltRunTests {
  const args: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (Object.hasOwn(ENVELOPE_KEYS, key) || value == null) continue;
    if (key === "args") {
      if (Array.isArray(value) && value.length === 0) continue;
      return { ok: false, error: "run-tests takes no free-form args; use app, module, doctype, test, failfast, skip_before_tests, test_category" };
    }
    const str = Object.hasOwn(STRING_OPTS, key) ? STRING_OPTS[key] : undefined;
    if (str) {
      if (typeof value !== "string" || !str.re.test(value)) return { ok: false, error: `invalid ${key}: ${JSON.stringify(value)}` };
      args.push(`${str.flag}=${value}`);
    } else if (Object.hasOwn(BOOL_OPTS, key)) {
      if (typeof value !== "boolean") return { ok: false, error: `${key} must be a boolean` };
      if (value) args.push(BOOL_OPTS[key]);
    } else if (key === "test_category") {
      if (typeof value !== "string" || !Object.hasOwn(TEST_CATEGORIES, value)) return { ok: false, error: "test_category must be 'unit' or 'integration'" };
      args.push(`--test-category=${value}`);
    } else {
      return { ok: false, error: `unknown option '${key}'` };
    }
  }
  // Frappe raises UsageError for these combinations; fail before spawning.
  if ("module" in input && "doctype" in input && input.module != null && input.doctype != null) {
    return { ok: false, error: "module and doctype are mutually exclusive" };
  }
  return { ok: true, args };
}

// ── Output parsing ────────────────────────────────────────────────────────────

export type RunTestsFailure = { kind: "FAIL" | "ERROR"; test: string; message: string };

export type RunTestsSummary = {
  status: "passed" | "failed" | "no_tests" | "disabled" | "crashed";
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  durationMs: number;
  failures: RunTestsFailure[];
  /** Failures beyond MAX_FAILURES that were dropped from `failures`. */
  omitted: number;
  /** Set for `disabled` / `crashed`: the line that explains why. */
  error?: string;
};

const MAX_FAILURES = 20;
const MAX_MESSAGE = 500;
const TAIL_CHARS = 2000;
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;]*[A-Za-z]/g;
const SEP1 = /^={20,}$/;
const SEP2 = /^-{20,}$/;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

/** Last traceback's exception text: first unindented line after its frames. */
function failureMessage(lines: string[]): string {
  const tb = lines.map((l) => l.startsWith("Traceback (most recent call last)")).lastIndexOf(true);
  const body = tb >= 0 ? lines.slice(tb + 1) : lines;
  const first = body.findIndex((l) => l.length > 0 && !/^\s/.test(l));
  const msg = (first >= 0 ? body.slice(first) : body).join("\n").trim();
  return msg.length > MAX_MESSAGE ? `${msg.slice(0, MAX_MESSAGE)}…` : msg;
}

function parseFailures(lines: string[]): { failures: RunTestsFailure[]; total: number } {
  const failures: RunTestsFailure[] = [];
  let total = 0;
  for (let i = 0; i < lines.length; i++) {
    const header = SEP1.test(lines[i]) ? /^\s*(ERROR|FAIL)\s+(.+)$/.exec(lines[i + 1] ?? "") : null;
    if (!header || !SEP2.test(lines[i + 2] ?? "")) continue;
    let end = i + 3;
    while (end < lines.length && !SEP1.test(lines[end]) && !SEP2.test(lines[end])) end++;
    total++;
    if (failures.length < MAX_FAILURES) {
      failures.push({
        kind: header[1] as "FAIL" | "ERROR",
        test: header[2].trim(),
        message: failureMessage(lines.slice(i + 3, end)),
      });
    }
    i = end - 1;
  }
  return { failures, total };
}

export function parseRunTestsOutput(raw: string, exitCode: number): RunTestsSummary {
  const text = stripAnsi(raw);
  const lines = text.split("\n").map((l) => l.replace(/\s+$/, ""));
  const empty = { passed: 0, failed: 0, errors: 0, skipped: 0, durationMs: 0, failures: [], omitted: 0 };
  const lastLine = lines.filter(Boolean).at(-1) ?? "";

  if (text.includes("Testing is disabled for the site!")) {
    return { ...empty, status: "disabled", error: "Tests are disabled for this site; the user must run `bench --site <site> set-config allow_tests true`" };
  }

  // One `Ran N tests in Xs` + result footer per category (unit, integration, ...); sum them.
  let ran = 0;
  let seconds = 0;
  let failedCount = 0;
  let errors = 0;
  let skipped = 0;
  let blocks = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^Ran (\d+) tests? in ([\d.]+)s$/.exec(lines[i]);
    if (!m) continue;
    blocks++;
    ran += Number(m[1]);
    seconds += Number(m[2]);
    const footer = lines.slice(i + 1).find(Boolean) ?? "";
    const counts = footer.startsWith("FAILED") || footer.startsWith("OK") ? footer : "";
    const n = (key: string) => Number(new RegExp(`${key}=(\\d+)`).exec(counts)?.[1] ?? 0);
    failedCount += n("failures") + n("unexpected successes");
    errors += n("errors");
    skipped += n("skipped");
  }

  if (blocks === 0) {
    return exitCode === 0
      ? { ...empty, status: "no_tests" }
      : { ...empty, status: "crashed", error: lastLine };
  }

  const { failures, total } = parseFailures(lines);
  return {
    status: failedCount + errors > 0 || exitCode !== 0 ? "failed" : ran === 0 ? "no_tests" : "passed",
    passed: Math.max(0, ran - failedCount - errors - skipped),
    failed: failedCount,
    errors,
    skipped,
    durationMs: Math.round(seconds * 1000),
    failures,
    omitted: Math.max(0, total - failures.length),
  };
}

/** JSON the model reads: structured summary plus a short raw tail for context. */
export function runTestsReport(raw: string, exitCode: number): { summary: RunTestsSummary; content: string } {
  const summary = parseRunTestsOutput(raw, exitCode);
  const tail = stripAnsi(raw).trim().slice(-TAIL_CHARS);
  return { summary, content: JSON.stringify({ ...summary, tail }) };
}
