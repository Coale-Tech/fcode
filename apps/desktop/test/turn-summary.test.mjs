/**
 * Tests for turn-summary.ts (I.3)
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { summarizeTurn } = await import(
  "../src/features/chat/transcript/turn-summary.ts"
);

function toolItem(toolName, toolStatus = "done") {
  return { kind: "tool", message: { toolName, toolStatus } };
}

function thinkingItem() {
  return { kind: "thinking", message: { content: "..." } };
}

function hostedSearchItem() {
  return { kind: "hostedSearch", message: { toolName: "HostedSearch" }, round: { status: "done" } };
}

test("summarizeTurn: empty items returns all-zero counts", () => {
  const s = summarizeTurn([]);
  assert.equal(s.edited, 0);
  assert.equal(s.ran, 0);
  assert.equal(s.read, 0);
  assert.equal(s.fetched, 0);
  assert.equal(s.searched, 0);
});

test("summarizeTurn: thinking-only turn returns all-zero counts", () => {
  const s = summarizeTurn([thinkingItem(), thinkingItem()]);
  assert.equal(s.edited, 0);
  assert.equal(s.ran, 0);
  assert.equal(s.read, 0);
});

test("summarizeTurn: counts edit tools", () => {
  const items = [
    toolItem("Edit"),
    toolItem("write"),
    toolItem("MultiEdit"),
  ];
  const s = summarizeTurn(items);
  assert.equal(s.edited, 3);
  assert.equal(s.ran, 0);
});

test("summarizeTurn: counts run tools", () => {
  const items = [toolItem("Bash"), toolItem("Shell"), toolItem("RunCommand")];
  const s = summarizeTurn(items);
  assert.equal(s.ran, 3);
  assert.equal(s.edited, 0);
});

test("summarizeTurn: counts read tools", () => {
  const items = [toolItem("ReadFile"), toolItem("List"), toolItem("read")];
  const s = summarizeTurn(items);
  assert.equal(s.read, 3);
});

test("summarizeTurn: counts fetch tools", () => {
  const items = [toolItem("Fetch"), toolItem("web_fetch")];
  const s = summarizeTurn(items);
  assert.equal(s.fetched, 2);
});

test("summarizeTurn: counts search + hosted search", () => {
  const items = [toolItem("grep"), toolItem("Search"), hostedSearchItem()];
  const s = summarizeTurn(items);
  assert.equal(s.searched, 3);
});

test("summarizeTurn: mixed sequence counts each bucket independently", () => {
  const items = [
    toolItem("Edit"),
    toolItem("Bash"),
    toolItem("ReadFile"),
    toolItem("Edit"),
    toolItem("Fetch"),
    thinkingItem(),
  ];
  const s = summarizeTurn(items);
  assert.equal(s.edited, 2);
  assert.equal(s.ran, 1);
  assert.equal(s.read, 1);
  assert.equal(s.fetched, 1);
  assert.equal(s.searched, 0);
});

test("summarizeTurn: failed tool (isError) is still counted", () => {
  const items = [
    { kind: "tool", message: { toolName: "Edit", toolStatus: "error", isError: true } },
  ];
  const s = summarizeTurn(items);
  assert.equal(s.edited, 1);
});
