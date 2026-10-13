/**
 * Field/control height contract (renderer CSS).
 *
 * A text input, a native select and a menu-select trigger that acts as a form
 * field must resolve to one height, or the dropdown reads as a different-sized
 * control than the input beside it. `--ds-field-height` is that metric.
 *
 * Compact surfaces — a menu search row, the dense subagent sheet, the
 * Settings-row pill, the model row body — own a smaller metric instead. They
 * have to declare it as a *minimum*: the field vocabulary pins `min-height`, so
 * a bare `height` on one of their inputs would lose and the control would be
 * stretched to the field metric.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { loadStyles, resolveThemeToken } from "./helpers/styles.mjs";

const styles = await loadStyles();

test("the field vocabulary shares one height metric", () => {
  /* Resolved-value: --d-ctrl = 28px and --ds-field-height resolves through it (D.css:734) */
  const dCtrl = resolveThemeToken(styles, "light", "--d-ctrl");
  assert.equal(dCtrl, "28px", `--d-ctrl should be 28px, got ${dCtrl}`);
  const fieldH = resolveThemeToken(styles, "light", "--ds-field-height");
  assert.equal(fieldH, "28px", `--ds-field-height should resolve to 28px, got ${fieldH}`);
});
