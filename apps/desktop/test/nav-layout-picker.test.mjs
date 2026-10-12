import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";
import { loadStyles } from "./helpers/styles.mjs";

register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { nextNavLayout } = await import("../src/lib/nav-layout.ts");

const rowSource = await readFile(
  new URL("../src/components/settings/NavLayoutRow.tsx", import.meta.url),
  "utf8",
);
const styles = await loadStyles();

test("nextNavLayout cycles right and left wrapping around", () => {
  assert.equal(nextNavLayout("tabs", "ArrowRight"), "rail");
  assert.equal(nextNavLayout("rail", "ArrowRight"), "island");
  assert.equal(nextNavLayout("island", "ArrowRight"), "tabs");
  assert.equal(nextNavLayout("tabs", "ArrowDown"), "rail");
  assert.equal(nextNavLayout("rail", "ArrowLeft"), "tabs");
  assert.equal(nextNavLayout("tabs", "ArrowUp"), "island");
  assert.equal(nextNavLayout("rail", "ArrowUp"), "tabs");
  assert.equal(nextNavLayout("tabs", "Enter"), null);
  assert.equal(nextNavLayout("rail", " "), null);
});

test("NavLayoutRow uses roving tabindex (selected=0, others=-1)", () => {
  assert.match(rowSource, /tabIndex=\{current === id \? 0 : -1\}/);
});

test("NavLayoutRow handles arrow-key navigation with onKeyDown", () => {
  assert.match(rowSource, /onKeyDown=\{onKeyDown\}/);
  assert.match(rowSource, /nextNavLayout\(current, e\.key\)/);
  assert.match(rowSource, /btn\?\.focus\(\)/);
});

test("NavLayoutRow imports cx from ../ui", () => {
  assert.match(rowSource, /import \{ cx \} from "\.\.\/ui"/);
});

test("nav-layout-card-label has overflow ellipsis", () => {
  assert.match(styles, /\.nav-layout-card-label\s*\{[^}]*white-space:\s*nowrap;/s);
  assert.match(styles, /\.nav-layout-card-label\s*\{[^}]*text-overflow:\s*ellipsis;/s);
  assert.match(styles, /\.nav-layout-card-label\s*\{[^}]*overflow:\s*hidden;/s);
});
