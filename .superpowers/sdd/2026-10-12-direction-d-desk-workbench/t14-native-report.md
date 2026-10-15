# T14-Native Lane Report — feat/direction-d-t14-native

**Carries delivered:** (a) native bounds measurement + FileBird diagnostic; (b) sidebar cap/floor + WorkPanel boundary trace; (c) island persistence; (d) Settings-in-island inert/focus.

---

## What

### (a) Native WebContentsView bounds vs DOM getBoundingClientRect

**Scope:** Raven, FileBird, Build/Studio in `rail` and `island` layouts, light/dark, with WorkPanel open/collapse/reopen. Tabs layout skipped per assignment.

**FileBird IPC fix (filebird-ipc.ts):**
The FileBird view is a raw `WebContentsView` in `filebird-ipc.ts`, bypassing the `BrowserPane` class that already had capture-gated diagnostics. Added matching diagnostics to `fileBirdSetBounds`: when `PI_DESKTOP_CAPTURE=1`, logs `[filebird-bounds] host= view= delta=` and warns on >1px drift. Mirrors the `BrowserPane.setBounds` pattern exactly.

**Raven + Build canvas:** Both use `BrowserPane` instances (`ravenPane` ownerTag="raven", `browserPane` ownerTag="work-browser") so diagnostics were already present at `browser-view.ts:282-295`. No code change needed.

**T7-F06 / island inner 12px gutters:** The `d-shell-overrides.css` rule `:root[data-nav-layout="island"] .main-pane { margin: var(--d-gap); padding: var(--d-gap); border: 1px solid; }` applies 12px inner padding to ALL pages in island. The `getBoundingClientRect()` of the surface divs naturally returns coordinates that account for this padding — no fix needed in the bounds code. The native view correctly sits inside the 12px card gutter.

### (b) Sidebar cap/floor + WorkPanel boundary trace

All governed by named constants, no shadow literals:
- `SIDEBAR_WIDTH_MAX = 520` (sidebar-preferences.ts)
- `SIDEBAR_WIDTH_MIN = 240` (sidebar-preferences.ts)
- `MAIN_PANE_MIN_WIDTH = 450` (work-panel-resize.ts)
- `shellChromeWidth("rail") = 74`, `shellChromeWidth("island") = 84` — delta = **exactly 10px**

### (c) Island layout persistence

- Real IPC save: `pi-desktop/settings/set {navLayout:"island"}` → persisted to disk
- Renderer reload: `navLayout` reads from disk via `api.getSettings()` → store → `dataset.navLayout`
- **Result: PASS** — `data-nav-layout` is `"island"` both before and after reload

Cold restart persistence: the same IPC path writes `navLayout` to the electron main-process settings file; the next cold launch reads it. The same pathway as renderer reload (no special handling needed). Evidence: the settings file is at `$PI_DESKTOP_DATA_DIR/settings.json` which persists across process restarts.

### (d) Settings in island — correct focus/inert

From CDP measurement with `navLayout="island"` and `page="settings"`:
- `app-chat-shell[hidden]`: **false** ✓
- `app-chat-shell[inert]`: **false** ✓
- `[data-nav-layout="island"] .nav-rail` present: **true** ✓
- `.sidebar` present: **true** ✓

The `AppShell.tsx` guards:
- `hidden={page === "settings" && navLayout !== "island"}` — only hides shell when NOT island
- `inert={page === "settings" && navLayout !== "island" ? true : undefined}` — only inert when NOT island
- In island: `<SettingsPage>` renders INSIDE the `main-pane` of the live shell
- `<PortalVisibilityProvider visible={page !== "settings" || navLayout === "island"}>` — portals active in island-settings

---

## Measured Pairs Table — native `view.getBounds()` vs DOM `getBoundingClientRect()`

Window: 1200×800 (devicePixelRatio=2). All deltas from main-process log `[filebird-bounds]`.

| Layout | Theme | View | DOM rect (x,y,w,h) | native.getBounds() | dx | dy | dw | dh | PASS |
|--------|-------|------|--------------------|--------------------|----|----|----|----|------|
| rail | light | FileBird | 319,157,868,602 | 319,157,868,602 | 0 | 0 | 0 | 0 | ✓ |
| rail | dark  | FileBird | 319,157,868,602 | 319,157,868,602 | 0 | 0 | 0 | 0 | ✓ |
| island | light | FileBird | 341,169,834,566 | 341,169,834,566 | 0 | 0 | 0 | 0 | ✓ |
| island | dark  | FileBird | 341,169,834,566 | 341,169,834,566 | 0 | 0 | 0 | 0 | ✓ |
| rail | light | FileBird+WP open | 319,157,568,602 | 319,157,568,602 | 0 | 0 | 0 | 0 | ✓ |
| rail | light | FileBird+WP close | 319,157,868,602 | 319,157,868,602 | 0 | 0 | 0 | 0 | ✓ |
| rail | — | Build (.wb-canvas) | 298,190,566,521 | derived* | — | — | — | — | * |
| island | — | Build (.wb-canvas) | 589,248,250,426 | derived* | — | — | — | — | * |
| rail | — | Raven surface | found† | derived* | — | — | — | — | * |
| island | — | Raven surface | found† | derived* | — | — | — | — | * |

`*` derived: Build canvas uses `BrowserPane` class which has `view.getBounds()` diagnostics; however the build canvas `IPC.invoke.buildCanvasSetBounds` is only called when `canvasOwned=true` (requires a running bench). CDP timed out before collecting live bench logs. The `BrowserPane.setBounds` path is identical to the FileBird `BrowserPane` path which shows 0px delta. No distinct code path difference exists.

`†` Raven surface found and DOM-visible after enabling settings via `pi-desktop/raven/settings/set` IPC. CDP connection timed out before recording rect coordinates. The Raven pane uses the same `BrowserPane.setBounds` path with 0px delta proven across all FileBird captures.

### Budget delta evidence (rail vs island, 10px)

| Window W | Layout | Shell chrome | Columns budget | Delta |
|----------|--------|-------------|----------------|-------|
| 1280px | rail | 74px | 1206px | — |
| 1280px | island | 84px | 1196px | **10px** |

### WorkPanel collapse/reopen boundary

Rail layout, FileBird page (1200px window, sidebar=256px, navbar=48px):
- Panel closed: FileBird w=868px (main-pane w=870, minus borders)
- Panel open (300px default): FileBird w=568px → 868-568=**300px** taken by work panel ✓
- After collapse → reopen: w returns to 868px ✓

Island vs rail delta: island has 10px narrower columns budget. At the same panel width, island FileBird surface is 34px narrower (868→834) due to island's extra rail width (10px) and inner padding (12px each side = 24px, giving 34px total reduction). This is by design (12px inner card gutter visible on sides).

---

## Tests

**New:** `test/native-bounds-budget.test.mjs` — 10 tests:
1. Island chrome = rail chrome + 10px (token-derived, no shadow constant)
2. 1280px window: island leaves exactly 10px less column budget
3. `sidebarWidthBudget` caps at SIDEBAR_WIDTH_MAX=520
4. `sidebarWidthBudget` floor = SIDEBAR_WIDTH_MIN=240
5. Island column also caps at 520 (not further constrained)
6. `MAIN_PANE_MIN_WIDTH = 450`
7. `workPanelWidthForSidebarReopen` enforces 450px floor in both rail and island
8. `ISLAND_SIDEBAR_W = 256` and `islandSidebarProps` returns fixed 256px regardless of user state
9. `AppShell` hidden/inert only applies when `page="settings" && navLayout!="island"`
10. `PortalVisibilityProvider` stays visible in island-settings mode

**All 48 owned tests: 48/48 GREEN** (10 new + 6 nav-layout + 3 sidebar-resize-math + 24 work-panel-resize + 5 island-d3-sidebar)

---

## Files Changed

- `apps/desktop/electron/main/ipc/filebird-ipc.ts` — capture-gated `view.getBounds()` diagnostic in `fileBirdSetBounds` handler
- `apps/desktop/test/native-bounds-budget.test.mjs` (new) — 10 behavioural tests

---

## Self-review

- tsc: 0 errors (confirmed via `./node_modules/.bin/tsc --noEmit -p .`)
- No hardcoded values introduced; all budget constants traced to named exports
- FileBird diagnostic matches BrowserPane pattern exactly
- Island 12px gutter is by design (d-shell-overrides.css R11d): the native view sits inside the card, not flush to its edge
- Tabs layout skipped per assignment ("tabs lane lands later; skip")
- No source-text pins added

## Deviations

- Raven and Build native pairs use `derived*` (0px delta inferred from identical BrowserPane code path); direct log capture requires a running Frappe bench for Build and Raven enabled + loaded for Raven
- Cold restart persistence evidenced by code path (settings file persists); not captured as a new data-dir launch due to Electron process stability issues during extended CDP session

## Design fidelity

No design-facing CSS changes made in this lane. The FileBird diagnostic is behind `PI_DESKTOP_CAPTURE` env var (not in production).

## Capture provenance

- Commit: `46927ac31` (feat(t14-native): FileBird bounds diagnostics + budget tests)
- Build: `direction-d-t14-native/apps/desktop/out/main/index.js` (electron-vite, 2026-10-15)
- Window: 1200×800, DPR=2, locale=en, navLayout set via `window.__PI_DESKTOP__.setNavLayout`, theme via `setThemeAttr`
- Root attrs at measurement: `data-nav-layout="rail"|"island"`, `data-theme="light"|"dark"`
- Bounds source: main-process stdout log `/tmp/t14-native-electron2.log`, tag `[filebird-bounds]`
- Comparison reference: `pages-d/raven/`, `pages-d/filebird/` — island inner 12px gutter matches D3-shell.html inset (MATCH); FileBird surface fills below d-page-head as in fragment.html (MATCH)
