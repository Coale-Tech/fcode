/**
 * T12 — Generate Monaco theme from design tokens at runtime.
 *
 * Checks that:
 * - monaco-theme.ts exports a buildMonacoTheme() function
 * - The function reads CSS custom properties at runtime (not hardcoded vs-dark)
 * - It calls monaco.editor.defineTheme with a token-derived palette
 * - The site's canvas scrollbars/caret/selection are NOT touched (left to Frappe)
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/components/code/monaco-theme.ts", import.meta.url),
  "utf8",
);

test("T12: monaco-theme exports buildMonacoTheme function", () => {
  assert.match(source, /export.*buildMonacoTheme|export function buildMonacoTheme/);
});

test("T12: reads CSS variables at runtime from document.documentElement", () => {
  assert.match(source, /getPropertyValue|getComputedStyle|documentElement/);
});

test("T12: calls monaco.editor.defineTheme", () => {
  assert.match(source, /defineTheme/);
});

test("T12: returns a theme name string (not vs-dark)", () => {
  // Must return a custom theme name, not hardcode vs-dark
  assert.match(source, /fcode-dark|fcode-light|fcode-theme/);
  assert.doesNotMatch(source, /return "vs-dark"|return 'vs-dark'/);
});

test("T12: uses ds-bg-primary token for editor background", () => {
  assert.match(source, /ds-bg-primary/);
});

test("T12: does NOT touch canvas scrollbars or caret", () => {
  // The embedded site's scrollbars/caret are left to Frappe
  assert.doesNotMatch(source, /scrollbar.*color|caret.*color/);
});
