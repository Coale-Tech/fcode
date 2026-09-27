/**
 * Tests for bench/supervisor.ts (E4, E21, DX4).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const {
  classifyBenchFailure,
  BENCH_FAILURE_CODES,
  WATCHER_MAX_RESTARTS,
  shouldAutoApproveVerb,
} = await import("../electron/main/bench/supervisor.ts");

// ── DX4: Typed bench doctor with classified failures ──────────────────────────

test("classifyBenchFailure: bench not on PATH", () => {
  const result = classifyBenchFailure("ENOENT", "", "bench");
  assert.equal(result.code, BENCH_FAILURE_CODES.BENCH_NOT_FOUND);
  assert.ok(result.problem.length > 0, "problem string non-empty");
  assert.ok(result.cause.length > 0, "cause string non-empty");
  assert.ok(result.fix.length > 0, "fix string non-empty");
  assert.ok(result.docsUrl.startsWith("https://"), "docsUrl is a URL");
});

test("classifyBenchFailure: port already bound", () => {
  const result = classifyBenchFailure(null, "address already in use", "");
  assert.equal(result.code, BENCH_FAILURE_CODES.PORT_BOUND);
});

test("classifyBenchFailure: Redis down", () => {
  const result = classifyBenchFailure(null, "Connection refused", "redis");
  assert.equal(result.code, BENCH_FAILURE_CODES.REDIS_DOWN);
});

test("classifyBenchFailure: MariaDB down", () => {
  const result = classifyBenchFailure(null, "Can't connect to MySQL server", "");
  assert.equal(result.code, BENCH_FAILURE_CODES.MARIADB_DOWN);
});

test("classifyBenchFailure: developer_mode off", () => {
  const result = classifyBenchFailure(null, "developer_mode is not enabled", "");
  assert.equal(result.code, BENCH_FAILURE_CODES.DEVELOPER_MODE_OFF);
});

test("classifyBenchFailure: app not installed", () => {
  const result = classifyBenchFailure(null, "No module named 'studio'", "");
  assert.equal(result.code, BENCH_FAILURE_CODES.APP_NOT_INSTALLED);
});

test("classifyBenchFailure: unknown falls back to UNKNOWN", () => {
  const result = classifyBenchFailure(null, "some completely unrecognised error", "some_cmd");
  assert.equal(result.code, BENCH_FAILURE_CODES.UNKNOWN);
});

// ── E21: Bounded restart policy ───────────────────────────────────────────────

test("WATCHER_MAX_RESTARTS is a finite positive number", () => {
  assert.ok(
    typeof WATCHER_MAX_RESTARTS === "number" &&
      WATCHER_MAX_RESTARTS > 0 &&
      Number.isFinite(WATCHER_MAX_RESTARTS),
  );
});

// ── E4: Verb allow-list (no start/console/serve) ─────────────────────────────

test("shouldAutoApproveVerb: start is NOT allowed (footgun guard)", () => {
  assert.ok(!shouldAutoApproveVerb("start"));
});

test("shouldAutoApproveVerb: console is NOT allowed", () => {
  assert.ok(!shouldAutoApproveVerb("console"));
});

test("shouldAutoApproveVerb: migrate is allowed", () => {
  assert.ok(shouldAutoApproveVerb("migrate"));
});

test("shouldAutoApproveVerb: clear-cache is allowed", () => {
  assert.ok(shouldAutoApproveVerb("clear-cache"));
});

test("shouldAutoApproveVerb: build is allowed", () => {
  assert.ok(shouldAutoApproveVerb("build"));
});

test("shouldAutoApproveVerb: list-apps is allowed", () => {
  assert.ok(shouldAutoApproveVerb("list-apps"));
});

test("shouldAutoApproveVerb: install-app is allowed", () => {
  assert.ok(shouldAutoApproveVerb("install-app"));
});

test("shouldAutoApproveVerb: build-studio-app is allowed", () => {
  assert.ok(shouldAutoApproveVerb("build-studio-app"));
});

test("shouldAutoApproveVerb: serve is NOT allowed", () => {
  assert.ok(!shouldAutoApproveVerb("serve"));
});

test("shouldAutoApproveVerb: unknown verb is NOT allowed", () => {
  assert.ok(!shouldAutoApproveVerb("rm -rf /"));
});
