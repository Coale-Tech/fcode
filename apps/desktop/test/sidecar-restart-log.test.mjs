/**
 * Regression: `superviseRestart("sidecar", "settings")` must not emit the
 * "restarted after crash" log message; a plain crash restart must emit it.
 *
 * lifecycle.ts is Electron-free so it can be imported directly.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { createRuntimeLifecycle } = await import(
  "../electron/main/runtime/lifecycle.ts"
);

function makeLifecycle(startSidecar = async () => {}) {
  const logs = [];
  const lifecycle = createRuntimeLifecycle({
    runtimeState: { host: null, sidecar: null, workerSidecars: new Map(), agentHostBridge: null },
    dataDir: "/tmp/test",
    logger: {
      app: (_cat, level, msg) => { logs.push({ level, msg }); },
      flushChild: () => {},
    },
    sendToRenderer: () => {},
    startHost: async () => {},
    startSidecar,
    drainApprovedPlanExecutions: async () => {},
    applyNetworkProxyFromAppSettings: async () => {},
    plugins: { listLoaded: () => [] },
    setCurrentWorkspacePath: () => {},
    rememberPluginScopes: () => {},
    refreshUserMcp: async () => {},
    isQuitting: () => false,
    getDisplayLocale: () => "en",
  });
  return { lifecycle, logs };
}

test("settings restart logs a neutral info line, not 'after crash'", async () => {
  const { lifecycle, logs } = makeLifecycle();
  await lifecycle.superviseRestart("sidecar", "settings");
  const restarted = logs.filter((l) => l.msg.includes("restarted"));
  assert.ok(restarted.length > 0, "expected a restarted log line");
  assert.ok(
    restarted.every((l) => !l.msg.includes("after crash")),
    `settings restart must not log "after crash"; got: ${restarted.map((l) => l.msg).join(", ")}`,
  );
  assert.ok(
    restarted.some((l) => l.level === "info"),
    "settings restart should log at info level",
  );
});

test("crash restart logs 'after crash' at warn level", async () => {
  const { lifecycle, logs } = makeLifecycle();
  await lifecycle.superviseRestart("sidecar"); // no reason = crash
  const restarted = logs.filter((l) => l.msg.includes("restarted"));
  assert.ok(restarted.length > 0, "expected a restarted log line");
  assert.ok(
    restarted.some((l) => l.msg.includes("after crash") && l.level === "warn"),
    `crash restart must log "after crash" at warn; got: ${restarted.map((l) => `${l.level}:${l.msg}`).join(", ")}`,
  );
});

test("a settings call that joins a crash restart keeps the crash label", async () => {
  const { lifecycle, logs } = makeLifecycle();
  const crash = lifecycle.superviseRestart("sidecar");
  await Promise.all([crash, lifecycle.superviseRestart("sidecar", "settings")]);
  assert.deepEqual(
    logs.filter((l) => l.msg.includes("restarted")).map((l) => `${l.level}:${l.msg}`),
    ["warn:sidecar restarted after crash"],
  );
});
