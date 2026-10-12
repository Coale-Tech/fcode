import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadStyles, resolveThemeToken } from "./helpers/styles.mjs";

const tokens = await readFile(
  new URL("../src/styles/tokens.css", import.meta.url),
  "utf8",
);
const uiKit = await readFile(
  new URL("../src/styles/ui-kit.css", import.meta.url),
  "utf8",
);
const styles = await loadStyles();

test("fixed radii follow the Apple-inspired desktop ladder", () => {
  const expected = [
    ["3xs", 4],
    ["2xs", 6],
    ["xs", 8],
    ["sm", 10],
    ["md", 12],
    ["md-plus", 14],
    ["lg", 16],
    ["lg-plus", 18],
    ["xl", 20],
    ["2xl", 24],
  ];

  for (const [name, value] of expected) {
    assert.match(tokens, new RegExp(`--radius-${name}:\\s*${value}px;`));
  }

  assert.match(tokens, /--radius-full:\s*9999px;/);
  assert.match(tokens, /--radius-round:\s*50%;/);
  assert.match(tokens, /--ds-composer-radius:\s*var\(--radius-xl\);/);
  assert.match(tokens, /--ds-composer-radius-lg:\s*var\(--radius-xl\);/);
});

test("shared compact controls use r8 (--d-r-ctrl) while badges stay r10", () => {
  /* Resolved-value check: --d-r-ctrl must be 8px (D.css:37 / D-SPEC.md) */
  const rCtrl = resolveThemeToken(styles, "light", "--d-r-ctrl");
  assert.equal(rCtrl, "8px", `--d-r-ctrl should resolve to 8px, got ${rCtrl}`);
  /* --ds-btn-radius redirects to --d-r-ctrl (D.css:659) */
  const btnRadius = resolveThemeToken(styles, "light", "--ds-btn-radius");
  assert.equal(btnRadius, "8px", `--ds-btn-radius should resolve to 8px, got ${btnRadius}`);
  /* Badge r10 — verify the radius ladder includes r10 */
  assert.match(tokens, /--radius-xs:\s*8px;/);
});
