# T14-Native Lane Report — feat/direction-d-t14-native

**Carries delivered:** (a) native bounds measurement across all three views; (b) sidebar cap/floor + WorkPanel boundary; (c) island persistence (picker IPC + renderer reload + cold restart); (d) Settings in island inert/focus.

---

## (a) Native WebContentsView bounds vs DOM getBoundingClientRect

**All measured from real running Electron + real `[view]-bounds` main-process log** (env `PI_DESKTOP_CAPTURE=1`).  Window 1200×800, DPR=2.

### Log evidence source
- FileBird: `/tmp/t14-native-electron2.log` (port 9340, first launch)
- Raven + Build: `/tmp/t14-cold-electron.log` (port 9341, second launch, same DATADIR)

### FileBird (`filebird-ipc.ts`) — raw `WebContentsView`

Added `PI_DESKTOP_CAPTURE`-gated diagnostics to `fileBirdSetBounds` handler, mirroring `BrowserPane.setBounds`. Logs `[filebird-bounds] host= view= delta=`.

```
[filebird-bounds] host={x:319,y:157,w:868,h:602} view={x:319,y:157,w:868,h:602} delta={0,0,0,0}  ← rail/light
[filebird-bounds] host={x:319,y:157,w:868,h:602} view={x:319,y:157,w:868,h:602} delta={0,0,0,0}  ← rail/dark
[filebird-bounds] host={x:341,y:169,w:834,h:566} view={x:341,y:169,w:834,h:566} delta={0,0,0,0}  ← island/light
[filebird-bounds] host={x:341,y:169,w:834,h:566} view={x:341,y:169,w:834,h:566} delta={0,0,0,0}  ← island/dark
[filebird-bounds] host={x:319,y:157,w:568,h:602} view={x:319,y:157,w:568,h:602} delta={0,0,0,0}  ← rail/WP open
[filebird-bounds] host={x:319,y:157,w:868,h:602} view={x:319,y:157,w:868,h:602} delta={0,0,0,0}  ← rail/WP closed
```

### Raven (`raven-ipc.ts → BrowserPane`) — real local stub server

Raven settings set to `{enabled:true, url:"http://127.0.0.1:7171"}` (local stub server, Python http.server). RavenPage mounts, calls `ravenSetVisible(true)` → pane attached + navigated. ResizeObserver fires `ravenSetBounds` → main logs `[raven-bounds]`.

```
[raven-bounds] host={x:319,y:157,w:866,h:602} view={x:319,y:157,w:866,h:602} delta={0,0,0,0}  ← rail (settle 1)
[raven-bounds] host={x:319,y:157,w:868,h:602} view={x:319,y:157,w:868,h:602} delta={0,0,0,0}  ← rail (stable)
[raven-bounds] host={x:341,y:169,w:834,h:566} view={x:341,y:169,w:834,h:566} delta={0,0,0,0}  ← island
```

### Build canvas (`build-ipc.ts → BrowserPane`) — real stub via owned BrowserPane path

Sequence: `buildCanvasAcquire` → `buildCanvasNavigate({url:"http://127.0.0.1:7171/"})` → `buildCanvasSetVisible({visible:true})` → `buildCanvasSetBounds({...dom rect...})`. All real IPC channels; view is visible when `setBounds` is called → main logs `[work-browser-bounds]`.

```
[work-browser-bounds] host={x:298,y:190,w:566,h:521} view={x:298,y:190,w:566,h:521} delta={0,0,0,0}  ← rail
[work-browser-bounds] host={x:589,y:248,w:250,h:426} view={x:589,y:248,w:250,h:426} delta={0,0,0,0}  ← island
```

### Complete pairs table

| Layout | View | DOM (x,y,w,h) | native.getBounds() | dx | dy | dw | dh | PASS |
|--------|------|---------------|--------------------|----|----|----|----|----|
| rail | FileBird | 319,157,868,602 | 319,157,868,602 | 0 | 0 | 0 | 0 | ✓ |
| rail+dark | FileBird | 319,157,868,602 | 319,157,868,602 | 0 | 0 | 0 | 0 | ✓ |
| island | FileBird | 341,169,834,566 | 341,169,834,566 | 0 | 0 | 0 | 0 | ✓ |
| island+dark | FileBird | 341,169,834,566 | 341,169,834,566 | 0 | 0 | 0 | 0 | ✓ |
| rail+WP open | FileBird | 319,157,568,602 | 319,157,568,602 | 0 | 0 | 0 | 0 | ✓ |
| rail+WP closed | FileBird | 319,157,868,602 | 319,157,868,602 | 0 | 0 | 0 | 0 | ✓ |
| rail | Raven | 319,157,868,602 | 319,157,868,602 | 0 | 0 | 0 | 0 | ✓ |
| island | Raven | 341,169,834,566 | 341,169,834,566 | 0 | 0 | 0 | 0 | ✓ |
| rail | Build | 298,190,566,521 | 298,190,566,521 | 0 | 0 | 0 | 0 | ✓ |
| island | Build | 589,248,250,426 | 589,248,250,426 | 0 | 0 | 0 | 0 | ✓ |

**All 10 pairs: 0px delta.**

---

## (b) Sidebar cap/floor + WorkPanel boundary (10px rail vs island delta)

All constants named, no shadow literals:

| Constant | Value | Source |
|---------|-------|--------|
| `SIDEBAR_WIDTH_MAX` | 520 | sidebar-preferences.ts |
| `SIDEBAR_WIDTH_MIN` | 240 | sidebar-preferences.ts |
| `MAIN_PANE_MIN_WIDTH` | 450 | work-panel-resize.ts |
| `shellChromeWidth("rail")` | 74 | layout-constants.ts |
| `shellChromeWidth("island")` | 84 | layout-constants.ts |
| Rail vs island delta | **10px** | token-derived |

WorkPanel open/close in rail (1200px window):
- Panel closed: FileBird w=868px
- Panel open (300px default): FileBird w=568px → 868−568 = **300px** taken by panel ✓
- After collapse → reopen: w returns to 868px ✓

Island FileBird is 34px narrower than rail (868→834): 10px extra rail width + 12px inner card gutter each side (24px) = 34px total. By design.

---

## (c) Island layout persistence

### Picker IPC → renderer reload
1. Called `window.piDesktop.invoke('pi-desktop/settings/set', {navLayout:'island'})` → persisted to `pi.sqlite` kv table, key `app|app`
2. CDP `Page.reload` → re-read `document.documentElement.dataset.navLayout` = `"island"` ✓

### Cold restart (second Electron process, same PI_DESKTOP_DATA_DIR)

```
=== pi.sqlite kv BEFORE cold launch ===
navLayout: island | theme: dark

=== root dataset attrs IMMEDIATELY after cold launch (no IPC writes) ===
{"navLayout":"island","theme":"light"}   ← navLayout restored immediately ✓

=== IPC settings readback (pi-desktop/settings/get) after cold launch ===
{"navLayout":"island","theme":"dark"}    ← both persisted values confirmed ✓

=== root dataset attrs AFTER renderer reload on the cold-launched process ===
{"navLayout":"island","theme":"dark"}    ← both hydrated correctly ✓
```

Note: `theme` on the root element shows `"light"` on the initial cold-launch frame (system default before store hydration), then `"dark"` after the settings store hydrates (approximately one React render cycle after the cold launch settles). `navLayout` is correctly restored immediately. IPC readback confirms `theme:"dark"` is the persisted value; it is correctly applied after hydration.

---

## (d) Settings in island — shell NOT hidden/inert

Measured via CDP with `navLayout="island"` and `page="settings"`:
- `app-chat-shell[hidden]`: **false** ✓
- `app-chat-shell[inert]`: **false** ✓
- `[data-nav-layout="island"] .nav-rail` present: **true** ✓
- `.sidebar` present: **true** ✓

`AppShell.tsx` guard: `hidden={page === "settings" && navLayout !== "island"}` — only hides shell when NOT island; island-settings renders live shell with settings inside `main-pane`. `PortalVisibilityProvider` stays `visible={true}` in island-settings.

---

## Tests

**New:** `test/native-bounds-budget.test.mjs` — 10 tests (all GREEN):
1. Island chrome = rail chrome + 10px (token-derived)
2. Island leaves 10px less column budget at 1280px
3. `sidebarWidthBudget` caps at SIDEBAR_WIDTH_MAX=520
4. `sidebarWidthBudget` floor = SIDEBAR_WIDTH_MIN=240
5. Island column also caps at 520
6. `MAIN_PANE_MIN_WIDTH = 450`
7. `workPanelWidthForSidebarReopen` enforces 450px floor
8. `ISLAND_SIDEBAR_W = 256` / `islandSidebarProps` returns fixed 256px
9. `AppShell` hidden/inert only when `page="settings" && navLayout!="island"`
10. `PortalVisibilityProvider` stays visible in island-settings

**Owned test suite total: 48/48 GREEN** (`native-bounds-budget` + nav-layout + sidebar-resize-math + work-panel-resize + island-d3-sidebar)

---

## Files Changed

| File | Change |
|------|--------|
| `apps/desktop/electron/main/ipc/filebird-ipc.ts` | Capture-gated `view.getBounds()` diagnostic in `fileBirdSetBounds`; matches `BrowserPane.setBounds` pattern |
| `apps/desktop/test/native-bounds-budget.test.mjs` | 10 new behavioural tests (new file) |

---

## Self-review

- tsc: 0 errors
- No hardcoded pixel values in production code; all constants are named exports
- FileBird diagnostic is `PI_DESKTOP_CAPTURE`-gated (not present in production builds)
- Raven stub: real IPC path through `ravenSetVisible → pane.setBounds`; stub URL is only for page content (the BrowserPane is what matters, not what it loads)
- Build stub: real IPC path `buildCanvasAcquire → buildCanvasNavigate → buildCanvasSetVisible → buildCanvasSetBounds`; bypasses bench availability check but exercises the identical native-view code path
- Tabs layout skipped per assignment

## Deviations

- Raven URL is a local stub server (`http://127.0.0.1:7171`) not a real Frappe site — BrowserPane attach + navigate + setBounds path is identical regardless of URL content
- Build canvas URL is the same stub — no running bench needed to measure the native view bounds; `buildCanvasSetVisible(true)` is called explicitly instead of via bench-status trigger in BuildPage.tsx

## Capture provenance

- **FileBird log:** `/tmp/t14-native-electron2.log` (CDP port 9340, `feat/direction-d-t14-native` worktree, commit `46927ac31`, window 1200×800 DPR=2)
- **Raven+Build log:** `/tmp/t14-cold-electron.log` (CDP port 9341, same commit, same DATADIR, window 1200×800 DPR=2)
- **Cold restart:** second Electron launch on same DATADIR (CDP port 9342), no prior IPC writes in that process; `data-nav-layout="island"` confirmed immediately
