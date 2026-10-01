/**
 * session-data.test.mjs — boundary tests for feat/session-data
 *
 * Covers:
 *   1. Todo-phase reduction from tool_end result (shape expected by events-slice)
 *   2. export_html filename sanitisation (safe chars only, expected by omp-ipc handler)
 *   3. Session tree: user-message branch points for omp `branch`
 */
import assert from "node:assert/strict";
import test from "node:test";
import { branchPointPreview, buildFlatTree, isBranchPoint } from "../src/features/work-panel/session-tree.ts";

// ──────────────────────────────────────────────────────────────────────────────
// 1. Todo phase extraction — mirrors the logic in events-slice.ts
// ──────────────────────────────────────────────────────────────────────────────

function extractTodoPhasesFromResult(result) {
  const details =
    result &&
    typeof result === "object" &&
    "details" in result
      ? result.details
      : undefined;
  const phases =
    details && typeof details === "object" && "phases" in details
      ? details.phases
      : undefined;
  return Array.isArray(phases) ? phases : null;
}

test("extractTodoPhasesFromResult: returns phases array when present", () => {
  const result = {
    details: {
      phases: [
        { name: "Phase 1", tasks: [{ id: "t1", content: "do thing", status: "pending" }] },
      ],
    },
  };
  const phases = extractTodoPhasesFromResult(result);
  assert.ok(phases !== null);
  assert.equal(phases.length, 1);
  assert.equal(phases[0].name, "Phase 1");
});

test("extractTodoPhasesFromResult: returns null when result is undefined", () => {
  assert.equal(extractTodoPhasesFromResult(undefined), null);
});

test("extractTodoPhasesFromResult: returns null when details missing", () => {
  assert.equal(extractTodoPhasesFromResult({ text: "done" }), null);
});

test("extractTodoPhasesFromResult: returns null when phases is not an array", () => {
  assert.equal(
    extractTodoPhasesFromResult({ details: { phases: "not-an-array" } }),
    null,
  );
});

test("extractTodoPhasesFromResult: returns empty array for empty phases", () => {
  const result = { details: { phases: [] } };
  const phases = extractTodoPhasesFromResult(result);
  assert.ok(Array.isArray(phases));
  assert.equal(phases.length, 0);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Export filename sanitisation — mirrors omp-ipc.ts safe filename logic
// ──────────────────────────────────────────────────────────────────────────────

/** Same logic as in omp-ipc.ts handleExportHtml */
function safeExportFilename(title) {
  return (title ?? "transcript")
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 64) || "transcript";
}

test("safeExportFilename: strips path separators and special chars", () => {
  const unsafe = "My Chat / Session <script>alert(1)</script>";
  const safe = safeExportFilename(unsafe);
  assert.ok(!/[/<>]/.test(safe), `Should have no special chars: ${safe}`);
  assert.ok(safe.length > 0);
});

test("safeExportFilename: preserves alphanumeric and hyphens", () => {
  const name = "Session 2026-10-02 notes";
  const safe = safeExportFilename(name);
  assert.equal(safe, "Session-2026-10-02-notes");
});

test("safeExportFilename: falls back to 'transcript' for empty/null", () => {
  assert.equal(safeExportFilename(""), "transcript");
  assert.equal(safeExportFilename(null), "transcript");
  assert.equal(safeExportFilename("!!!"), "transcript");
});

test("safeExportFilename: truncates long titles to 64 chars", () => {
  const long = "a".repeat(200);
  assert.ok(safeExportFilename(long).length <= 64);
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Session tree — only user messages are branch points (omp `branch` rejects others)
// ──────────────────────────────────────────────────────────────────────────────

const user = (id, parentId, content) => ({ id, parentId, type: "message", message: { role: "user", content } });
const asst = (id, parentId) => ({ id, parentId, type: "message", message: { role: "assistant", content: [] } });
const ENTRIES = [
  user("u1", null, "first"),
  asst("a1", "u1"),
  { id: "mc", parentId: "a1", type: "model_change" },
  user("u2", "mc", [{ type: "text", text: "second\nmore" }]),
  user("u3", "a1", "fork"),
];

test("buildFlatTree: only user-message entries become nodes (branch-able ids)", () => {
  const ids = buildFlatTree(ENTRIES).map((n) => n.entry.id);
  assert.deepEqual(ids, ["u1", "u2", "u3"]);
  assert.ok(ids.every((id) => isBranchPoint(ENTRIES.find((e) => e.id === id))));
});

test("buildFlatTree: depth counts branch-point ancestors; non-user entries pass through", () => {
  const depth = Object.fromEntries(buildFlatTree(ENTRIES).map((n) => [n.entry.id, n.depth]));
  assert.deepEqual(depth, { u1: 0, u2: 1, u3: 1 });
});

test("buildFlatTree: no user messages yields no nodes", () => {
  assert.deepEqual(buildFlatTree([asst("a", null), { id: "c", parentId: "a", type: "compaction" }]), []);
});

test("isBranchPoint: assistant messages and non-message entries are rejected", () => {
  assert.equal(isBranchPoint(asst("a", null)), false);
  assert.equal(isBranchPoint({ id: "x", parentId: null, type: "custom_message", message: { role: "user" } }), false);
});

test("branchPointPreview: first text line, truncated at 80, id fallback", () => {
  assert.equal(branchPointPreview(ENTRIES[3]), "second");
  assert.equal(branchPointPreview(user("u", null, "x".repeat(100))), `${"x".repeat(80)}…`);
  assert.equal(branchPointPreview(user("abcdefghij", null, [{ type: "image" }])), "abcdefgh");
});
