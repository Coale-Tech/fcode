/**
 * island-d3-sidebar.test.mjs
 *
 * Behavioural tests for the D3 island sidebar features (Task 9):
 *   1. Bench card state formatting (empty / running / stopped)
 *   2. All new nav keys are present in every locale
 */
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

// ── 1. Bench card state formatting ──────────────────────────────────────────

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

// ── 2. i18n: nav.pinnedPages present in all 9 locales ───────────────────────

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
