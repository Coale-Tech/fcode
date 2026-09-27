/**
 * Tests for canvas ownership protocol on the single WebContentsView (E13).
 * Tasks: E13 — one owner at a time, explicit handoff, visible state.
 */
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Stub Electron before importing browser-view.
const electron = `data:text/javascript,${encodeURIComponent(`
  import { EventEmitter } from "node:events";
  export const shell = {};
  export class WebContentsView {
    static instances = [];
    constructor() {
      this.webContents = Object.assign(new EventEmitter(), {
        url: "",
        pendingLoads: [],
        loadURL(url) { this.url = url; return Promise.resolve(); },
        getURL() { return this.url; },
        getTitle: () => "test",
        isLoading: () => false,
        isDestroyed: () => false,
        navigationHistory: { canGoBack: () => false, canGoForward: () => false },
        setWindowOpenHandler: () => {},
        session: { setPermissionRequestHandler: () => {} },
      });
      WebContentsView.instances.push(this);
    }
  }
`)}`;

registerHooks({
  resolve(specifier, context, next) {
    return specifier === "electron"
      ? { url: electron, shortCircuit: true }
      : next(specifier, context);
  },
});
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { BrowserPane } = await import("../electron/main/browser-view.ts");
const { BrowserHost, withAgentCanvasOwnership } = await import("../electron/main/browser-host.ts");

test("acquireCanvas returns true for the first acquirer (E13)", () => {
  const pane = new BrowserPane(() => {});
  assert.equal(pane.acquireCanvas("build-tab"), true);
  assert.equal(pane.currentOwner(), "build-tab");
});

test("acquireCanvas returns false when another owner holds the canvas (E13)", () => {
  const pane = new BrowserPane(() => {});
  pane.acquireCanvas("build-tab");
  assert.equal(pane.acquireCanvas("fcode-canvas-tool"), false);
  // Owner should not have changed
  assert.equal(pane.currentOwner(), "build-tab");
});

test("releaseCanvas gives up ownership and allows a new acquirer (E13)", () => {
  const pane = new BrowserPane(() => {});
  pane.acquireCanvas("build-tab");
  pane.releaseCanvas("build-tab");
  assert.equal(pane.currentOwner(), null);
  assert.equal(pane.acquireCanvas("fcode-canvas-tool"), true);
  assert.equal(pane.currentOwner(), "fcode-canvas-tool");
});

test("releaseCanvas by non-owner is a no-op (E13)", () => {
  const pane = new BrowserPane(() => {});
  pane.acquireCanvas("build-tab");
  pane.releaseCanvas("wrong-owner");
  assert.equal(pane.currentOwner(), "build-tab");
});

test("acquireCanvas same owner again returns true (already holds) (E13)", () => {
  const pane = new BrowserPane(() => {});
  pane.acquireCanvas("build-tab");
  assert.equal(pane.acquireCanvas("build-tab"), true);
  assert.equal(pane.currentOwner(), "build-tab");
});

test("forceAcquireCanvas takes over from another owner (handoff, E13)", () => {
  const pane = new BrowserPane(() => {});
  pane.acquireCanvas("build-tab");
  // forceAcquireCanvas is the explicit handoff path
  pane.forceAcquireCanvas("fcode-canvas-tool");
  assert.equal(pane.currentOwner(), "fcode-canvas-tool");
});

test("BrowserHost.forceAcquireCanvas delegates to the pane and notifies onOwnerChange (E13)", () => {
  const events = [];
  const pane = new BrowserPane(() => {});
  const host = new BrowserHost({
    pane,
    isPluginLoaded: () => false,
    getFileRoot: async () => null,
    onState: () => {},
    onOwnerChange: (owner) => events.push(owner),
  });
  host.forceAcquireCanvas("agent");
  assert.equal(pane.currentOwner(), "agent");
  assert.deepEqual(events, ["agent"]);
});

test("BrowserHost.releaseCanvas delegates to the pane and notifies onOwnerChange (E13)", () => {
  const events = [];
  const pane = new BrowserPane(() => {});
  const host = new BrowserHost({
    pane,
    isPluginLoaded: () => false,
    getFileRoot: async () => null,
    onState: () => {},
    onOwnerChange: (owner) => events.push(owner),
  });
  host.forceAcquireCanvas("agent");
  host.releaseCanvas("agent");
  assert.equal(pane.currentOwner(), null);
  assert.deepEqual(events, ["agent", null]);
});

test("withAgentCanvasOwnership takes over as 'agent' and restores the previous owner after (E13)", async () => {
  const pane = new BrowserPane(() => {});
  const host = new BrowserHost({
    pane,
    isPluginLoaded: () => false,
    getFileRoot: async () => null,
    onState: () => {},
  });
  pane.forceAcquireCanvas("build-tab");
  const result = await withAgentCanvasOwnership(host, async () => {
    assert.equal(host.currentOwner(), "agent");
    return 42;
  });
  assert.equal(result, 42);
  assert.equal(host.currentOwner(), "build-tab");
});

test("withAgentCanvasOwnership releases to null when nobody owned the canvas before (E13)", async () => {
  const pane = new BrowserPane(() => {});
  const host = new BrowserHost({
    pane,
    isPluginLoaded: () => false,
    getFileRoot: async () => null,
    onState: () => {},
  });
  await withAgentCanvasOwnership(host, async () => {
    assert.equal(host.currentOwner(), "agent");
  });
  assert.equal(host.currentOwner(), null);
});

test("withAgentCanvasOwnership restores the previous owner even when the action throws (E13)", async () => {
  const pane = new BrowserPane(() => {});
  const host = new BrowserHost({
    pane,
    isPluginLoaded: () => false,
    getFileRoot: async () => null,
    onState: () => {},
  });
  pane.forceAcquireCanvas("build-tab");
  await assert.rejects(
    () => withAgentCanvasOwnership(host, async () => { throw new Error("boom"); }),
    /boom/,
  );
  assert.equal(host.currentOwner(), "build-tab");
});
