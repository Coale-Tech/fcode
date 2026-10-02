/**
 * Behaviour tests for editable-todos logic (T4).
 *
 * Covers:
 *  - rejected call restores (store unchanged) and surfaces error
 *  - agent event during in-flight edit wins (RPC result discarded)
 *  - success path: store updated with returned phases
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { editTodosWithRevert, toggleTaskStatus } = await import(
  "../src/features/chat/transcript/omp-todo-logic.ts"
);

// ─── helpers ─────────────────────────────────────────────────────────────────

function makePhases(status = "pending") {
  return [{ name: "Phase 1", tasks: [{ content: "Task A", status }] }];
}

// ─── editTodosWithRevert: success path ────────────────────────────────────────

test("success: store is updated with returned phases", async () => {
  const prev = makePhases("pending");
  const next = makePhases("completed");
  const returned = makePhases("completed");
  let stored = prev;

  const result = await editTodosWithRevert({
    prevPhases: prev,
    nextPhases: next,
    getCurrentPhases: () => stored,
    setPhases: (ps) => { stored = ps; },
    callSetTodos: async () => ({ phases: returned }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.error, undefined);
  assert.equal(stored, returned, "store should hold the returned phases");
});

// ─── rejected call restores + surfaces error ──────────────────────────────────

test("RPC error: store is NOT changed and error is returned", async () => {
  const prev = makePhases("pending");
  const next = makePhases("completed");
  let stored = prev;

  const result = await editTodosWithRevert({
    prevPhases: prev,
    nextPhases: next,
    getCurrentPhases: () => stored,
    setPhases: (ps) => { stored = ps; },
    callSetTodos: async () => { throw new Error("network timeout"); },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "network timeout");
  // Store must still hold the original phases (not modified on failure)
  assert.equal(stored, prev, "store should be unchanged after RPC failure");
});

test("RPC error: returned error string is non-empty", async () => {
  const prev = makePhases("pending");
  const result = await editTodosWithRevert({
    prevPhases: prev,
    nextPhases: makePhases("completed"),
    getCurrentPhases: () => prev,
    setPhases: () => {},
    callSetTodos: async () => { throw new Error("ECONNREFUSED"); },
  });
  assert.match(result.error ?? "", /ECONNREFUSED/);
});

// ─── agent event during in-flight edit wins ───────────────────────────────────

test("agent wins: if store changes mid-flight, RPC result is discarded", async () => {
  const prev = makePhases("pending");
  const agentUpdate = makePhases("in_progress");
  let stored = prev;

  const result = await editTodosWithRevert({
    prevPhases: prev,
    nextPhases: makePhases("completed"),
    // Simulate agent event: getCurrentPhases returns new object
    getCurrentPhases: () => agentUpdate,
    setPhases: (ps) => { stored = ps; },
    callSetTodos: async () => ({ phases: makePhases("completed") }),
  });

  assert.equal(result.ok, true, "result should be ok even though agent won");
  // Store was NOT updated by us — agent's value stays
  assert.equal(stored, prev, "our setPhases was never called; agent value unchanged");
});

// ─── toggleTaskStatus ─────────────────────────────────────────────────────────

test("toggleTaskStatus: pending → completed", () => {
  const phases = [{ name: "P", tasks: [{ content: "T", status: "pending" }] }];
  const result = toggleTaskStatus(phases, 0, 0);
  assert.equal(result[0].tasks[0].status, "completed");
});

test("toggleTaskStatus: completed → pending", () => {
  const phases = [{ name: "P", tasks: [{ content: "T", status: "completed" }] }];
  const result = toggleTaskStatus(phases, 0, 0);
  assert.equal(result[0].tasks[0].status, "pending");
});

test("toggleTaskStatus: does not mutate original", () => {
  const phases = [{ name: "P", tasks: [{ content: "T", status: "pending" }] }];
  const result = toggleTaskStatus(phases, 0, 0);
  assert.equal(phases[0].tasks[0].status, "pending", "original unchanged");
  assert.notEqual(result, phases);
});

test("toggleTaskStatus: only affects targeted task", () => {
  const phases = [{
    name: "P",
    tasks: [
      { content: "A", status: "pending" },
      { content: "B", status: "in_progress" },
    ],
  }];
  const result = toggleTaskStatus(phases, 0, 0);
  assert.equal(result[0].tasks[0].status, "completed");
  assert.equal(result[0].tasks[1].status, "in_progress", "untouched task unchanged");
});
