/**
 * Behavioural tests for the pure workspace-bar-state formatter.
 * No build needed: plain Node TS-stripping runs these.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { formatWorkspaceBarState } from "../src/lib/workspace-bar-state.ts";

test("no bench → empty state", () => {
  assert.deepEqual(
    formatWorkspaceBarState({ benchPath: null, site: null, status: "stopped" }),
    { kind: "empty" },
  );
});

test("bench stopped → stopped state with benchName", () => {
  const result = formatWorkspaceBarState({
    benchPath: "/home/user/frappe-bench",
    site: "site1.localhost",
    status: "stopped",
  });
  assert.equal(result.kind, "stopped");
  assert.equal(result.benchName, "frappe-bench");
  assert.equal(result.site, "site1.localhost");
});

test("bench running with site → running state", () => {
  const result = formatWorkspaceBarState({
    benchPath: "/home/user/frappe-bench",
    site: "site1.localhost",
    status: "running",
  });
  assert.equal(result.kind, "running");
  assert.equal(result.benchName, "frappe-bench");
  assert.equal(result.site, "site1.localhost");
});

test("bench running without site → running state, site null", () => {
  const result = formatWorkspaceBarState({
    benchPath: "/home/user/frappe-bench",
    site: null,
    status: "running",
  });
  assert.equal(result.kind, "running");
  assert.equal(result.benchName, "frappe-bench");
  assert.equal(result.site, null);
});

test("Windows-style bench path extracts correct name", () => {
  const result = formatWorkspaceBarState({
    benchPath: "C:\\Users\\dev\\frappe-bench",
    site: null,
    status: "stopped",
  });
  assert.equal(result.kind, "stopped");
  assert.equal(result.benchName, "frappe-bench");
});

test("starting and failed status → stopped state (not running)", () => {
  for (const status of ["starting", "failed"]) {
    const result = formatWorkspaceBarState({ benchPath: "/bench", site: null, status });
    assert.equal(result.kind, "stopped", `expected stopped for status=${status}`);
  }
});
