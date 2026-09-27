/**
 * Behavioral unit tests for build-ipc.ts IPC handlers (T6).
 *
 * Drives `registerBuildIpc` with a minimal fake registrar to test:
 *  - buildListApps  returns a safe default when no bench is active
 *  - buildCanvasAcquire / buildCanvasRelease  delegate to BrowserPane
 *  - buildCheckDeveloperMode  returns false when no bench/site is active
 *  - buildCheckWatchdog  returns {ok: false} when bench not active
 *  - buildSync  returns error when no bench is active
 *
 * Pattern follows bench-ipc-stop-identity.test.mjs:
 *   register ts-import-hooks → import TS sources → drive handlers directly.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { IPC } = await import("@pi-desktop/shared");
const { registerBuildIpc } = await import("../electron/main/ipc/build-ipc.ts");
const { benchSupervisor } = await import("../electron/main/bench/supervisor.ts");

/** Minimal fake BrowserPane that records calls. */
function makeFakeBrowserPane() {
  const calls = [];
  return {
    calls,
    forceAcquireCanvas(ownerId) {
      calls.push({ method: "forceAcquireCanvas", ownerId });
    },
    releaseCanvas(ownerId) {
      calls.push({ method: "releaseCanvas", ownerId });
    },
    navigate() {},
    setBounds() {},
    setVisible() {},
    getState() { return { url: "", title: "", isLoading: false }; },
    action() {},
  };
}

/** Register all build IPC handlers and return the handler map + fake pane. */
function setup() {
  const handlers = new Map();
  const registrar = { handle: (ch, fn) => handlers.set(ch, fn) };
  const browserPane = makeFakeBrowserPane();
  registerBuildIpc({ registrar, mainWindow: () => null, browserPane });
  return { handlers, browserPane };
}

// Reset supervisor state between tests
function clearSupervisor() {
  benchSupervisor.activeBenchPath = null;
  benchSupervisor.activeSite = null;
}

// ── buildListApps ────────────────────────────────────────────────────────────

test("buildListApps: returns empty apps and defaults when no bench active", async () => {
  clearSupervisor();
  const { handlers } = setup();
  const fn = handlers.get(IPC.invoke.buildListApps);
  assert.ok(fn, "handler should be registered");
  const result = await fn();
  assert.deepEqual(result.apps, []);
  assert.equal(result.webserverPort, 8000);
  assert.equal(result.builderPath, "builder");
  assert.equal(result.site, null);
});

// ── buildCanvasAcquire ───────────────────────────────────────────────────────

test("buildCanvasAcquire: calls forceAcquireCanvas with 'build-tab'", async () => {
  const { handlers, browserPane } = setup();
  const fn = handlers.get(IPC.invoke.buildCanvasAcquire);
  assert.ok(fn, "handler should be registered");
  await fn();
  const call = browserPane.calls.find(c => c.method === "forceAcquireCanvas");
  assert.ok(call, "forceAcquireCanvas must be called");
  assert.equal(call.ownerId, "build-tab");
});

// ── buildCanvasRelease ───────────────────────────────────────────────────────

test("buildCanvasRelease: calls releaseCanvas with 'build-tab'", async () => {
  const { handlers, browserPane } = setup();
  const fn = handlers.get(IPC.invoke.buildCanvasRelease);
  assert.ok(fn, "handler should be registered");
  await fn();
  const call = browserPane.calls.find(c => c.method === "releaseCanvas");
  assert.ok(call, "releaseCanvas must be called");
  assert.equal(call.ownerId, "build-tab");
});

// ── buildCheckDeveloperMode ──────────────────────────────────────────────────

test("buildCheckDeveloperMode: returns {developerMode: false} when no bench/site active", async () => {
  clearSupervisor();
  const { handlers } = setup();
  const fn = handlers.get(IPC.invoke.buildCheckDeveloperMode);
  assert.ok(fn, "handler should be registered");
  const result = await fn();
  assert.deepEqual(result, { developerMode: false });
});

// ── buildCheckWatchdog ───────────────────────────────────────────────────────

test("buildCheckWatchdog: returns {ok: false} when no bench active", async () => {
  clearSupervisor();
  const { handlers } = setup();
  const fn = handlers.get(IPC.invoke.buildCheckWatchdog);
  assert.ok(fn, "handler should be registered");
  const result = await fn();
  assert.deepEqual(result, { ok: false });
});

// ── buildSync ────────────────────────────────────────────────────────────────

test("buildSync: returns exitCode when no bench active (runOneShot with no bench path)", async () => {
  clearSupervisor();
  const { handlers } = setup();
  const fn = handlers.get(IPC.invoke.buildSync);
  assert.ok(fn, "handler should be registered");
  // With no bench active, buildSync returns early with an error result
  const result = await fn();
  // Should return some object (not throw)
  assert.ok(typeof result === "object" && result !== null);
});

// ── handler registration completeness ────────────────────────────────────────

test("all build IPC invoke channels are registered", () => {
  const { handlers } = setup();
  const buildChannels = [
    IPC.invoke.buildListApps,
    IPC.invoke.buildCanvasAcquire,
    IPC.invoke.buildCanvasRelease,
    IPC.invoke.buildCanvasNavigate,
    IPC.invoke.buildCanvasSetBounds,
    IPC.invoke.buildCanvasSetVisible,
    IPC.invoke.buildCanvasGetState,
    IPC.invoke.buildCanvasAction,
    IPC.invoke.buildStartWatcher,
    IPC.invoke.buildStopWatcher,
    IPC.invoke.buildSync,
    IPC.invoke.buildCheckDeveloperMode,
    IPC.invoke.buildCheckWatchdog,
  ];
  for (const ch of buildChannels) {
    assert.ok(handlers.has(ch), `channel ${ch} must be registered`);
  }
});
