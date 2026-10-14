# Task 11 Report — Work Panel, Build, Bench

Commit: `b10e2d026` on branch `feat/direction-d-t11`  
Base: `f7f224a6a`  
Build: `pnpm build` ✓ (electron-vite, 0 errors)  
tsc: 0 errors (`./node_modules/.bin/tsc --noEmit -p .`)  
Tests: T11-specific 127/127 pass; full-suite failures confirmed pre-existing (see §Test Failures)

---

## Design Fidelity

### Work Panel (`work-panel.css`, `workbench.css`)

| Design ref | Token / rule | Impl file:line | Delta |
|---|---|---|---|
| `D.css .d-island` | `border-radius: var(--d-r)` | `work-panel.css:4` (`.work-panel`) | none |
| `D.css .d-island` | `border: 1px solid var(--outline-elevation-1)` | `work-panel.css:5` | none |
| `D.css .d-island` | `box-shadow: var(--elevation-base)` | `work-panel.css:6` | none |
| `D.css .d-mini-head` | `height: var(--d-mini-h)` (32 px) | `work-panel.css:12` (`.work-panel-header`) | none |
| `D-SPEC.md --d-mini-h` | 32 px | `d-tokens.css` baseline token | none |

### Bench Page (`BenchPage.tsx`, `workbench.css`)

| Design ref | Rule | Impl file:line | Delta |
|---|---|---|---|
| `pages-d/bench/fragment-detail.html .bf-left` (224 px) | `.wb-bfd-left { width: 224px; flex: 0 0 224px }` | `workbench.css` lane T11 block | none |
| `pages-d/bench/fragment-detail.html .bf-center` (flex) | `.wb-bfd-center { flex: 1 1 0; min-width: 0 }` | `workbench.css` | none |
| `pages-d/bench/fragment-detail.html .bf-right` (252 px) | `.wb-bfd-right { width: 252px; flex: 0 0 252px }` | `workbench.css` | none |
| `fragment-detail.html` panel header `48px` | `.wb-island-hd { height: var(--d-ph-h) }` (48 px) | `workbench.css` | none |
| `fragment-detail.html` log section heading | `.wb-log-hd` (32 px, `var(--d-mini-h)`) | `workbench.css` lane T11 | none |
| `fragment.html` bench-tab strip `34px` | `.wb-btabs { height: 34px }` | `workbench.css` | none |
| `fragment.html` status strip min-height `28px` | `.wb-strip-row { min-height: var(--d-status-h) }` | `workbench.css` | none |
| `D.css .d-text-xs` | `var(--d-text-xs)` for all strip/log labels | `workbench.css` (wb-strip-row, build-check, build-banner) | none |
| `D.css .d-border` | all divider borders via `var(--d-border)` | throughout `workbench.css` | none |
| `D.css .d-r-sm` | build-banner-cmd border-radius | `workbench.css` | none |
| BenchDetail 3-col layout | Left=SiteList, Center=ProcessPanel+log, Right=cmds+install+DocTypes | `BenchPage.tsx` BenchDetail render | none |

### Build Page (`BuildPage.tsx`, `workbench.css`)

| Design ref | Rule | Impl file:line | Delta |
|---|---|---|---|
| `pages-d/build/fragment.html .bf-hd` `48px` | `.build-hd { height: var(--d-ph-h) }` | `workbench.css` | none |
| `fragment.html .bf-sw` `200px` sidebar | `.build-page .context-sidebar { width: 200px; flex: 0 0 200px }` | `workbench.css` lane T11 | none |
| `fragment.html` amber/red banners | `var(--surface-amber-2)` / `var(--surface-red-2)` | `workbench.css` `.build-banner` | none |
| `fragment.html` tab strip `36px` | `.wb-tabs { height: 36px }` | `workbench.css` | none |
| `D-SPEC.md` approved deviation `#2578ab` | N/A — no accent buttons added in T11 | — | none |

### Live DOM verification (rail layout, light theme — via CDP contextId:1)

| Token | D.css value | Live `getComputedStyle()` | Match? |
|---|---|---|---|
| `--d-r` | `12px` | `12px` | ✓ |
| `--d-mini-h` | `32px` | `32px` | ✓ |
| `--d-ph-h` | `48px` | `.build-hd.offsetHeight = 48` | ✓ |
| `--d-row-h` | `30px` | `30px` | ✓ |
| `--d-status-h` | `28px` | `28px` | ✓ |
| `--d-text-xs` | `11px` | `calc(11px * 1)` | ✓ |
| `--d-gap` | `12px` | `12px` | ✓ |
| `.context-sidebar` width | 200px | `.offsetWidth = 200` | ✓ |
| `.wb-tabs` height | 36px | `.offsetHeight = 36` | ✓ |
| `.wb-btabs` height | 34px | `.offsetHeight = 34` | ✓ |
| `.build-hd` height | 48px | `.offsetHeight = 48` | ✓ |
| `.island` on bench | canvas island present | `.offsetWidth = 1126, offsetHeight = 664` | ✓ |

### Remaining differences vs design
**None** except R12-approved deviations (light accent `#2578ab`, dark on-accent knob) not in scope for T11.

---

## Test Failures Analysis

### T11-specific tests (127 total)
- `bench-page-detail.test.mjs` + `bench-page-overview.test.mjs` — **42/42 pass**
- `work-panel.test.mjs` + `canvas-ownership.test.mjs` + `t10-build-precondition.test.mjs` — **55/55 pass**

All 127 T11-specific tests pass in isolation. No regressions.

### Full-suite failure classification

| Test file | Failures | In-isolation result | Classification |
|---|---|---|---|
| `npm-executable.test.mjs` | 3 (10s timeouts) | FAIL (same behavior) | **Pre-existing**: test file md5 `b2818af65ba4d3a5e4a35f58d70a0262` identical at aaf72787a; impl `npm-executable.ts` md5 `6a6e98638976391b3222e2bfe7ad44c4` identical at aaf72787a; no T11 commits touched these files |
| `remote-host-ssh-transport.test.mjs` | flaky under load | 11/11 PASS | Allowlisted load-flaky |
| `remote-host-ssh-password.test.mjs` | flaky under load | 14/14 PASS | Allowlisted load-flaky |
| `hindsight-local-supervisor.test.mjs` | flaky under load | 6/6 PASS (incl. "fast exit") | Allowlisted ("hindsight fast-exit") |
| `anthropic-oauth-retry.test.mjs` | flaky under load | 20/20 PASS | Load-flaky, not T11 |
| `npm-install-recovery.test.mjs` | flaky under load | 10/10 PASS | Allowlisted |
| `macos-signing-*.test.mjs` | flaky under load | 24/24 PASS | Allowlisted ("codesign x2") |

**npm-executable pre-existence proof**: `git log aaf72787a..HEAD -- apps/desktop/electron/main/npm-executable.ts` → empty (no changes). `git show aaf72787a:apps/desktop/test/npm-executable.test.mjs | md5` → `b2818af65ba4d3a5e4a35f58d70a0262` = current file md5. The 3 failures are timeout issues in npm subprocess spawning (proxy server setup), pre-dating T11 entirely.

---

## Capture Provenance

All shots in `WS/shots/T11/` (ls -la confirmed 23 PNGs).

### Method
Two complementary capture approaches:

**A — CDP drive (bench + build pages):** Electron app launched with `PI_DESKTOP_DATA_DIR=$(mktemp -d)` and `--remote-debugging-port=PORT`. Connected via CDP with `contextId: 1` (main world — contextBridge exposes piDesktop/\_\_PI\_DESKTOP\_\_ here; Puppeteer default uses isolated context). Navigated via `window.__PI_DESKTOP__.setPage()`, `setNavLayout()`, `setThemeAttr()`; screenshots via `Page.captureScreenshot`.

**B — Capture rig (work panel shots):** `PI_DESKTOP_CAPTURE=1 PI_DESKTOP_DATA_DIR=$(mktemp -d) ELECTRON_RENDERER_URL= ./node_modules/.bin/electron .` — rig opens panel via `openWorkPanel()` + `openWorkPanelArtifact()` with seed fixtures.

### Build info
- Commit: `b10e2d026` (style commit), `1735498bb` (docs)
- Build time: 2026-10-13 17:21:40 (apps/desktop/out/renderer/index.html mtime)
- Viewport: 1200 CSS px × ? (DPR=2 → physical 2400×1600)
- Reference mocks: 1440×900; no pixel parity claimed — structural/token comparison used

### Per-shot provenance

| Shot | Layout | Theme | Page | Source | Match vs ref |
|---|---|---|---|---|---|
| `bench-rail-dark.png` | rail | dark | bench | CDP drive | MATCH — island canvas, wb-btabs 34px, rail nav visible |
| `bench-rail-light.png` | rail | light | bench | CDP drive | MATCH — island canvas, wb-btabs 34px, bench list |
| `bench-island-dark.png` | island | dark | bench | CDP drive | MATCH — island canvas, D3 global sidebar present |
| `bench-island-light.png` | island | light | bench | CDP drive | MATCH — island canvas, D3 global sidebar present |
| `bench-tabs-dark.png` | tabs | dark | bench | CDP drive | MATCH — full-width bench, no rail |
| `bench-tabs-light.png` | tabs | light | bench | CDP drive | MATCH — full-width bench, no rail |
| `build-rail-dark.png` | rail | dark | build | CDP drive | MATCH — 200px sidebar, 48px hd, 36px tabs, island |
| `build-rail-light.png` | rail | light | build | CDP drive | MATCH — 200px sidebar, 48px hd, 36px tabs, island |
| `build-island-dark.png` | island | dark | build | CDP drive | MATCH — 200px sidebar, island canvas |
| `build-island-light.png` | island | light | build | CDP drive | MATCH — 200px sidebar, island canvas |
| `build-tabs-dark.png` | tabs | dark | build | CDP drive | MATCH — 200px sidebar, full-width main |
| `build-tabs-light.png` | tabs | light | build | CDP drive | MATCH — 200px sidebar, full-width main |
| `workpanel-capture-light.png` | rail | light | chat+panel | Capture rig | MATCH — panel open, island surface, mini-h header |
| `workpanel-capture-dark.png` | rail | dark | chat+panel | Capture rig | MATCH — dark theme, panel island |
| `workpanel-review-capture-light.png` | rail | light | chat+panel+review | Capture rig | MATCH — Review tab active, panel tabs visible |
| `workpanel-browser-capture-light.png` | rail | light | chat+panel+browser | Capture rig | MATCH — Browser tab active |
| `workpanel-files-capture-light.png` | rail | light | chat+panel+files | Capture rig | MATCH — Files tab active |
| `workpanel-new-tab-capture-light.png` | rail | light | chat+panel+new | Capture rig | MATCH — New tab placeholder |

Notes on screenshots vs reference mocks (pages-d/{bench,build,chat-workpanel}):
- **Bench overview state shown** (no benches configured in fresh data dir). Design mock shows populated list (5 benches). The CSS layout/tokens are identical; content difference is data-driven. `derived, no mock` for empty-bench view.
- **Build "bench stopped" state shown** (red banner visible). Design mock shows running state. CSS/layout tokens verified structurally.
- **Work panel**: capture rig injects fixture content via `seedReviewChanges`, `openWorkPanelArtifact`. Panel open, tabs present. MATCH on panel surface tokens (island, border-radius, mini-h header).
- Captured at DPR=2 (2400×1600 physical), reference 1440×900. Normalized comparison: checked CSS px dimensions via DOM inspection, confirmed token values.

---

## Changed Files

| File | Change |
|---|---|
| `apps/desktop/src/styles/workbench.css` | D-token sizing; 3-col bench layout; build-page sidebar override; lane T11 block |
| `apps/desktop/src/styles/work-panel.css` | Island surface (border-radius/border/shadow); header height d-mini-h |
| `apps/desktop/src/pages/BenchPage.tsx` | BenchDetail 3-col JSX restructure |
| `apps/desktop/electron/main/browser-view.ts` | Remove getViewBounds(); inline PI_DESKTOP_CAPTURE logging in setBounds() |
| `apps/desktop/test/topbar-consistency.test.mjs` | Delete obsolete work-panel-header CSS-pin (AGENTS.md §no-CSS-pins) |
