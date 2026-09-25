import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { createSessionLaunchRuntime } = await import("../electron/main/runtime/session-launch.ts");

// E2: omp resolves its own models and credentials from its own config, so a
// PI-native provider is no longer required to start a real agent turn. A
// fresh install (or any state where providers.list has nothing usable) must
// not reject the launch — every caller below gets the "omp" placeholder
// launch instead of a MODEL_NOT_CONFIGURED / PROVIDER_SECRET_MISSING throw.
// One case per callsite of resolveAgentRuntimeLaunch:
//   agent-ipc.ts:150 (prompt-enhance), :217 (title-summarize),
//   :415 (agentPrompt), :635 (agentCompact), runtime/plans.ts:442 (plan turn).

const shell = { id: "bash", label: "Bash", dialect: "posix", available: true, isDefault: true };

function launchRuntime() {
  return createSessionLaunchRuntime({
    runtimeState: { host: {
      isAvailable: () => true,
      call: async (method) => {
        if (method === "commandShells.list") return { configuredId: "bash", effective: shell, fallback: false, choices: [shell] };
        if (method === "providers.list") return { providers: [] };
        if (method === "providers.getSecret") return {};
        if (method === "agents.active") return { subagents: [] };
        if (method === "agents.disabledBuiltins") return { disabled: [] };
        if (method === "skills.active") return { skills: [] };
        if (method === "mcp.active") return { servers: [] };
        if (method === "project.memory.get") return {};
        throw new Error(`Unexpected host call ${method}`);
      },
    } },
    logger: { app() {} }, userMcp: { setRecords() {}, toolsForProject: async () => [] },
    plugins: { listLoaded: () => [], getSkills: () => [], getTools: () => [], getAgentExtensions: () => [] },
    sessionProjects: new Map(), dataDir: "/tmp/omp-launch-bypass", vendorOAuth: {},
    modelsDevCatalog: { ensureLoaded: async () => {}, findModel: () => undefined },
    getWorkspacePath: () => null, pluginActiveInProject: () => true,
    bindingForModel: () => undefined,
    effectiveSubagentModelConfig: () => ({}),
    normalizeThinkingLevel: (value) => (typeof value === "string" ? value : "off"),
  });
}

function assertOmpLaunch(launch) {
  assert.equal(launch.providerId, "omp");
  assert.equal(launch.modelId, "omp");
  assert.ok(launch.sidecarParams, "still produces sidecar params for the turn");
}

test("agent-ipc.ts:150 prompt-enhance launch call bypasses provider admission", async () => {
  const runtime = launchRuntime();
  const launch = await runtime.resolveAgentRuntimeLaunch("session-1", {}, {}, {
    mode: "agent", providerId: undefined, modelId: undefined, thinkingLevel: undefined,
  });
  assertOmpLaunch(launch);
});

test("agent-ipc.ts:217 title-summarize launch call bypasses provider admission", async () => {
  const runtime = launchRuntime();
  const launch = await runtime.resolveAgentRuntimeLaunch("title-summary:session-1", {}, {}, {
    mode: "agent", providerId: undefined, modelId: undefined, thinkingLevel: "off",
  });
  assertOmpLaunch(launch);
});

test("agent-ipc.ts:415 agentPrompt real-turn launch call bypasses provider admission", async () => {
  const runtime = launchRuntime();
  const launch = await runtime.resolveAgentRuntimeLaunch("session-1", {}, {});
  assertOmpLaunch(launch);
});

test("agent-ipc.ts:635 agentCompact launch call bypasses provider admission", async () => {
  const runtime = launchRuntime();
  const launch = await runtime.resolveAgentRuntimeLaunch("session-1", {}, {});
  assertOmpLaunch(launch);
});

test("runtime/plans.ts:442 plan-execution turn launch call bypasses provider admission", async () => {
  const runtime = launchRuntime();
  const launch = await runtime.resolveAgentRuntimeLaunch("session-1", {}, {}, { mode: "agent" });
  assertOmpLaunch(launch);
});
