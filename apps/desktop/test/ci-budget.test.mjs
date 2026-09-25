import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

// Mirrors the `mainIndex` / `appStore` entries in `scripts/check-architecture.mjs`.
// Kept in sync by hand: this test fails locally in seconds instead of waiting
// for a red CI run when either file grows past budget.
const limits = [
  { path: "apps/desktop/electron/main/index.ts", max: 1_500 },
  { path: "apps/desktop/src/stores/app-store.ts", max: 1_000 },
];

function locFor(filePath) {
  const text = readFileSync(join(repoRoot, filePath), "utf8");
  const newlineCount = (text.match(/\n/g) || []).length;
  return newlineCount + (text.length > 0 && !text.endsWith("\n") ? 1 : 0);
}

for (const { path, max } of limits) {
  test(`${path} stays under the ${max} LOC architecture budget`, () => {
    const loc = locFor(path);
    assert.ok(
      loc <= max,
      `${path} is ${loc} LOC, over the ${max} budget — extract before adding more`,
    );
  });
}
