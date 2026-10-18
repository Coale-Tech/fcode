import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { pickAgent } = await import("../electron/main/runtime/kanban-router.ts");

const agent = (name, description = "", shadowed) => ({ name, description, ...(shadowed ? { shadowed } : {}) });
const card = (title, body = "") => ({ title, body });
const none = new Map();

test("a security-review card picks the security agent over an unrelated scout", () => {
  const agents = [
    agent("scout", "Fast read-only scout returning compressed context for handoff"),
    agent("security-reviewer", "Read-only security specialist for evidence-backed vulnerability discovery"),
  ];
  assert.equal(pickAgent(card("Review this diff for security issues"), agents, none), "security-reviewer");
});

test("a card with no overlap is left to the generic worker", () => {
  assert.equal(pickAgent(card("aaa bbb"), [agent("frappe-dev", "writes frappe code")], none), undefined);
});

test("sentence punctuation does not defeat a match", () => {
  // "security." must still match the "security" name token.
  assert.equal(pickAgent(card("Audit security."), [agent("security-reviewer", "")], none), "security-reviewer");
});

test("a shadowed duplicate is never returned", () => {
  const agents = [
    agent("security-audit", "security audit", true), // would win on score if it counted
    agent("audit-bot", "security audit"),
  ];
  assert.equal(pickAgent(card("security audit"), agents, none), "audit-bot");
});

test("the generic task agent is never returned", () => {
  const agents = [agent("task", "security audit review")]; // 3 description hits — would clear the bar
  assert.equal(pickAgent(card("security audit review"), agents, none), undefined);
});

test("an agent with a failing record loses to a lower-scoring agent with a clean one", () => {
  const agents = [
    agent("alpha-security", "audit helper"), // raw 4
    agent("beta-security", "helper"), // raw 3
  ];
  const outcomes = new Map([
    ["alpha-security", { done: 0, failed: 3 }], // × 0.5 → 2
    ["beta-security", { done: 3, failed: 0 }], // × 1.5 → 4.5
  ]);
  assert.equal(pickAgent(card("security audit"), agents, outcomes), "beta-security");
});

test("a record below the evidence floor does not move the score", () => {
  const agents = [agent("alpha-security", "audit helper"), agent("beta-security", "helper")];
  const outcomes = new Map([["alpha-security", { done: 0, failed: 2 }]]); // only 2 runs → neutral
  assert.equal(pickAgent(card("security audit"), agents, outcomes), "alpha-security");
});

test("identical scores resolve by name", () => {
  const agents = [agent("bbb-security"), agent("aaa-security")];
  assert.equal(pickAgent(card("security"), agents, none), "aaa-security");
});
