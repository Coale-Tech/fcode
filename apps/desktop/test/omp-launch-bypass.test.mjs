import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { createSessionLaunchRuntime } = await import("../electron/main/runtime/session-launch.ts");
// E2: omp resolves its own models and credentials from its own config, so a
// PI-native provider is no longer required to start a real agent turn. Only
// the three callers that hand a turn to the omp bridge sidecar may bypass
// admission with the "omp" placeholder (`allowOmpFallback: true`):
//   agent-ipc.ts:415 (agentPrompt), :637 (agentCompact), runtime/plans.ts:442
//   (plan execution).
// The other three callers build `launch.sidecarParams.provider` into a direct
// HTTP call and must keep throwing MODEL_NOT_CONFIGURED /
// PROVIDER_SECRET_MISSING on a provider-less install, unchanged from before
// E2 -- handing them the "omp" placeholder would trade a clean error for an
// opaque network failure, and for prompt-enhance would silently skip its
// existing pinned-provider-unavailable fallback (agent-ipc.ts:157-169):
//   agent-ipc.ts:150 (prompt-enhance), :217 (title-summarize),
//   services/plugin-services.ts:368 (plugin completeOneShot).

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

async function assertCleanRejection(promise) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.errorCode, "MODEL_NOT_CONFIGURED");
    return true;
  });
}

test("agent-ipc.ts:150 prompt-enhance launch call keeps throwing on a provider-less install", async () => {
  const runtime = launchRuntime();
  await assertCleanRejection(runtime.resolveAgentRuntimeLaunch("session-1", {}, {}, {
    mode: "agent", providerId: undefined, modelId: undefined, thinkingLevel: undefined,
  }));
});

test("agent-ipc.ts:217 title-summarize launch call keeps throwing on a provider-less install", async () => {
  const runtime = launchRuntime();
  await assertCleanRejection(runtime.resolveAgentRuntimeLaunch("title-summary:session-1", {}, {}, {
    mode: "agent", providerId: undefined, modelId: undefined, thinkingLevel: "off",
  }));
});

test("services/plugin-services.ts:368 plugin completeOneShot keeps throwing on a provider-less install", async () => {
  const runtime = launchRuntime();
  await assertCleanRejection(runtime.resolveAgentRuntimeLaunch("plugin-complete:session-1", {}, {}, {
    mode: "agent", providerId: "some-provider", modelId: "some-model", thinkingLevel: "off",
  }));
});

test("agent-ipc.ts:415 agentPrompt real-turn launch call bypasses provider admission", async () => {
  const runtime = launchRuntime();
  const launch = await runtime.resolveAgentRuntimeLaunch("session-1", {}, {}, { allowOmpFallback: true });
  assertOmpLaunch(launch);
});

test("agent-ipc.ts:637 agentCompact launch call bypasses provider admission", async () => {
  const runtime = launchRuntime();
  const launch = await runtime.resolveAgentRuntimeLaunch("session-2", {}, {}, { allowOmpFallback: true });
  assertOmpLaunch(launch);
});

test("runtime/plans.ts:442 plan-execution turn launch call bypasses provider admission", async () => {
  const runtime = launchRuntime();
  const launch = await runtime.resolveAgentRuntimeLaunch("session-3", {}, {}, { mode: "agent", allowOmpFallback: true });
  assertOmpLaunch(launch);
});

test("a pinned provider that's gone still rejects cleanly without allowOmpFallback, so prompt-enhance's own composer-provider fallback still fires", async () => {
  const runtime = launchRuntime();
  // providers.list is empty in this harness, so any requested providerId is
  // already "gone" -- this is exactly the shape agent-ipc.ts:157-169's catch
  // depends on to retry with the composer provider instead of surfacing the
  // omp placeholder to a direct HTTP call.
  await assertCleanRejection(runtime.resolveAgentRuntimeLaunch("session-1", {}, {}, {
    mode: "agent", providerId: "removed-pinned-provider", modelId: "removed-model",
  }));
});

test("only the three sidecar-turn callsites pass allowOmpFallback: true", async () => {
  const { readFile } = await import("node:fs/promises");
  const [agentIpc, plans, pluginServices] = await Promise.all([
    readFile(new URL("../electron/main/ipc/agent-ipc.ts", import.meta.url), "utf8"),
    readFile(new URL("../electron/main/runtime/plans.ts", import.meta.url), "utf8"),
    readFile(new URL("../electron/main/services/plugin-services.ts", import.meta.url), "utf8"),
  ]);
  // agentPrompt (:415) and agentCompact (:637) each open a resolveAgentRuntimeLaunch(
  // call and must reach allowOmpFallback: true before the next call.
  const sidecarCalls = agentIpc.match(/resolveAgentRuntimeLaunch\(\s*req\.sessionId,[\s\S]*?\n\s*\);/g) ?? [];
  assert.equal(sidecarCalls.length, 2, "expected exactly agentPrompt + agentCompact's two req.sessionId launch calls");
  for (const call of sidecarCalls) {
    assert.match(call, /allowOmpFallback:\s*true/);
  }
  assert.match(plans, /resolveAgentRuntimeLaunch\(\s*execution\.sessionId,[\s\S]*?allowOmpFallback:\s*true[\s\S]*?\);/);
  // prompt-enhance and title-summarize must NOT carry the flag.
  const launchForCall = agentIpc.match(/resolveAgentRuntimeLaunch\(launchSessionId, session[\s\S]*?\}\);/);
  assert.ok(launchForCall);
  assert.doesNotMatch(launchForCall[0], /allowOmpFallback/);
  const titleSummarizeCall = agentIpc.match(/resolveAgentRuntimeLaunch\(\s*`title-summary:\$\{sessionId\}`,[\s\S]*?\);/);
  assert.ok(titleSummarizeCall);
  assert.doesNotMatch(titleSummarizeCall[0], /allowOmpFallback/);
  // plugin completeOneShot must not carry the flag either.
  const pluginCall = pluginServices.match(/resolveAgentRuntimeLaunch\(launchSessionId, session[\s\S]*?\}\);/);
  assert.ok(pluginCall);
  assert.doesNotMatch(pluginCall[0], /allowOmpFallback/);
});
