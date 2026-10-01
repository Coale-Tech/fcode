/**
 * Boundary tests for the DAP session panel reducer (feat/dap-panel).
 *
 * Covers:
 *   - stopped event updates session status and stores frames/variables
 *   - continued/running event updates status back to running
 *   - terminated session is kept but marked terminated
 *   - unknown session in snapshot is created correctly
 *   - unrecognised action type falls back safely (unknown sessions)
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { dapPanelReducer, EMPTY_DAP_STATE } = await import(
  "../src/lib/dap-panel.ts"
);

const SESSION_A = {
  id: "sess-1",
  adapter: "debugpy",
  program: "/app/main.py",
  status: "running",
  breakpointCount: 2,
  functionBreakpointCount: 0,
};

// ─── stopped event ────────────────────────────────────────────────────────────

test("stopped event creates session with stopped status", () => {
  const next = dapPanelReducer(EMPTY_DAP_STATE, {
    type: "tool_result",
    details: {
      snapshot: { ...SESSION_A, status: "stopped", stopReason: "breakpoint" },
    },
  });
  const s = next.sessions.get("sess-1");
  assert.ok(s, "session created");
  assert.equal(s.status, "stopped");
  assert.equal(s.stopReason, "breakpoint");
  assert.equal(s.adapter, "debugpy");
});

test("stopped event with stackFrames stores frames", () => {
  const next = dapPanelReducer(EMPTY_DAP_STATE, {
    type: "tool_result",
    details: {
      snapshot: { ...SESSION_A, status: "stopped" },
      stackFrames: [
        { id: 1, name: "main", source: { path: "/app/main.py" }, line: 42 },
        { id: 2, name: "run", source: { name: "runner.py" }, line: 10 },
      ],
    },
  });
  assert.equal(next.frames.length, 2);
  assert.equal(next.frames[0].name, "main");
  assert.equal(next.frames[0].source, "/app/main.py");
  assert.equal(next.frames[0].line, 42);
  assert.equal(next.frames[1].source, "runner.py");
});

test("stopped event with variables stores variables", () => {
  const next = dapPanelReducer(EMPTY_DAP_STATE, {
    type: "tool_result",
    details: {
      snapshot: { ...SESSION_A, status: "stopped" },
      variables: [
        { name: "x", value: "42", type: "int" },
        { name: "msg", value: '"hello"', type: "str" },
      ],
    },
  });
  assert.equal(next.variables.length, 2);
  assert.equal(next.variables[0].name, "x");
  assert.equal(next.variables[0].type, "int");
  assert.equal(next.variables[1].value, '"hello"');
});

// ─── continued / running ──────────────────────────────────────────────────────

test("continued event updates status to running and clears stopReason", () => {
  const withStopped = dapPanelReducer(EMPTY_DAP_STATE, {
    type: "tool_result",
    details: {
      snapshot: { ...SESSION_A, status: "stopped", stopReason: "breakpoint" },
    },
  });
  const next = dapPanelReducer(withStopped, {
    type: "tool_result",
    details: {
      snapshot: { ...SESSION_A, status: "running" },
    },
  });
  const s = next.sessions.get("sess-1");
  assert.equal(s?.status, "running");
  assert.equal(s?.stopReason, undefined);
});

// ─── terminated ───────────────────────────────────────────────────────────────

test("terminated snapshot keeps session but marks it terminated", () => {
  const withRunning = dapPanelReducer(EMPTY_DAP_STATE, {
    type: "tool_result",
    details: { snapshot: SESSION_A },
  });
  const next = dapPanelReducer(withRunning, {
    type: "tool_result",
    details: { snapshot: { ...SESSION_A, status: "terminated" } },
  });
  const s = next.sessions.get("sess-1");
  assert.ok(s, "session still present");
  assert.equal(s.status, "terminated");
});

// ─── sessions list ────────────────────────────────────────────────────────────

test("sessions array creates multiple session entries", () => {
  const next = dapPanelReducer(EMPTY_DAP_STATE, {
    type: "tool_result",
    details: {
      sessions: [
        SESSION_A,
        { id: "sess-2", adapter: "lldb-dap", status: "running", breakpointCount: 0, functionBreakpointCount: 0 },
      ],
    },
  });
  assert.equal(next.sessions.size, 2);
  assert.ok(next.sessions.has("sess-1"));
  assert.ok(next.sessions.has("sess-2"));
});

// ─── unknown / invalid session data ──────────────────────────────────────────

test("snapshot with no id is ignored", () => {
  const next = dapPanelReducer(EMPTY_DAP_STATE, {
    type: "tool_result",
    details: { snapshot: { adapter: "debugpy", status: "running" } },
  });
  assert.equal(next.sessions.size, 0);
  assert.equal(next, EMPTY_DAP_STATE, "same reference when nothing changed");
});

test("unknown status string is normalised to running", () => {
  const next = dapPanelReducer(EMPTY_DAP_STATE, {
    type: "tool_result",
    details: { snapshot: { id: "sess-x", adapter: "debugpy", status: "zombie", breakpointCount: 0, functionBreakpointCount: 0 } },
  });
  assert.equal(next.sessions.get("sess-x")?.status, "running");
});

// ─── clear ────────────────────────────────────────────────────────────────────

test("clear action resets to EMPTY_DAP_STATE reference", () => {
  const withData = dapPanelReducer(EMPTY_DAP_STATE, {
    type: "tool_result",
    details: { snapshot: SESSION_A },
  });
  const cleared = dapPanelReducer(withData, { type: "clear" });
  assert.equal(cleared, EMPTY_DAP_STATE);
});

// ─── no-op returns same reference ────────────────────────────────────────────

test("tool_result with no recognisable details returns same state", () => {
  const state = dapPanelReducer(EMPTY_DAP_STATE, {
    type: "tool_result",
    details: { action: "sessions", success: true },
  });
  assert.equal(state, EMPTY_DAP_STATE, "same reference when nothing to update");
});
