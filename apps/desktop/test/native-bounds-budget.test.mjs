/**
 * native-bounds-budget.test.mjs
 *
 * T14 carry (b): Behavioural tests for the pure budget functions that
 * govern WebContentsView placement and column layout for native embedded
 * views (Raven, FileBird, Build canvas).
 *
 * Checks:
 *  1. shellChromeWidth rail vs island differ by exactly the token-derived 10px delta
 *  2. sidebarWidthBudget uses the token-derived SIDEBAR_WIDTH_MAX=520 cap
 *     and SIDEBAR_WIDTH_MIN=240 floor (no shadow constants)
 *  3. MAIN_PANE_MIN_WIDTH=450 is enforced by workPanelWidthForSidebarReopen
 *  4. islandSidebarProps permanently fixes the sidebar at ISLAND_SIDEBAR_W=256
 *  5. Settings in island: shell inert logic (source-level, no inert in island)
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { shellChromeWidth, islandSidebarProps, ISLAND_SIDEBAR_W } =
  await import("../src/lib/nav-layout.ts");
const {
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
} = await import("../src/lib/sidebar-preferences.ts");
const { sidebarWidthBudget } = await import("../src/lib/sidebar-resize.ts");
const {
  MAIN_PANE_MIN_WIDTH,
  workPanelWidthForSidebarReopen,
} = await import("../src/lib/work-panel-resize.ts");

// ── 1. Island vs rail chrome delta ────────────────────────────────────────────

test("island layout's rail chrome is exactly 10px wider than rail layout (token-derived, no shadow constant)", () => {
  const railChrome = shellChromeWidth("rail");
  const islandChrome = shellChromeWidth("island");
  assert.equal(islandChrome - railChrome, 10,
    `expected island(${islandChrome}) - rail(${railChrome}) = 10, got ${islandChrome - railChrome}`);
  // Verify the absolute values too (50px rail + 2×12px gap, 60px island + 2×12px gap)
  assert.equal(railChrome, 74);
  assert.equal(islandChrome, 84);
});

test("at a 1280px window the island layout leaves exactly 10px less column budget than rail", () => {
  const windowWidth = 1280;
  const railBudget = windowWidth - shellChromeWidth("rail");
  const islandBudget = windowWidth - shellChromeWidth("island");
  assert.equal(railBudget - islandBudget, 10);
  assert.equal(railBudget, 1206);
  assert.equal(islandBudget, 1196);
});

// ── 2. Sidebar cap and floor (520/240) ────────────────────────────────────────

test("sidebarWidthBudget caps at SIDEBAR_WIDTH_MAX=520 even with generous column budget", () => {
  assert.equal(SIDEBAR_WIDTH_MAX, 520);
  assert.equal(SIDEBAR_WIDTH_MIN, 240);
  // Wide window, work panel closed: budget is capped at 520
  const cap = sidebarWidthBudget({
    containerWidth: 2000,
    workPanelOpen: false,
    workPanelWidth: 300,
  });
  assert.equal(cap, SIDEBAR_WIDTH_MAX);
});

test("sidebarWidthBudget returns SIDEBAR_WIDTH_MIN=240 floor in tight columns", () => {
  // Very tight: even with sidebar+main+panel there is not 240 to spare
  const floor = sidebarWidthBudget({
    containerWidth: 800,
    workPanelOpen: true,
    workPanelWidth: 300,
  });
  assert.equal(floor, SIDEBAR_WIDTH_MIN);
});

test("sidebarWidthBudget in island column (10px tighter) still caps at 520", () => {
  // Same window, island layout has 10px less columns budget
  const w = 1280;
  const railCols = w - shellChromeWidth("rail");   // 1206
  const islandCols = w - shellChromeWidth("island"); // 1196
  // Both are wide enough that the result is capped at 520
  const railBudget = sidebarWidthBudget({ containerWidth: railCols, workPanelOpen: false, workPanelWidth: 300 });
  const islandBudget = sidebarWidthBudget({ containerWidth: islandCols, workPanelOpen: false, workPanelWidth: 300 });
  assert.equal(railBudget, SIDEBAR_WIDTH_MAX);
  assert.equal(islandBudget, SIDEBAR_WIDTH_MAX);
});

// ── 3. 450px main-pane floor ──────────────────────────────────────────────────

test("MAIN_PANE_MIN_WIDTH is 450px", () => {
  assert.equal(MAIN_PANE_MIN_WIDTH, 450);
});

test("workPanelWidthForSidebarReopen respects 450px main-pane floor on reopen", () => {
  // At 1040px columns, sidebar=275, panel=360: main would be 1040-275-360=405 < 450
  // So panel should shrink to 460 reopen target: 1040-275-460=305 panel
  const narrowed = workPanelWidthForSidebarReopen({
    containerWidth: 1040,
    sidebarWidth: 275,
    currentPanelWidth: 360,
  });
  assert.equal(narrowed, 305);
  // Verify: 1040 - 275 - 305 = 460 >= 450 floor ✓
  assert.ok(1040 - 275 - narrowed >= MAIN_PANE_MIN_WIDTH);

  // In island, columns are 10px narrower at same window width
  // 1040 - 10 = 1030; sidebar=275, panel=360: main=1030-275-360=395 < 450
  const islandNarrowed = workPanelWidthForSidebarReopen({
    containerWidth: 1030,
    sidebarWidth: 275,
    currentPanelWidth: 360,
  });
  assert.ok(1030 - 275 - islandNarrowed >= MAIN_PANE_MIN_WIDTH,
    `island reopen: main=${1030 - 275 - islandNarrowed} must be >=450`);
});

// ── 4. Island sidebar permanent at 256px ─────────────────────────────────────

test("ISLAND_SIDEBAR_W is 256px and islandSidebarProps always returns fixed width", () => {
  assert.equal(ISLAND_SIDEBAR_W, 256);
  // Collapsed or any user width → always 256px open in island
  for (const [collapsed, width] of [[true, 0], [false, 300], [true, 256]]) {
    const props = islandSidebarProps("island", collapsed, width);
    assert.deepEqual(props, { sidebarCollapsed: false, sidebarWidth: 256 });
  }
  // Non-island passes through
  assert.deepEqual(islandSidebarProps("rail", true, 200), { sidebarCollapsed: true, sidebarWidth: 200 });
  assert.deepEqual(islandSidebarProps("tabs", false, 300), { sidebarCollapsed: false, sidebarWidth: 300 });
});

// ── 5. Settings in island: shell stays visible (no inert) ────────────────────

test("AppShell: in island layout the app-chat-shell is NOT hidden or inert when page=settings", async () => {
  const src = await readFile(
    new URL("../src/features/app/AppShell.tsx", import.meta.url),
    "utf8",
  );
  // Pattern: hidden=... is only set when navLayout !== "island"
  assert.match(
    src,
    /hidden=\{page === "settings" && navLayout !== "island"\}/,
    "hidden must only apply when navLayout !== island",
  );
  assert.match(
    src,
    /inert=\{page === "settings" && navLayout !== "island" \? true : undefined\}/,
    "inert must only apply when navLayout !== island",
  );
  // In island, Settings renders inside the shell (main-pane), not outside
  assert.match(
    src,
    /page === "settings" && navLayout === "island"[\s\S]*?<SettingsPage/,
    "Settings page must render inside main-pane when island",
  );
});

test("AppShell: PortalVisibilityProvider stays visible in island settings mode", async () => {
  const src = await readFile(
    new URL("../src/features/app/AppShell.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    src,
    /PortalVisibilityProvider visible=\{page !== "settings" \|\| navLayout === "island"\}/,
    "portal must stay visible in island-settings",
  );
});
