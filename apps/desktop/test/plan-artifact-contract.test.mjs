import { readMainSourceSync } from "./helpers/source-contracts.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readRoot = (relativePath) =>
  readFile(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
const readDesktop = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("Plan and Goal artifact runtime uses the terminating submit contract", () => {
  const main = readMainSourceSync();
  assert.match(main, /plans\.queuedExecutions/);
  assert.match(main, /plans\.claimExecution/);
  assert.match(main, /plans\.finishExecution/);
  assert.match(main, /createNotification/);
  assert.match(main, /event\.toolName === "SubmitGoal"/);

  const resolveStart = main.indexOf("handle(IPC.invoke.plansResolve");
  const resolveSource = main.slice(resolveStart, main.indexOf("handle(IPC.invoke.pluginList", resolveStart));
  assert.match(resolveSource, /if \(action === "approve"\)/);
  assert.doesNotMatch(resolveSource, /action === "reject"[\s\S]*dispatchApprovedPlan/);
});

test("Electron retains the stable Plan IPC names and protocol v11", async () => {
  const [protocol, main] = await Promise.all([
    readRoot("packages/shared/src/protocol.ts"),
    readMainSourceSync(),
  ]);

  assert.match(protocol, /PROTOCOL_VERSION = 11/);
  assert.match(protocol, /SCHEMA_VERSION = 16/);
  assert.match(protocol, /plansPending:/);
  assert.match(protocol, /plansResolve:/);
  assert.match(protocol, /plansChanged:/);
  assert.match(main, /IPC\.invoke\.plansPending/);
  assert.match(main, /IPC\.invoke\.plansResolve/);
});
