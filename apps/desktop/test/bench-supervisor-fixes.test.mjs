/**
 * Tests for B1, B2, B6, B10(d), and the benchStatus contract extension.
 *
 * B1  — Frappe v16 "Running on http://" triggers starting→running.
 * B2  — activeSite/startedAt are set on start() and cleared on stop().
 * B6  — classifyBenchFailure distinguishes redis port conflict (REDIS_PORT_BOUND)
 *        from web-server port conflict (PORT_BOUND).
 * B10(d) — benchStart/benchRun reject paths not in discovered benches.
 * contract — benchStatus response includes startedAt + logs.
 */
import assert from "node:assert/strict";
import test from "node:test";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { register, syncBuiltinESMExports } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const {
  classifyBenchFailure,
  BENCH_FAILURE_CODES,
  BenchSupervisor,
} = await import("../electron/main/bench/supervisor.ts");

const { IPC } = await import("@pi-desktop/shared");
const { registerBenchIpc } = await import("../electron/main/ipc/bench-ipc.ts");
const { benchSupervisor } = await import("../electron/main/bench/supervisor.ts");

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Mock spawn so no real process is launched. Appends each created child to `children`. */
function fakeSpawn(t, children) {
  t.mock.method(childProcess, "spawn", () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    children.push(child);
    return child;
  });
  syncBuiltinESMExports();
}

/** Build a fake discover() that treats the given paths as discovered. */
function makeDiscover(...paths) {
  return async () => ({
    benches: paths.map((p) => ({
      id: p,
      path: p,
      version: 15,
      sites: [{ name: "site1.localhost", isDefault: true }],
    })),
    failedRoots: [],
  });
}

/** Register bench IPC with a fake discover and return the named handler. */
function setup(discover, channel) {
  const handlers = new Map();
  const registrar = { handle: (ch, fn) => handlers.set(ch, fn) };
  registerBenchIpc({ registrar, mainWindow: () => null, discover });
  return handlers.get(channel);
}

// ── B1: Frappe v16 running marker ────────────────────────────────────────────

test("B1: 'Running on http://' advances status from starting to running", async (t) => {
  const children = [];
  fakeSpawn(t, children);

  const sup = new BenchSupervisor();
  const statuses = [];
  sup.on("status", (s) => statuses.push(s));

  await sup.start("/tmp/bench-v16");
  assert.equal(statuses.at(-1), "starting");

  // Simulate Frappe v16 output
  children[0].stdout.emit("data", "Running on http://127.0.0.1:8034\n");
  assert.equal(statuses.at(-1), "running", "v16 log line must advance status to 'running'");
});

test("B1: 'Serving on' still works (v15 compat)", async (t) => {
  const children = [];
  fakeSpawn(t, children);

  const sup = new BenchSupervisor();
  const statuses = [];
  sup.on("status", (s) => statuses.push(s));

  await sup.start("/tmp/bench-v15");
  children[0].stdout.emit("data", "Serving on http://0.0.0.0:8000\n");
  assert.equal(statuses.at(-1), "running");
});

test("B1: 'Watching files' still works (v15 compat)", async (t) => {
  const children = [];
  fakeSpawn(t, children);

  const sup = new BenchSupervisor();
  const statuses = [];
  sup.on("status", (s) => statuses.push(s));

  await sup.start("/tmp/bench-v15b");
  children[0].stdout.emit("data", "Watching files for changes\n");
  assert.equal(statuses.at(-1), "running");
});

// ── B2: activeSite assignment and startedAt ───────────────────────────────────

test("B2: start() sets activeSite from explicit site param", async (t) => {
  const children = [];
  fakeSpawn(t, children);

  const sup = new BenchSupervisor();
  await sup.start("/tmp/bench", "mysite.localhost");
  assert.equal(sup.activeSite, "mysite.localhost");
});

test("B2: start() sets startedAt to a recent epoch-ms", async (t) => {
  const children = [];
  fakeSpawn(t, children);

  const sup = new BenchSupervisor();
  const before = Date.now();
  await sup.start("/tmp/bench");
  assert.ok(sup.startedAt !== null && sup.startedAt >= before && sup.startedAt <= Date.now());
});

test("B2: start() with no site sets activeSite to null", async (t) => {
  const children = [];
  fakeSpawn(t, children);

  const sup = new BenchSupervisor();
  await sup.start("/tmp/bench");
  assert.equal(sup.activeSite, null);
});

test("B2: stop() clears activeSite and startedAt", async (t) => {
  const children = [];
  fakeSpawn(t, children);

  const sup = new BenchSupervisor();
  await sup.start("/tmp/bench", "mysite.localhost");
  assert.ok(sup.startedAt !== null);
  assert.equal(sup.activeSite, "mysite.localhost");

  sup.stop();
  assert.equal(sup.activeSite, null);
  assert.equal(sup.startedAt, null);
});

// ── B6: redis vs web-server port conflict ─────────────────────────────────────

test("B6: 'Failed listening on port 11034' + 'address already in use' → REDIS_PORT_BOUND", () => {
  const output =
    "Could not create server TCP listening socket 127.0.0.1:13034: bind: Address already in use\n" +
    "Failed listening on port 11034\n";
  const f = classifyBenchFailure(null, output, "bench start");
  assert.equal(f.code, BENCH_FAILURE_CODES.REDIS_PORT_BOUND, `expected REDIS_PORT_BOUND, got ${f.code}`);
  assert.ok(f.problem.length > 0);
  assert.ok(f.fix.length > 0);
  // Should mention a port number in the message
  assert.ok(
    /\d{4,5}/.test(f.problem) || /\d{4,5}/.test(f.fix),
    "redis port conflict message should contain a port number",
  );
});

test("B6: redis port conflict fix includes how to stop stale redis", () => {
  const output =
    "Failed listening on port 13034\nAddress already in use\n";
  const f = classifyBenchFailure(null, output, "bench start");
  assert.equal(f.code, BENCH_FAILURE_CODES.REDIS_PORT_BOUND);
  assert.ok(
    f.fix.includes("redis-cli") || f.fix.includes("kill") || f.fix.includes("lsof"),
    "fix should tell user how to stop stale redis",
  );
});

test("B6: generic 'address already in use' (no redis marker) → PORT_BOUND (web server)", () => {
  const f = classifyBenchFailure(null, "Error: address already in use :::8034", "bench start");
  assert.equal(f.code, BENCH_FAILURE_CODES.PORT_BOUND, `expected PORT_BOUND, got ${f.code}`);
});

test("B6: PORT_BOUND message no longer hard-codes 8000", () => {
  const f = classifyBenchFailure(null, "address already in use", "bench start");
  assert.equal(f.code, BENCH_FAILURE_CODES.PORT_BOUND);
  // Must NOT say "default 8000" since the actual port depends on bench config
  assert.ok(!f.cause.includes("default 8000"), "PORT_BOUND cause must not hard-code port 8000");
});

// ── B10(d): benchStart rejects undiscovered paths ─────────────────────────────

test("B10(d): benchStart rejects a path not in discovered benches", async () => {
  const startHandler = setup(makeDiscover("/known/bench"), IPC.invoke.benchStart);

  await assert.rejects(
    () => startHandler({ benchPath: "/unknown/bench" }),
    (err) => err.errorCode === "NOT_FOUND",
  );
});

test("B10(d): benchStart accepts a discovered bench path", async () => {
  // Stub out supervisor.start to avoid spawning a real process
  benchSupervisor.start = async () => ({ conflict: false });
  const startHandler = setup(makeDiscover("/known/bench"), IPC.invoke.benchStart);

  const result = await startHandler({ benchPath: "/known/bench" });
  assert.deepEqual(result, { started: true });
});

// ── B10(d): benchRun rejects explicitly-provided undiscovered paths ───────────

test("B10(d): benchRun rejects an explicitly-provided path not in discovered benches", async () => {
  benchSupervisor.activeBenchPath = null;
  const runHandler = setup(makeDiscover("/known/bench"), IPC.invoke.benchRun);

  await assert.rejects(
    () => runHandler({ benchPath: "/unknown/bench", verb: "migrate" }),
    (err) => err.errorCode === "NOT_FOUND",
  );
});

// ── B2/contract: benchIpc resolves activeSite via discovery ──────────────────

test("B2/contract: benchStart resolves site from discovered bench when not explicit", async () => {
  let startedWithSite = null;
  benchSupervisor.start = async (_path, site) => {
    startedWithSite = site;
    return { conflict: false };
  };

  const discover = async () => ({
    benches: [
      {
        id: "/my/bench",
        path: "/my/bench",
        version: 16,
        sites: [{ name: "only-site.localhost", isDefault: false }], // only one site
      },
    ],
    failedRoots: [],
  });

  const startHandler = setup(discover, IPC.invoke.benchStart);
  await startHandler({ benchPath: "/my/bench" });
  assert.equal(startedWithSite, "only-site.localhost", "single site should be auto-selected");
});

test("B2/contract: benchStart prefers isDefault site when multiple exist", async () => {
  let startedWithSite = null;
  benchSupervisor.start = async (_path, site) => {
    startedWithSite = site;
    return { conflict: false };
  };

  const discover = async () => ({
    benches: [
      {
        id: "/my/bench",
        path: "/my/bench",
        version: 16,
        sites: [
          { name: "other.localhost", isDefault: false },
          { name: "default.localhost", isDefault: true },
        ],
      },
    ],
    failedRoots: [],
  });

  const startHandler = setup(discover, IPC.invoke.benchStart);
  await startHandler({ benchPath: "/my/bench" });
  assert.equal(startedWithSite, "default.localhost", "isDefault site should be selected");
});

test("B2/contract: explicit site overrides discovery auto-select", async () => {
  let startedWithSite = null;
  benchSupervisor.start = async (_path, site) => {
    startedWithSite = site;
    return { conflict: false };
  };

  const discover = async () => ({
    benches: [
      {
        id: "/my/bench",
        path: "/my/bench",
        version: 16,
        sites: [{ name: "auto.localhost", isDefault: true }],
      },
    ],
    failedRoots: [],
  });

  const startHandler = setup(discover, IPC.invoke.benchStart);
  await startHandler({ benchPath: "/my/bench", site: "explicit.localhost" });
  assert.equal(startedWithSite, "explicit.localhost", "explicit site must win over auto-select");
});

// ── contract: benchStatus includes startedAt and logs ────────────────────────

test("contract: benchStatus returns startedAt=null and logs=[] when stopped", async () => {
  benchSupervisor.activeBenchPath = null;
  benchSupervisor.activeSite = null;
  benchSupervisor.startedAt = null;
  // Override status via stop() without a real process
  benchSupervisor.stop = () => {}; // no-op for this test

  const statusHandler = setup(makeDiscover(), IPC.invoke.benchStatus);
  const result = await statusHandler();
  assert.equal(result.startedAt, null, "startedAt must be null when stopped");
  assert.deepEqual(result.logs, [], "logs must be [] when stopped");
});

test("contract: benchStatus shape has required fields", async () => {
  const statusHandler = setup(makeDiscover(), IPC.invoke.benchStatus);
  const result = await statusHandler();
  assert.ok("running" in result, "must have running");
  assert.ok("status" in result, "must have status");
  assert.ok("benchPath" in result, "must have benchPath");
  assert.ok("site" in result, "must have site");
  assert.ok("startedAt" in result, "must have startedAt");
  assert.ok("logs" in result, "must have logs");
  assert.ok(Array.isArray(result.logs), "logs must be an array");
});
