/**
 * session-data.test.mjs — boundary tests for feat/session-data
 *
 * Covers:
 *   1. Todo-phase reduction from tool_end result (shape expected by events-slice)
 *   2. export_html filename sanitisation (safe chars only, expected by omp-ipc handler)
 *   3. buildFlatTree depth/leaf/active invariants for OmpSessionTreeTab
 */
import assert from "node:assert/strict";
import test from "node:test";

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
// 3. buildFlatTree invariants — pure tree-building logic from OmpSessionTreeTab
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Simplified version of buildFlatTree from OmpSessionTreeTab.tsx (same logic,
 * no React imports needed — tests the pure algorithm).
 */
function buildFlatTree(entries, leafId) {
  if (entries.length === 0) return [];
  const children = new Map();
  for (const entry of entries) {
    const pid = entry.parentId ?? null;
    const list = children.get(pid);
    if (list) list.push(entry);
    else children.set(pid, [entry]);
  }
  const isVisible = (e) => e.type === "message" && (e.role === "assistant" || !e.role);
  const visibleIds = new Set(entries.filter(isVisible).map((e) => e.id));
  const result = [];
  const walk = (parentId, depth) => {
    const kids = children.get(parentId) ?? [];
    for (const entry of kids) {
      if (visibleIds.has(entry.id)) {
        const isLeaf = !(children.get(entry.id) ?? []).some((c) => visibleIds.has(c.id));
        result.push({ entry, depth, isLeaf, isActive: entry.id === leafId });
        walk(entry.id, depth + 1);
      } else {
        walk(entry.id, depth);
      }
    }
  };
  walk(null, 0);
  if (result.length === 0) {
    const childIds = new Set(entries.filter((e) => e.parentId !== null).map((e) => e.id));
    for (const entry of entries) {
      result.push({ entry, depth: 0, isLeaf: !childIds.has(entry.id), isActive: entry.id === leafId });
    }
  }
  return result;
}

const ENTRIES = [
  { id: "a", parentId: null, type: "message", role: "assistant", label: "msg-a" },
  { id: "b", parentId: "a",  type: "message", role: "assistant", label: "msg-b" },
  { id: "c", parentId: "a",  type: "message", role: "assistant", label: "msg-c" },
  { id: "d", parentId: "b",  type: "message", role: "assistant", label: "msg-d" },
  // A structural entry that should be skipped (passthrough).
  { id: "x", parentId: "b", type: "model_change", role: undefined, label: "mchg" },
];

test("buildFlatTree: returns empty for empty input", () => {
  assert.deepEqual(buildFlatTree([], null), []);
});

test("buildFlatTree: root has depth 0", () => {
  const nodes = buildFlatTree(ENTRIES, null);
  const root = nodes.find((n) => n.entry.id === "a");
  assert.ok(root, "root node 'a' should be present");
  assert.equal(root.depth, 0);
});

test("buildFlatTree: child depth is parent depth + 1 for visible entries", () => {
  const nodes = buildFlatTree(ENTRIES, null);
  const b = nodes.find((n) => n.entry.id === "b");
  const d = nodes.find((n) => n.entry.id === "d");
  assert.ok(b && d, "b and d must be present");
  assert.equal(d.depth, b.depth + 1);
});

test("buildFlatTree: structural entries (model_change) are excluded", () => {
  const nodes = buildFlatTree(ENTRIES, null);
  assert.ok(!nodes.some((n) => n.entry.id === "x"), "structural node 'x' should be excluded");
});

test("buildFlatTree: leaf nodes have isLeaf=true, non-leaves false", () => {
  const nodes = buildFlatTree(ENTRIES, null);
  // 'b' has a visible child 'd', so not a leaf
  const b = nodes.find((n) => n.entry.id === "b");
  // 'd' has no visible children, so it's a leaf
  const d = nodes.find((n) => n.entry.id === "d");
  assert.equal(b.isLeaf, false);
  assert.equal(d.isLeaf, true);
});

test("buildFlatTree: active node identified by leafId", () => {
  const nodes = buildFlatTree(ENTRIES, "c");
  const c = nodes.find((n) => n.entry.id === "c");
  const b = nodes.find((n) => n.entry.id === "b");
  assert.equal(c.isActive, true);
  assert.equal(b.isActive, false);
});

test("buildFlatTree: fallback shows all entries at depth 0 when no visible entries", () => {
  const noAssistant = [
    { id: "p", parentId: null, type: "user_message", role: "user", label: "um" },
    { id: "q", parentId: "p",  type: "user_message", role: "user", label: "um2" },
  ];
  const nodes = buildFlatTree(noAssistant, null);
  assert.equal(nodes.length, 2);
  assert.ok(nodes.every((n) => n.depth === 0), "all at depth 0 in fallback");
});
