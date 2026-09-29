import {
  readStoreModuleSync,
  readStoreSourceSync,
  readComposerSourceSync,
} from "./helpers/source-contracts.mjs";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readDesktop = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

const [store, planState, approvalBar, composer, packageJson] =
  await Promise.all([
    readStoreSourceSync(),
    readDesktop("src/lib/plan-mode-state.ts"),
    readDesktop("src/components/PlanApprovalBar.tsx"),
    readComposerSourceSync(),
    readDesktop("package.json"),
  ]);
const eventsSource = readStoreModuleSync("slices/events-slice.ts");

test("rejection clears only the live gate and a later proposal replaces the checkpoint", () => {
  const hostPlanBlock = eventsSource.slice(eventsSource.indexOf("handlePlansChanged: (event) =>"));
  assert.match(hostPlanBlock, /mergePlanCheckpoint/);
  assert.match(hostPlanBlock, /planCheckpoints: checkpoint/);
  assert.match(hostPlanBlock, /const pendingPlans = activeProposal/);
  assert.match(hostPlanBlock, /\n\s+pendingPlans,/);
  assert.match(hostPlanBlock, /withoutRecordKey\(state\.pendingPlans, event\.sessionId\)/);
  assert.match(planState, /if \(event\.proposal\) return event\.proposal/);
  assert.match(planState, /current\.status === "pending" && event\.state === "planning"/);
});

test("each pending proposal restores the remembered approval choice", () => {
  assert.match(approvalBar, /useState<GlobalPermissionMode>\(\s*readPlanApprovalMode\(\)/);
  assert.match(approvalBar, /setApprovalMode\(readPlanApprovalMode\(\)\)/);
  assert.match(approvalBar, /rememberPlanApprovalMode\(selectedMode\)/);
  assert.match(approvalBar, /\}, \[proposal\.id\]\);/);
  assert.doesNotMatch(approvalBar, /state\.settings|planApprovalPermissionMode/);
});

test("the normal desktop test command includes source-level renderer contracts", () => {
  const scripts = JSON.parse(packageJson).scripts;
  assert.match(scripts.test, /test\/\*\.test\.mjs/);
  assert.ok(
    existsSync(new URL("./plan-mode-source-contract.test.mjs", import.meta.url)),
    "the source-level contract test must live under test/ so the glob picks it up",
  );
});
