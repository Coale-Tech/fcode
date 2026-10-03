/**
 * Regression: the dispatcher prompted via host.call("agent.prompt"), a method
 * the host does not have, so every worker crashed with PROMPT_FAILED.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { register } from "node:module";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { createKanbanWiring } = await import("../electron/main/runtime/kanban-wiring.ts");
const { createTask, emptyBoard } = await import("../electron/main/runtime/kanban-core.ts");
const { loadBoard, saveBoard } = await import("../electron/main/runtime/kanban-store.ts");
const { writeKanbanSettings } = await import("../electron/main/runtime/kanban-settings.ts");
const { IPC } = await import("../../../packages/shared/src/protocol.ts");

test("a ready card is prompted through the agentPrompt IPC handler, not the host", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "kanban-wiring-"));
  await writeKanbanSettings(dataDir, { enabled: true, maxInProgress: 2, maxRuntimeSeconds: 1800, maxAgentCardsPerSession: 20, maxDailySpawns: 20 });
  const { board } = createTask(emptyBoard(), { title: "t", body: "do it", projectPath: "/tmp", status: "ready", createdBy: "user" });
  await saveBoard(dataDir, board);

  const hostCalls = [];
  const host = { call: async (method) => { hostCalls.push(method); return { session: { id: "s1" } }; } };
  const ipcCalls = [];
  const wiring = createKanbanWiring({
    dataDir, getHost: () => host, sendToRenderer() {}, logError() {},
    getLabels: () => ({ kanban: { notify: { blocked: "", done: "", dailyCap: "" } } }),
  });
  wiring.bindInvoke(async (channel, args) => { ipcCalls.push([channel, args]); });

  await wiring.kanbanRunner.tick();

  assert.deepEqual(hostCalls, ["session.create"]);
  assert.equal(ipcCalls.length, 1);
  assert.equal(ipcCalls[0][0], IPC.invoke.agentPrompt);
  assert.equal(ipcCalls[0][1][0].sessionId, "s1");
  assert.equal(loadBoard(dataDir).tasks[0].status, "running");
});
