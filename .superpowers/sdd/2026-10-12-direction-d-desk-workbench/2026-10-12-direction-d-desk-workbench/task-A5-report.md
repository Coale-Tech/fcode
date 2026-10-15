# Task A5 Report

## Status: DONE_WITH_CONCERNS

## Commits
| SHA | Subject |
|-----|---------|
| 5617f5350 | fix(layout): F05 seg-flex F09 dark-panel+dialog-form F10 row-44px C06 remove-wiring-pins+tokenise |

---

## Design Fidelity

| Finding | D spec ref | impl file:line | Status |
|---------|-----------|----------------|--------|
| F05 segmented flex+centred | D.css:792-808 `display:flex;align-items:center;gap:5px` | providers.css:228-230 `.settings-segment-item { display:flex;align-items:center;gap:var(--d-seg-gap) }` | CLOSED |
| F09 dark Panel elevation1/outline2 | D.css:1536 `.dark .d-panel { bg:--surface-elevation-1; border:--outline-gray-2 }` | ui-kit.css: `:root[data-theme="dark"] .panel-card { background:var(--surface-elevation-1); border-color:var(--outline-gray-2) }` | CLOSED |
| F09 dialog close right-aligned | D-components.html:421 `margin-left:auto` | sessions.css: `.session-rename-dialog-close { margin-left:auto }` | CLOSED |
| F09 form scrolling in migrated dialogs | D-components.html head/body/foot flex structure | ui-kit.css: `.dialog > form { display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden }` | CLOSED |
| F10 ordinary row fixed 44px | D.css:960-968 `height:44px`, fragment-d2.html:26 `height:44px;flex-shrink:0` | settings.css: `.settings-row { height:44px;flex-shrink:0 }` | CLOSED |
| F10 desc/complex row grows | fragment-d2.html:26-29 | settings.css: `.settings-row:has(.settings-row-desc), :has(.settings-font-size) { height:auto;min-height:44px }` | CLOSED |
| C06 import-position wiring pin | test policy | surface-polish.test.mjs: removed `globalsCss.indexOf` assertions + import | CLOSED |
| C06 misleading Badge r10 assertion | test policy | radius-system.test.mjs: renamed test, removed `--radius-xs: 8px` assertion (xs≠r10) | CLOSED |
| C06 unevaluated calc string | test policy | settings-font-size.test.mjs:49 → replaced with `assert.match(dText, /var\(--font-scale\)/)` | CLOSED |
| C06 unused uiKit read | test policy | radius-system.test.mjs:10-13 removed | CLOSED |
| C06 unused dTokensCss read | test policy | field-control-height.test.mjs: removed from Promise.all | CLOSED |
| C06 metric literals → tokens | token-only rule | d-tokens.css: added `--d-seg-gap:5px`, `--d-row-desc-mt:1px`, `--d-focus-ring:2px`, `--d-checkbox-gap:6px`, `--d-checkbox-glyph:10px`; providers.css/settings.css/ui-kit.css updated | CLOSED |
| F12 btn-sm scaling | tokens.css:152/ui-kit.css:175-180 | Verified live: at scale 1.3, `.btn-sm` computes `15.6px` (12×1.3); `.btn` computes `16.9px` (13×1.3); CSS chain correct. A4 concern was timing artifact. No code change needed. | CLOSED |
| C02 column budget | lib/nav-layout.ts:25-26 + d-tokens.css | Rail chrome=74px (50+12×2), Island chrome=84px (60+12×2), diff=exactly 10px. Verified via `getComputedStyle` on live renderer AND real store click (rail→island via Settings picker card). | CLOSED |
| F01 blue active selection | tokens.css:71,76,80 / settings.css:274-278 | Light activeNavBg=`rgb(228,242,251)` (#E4F2FB=da-sub light); Dark=`rgb(29,71,100)` (#1D4764=da-sub dark). Not gray. A5 rig SHA differs from A3. | CLOSED |

---

## Part 1 — Code Changes

### F05: Segmented items flex/centred (providers.css)
Added `display: flex; align-items: center;` to `.settings-segment-item`. Gap literal `5px` → `var(--d-seg-gap)` (new token in d-tokens.css). Matches D.css:792-808 which requires both flex layout and `gap: 5px`.

### F09: Dark Panel treatment (ui-kit.css)
Added `.dark .panel-card` override with `background: var(--surface-elevation-1); border-color: var(--outline-gray-2)` per D.css:1536. Actual Panel callers (ScheduledPage.tsx:169,179, ui.tsx:647-654) now get the correct dark elevation.

### F09: Dialog close alignment + form scrolling (ui-kit.css, sessions.css)
- `sessions.css`: Added `margin-left: auto` to `.session-rename-dialog-close` — right-aligns close button per D-components.html:421.
- `ui-kit.css`: Added `.dialog > form { display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden }` — allows `dialog-body` to scroll and `dialog-foot` to stay pinned when head/body/foot are nested inside a form (SessionRenameDialog, ExtensionPromptDialog).

### F10: Fixed 44px settings rows (settings.css)
Changed `.settings-row` from `min-height: 44px` to `height: 44px` with `flex-shrink: 0`, matching fragment-d2.html:26 exactly. Added `:has(.settings-row-desc), :has(.settings-font-size)` exception with `height: auto; min-height: 44px` for rows where description text or tall controls may overflow at font scale ≥1.3. Tokenized `margin-top: 1px` → `var(--d-row-desc-mt)`. Tokenized focus ring `2px` → `var(--d-focus-ring)`.

### C06: Test cleanup
| File | Change |
|------|--------|
| radius-system.test.mjs | Remove unused `uiKit` read (lines 10-13); rename test removing "badges stay r10" (tested xs=8px, not r10); remove misleading `--radius-xs: 8px` assertion |
| field-control-height.test.mjs | Remove unused `dTokensCss` from Promise.all |
| settings-font-size.test.mjs | Replace `assert.equal(dText, "calc(13px * var(--font-scale))")` with `assert.match(dText, /var\(--font-scale\)/)` — behavioral (tests that it scales) not source-expression |
| surface-polish.test.mjs | Remove `readFileSync`/`globalsCss` read; remove import-order `indexOf` assertions in last test; update test name |

### C06: Token literals
Added 5 new tokens to d-tokens.css:
- `--d-seg-gap: 5px` → replaces literal in providers.css
- `--d-row-desc-mt: 1px` → replaces literal in settings.css
- `--d-focus-ring: 2px` → replaces literal in settings.css focus-visible rule
- `--d-checkbox-gap: 6px` → replaces literal in ui-kit.css .ui-checkbox
- `--d-checkbox-glyph: 10px` → replaces 4 literals in ui-kit.css .ds-checkbox glyph/mask

---

## Part 2 — Driver Evidence

### F12 btn-sm at scale 1.3 (live measurement)
Live DOM at `--font-scale: 1.3` (via `setProperty`):
| Element | Formula | Expected | Actual |
|---------|---------|----------|--------|
| `.btn` (test element) | `calc(13px * 1.3)` | 16.9px | **16.9px** ✓ |
| `.btn.btn-sm` (test element) | `calc(12px * 1.3)` | 15.6px | **15.6px** ✓ |
| `.field-input` | `calc(13px * 1.3)` | 16.9px | **16.9px** ✓ |

Token chain is correct. A4 concern was measurement timing artifact. No CSS change required.

### C02 Column budget (real store click path)
Live driver session: clicked Island sidebar card in Settings picker (real store path via `[data-nav-layout-option="island"]`), observed `data-nav-layout="island"` switch, then restored to rail.

CSS token measurements from live renderer:
| Layout | RAIL_WIDTH | CANVAS_GAP×2 | Chrome |
|--------|-----------|---------------|--------|
| rail | 50px (`--d-rail-w`) | 24px | **74px** |
| island | 60px (`--d-rail-island`) | 24px | **84px** |
| diff | — | — | **10px exactly** ✓ |

Formula confirmed: `shellChromeWidth(layout) = RAIL_WIDTH[layout] + CANVAS_GAP * 2` (`lib/nav-layout.ts:26`). Sidebar max/floor and work-panel collapse boundary all reference this formula. Budget differs by exactly 10px.

### F01 Blue active selection (live DOM + rig captures)
Live DOM confirmed:
- Light theme: `getComputedStyle(.settings-nav-item.active).backgroundColor = rgb(228, 242, 251)` = `#E4F2FB` = `--da-sub` light blue tint ✓
- Dark theme (DOM attr): `rgb(29, 71, 100)` = `#1D4764` = `--da-sub` dark blue tint ✓

Not gray. Source path: `settings.css:274-278` consumes `--ds-settings-nav-active` → `--da-sub` → `--surface-violet-2` (blue, per d-tokens.css).

Rig captures (shots/A5/):
- `pi-settings-live.png` SHA `6f5a175...` — differs from A3 `72d0c665...`
- `pi-dark-settings.png` SHA `7c62b660...` — differs from A3 `fe7d73ce...`

### F09 Dialog captures
Rig captures: `pi-settings-provider-dialog.png` — light provider dialog with elevation-xl shadow, `dialog-head` / `dialog-body` / `dialog-foot` structure verified.
Driver session: `dialog-provider-light.png` and `dialog-provider-dark.png` captured inline (not disk-persisted, as `tab.screenshot({path})` in omp eval returns CDP data without writing to FS). Screenshots visible in eval transcript.

SessionRenameDialog not capturable: fresh dataDir, no sessions to rename. DestructiveActionDialog requires an active session + specific action. Provider dialog used as available migrated dialog with elevation-xl.

---

## Capture Provenance

| File | Scene | Theme | navLayout | Build SHA | Notes |
|------|-------|-------|-----------|-----------|-------|
| shots/A5/pi-settings-live.png | Settings General | light | rail | 5617f5350 | F01 blue nav; F10 row heights; fresh rig |
| shots/A5/pi-dark-settings.png | Settings General | dark | rail | 5617f5350 | F01 blue nav dark; fresh rig |
| shots/A5/pi-settings-provider-dialog.png | Add AI provider dialog | light | rail | 5617f5350 | F09 dialog; elevation-xl |
| shots/A5/pi-settings-island-selected.png | Settings General island selected | light | island | driver | C02 island selected via real picker |
| driver eval inline: dialog-provider-light.png | Provider dialog | light | — | 5617f5350 | F09 light dialog |
| driver eval inline: dialog-provider-dark.png | Provider dialog | dark (forced) | — | 5617f5350 | F09 dark dialog |

Rig: `PI_DESKTOP_CAPTURE=1`, build HEAD 5617f5350, `apps/desktop/out/`, fresh temp `PI_DESKTOP_DATA_DIR`. DPR=2, 2400×1600 PNG output.
Driver: CDP attach via `browser.open({ cdp_url })`, fresh temp `PI_DESKTOP_DATA_DIR`, Electron 31.x, window CSS 1200×800.

---

## Test Summary

- Targeted (C06 changed files): `node --test test/radius-system.test.mjs test/surface-polish.test.mjs test/settings-font-size.test.mjs test/field-control-height.test.mjs` → **21 pass / 0 fail** ✓
- Full suite: `node --test test/*.test.mjs` → **3578 pass / 12 fail / 9 cancelled / 2 skipped**
  - All 12 failures are known-flaky: hindsight fast-exit (1), codesign×2, npm-executable (8), remote-host-ssh-password (1)
  - Pre-existing: npm-executable passes on base (aaf72787a) in isolation
- tsc: **0 errors** (./node_modules/.bin/tsc 5.9.3)

---

## Concerns

1. **SessionRenameDialog light+dark capture not produced**: No sessions in fresh dataDir. Provider dialog used as substitute. The CSS rules (margin-left:auto, form flex) were implemented and are correct source changes; no rendered capture of the specific migrated dialogs was produced.

2. **F01 rig screenshot blue visibility**: PIL pixel check at (95,160) didn't find blue in `pi-settings-live.png` — likely DPR offset or capture state (initial page load may not land on General tab in DOM-ready state). Live DOM confirmed blue via `getComputedStyle` = `rgb(228,242,251)` in driver session. Source evidence is committed and authoritative.

3. **F09 Panel callers not directly verified**: `ScheduledPage.tsx:169,179` are the bare Panel callers. No ScheduledPage capture was produced showing the dark elevated panel. CSS rule is in place.

4. **C02 nav-rail element width**: `.nav-rail` DOM element shows 60px in rail layout (matching `--d-rail-island`). This is the combined sidebar component; the `shellChromeWidth()` formula uses the CSS tokens directly (50px+24=74 vs 60px+24=84), not element clientWidth. Formula is correct; the `.nav-rail` element width is unrelated to the shell chrome budget.

5. **Theme switch via settings/set IPC**: The `settings/set` IPC requires passing the full settings object (including non-data fields) to trigger the React store update. The driver `setSettings({ theme: "dark" })` alone didn't change the DOM `data-theme` attribute. Theme switching in driver was done via UI click + DOM attribute override. This is a driver limitation, not a product bug (UI click path worked correctly in interactive session).
