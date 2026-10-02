/**
 * K0 spike #5 proof: kanban channels always route local.
 * Uses the real BackendRouter from remote/backend-router.ts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { createBackendRouter, ROUTE_LOCAL } = await import(
  "../electron/main/remote/backend-router.ts"
);

const { IPC } = await import("../../../packages/shared/src/protocol.ts");

// Collect all kanban invoke channel values
const kanbanChannels = Object.entries(IPC.invoke)
  .filter(([key]) => key.startsWith("kanban"))
  .map(([, channel]) => channel);

// A fake remote backend that says it handles everything
const fakeBackend = {
  handles: () => true,
  invoke: async () => ({ value: "remote" }),
};

test("kanban channels with no sessionId route local even with a remote backend registered", async () => {
  const router = createBackendRouter();
  // Register a remote backend for a fake remote session
  router.registerBackend("remote:host-key:session-123", fakeBackend);

  for (const channel of kanbanChannels) {
    // Call with no args
    const result = await router.route(channel, []);
    assert.equal(result, ROUTE_LOCAL, `${channel} should be ROUTE_LOCAL with no args`);

    // Call with a plain object arg (no sessionId)
    const result2 = await router.route(channel, [{ taskId: "task-123" }]);
    assert.equal(result2, ROUTE_LOCAL, `${channel} should be ROUTE_LOCAL with plain taskId arg`);
  }
});

test("kanban channels with a non-remote sessionId still route local", async () => {
  const router = createBackendRouter();
  router.registerBackend("remote:host-key:session-123", fakeBackend);

  for (const channel of kanbanChannels) {
    const result = await router.route(channel, [{ sessionId: "local-session-abc" }]);
    assert.equal(result, ROUTE_LOCAL, `${channel} with local sessionId should be ROUTE_LOCAL`);
  }
});

test("kanban event channel is in IPC.event", () => {
  assert.ok("kanbanChanged" in IPC.event);
  assert.equal(IPC.event.kanbanChanged, "pi-desktop/kanban/event/changed");
});

test("all kanban channels exist in IPC.invoke", () => {
  const expectedKeys = [
    "kanbanList", "kanbanCreate", "kanbanMove", "kanbanLink",
    "kanbanComment", "kanbanArchive", "kanbanListRuns",
    "kanbanSettingsGet", "kanbanSettingsSet", "kanbanSetPaused", "kanbanNudge",
  ];
  for (const key of expectedKeys) {
    assert.ok(key in IPC.invoke, `IPC.invoke.${key} should exist`);
  }
});
