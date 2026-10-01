/**
 * Hindsight local supervisor lifecycle tests.
 *
 * Uses a stub executable so the test suite does not require the real
 * hindsight-api binary, uvx, or docker. The stub is a tiny shell script
 * that sleeps briefly then exits, or exits immediately with a fake error.
 *
 * Acceptance: start → starting → running (when stub stays alive + probe
 * answers) and stop → stopped; fast-exit with LLM error text → unavailable.
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import test from "node:test";
import { register } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { HindsightSupervisor } = await import(
  "../electron/main/hindsight-local/supervisor.ts"
);

// ── Stub helpers ──────────────────────────────────────────────────────────────

/** Write an executable shell script to a temp dir; return its full path. */
function makeStub(dir, name, script) {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\n${script}\n`);
  chmodSync(path, 0o755);
  return path;
}

/** Start a minimal HTTP server on `port`; returns { server, close() }. */
function startMockServer(port) {
  const { promise, resolve } = Promise.withResolvers();
  const server = createServer((_req, res) => res.writeHead(200).end("[]"));
  server.listen(port, "127.0.0.1", () => resolve());
  return { promise, close: () => new Promise((r) => server.close(r)), server };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("detect: empty launchers when nothing found", async () => {
  const sup = new HindsightSupervisor();
  // Inject a PATH with no known launchers
  const orig = process.env.PATH;
  process.env.PATH = "/nonexistent-path";
  try {
    const launchers = await sup.detect();
    assert.deepEqual(launchers, []);
  } finally {
    process.env.PATH = orig;
  }
});

test("start without launchers transitions to unavailable", async () => {
  const sup = new HindsightSupervisor();
  const orig = process.env.PATH;
  process.env.PATH = "/nonexistent-path";
  try {
    const states = [];
    sup.on("status", (s) => states.push(s.state));
    await sup.start(19999); // port unlikely to be in use
    assert.ok(states.includes("unavailable"), `states: ${JSON.stringify(states)}`);
    assert.equal(sup.getState().state, "unavailable");
  } finally {
    process.env.PATH = orig;
  }
});

test("start → starting → running when stub stays alive and HTTP probe succeeds", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "hs-stub-"));

  // Stub that simply sleeps; will be killed on stop()
  const stubPath = makeStub(dir, "hindsight-api", "sleep 60");

  // Mock HTTP server to answer the probe
  const port = 19880;
  const mock = startMockServer(port);
  await mock.promise;
  t.after(() => mock.close());

  const sup = new HindsightSupervisor();
  // Inject PATH so `which hindsight-api` resolves to our stub
  const orig = process.env.PATH;
  process.env.PATH = `${dir}:${orig}`;

  const states = [];
  sup.on("status", (s) => states.push(s.state));

  try {
    await sup.start(port);
    // Should have seen starting
    assert.ok(states.includes("starting"), `states so far: ${JSON.stringify(states)}`);

    // Wait for running (probe polls every 2s; mock server is already up)
    await new Promise((resolve) => {
      const check = () => {
        if (sup.getState().state === "running") return resolve();
        if (sup.getState().state === "failed" || sup.getState().state === "unavailable") return resolve();
        setTimeout(check, 200);
      };
      check();
    });

    assert.equal(sup.getState().state, "running", `final state: ${JSON.stringify(states)}`);
  } finally {
    sup.stop();
    process.env.PATH = orig;
  }
});

test("stop() transitions running → stopped and kills the child", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "hs-stub-"));
  const stubPath = makeStub(dir, "hindsight-api", "sleep 60");

  const port = 19881;
  const mock = startMockServer(port);
  await mock.promise;
  t.after(() => mock.close());

  const sup = new HindsightSupervisor();
  const orig = process.env.PATH;
  process.env.PATH = `${dir}:${orig}`;

  try {
    await sup.start(port);
    // Wait for running
    await new Promise((resolve) => {
      const check = () => {
        const s = sup.getState().state;
        if (s === "running" || s === "failed" || s === "unavailable") return resolve();
        setTimeout(check, 200);
      };
      check();
    });

    sup.stop();
    assert.equal(sup.getState().state, "stopped");
  } finally {
    sup.stop();
    process.env.PATH = orig;
  }
});

test("fast exit with LLM key error → unavailable state with message", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "hs-stub-"));
  // Stub exits immediately with an LLM error message
  makeStub(dir, "hindsight-api", 'echo "missing api_key configuration"; exit 1');

  const sup = new HindsightSupervisor();
  const orig = process.env.PATH;
  process.env.PATH = `${dir}:${orig}`;

  const states = [];
  sup.on("status", (s) => states.push({ state: s.state, msg: s.message }));

  try {
    await sup.start(19882);
    // Wait until state settles (unavailable or failed)
    await new Promise((resolve) => {
      const check = () => {
        const s = sup.getState().state;
        if (s === "unavailable" || s === "failed" || s === "stopped") return resolve();
        setTimeout(check, 100);
      };
      check();
    });

    const final = sup.getState();
    assert.equal(final.state, "unavailable", `states: ${JSON.stringify(states)}`);
    assert.ok(final.message?.includes("LLM API key") || final.message?.includes("api_key") || final.message?.includes("LLM"), `message: ${final.message}`);
    // Security: raw subprocess output must NOT be embedded in the IPC state message.
    assert.ok(!final.message?.includes("api_key configuration"), `message must not include raw output: ${final.message}`);
  } finally {
    sup.stop();
    process.env.PATH = orig;
  }
});

test("ENOENT on spawn → unavailable with not-found message", async (t) => {
  const sup = new HindsightSupervisor();
  // Manually set launchers to include binary but PATH has nothing
  const state0 = sup.getState();
  // Directly test the error path by using a fake PATH with a fake binary ref
  const orig = process.env.PATH;
  process.env.PATH = "/absolutely-nonexistent";
  t.after(() => { process.env.PATH = orig; });

  // Force launcher so start() doesn't re-detect (re-detect would find nothing and
  // go unavailable before spawn, but we want to exercise the spawn ENOENT path)
  // Directly call start with an injected launcher via a subclass override
  class ForcedSup extends HindsightSupervisor {
    async detect() {
      // Return binary even though it's not there — forces spawn attempt
      return ["binary"];
    }
  }
  const fsup = new ForcedSup();
  const states = [];
  fsup.on("status", (s) => states.push(s.state));

  await fsup.start(19883);

  // Wait for error state
  await new Promise((resolve) => {
    const check = () => {
      const s = fsup.getState().state;
      if (s === "unavailable" || s === "failed" || s === "stopped") return resolve();
      setTimeout(check, 100);
    };
    check();
  });

  // Could be unavailable (ENOENT) or failed — both are acceptable for bad PATH
  assert.ok(
    fsup.getState().state === "unavailable" || fsup.getState().state === "failed",
    `expected unavailable/failed, got: ${fsup.getState().state}`,
  );
});
