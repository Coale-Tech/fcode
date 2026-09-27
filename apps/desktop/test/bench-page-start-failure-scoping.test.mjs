/**
 * BenchPage — selectVisibleStartFailure gates the start-failure panel to the
 * bench it happened for (PR #27 follow-up: cross-bench start-failure leak).
 *
 * A source-regex assertion (bench-page-start-identity.test.mjs) can only
 * prove the gating tokens exist somewhere in the file; it would still pass
 * if the comparison were inverted or wired to the wrong variable. The unit
 * tests below load the real exported selector through Vite's SSR module
 * loader and assert on its return value for each branch and edge case.
 *
 * Selector coverage alone is not the representative user path AGENTS.md §12
 * requires ("not only extracted pure functions... a real sequence of user
 * actions, state transitions, and visible results"): it proves the decision
 * but not that it drives real visible output. The last test renders the real
 * ProcessPanel component — the same technique sidebar-pinned-rendering.test.mjs
 * uses to execute real TSX exports under `node --test` — through the selector
 * across bench A failing, the user looking at bench B, and returning to bench
 * A, asserting on the actual `role="alert"` markup the user would see at
 * each step.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

async function loadBenchPageModule() {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false },
    esbuild: { jsx: "automatic" },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    return await server.ssrLoadModule("/src/pages/BenchPage.tsx");
  } finally {
    await server.close();
  }
}

const benchA = { id: "a", path: "/benches/a", version: 16, sites: [] };
const benchB = { id: "b", path: "/benches/b", version: 16, sites: [] };
const failureForA = {
  benchPath: "/benches/a",
  failure: {
    code: "CONFLICT",
    problem: "Bench failed to start",
    cause: "port in use",
    fix: "Stop the running bench, then retry.",
    docsUrl: "",
  },
};

test("selectVisibleStartFailure returns the failure when it matches the selected bench", async () => {
  const { selectVisibleStartFailure } = await loadBenchPageModule();
  assert.equal(selectVisibleStartFailure(failureForA, benchA), failureForA);
});

test("selectVisibleStartFailure hides the failure once a different bench is selected", async () => {
  const { selectVisibleStartFailure } = await loadBenchPageModule();
  assert.equal(selectVisibleStartFailure(failureForA, benchB), null);
});

test("selectVisibleStartFailure's decision follows a bench-switch sequence: A, then B, then A again", async () => {
  const { selectVisibleStartFailure } = await loadBenchPageModule();
  assert.equal(selectVisibleStartFailure(failureForA, benchA), failureForA);
  assert.equal(selectVisibleStartFailure(failureForA, benchB), null);
  assert.equal(selectVisibleStartFailure(failureForA, benchA), failureForA);
});

test("no active failure and no selected bench both resolve to null", async () => {
  const { selectVisibleStartFailure } = await loadBenchPageModule();
  assert.equal(selectVisibleStartFailure(null, benchA), null);
  assert.equal(selectVisibleStartFailure(failureForA, null), null);
});

test("representative user path: the visible failure banner follows the selected bench, not the one that failed", async () => {
  const { selectVisibleStartFailure, ProcessPanel } = await loadBenchPageModule();
  const renderFor = (selectedBench) =>
    renderToStaticMarkup(
      createElement(ProcessPanel, {
        status: "failed",
        anotherBenchRunning: false,
        onStart() {},
        onStop() {},
        elapsedLabel: "",
        warnings: [],
        startFailure: selectVisibleStartFailure(failureForA, selectedBench),
      }),
    );

  const onA = renderFor(benchA);
  assert.match(onA, /role="alert"/, "A's own failure is visible while A is selected");
  assert.match(onA, /Bench failed to start/);
  assert.match(onA, />Retry</);

  const onB = renderFor(benchB);
  assert.doesNotMatch(onB, /role="alert"/, "B never shows a failure that was never its own");

  const onAAgain = renderFor(benchA);
  assert.match(onAAgain, /role="alert"/, "reselecting A restores the same panel");
  assert.match(onAAgain, /Bench failed to start/);
});
