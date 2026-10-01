/**
 * Boundary tests for session-tree pure helpers (feat/session-data).
 *
 * Covers buildFlatTree (tree construction, depth tracking, non-user filtering)
 * and branchPointPreview (content extraction and truncation).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { buildFlatTree, branchPointPreview, isBranchPoint } = await import(
  "../src/features/work-panel/session-tree.ts"
);

// ─── helpers ──────────────────────────────────────────────────────────────────

const userMsg = (id, parentId = null, text = "hello") => ({
  id,
  parentId,
  type: "message",
  message: { role: "user", content: text },
});

const assistMsg = (id, parentId = null) => ({
  id,
  parentId,
  type: "message",
  message: { role: "assistant", content: "response" },
});

const toolEntry = (id, parentId = null) => ({
  id,
  parentId,
  type: "tool_use",
});

// ─── isBranchPoint ────────────────────────────────────────────────────────────

test("user message is a branch point", () => {
  assert.equal(isBranchPoint(userMsg("a")), true);
});

test("assistant message is not a branch point", () => {
  assert.equal(isBranchPoint(assistMsg("a")), false);
});

test("tool entry is not a branch point", () => {
  assert.equal(isBranchPoint(toolEntry("a")), false);
});

// ─── buildFlatTree ────────────────────────────────────────────────────────────

test("empty entries → empty tree", () => {
  assert.deepEqual(buildFlatTree([]), []);
});

test("single user message at root → depth 0", () => {
  const tree = buildFlatTree([userMsg("a")]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].entry.id, "a");
  assert.equal(tree[0].depth, 0);
});

test("assistant messages are filtered out", () => {
  const tree = buildFlatTree([assistMsg("a"), userMsg("b", "a")]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].entry.id, "b");
});

test("tool entries are filtered out", () => {
  const tree = buildFlatTree([userMsg("a"), toolEntry("t", "a"), userMsg("b", "t")]);
  // "b" has depth 1 (one user-message ancestor: "a")
  const ids = tree.map((n) => n.entry.id);
  assert.ok(!ids.includes("t"), "tool entry must not appear");
});

test("linear chain increments depth", () => {
  const entries = [userMsg("a"), userMsg("b", "a"), userMsg("c", "b")];
  const tree = buildFlatTree(entries);
  assert.equal(tree.length, 3);
  assert.equal(tree[0].depth, 0);
  assert.equal(tree[1].depth, 1);
  assert.equal(tree[2].depth, 2);
});

test("branching: sibling user messages share parent depth", () => {
  // a (root) → b and c both children of a
  const entries = [userMsg("a"), userMsg("b", "a"), userMsg("c", "a")];
  const tree = buildFlatTree(entries);
  const depths = Object.fromEntries(tree.map((n) => [n.entry.id, n.depth]));
  assert.equal(depths["a"], 0);
  assert.equal(depths["b"], 1);
  assert.equal(depths["c"], 1);
});

test("non-branch-point pass-through does not increase depth", () => {
  // a (user) → t (tool) → b (user): b should be depth 1, not 2
  const entries = [userMsg("a"), toolEntry("t", "a"), userMsg("b", "t")];
  const tree = buildFlatTree(entries);
  const bNode = tree.find((n) => n.entry.id === "b");
  assert.equal(bNode.depth, 1);
});

// ─── branchPointPreview ───────────────────────────────────────────────────────

test("string content → returns first line", () => {
  const entry = userMsg("a", null, "hello world\nsecond line");
  assert.equal(branchPointPreview(entry), "hello world");
});

test("string content > 80 chars → truncated with ellipsis", () => {
  const long = "x".repeat(90);
  const entry = userMsg("a", null, long);
  const preview = branchPointPreview(entry);
  assert.equal(preview.length, 81); // 80 + "…"
  assert.ok(preview.endsWith("…"));
});

test("block content array → extracts first text block", () => {
  const entry = {
    id: "a", parentId: null, type: "message",
    message: { role: "user", content: [{ type: "text", text: "block text" }] },
  };
  assert.equal(branchPointPreview(entry), "block text");
});

test("empty content → falls back to id slice", () => {
  const entry = userMsg("abcdef12", null, "");
  const preview = branchPointPreview(entry);
  assert.equal(preview, "abcdef12".slice(0, 8));
});

test("exactly 80 chars → no ellipsis", () => {
  const exact = "y".repeat(80);
  const entry = userMsg("a", null, exact);
  assert.equal(branchPointPreview(entry), exact);
});
