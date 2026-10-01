/**
 * Boundary tests for the omp live subagent reducer (feat/subagents-view).
 *
 * Covers:
 *   - event ordering: started then ended yields correct status
 *   - unknown id: ended without started is dropped (no ghost entries)
 *   - completion after snapshot: if get_subagents returns running then ended arrives, status updates
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { ompSubagentsReducer } = await import("../src/lib/omp-subagents.ts");

const EMPTY = new Map();

// ─── event ordering ───────────────────────────────────────────────────────────

test("started then ended produces completed entry", () => {
  let state = ompSubagentsReducer(EMPTY, {
    type: "started",
    id: "sa1",
    agent: "frappe-dev",
    task: "Build the form",
    startedAt: 1000,
  });
  assert.equal(state.get("sa1")?.status, "running");
  assert.equal(state.get("sa1")?.agent, "frappe-dev");

  state = ompSubagentsReducer(state, {
    type: "ended",
    id: "sa1",
    status: "completed",
  });
  assert.equal(state.get("sa1")?.status, "completed");
  assert.equal(state.size, 1, "exactly one entry after start+end");
});

test("started then ended with failed status", () => {
  let state = ompSubagentsReducer(EMPTY, { type: "started", id: "sa2", agent: "scout", startedAt: 2000 });
  state = ompSubagentsReducer(state, { type: "ended", id: "sa2", status: "failed" });
  assert.equal(state.get("sa2")?.status, "failed");
});

test("duplicate ended does not change status (idempotent)", () => {
  let state = ompSubagentsReducer(EMPTY, { type: "started", id: "sa3", agent: "task", startedAt: 3000 });
  state = ompSubagentsReducer(state, { type: "ended", id: "sa3", status: "completed" });
  const beforeSize = state.size;
  state = ompSubagentsReducer(state, { type: "ended", id: "sa3", status: "failed" });
  // Already completed — second ended is a no-op.
  assert.equal(state.get("sa3")?.status, "completed");
  assert.equal(state.size, beforeSize);
});

// ─── unknown id ───────────────────────────────────────────────────────────────

test("ended for unknown id returns same state reference (no ghost entry)", () => {
  const state = ompSubagentsReducer(EMPTY, { type: "ended", id: "ghost", status: "completed" });
  assert.equal(state.size, 0, "no ghost entry created");
  // Same reference: the reducer short-circuited.
  assert.strictEqual(state, EMPTY);
});

test("ended for id from a different lifecycle not in state is dropped", () => {
  const initial = ompSubagentsReducer(EMPTY, { type: "started", id: "sa-a", agent: "x", startedAt: 0 });
  const after = ompSubagentsReducer(initial, { type: "ended", id: "sa-b", status: "completed" });
  assert.equal(after.size, 1, "sa-b was not added");
  assert.ok(!after.has("sa-b"), "ghost id not present");
});

// ─── completion after snapshot ────────────────────────────────────────────────

test("snapshot running then ended → status updated to completed", () => {
  let state = ompSubagentsReducer(EMPTY, {
    type: "snapshot",
    subagents: [{ id: "sa5", index: 0, agent: "frappe-scout", status: "running", lastUpdate: 5000 }],
  });
  assert.equal(state.get("sa5")?.status, "running");

  state = ompSubagentsReducer(state, { type: "ended", id: "sa5", status: "completed" });
  assert.equal(state.get("sa5")?.status, "completed");
});

test("snapshot terminal then ended → no status change (terminal wins)", () => {
  let state = ompSubagentsReducer(EMPTY, {
    type: "snapshot",
    subagents: [{ id: "sa6", index: 0, agent: "frappe-reviewer", status: "completed", lastUpdate: 6000 }],
  });
  // Already completed in snapshot; an ended event must not re-apply.
  state = ompSubagentsReducer(state, { type: "ended", id: "sa6", status: "failed" });
  assert.equal(state.get("sa6")?.status, "completed", "terminal status preserved");
});

test("snapshot merges with existing started entries without overwriting running", () => {
  let state = ompSubagentsReducer(EMPTY, {
    type: "started",
    id: "sa7",
    agent: "sonic",
    startedAt: 7000,
  });
  // Snapshot sees it as running too — should not duplicate or reset.
  state = ompSubagentsReducer(state, {
    type: "snapshot",
    subagents: [{ id: "sa7", index: 0, agent: "sonic", status: "running", lastUpdate: 7100 }],
  });
  assert.equal(state.size, 1, "no duplicate");
  assert.equal(state.get("sa7")?.status, "running");
});

test("snapshot adds new entries not yet seen in events", () => {
  const state = ompSubagentsReducer(EMPTY, {
    type: "snapshot",
    subagents: [
      { id: "sa8", index: 0, agent: "memory-extras", status: "completed", lastUpdate: 8000 },
      { id: "sa9", index: 1, agent: "frappe-dev", status: "running", lastUpdate: 8500 },
    ],
  });
  assert.equal(state.size, 2);
  assert.equal(state.get("sa8")?.status, "completed");
  assert.equal(state.get("sa9")?.status, "running");
});

// ─── unknown status normalization ─────────────────────────────────────────────

test("unknown status string from ended is normalized to completed", () => {
  let state = ompSubagentsReducer(EMPTY, { type: "started", id: "sa10", agent: "x", startedAt: 0 });
  state = ompSubagentsReducer(state, { type: "ended", id: "sa10", status: "unknown_future_status" });
  assert.equal(state.get("sa10")?.status, "completed");
});
