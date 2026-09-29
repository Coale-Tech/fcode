import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("app-state Page union carries the three new surfaces", async () => {
  const appState = await readFile(
    new URL("../src/stores/app-state.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    appState,
    /page: "chat" \| "pulls" \| "scheduled" \| "plugins" \| "settings" \| "code" \| "build" \| "bench";/,
  );
});

test("AppShell routes bench and build to their entry-point pages inside the main pane", async () => {
  const appShell = await readFile(
    new URL("../src/features/app/AppShell.tsx", import.meta.url),
    "utf8",
  );
  assert.match(appShell, /import\("\.\.\/\.\.\/pages\/BenchPage"\)/);
  assert.match(appShell, /import\("\.\.\/\.\.\/pages\/BuildPage"\)/);
  assert.match(
    appShell,
    /page === "bench" \? \(\s*<div className="route-surface route-page">\s*<BenchPage \/>/,
  );
  assert.match(
    appShell,
    /page === "build" \? \(\s*<div className="route-surface route-page">\s*<BuildPage \/>/,
  );
});

test("BenchPage and BuildPage are landmarked entry points, not bare divs", async () => {
  const [bench, build] = await Promise.all([
    readFile(new URL("../src/pages/BenchPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/BuildPage.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(bench, /export function BenchPage\(\)/);
  assert.match(bench, /<main className="wb-page bench-page" aria-label="Bench">/);
  assert.match(build, /export function BuildPage\(\)/);
  assert.match(build, /<main className="wb-page build-page" aria-label="Build">/);
});
