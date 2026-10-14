/**
 * island-d3-sidebar.test.mjs
 *
 * Behavioural tests for the D3 island sidebar features (Task 9):
 *   1. Bench card wires to useBenchContext for live status (not static placeholder)
 *   2. Pinned pages section navigates using setPage() via existing page ids
 *   3. Portal visibility is active in island+settings (tooltips remain interactive)
 *   4. All new nav keys are present in every locale
 */
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

// ── 1. Bench card wires to live bench state ─────────────────────────────────

test("D3 bench card: imports and uses useBenchContext for live status", async () => {
  const sidebar = await readFile(
    new URL("../src/components/Sidebar.tsx", import.meta.url),
    "utf8",
  );
  // Hook must be imported
  assert.match(sidebar, /import \{ useBenchContext \} from "\.\.\/hooks\/use-bench-context"/);
  // Hook must be called inside the component (not just imported)
  assert.match(sidebar, /const bench = useBenchContext\(\)/);
  // Bench name comes from bench.benchName (live), not static string
  assert.match(sidebar, /bench\.benchName/);
  // Status dot uses bench.kind for running/stopped class
  assert.match(sidebar, /bench\.kind === "running" \? "is-on" : "is-off"/);
  // Sub-label uses workspaceBar translation keys (reuses existing i18n, no new keys)
  assert.match(sidebar, /t\("workspaceBar\.running"\)/);
  assert.match(sidebar, /t\("workspaceBar\.stopped"\)/);
  assert.match(sidebar, /t\("workspaceBar\.chooseBench"\)/);
  // Clicking bench card navigates to bench page
  assert.match(sidebar, /d3-sb-bench[\s\S]*?onClick=\{.*setPage\("bench"\)/);
});

test("D3 bench card: empty state falls back gracefully", async () => {
  const { formatWorkspaceBarState } = await import("../src/lib/workspace-bar-state.ts");
  const empty = formatWorkspaceBarState({ benchPath: null, site: null, status: "stopped" });
  assert.equal(empty.kind, "empty");
  const running = formatWorkspaceBarState({ benchPath: "/home/user/benches/coale_v16", site: "site1.local", status: "running" });
  assert.equal(running.kind, "running");
  assert.equal(running.benchName, "coale_v16");
  assert.equal(running.site, "site1.local");
  const stopped = formatWorkspaceBarState({ benchPath: "/home/user/benches/myapp", site: null, status: "stopped" });
  assert.equal(stopped.kind, "stopped");
  assert.equal(stopped.benchName, "myapp");
  assert.equal(stopped.site, null);
});

// ── 2. Pinned pages: real navigation, existing page ids ─────────────────────

test("D3 pinned pages section: uses existing page ids and setPage navigation", async () => {
  const sidebar = await readFile(
    new URL("../src/components/Sidebar.tsx", import.meta.url),
    "utf8",
  );
  // Section only renders in island mode
  assert.match(sidebar, /navLayout === "island"[\s\S]*?d3-sb-pinned-pages/);
  // Kanban: gated by kanbanEnabled feature flag, navigates to "kanban" page
  assert.match(sidebar, /kanbanEnabled[\s\S]*?setPage\("kanban"\)/);
  // Raven: gated by ravenEnabled feature flag, navigates to "raven" page
  assert.match(sidebar, /ravenEnabled[\s\S]*?setPage\("raven"\)/);
  // FileBird: always present, navigates to "filebird" page
  assert.match(sidebar, /setPage\("filebird"\)/);
  // Active state from existing page store subscription
  assert.match(sidebar, /page === "kanban" && "active"/);
  assert.match(sidebar, /page === "raven" && "active"/);
  assert.match(sidebar, /page === "filebird" && "active"/);
  // Uses i18n keys already present for page titles
  assert.match(sidebar, /t\("kanban\.title"\)/);
  assert.match(sidebar, /t\("raven\.title"\)/);
  assert.match(sidebar, /t\("fileBird\.title"\)/);
  // Group label
  assert.match(sidebar, /t\("nav\.pinnedPages"\)/);
  // data-nav attributes for e2e targeting
  assert.match(sidebar, /data-nav="pinned-kanban"/);
  assert.match(sidebar, /data-nav="pinned-raven"/);
  assert.match(sidebar, /data-nav="pinned-filebird"/);
});

test("D3 pinned pages: feature flag subscriptions are from app store", async () => {
  const sidebar = await readFile(
    new URL("../src/components/Sidebar.tsx", import.meta.url),
    "utf8",
  );
  assert.match(sidebar, /const kanbanEnabled = useAppStore\(.*kanbanEnabled.*\)/);
  assert.match(sidebar, /const ravenEnabled = useAppStore\(.*ravenEnabled.*\)/);
});

// ── 3. Portal visibility: active in island+settings ─────────────────────────

test("Portal visibility: island mode keeps portals active during settings", async () => {
  const appShell = await readFile(
    new URL("../src/features/app/AppShell.tsx", import.meta.url),
    "utf8",
  );
  // Portal layers visible outside settings AND in island mode (D3) during settings
  assert.match(
    appShell,
    /<PortalVisibilityProvider visible=\{page !== "settings" \|\| navLayout === "island"\}>/,
  );
  // Non-island (D1/D2): shell hidden when settings is open
  assert.match(appShell, /hidden=\{page === "settings" && navLayout !== "island"\}/);
  // Island (D3): settings rendered inside the shell — shell is NOT hidden
  assert.doesNotMatch(appShell, /hidden=\{page === "settings"\}(?!\s*&&)/);
});

// ── 4. i18n: nav.pinnedPages present in all 9 locales ───────────────────────

const LOCALE_EXPECTED = {
  en:     "Pinned pages",
  de:     "Angeheftete Seiten",
  es:     "Páginas fijadas",
  fr:     "Pages épinglées",
  ko:     "고정된 페이지",
  "pt-BR": "Páginas fixadas",
  tr:     "Sabitlenmiş sayfalar",
  "zh-CN": "固定页面",
  "zh-TW": "固定頁面",
};

for (const [locale, expected] of Object.entries(LOCALE_EXPECTED)) {
  test(`i18n: nav.pinnedPages in ${locale} = "${expected}"`, async () => {
    const src = await readFile(
      new URL(`../../../packages/i18n/src/locales/${locale}/index.ts`, import.meta.url),
      "utf8",
    );
    const pattern = new RegExp(`["']?pinnedPages["']?:\\s*["']${expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`);
    assert.match(src, pattern, `${locale} locale missing pinnedPages = "${expected}"`);
  });
}
