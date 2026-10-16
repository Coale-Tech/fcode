import assert from "node:assert/strict";
import { test } from "node:test";
import { flattenCatalog, en } from "../../packages/i18n/src/index.ts";

test("bench.processes plural: singular", () => {
  const flat = flattenCatalog(en);
  assert.equal(flat["bench.processes_one"], "1 process");
  assert.equal(flat["bench.processes_other"], "{{count}} processes");
});
