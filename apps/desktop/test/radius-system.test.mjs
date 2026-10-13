import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadStyles, resolveThemeToken } from "./helpers/styles.mjs";

const tokens = await readFile(
  new URL("../src/styles/tokens.css", import.meta.url),
  "utf8",
);
const styles = await loadStyles();


test("shared compact controls use r8 (--d-r-ctrl)", () => {
  /* Resolved-value check: --d-r-ctrl must be 8px (D.css:37 / D-SPEC.md) */
  const rCtrl = resolveThemeToken(styles, "light", "--d-r-ctrl");
  assert.equal(rCtrl, "8px", `--d-r-ctrl should resolve to 8px, got ${rCtrl}`);
  /* --ds-btn-radius redirects to --d-r-ctrl (D.css:659) */
  const btnRadius = resolveThemeToken(styles, "light", "--ds-btn-radius");
  assert.equal(btnRadius, "8px", `--ds-btn-radius should resolve to 8px, got ${btnRadius}`);
});
