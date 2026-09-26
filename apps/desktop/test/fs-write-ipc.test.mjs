import { readMainModuleSync } from "./helpers/source-contracts.mjs";
import assert from "node:assert/strict";
import test from "node:test";

// workspace-ipc.ts imports the real `electron` module, so it cannot be
// `import()`ed under plain `node --test` (see safe-open-external.test.mjs for
// the established pattern). Assert on the source text instead; the actual
// containment/size/UTF-8/conflict behavior is covered functionally by
// packages/host-runtime/src/workspace-files.test.ts, which the handler below
// delegates to.
const source = readMainModuleSync("ipc/workspace-ipc.ts");

test("registers a fs/write handler that requires a workspace root before writing (E6)", () => {
  const handlerMatch = source.match(
    /handle\(\s*IPC\.invoke\.fsWrite,\s*async \(input[^)]*\) => \{([\s\S]*?)\n {4}\},\n {2}\);/,
  );
  assert.ok(handlerMatch, "expected a registered IPC.invoke.fsWrite handler");
  const body = handlerMatch[1];
  assert.match(body, /requireWorkspaceRoot\(\)/);
  assert.match(body, /writeWorkspaceFile\(/);
});
