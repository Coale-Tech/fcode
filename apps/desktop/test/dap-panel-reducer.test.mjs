/**
 * Boundary tests for the DAP session panel reducer (feat/dap-breakpoints).
 *
 * Covers:
 *   - stopped event updates session status and stores frames/variables
 *   - continued/running event updates status back to running
 *   - terminated session is kept but marked terminated
 *   - breakpoint add/remove/verify-failed (optimistic + reconciliation)
 *   - debug_tool_start stores pending call; tool_result reconciles breakpoints
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { dapPanelReducer, EMPTY_DAP_STATE, bpKey } = await import(
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

// ─── breakpoint: optimistic add ───────────────────────────────────────────────

test("bp_add_optimistic creates pending breakpoint", () => {
  const next = dapPanelReducer(EMPTY_DAP_STATE, {
    type: "bp_add_optimistic",
    file: "/app/main.py",
    line: 42,
  });
  const bp = next.breakpoints.get(bpKey("/app/main.py", 42));
  assert.ok(bp, "breakpoint created");
  assert.equal(bp.pending, true);
  assert.equal(bp.verified, false);
  assert.equal(bp.failed, false);
  assert.equal(bp.file, "/app/main.py");
  assert.equal(bp.line, 42);
});

test("bp_add_optimistic with condition stores condition", () => {
  const next = dapPanelReducer(EMPTY_DAP_STATE, {
    type: "bp_add_optimistic",
    file: "/app/main.py",
    line: 10,
    condition: "x > 5",
  });
  assert.equal(next.breakpoints.get(bpKey("/app/main.py", 10))?.condition, "x > 5");
});

// ─── breakpoint: optimistic remove ────────────────────────────────────────────

test("bp_remove_optimistic deletes existing breakpoint", () => {
  const withBp = dapPanelReducer(EMPTY_DAP_STATE, {
    type: "bp_add_optimistic",
    file: "/app/main.py",
    line: 42,
  });
  const removed = dapPanelReducer(withBp, {
    type: "bp_remove_optimistic",
    file: "/app/main.py",
    line: 42,
  });
  assert.equal(removed.breakpoints.has(bpKey("/app/main.py", 42)), false);
});

test("bp_remove_optimistic on nonexistent key returns same reference", () => {
  const same = dapPanelReducer(EMPTY_DAP_STATE, {
    type: "bp_remove_optimistic",
    file: "/app/main.py",
    line: 99,
  });
  assert.equal(same, EMPTY_DAP_STATE);
});

// ─── breakpoint: tool_result reconciliation ───────────────────────────────────

test("set_breakpoint tool_result verifies optimistic bp", () => {
  // 1. optimistic add
  const s1 = dapPanelReducer(EMPTY_DAP_STATE, {
    type: "bp_add_optimistic", file: "/app/main.py", line: 42,
  });
  // 2. track the in-flight call
  const s2 = dapPanelReducer(s1, {
    type: "debug_tool_start", toolCallId: "call-1",
    action: "set_breakpoint", file: "/app/main.py", line: 42,
  });
  assert.ok(s2.pendingCalls.has("call-1"), "pending call stored");
  // 3. tool result arrives with verified breakpoint
  const s3 = dapPanelReducer(s2, {
    type: "tool_result",
    toolCallId: "call-1",
    isError: false,
    details: {
      action: "set_breakpoint",
      breakpoints: [{ line: 42, verified: true }],
    },
  });
  const bp = s3.breakpoints.get(bpKey("/app/main.py", 42));
  assert.ok(bp, "breakpoint present");
  assert.equal(bp.verified, true);
  assert.equal(bp.pending, false);
  assert.equal(bp.failed, false);
  assert.equal(s3.pendingCalls.has("call-1"), false, "pending call cleared");
});

test("set_breakpoint tool_result marks bp failed when verified=false", () => {
  const s1 = dapPanelReducer(EMPTY_DAP_STATE, {
    type: "bp_add_optimistic", file: "/app/main.py", line: 99,
  });
  const s2 = dapPanelReducer(s1, {
    type: "debug_tool_start", toolCallId: "call-2",
    action: "set_breakpoint", file: "/app/main.py", line: 99,
  });
  const s3 = dapPanelReducer(s2, {
    type: "tool_result",
    toolCallId: "call-2",
    isError: false,
    details: {
      action: "set_breakpoint",
      breakpoints: [{ line: 99, verified: false, message: "No code at line" }],
    },
  });
  const bp = s3.breakpoints.get(bpKey("/app/main.py", 99));
  assert.ok(bp, "breakpoint present");
  assert.equal(bp.verified, false);
  assert.equal(bp.failed, true);
  assert.equal(bp.pending, false);
});

test("set_breakpoint tool_result with isError reverts optimistic add", () => {
  const s1 = dapPanelReducer(EMPTY_DAP_STATE, {
    type: "bp_add_optimistic", file: "/app/main.py", line: 5,
  });
  const s2 = dapPanelReducer(s1, {
    type: "debug_tool_start", toolCallId: "call-3",
    action: "set_breakpoint", file: "/app/main.py", line: 5,
  });
  const s3 = dapPanelReducer(s2, {
    type: "tool_result",
    toolCallId: "call-3",
    isError: true,
    details: { action: "set_breakpoint" },
  });
  assert.equal(s3.breakpoints.has(bpKey("/app/main.py", 5)), false, "reverted on error");
  assert.equal(s3.pendingCalls.has("call-3"), false, "pending call cleared on error");
});

test("remove_breakpoint tool_result updates file bp list", () => {
  // start with two bps
  const s1 = dapPanelReducer(EMPTY_DAP_STATE, { type: "bp_add_optimistic", file: "/app/main.py", line: 10 });
  const s2 = dapPanelReducer(s1,              { type: "bp_add_optimistic", file: "/app/main.py", line: 20 });
  // track remove of line 10
  const s3 = dapPanelReducer(s2, {
    type: "debug_tool_start", toolCallId: "call-4",
    action: "remove_breakpoint", file: "/app/main.py", line: 10,
  });
  // optimistic remove
  const s4 = dapPanelReducer(s3, { type: "bp_remove_optimistic", file: "/app/main.py", line: 10 });
  // tool result: only line 20 remains (verified)
  const s5 = dapPanelReducer(s4, {
    type: "tool_result",
    toolCallId: "call-4",
    isError: false,
    details: {
      action: "remove_breakpoint",
      breakpoints: [{ line: 20, verified: true }],
    },
  });
  assert.equal(s5.breakpoints.has(bpKey("/app/main.py", 10)), false, "removed bp gone");
  assert.ok(s5.breakpoints.has(bpKey("/app/main.py", 20)), "remaining bp present");
  assert.equal(s5.breakpoints.get(bpKey("/app/main.py", 20))?.verified, true);
});
