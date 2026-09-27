/**
 * BenchPage — selectVisibleStartFailure gates the start-failure panel to the
 * bench it happened for (PR #27 follow-up: cross-bench start-failure leak).
 *
 * A source-regex assertion (bench-page-start-identity.test.mjs) can only
 * prove the gating tokens exist somewhere in the file; it would still pass
 * if the comparison were inverted or wired to the wrong variable. This loads
 * the real exported selector through Vite's SSR module loader — the same
 * technique sidebar-pinned-rendering.test.mjs uses to execute real TSX
 * exports under `node --test` — and asserts on its real return value across
 * the representative user path (AGENTS.md §12): bench A fails, the user
 * looks at bench B, then returns to bench A.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

async function loadSelector() {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false },
    esbuild: { jsx: "automatic" },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { selectVisibleStartFailure } = await server.ssrLoadModule("/src/pages/BenchPage.tsx");
    return selectVisibleStartFailure;
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
    problem: "Can't start this bench",
    cause: "port in use",
    fix: "Stop the running bench, then retry.",
    docsUrl: "",
  },
};

test("selectVisibleStartFailure returns the failure when it matches the selected bench", async () => {
  const selectVisibleStartFailure = await loadSelector();
  assert.equal(selectVisibleStartFailure(failureForA, benchA), failureForA);
});

test("selectVisibleStartFailure hides the failure once a different bench is selected", async () => {
  const selectVisibleStartFailure = await loadSelector();
  assert.equal(selectVisibleStartFailure(failureForA, benchB), null);
});

test("representative user path: A fails, user checks B, user returns to A — the panel reappears", async () => {
  const selectVisibleStartFailure = await loadSelector();
  assert.equal(selectVisibleStartFailure(failureForA, benchA), failureForA);
  assert.equal(selectVisibleStartFailure(failureForA, benchB), null);
  assert.equal(selectVisibleStartFailure(failureForA, benchA), failureForA);
});

test("no active failure and no selected bench both resolve to null", async () => {
  const selectVisibleStartFailure = await loadSelector();
  assert.equal(selectVisibleStartFailure(null, benchA), null);
  assert.equal(selectVisibleStartFailure(failureForA, null), null);
});
