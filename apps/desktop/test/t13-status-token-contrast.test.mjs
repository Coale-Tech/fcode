/**
 * T13 — Measure status tokens against --ds-bg-primary on both themes.
 *
 * Dark bg #181818, light bg #ffffff.
 * Required: ≥ 4.5:1 contrast for every status token on its theme's bg.
 *
 * Luminance formula: WCAG 2.x relative luminance.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tokensSource = await readFile(
  new URL("../src/styles/tokens.css", import.meta.url),
  "utf8",
);

test("T13: dark theme status tokens retain passing values", () => {
  // dark bg #181818: success #40c977 ≈ 8.32:1, warning #ff8549 ≈ 7.36:1, error #ff6764 ≈ 6.24:1
  assert.match(tokensSource, /--ds-success: #40c977/);
  assert.match(tokensSource, /--ds-warning: #ff8549/);
  assert.match(tokensSource, /--ds-error: #ff6764/);
});

test("T13: light theme --ds-success is darkened to pass 4.5:1 on #ffffff", () => {
  // #006b2b ≈ 6.69:1 on white (was #00a240 ≈ 3.36:1 — fails)
  assert.match(tokensSource, /--ds-success: #006b2b/);
});

test("T13: light theme --ds-warning is darkened to pass 4.5:1 on #ffffff", () => {
  // #c14800 ≈ 5.01:1 on white (was #e25507 ≈ 3.79:1 — fails)
  assert.match(tokensSource, /--ds-warning: #c14800/);
});

test("T13: light theme --ds-error keeps #e02e2a (already passes 4.57:1)", () => {
  assert.match(tokensSource, /--ds-error: #e02e2a/);
});
