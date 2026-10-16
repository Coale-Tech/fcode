/**
 * Behavioural tests for the pure workspace-bar-state formatter.
 * No build needed: plain Node TS-stripping runs these.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { formatWorkspaceBarState, resolveStatusAgent } from "../src/lib/workspace-bar-state.ts";

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

const providers = [
  { id: "anthropic", defaultModelId: "claude-opus-4", models: [{ id: "claude-sonnet-5" }] },
  { id: "openai", models: [], defaultModelId: "gpt-5" },
];

test("status agent: session model and mode win over defaults", () => {
  assert.deepEqual(
    resolveStatusAgent({
      session: { modelId: "gpt-5", providerId: "openai", permissionMode: "auto" },
      draft: { modelId: "ignored", permissionMode: "accept-edits" },
      settings: { defaultModelId: "claude-sonnet-5", defaultProviderId: "anthropic", defaultPermissionMode: "ask" },
      providers,
    }),
    { modelId: "gpt-5", mode: "auto" },
  );
});

test("status agent: inherited session mode falls back to the global default", () => {
  assert.deepEqual(
    resolveStatusAgent({
      session: { permissionMode: "inherit" },
      settings: { defaultModelId: "claude-sonnet-5", defaultPermissionMode: "accept-edits" },
      providers,
    }),
    { modelId: "claude-sonnet-5", mode: "accept-edits" },
  );
});

test("status agent: no session uses the draft, then the provider's first model", () => {
  assert.deepEqual(
    resolveStatusAgent({ draft: { providerId: "anthropic" }, settings: {}, providers }),
    { modelId: "claude-sonnet-5", mode: "ask" },
  );
  assert.deepEqual(
    resolveStatusAgent({ settings: { defaultProviderId: "openai" }, providers }),
    { modelId: "gpt-5", mode: "ask" },
  );
});

test("status agent: nothing configured yields no model and supervised mode", () => {
  assert.deepEqual(resolveStatusAgent({ settings: null, providers: [] }), { modelId: null, mode: "ask" });
});
