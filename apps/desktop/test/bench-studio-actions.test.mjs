import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { studioExpression } = await import("../electron/main/bench/studio-actions.ts");

test("app action builds a get_doc method call", () => {
  assert.deepEqual(studioExpression({ action: "publish_app", app: "crm-ui" }), {
    ok: true,
    expression: 'frappe.get_doc("Studio App", "crm-ui").publish_app()',
  });
});

test("enable_export passes target_app and needs a valid one", () => {
  const ok = studioExpression({ action: "enable_export", app: "a", target_app: "my_app" });
  assert.equal(ok.expression, 'frappe.get_doc("Studio App", "a").enable_app_export("my_app")');
  assert.equal(studioExpression({ action: "enable_export", app: "a" }).ok, false);
  assert.equal(studioExpression({ action: "enable_export", app: "a", target_app: 'x"); os' }).ok, false);
});

test("page actions target Studio Page", () => {
  assert.equal(studioExpression({ action: "revert_page", page: "p1" }).expression, 'frappe.get_doc("Studio Page", "p1").revert()');
});

test("names are JSON-escaped so quotes cannot break out of the literal", () => {
  const { expression } = studioExpression({ action: "publish_page", page: 'x"); import os; ("' });
  assert.equal(expression, 'frappe.get_doc("Studio Page", "x\\"); import os; (\\"").publish()');
});

test("unknown action and missing target are rejected", () => {
  assert.equal(studioExpression({ action: "drop_db" }).ok, false);
  assert.equal(studioExpression({ action: "publish_app" }).ok, false);
  assert.equal(studioExpression({ action: "publish_page", app: "a" }).ok, false);
});
