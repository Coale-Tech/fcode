import { readComposerSource } from "./helpers/source-contracts.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const composerSource = await readComposerSource();

test("Agent and Plan permission menus present only effective selectable modes", () => {
  const permissionControlSource = composerSource.slice(
    composerSource.indexOf('className="composer-permission"'),
    composerSource.indexOf('<div className="composer-right">'),
  );

  assert.match(
    permissionControlSource,
    /\["ask", "accept-edits", "auto"\] as const/,
  );
  assert.match(
    permissionControlSource,
    /aria-checked=\{composerPermissionMode === candidate\}/,
  );
  assert.match(
    permissionControlSource,
    /\{t\(PERMISSION_MODE_I18N_KEYS\[candidate\]\)\}/,
  );
  assert.doesNotMatch(permissionControlSource, /permissionInherit/);
  assert.doesNotMatch(permissionControlSource, /\["inherit",/);
});

