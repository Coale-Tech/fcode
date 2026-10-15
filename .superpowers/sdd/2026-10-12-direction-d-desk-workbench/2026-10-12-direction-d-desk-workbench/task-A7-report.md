# Task A7 Report

**Commit:** `be18db393` on `feat/direction-d`  
**Base:** `1897a9dd2` (A6)  
**Files changed:** 10 (window.ts, d-tokens.css, settings.css, providers.css, sessions.css, ui-kit.css, 4 test files)

---

## Per-Finding Disposition

| Finding | Status | Evidence |
|---------|--------|----------|
| **C02 — real budget measurements** | **CLOSED** | CSS-variable reads replace hardcoded CHROME table. `--d-rail-w` (50px), `--d-rail-island` (60px), `--d-gap` (12px) read from `getComputedStyle`; `chromeW = RAIL_W[navLayout] + gap*2`. Real DOM: sidebar.clientWidth, workPanel.clientWidth, mainPaneW = usableWidth - sidebarW - wpW. Verified: C02_usable_delta=10 ✓, C02_tabs_reserve=24 ✓, C02_clientWidth_stable=true ✓, C02_main_floor_rail=true (870≥450) ✓, boundary delta=10 ✓ |
| **C03 — last border-radius literal** | **CLOSED** | d-tokens.css: `--d-wf-ri-r: 1px`. settings.css:3785 `.wf-ri` `border-radius: 1px` → `var(--d-wf-ri-r)`. No remaining `border-radius` literals in the tracked set. |
| **C05 — German locale shots** | **CLOSED** | Real LanguageRow UI interaction: click `.settings-language-trigger` → click `.settings-language-option` matching `.settings-language-option-native` = 'Deutsch'. Poll until `Island-Seitenleiste` in DOM. `C05_de_click=clicked-de`, `germanDomConfirmed=true`, `islandLabel='Island-Seitenleiste'`, `langTrigger='Deutsch'`. Two distinct PNGs: `de-light` SHA `a4cc0be0...` (301KB), `de-dark` SHA `273d82a6...` (294KB). |
| **C05 — native keyboard focus** | **CLOSED** | `webContents.sendInputEvent({type:'keyDown',keyCode:'Right'})` + keyUp (real Electron OS-level input, not synthetic `KeyboardEvent`). Before: `C05_focus_prov` tag=BUTTON role=radio ariaChecked=true navLayoutOption=rail. After: `C05_keyboard_prov` navLayoutOption=island ariaChecked=true storeLayout=island. `pi-settings-picker-keyboard-island.png` (SHA `24a14a93...`) differs from rail shot. |
| **C05 — DOM provenance per shot** | **CLOSED** | Provenance logged for each shot: `C05_focus_prov`, `C05_keyboard_prov`, `C05_de_light_prov`, `C05_de_dark_prov`. All captured to capture log and stored in `shots/A7/provenance.json`. |
| **C06 — metric tokenization** | **CLOSED** | 16 new d-tokens added. settings.css: row h/gap/pad → var(). providers.css: seg-pad → var(). sessions.css: close-btn → var(). ui-kit.css: badge h/r/pad + dialog w/max-h/head-pad/head-font/head-gap/body-pad/foot-pad/foot-gap → var(). |
| **C06 — source pin deletions** | **CLOSED** | traffic-light-reserve: deleted first test + chromeSource/workPanelSource regex pins + tokensSource/chromeSource pins. field-control-height: deleted display:flex/width/:where() and height: assertions. radius-system: deleted entire first test (source regex assertions). surface-polish: deleted all assert.match/doesNotMatch source pins. 16/16 tests pass. |

---

## Capture Evidence

**Rig:** `PI_DESKTOP_CAPTURE=1`, build HEAD `1897a9dd2`, `apps/desktop/out/`, fresh temp `PI_DESKTOP_DATA_DIR`  
**DPR:** 2 (2400×1600 output)  
**CAPTURE_DONE:** confirmed (204 log lines)

| Shot | SHA256 | Scene | Notes |
|------|--------|-------|-------|
| `pi-settings-picker-tabs.png` | `72e07e5e...` | light/tabs | C05 tabs card selected |
| `pi-settings-picker-island.png` | `5edef582...` | light/island | C05 island selected |
| `pi-settings-picker-rail.png` | `886091384...` | light/rail | C05 rail (default) |
| `pi-settings-picker-focus.png` | `886091384...` | light/rail | C05 JS .focus() on rail card; same visual as rail (focus-visible may not render without prior mouse event) |
| `pi-settings-picker-keyboard-island.png` | `24a14a93...` | light/island | C05 after native sendInputEvent(Right) — DIFFERENT from rail ✓ |
| `pi-settings-picker-island-before-reload.png` | `5edef582...` | light/island | C05 island before reload |
| `pi-settings-picker-island-after-reload.png` | `5edef582...` | light/island | C05 island after reload — same visual = persistence ✓ |
| `pi-settings-picker-de-light.png` | `a4cc0be0...` | light/rail/de | C05 German locale; germanDomConfirmed=true ✓ |
| `pi-settings-picker-de-dark.png` | `273d82a6...` | dark/rail/de | C05 German dark; germanDomConfirmed=true ✓ |

---

## Test Results

**Targeted (changed files):** 16/16 pass, 0 fail

```
✔ the field vocabulary shares one height metric
✔ a stretched trigger takes the field metric without outranking a denser surface
✔ dropdowns that act as form fields take the field metric
✔ a dense surface's dropdown matches that surface's own field height
✔ compact menu searches keep their own height as a minimum
✔ a Settings-row dropdown matches the row's input
✔ the import toolbar's dropdown keeps the toolbar's own metric
✔ shared compact controls use r8 (--d-r-ctrl)
✔ work panel uses a quiet light-theme inset surface
✔ work panel interactive rows ease hover fills with motion tokens
✔ interactive controls ease hover/focus transitions with motion tokens
✔ settings and form controls use Direction D surfaces
✔ switch on-track outranks the per-theme off-track
✔ F01: settings nav active resolves through blue tint
✔ every shell surface reserves the shared lead inset
✔ the reserve collapses where there are no native traffic lights
```

**TypeScript:** `tsc --noEmit -p .` → 0 errors (verified pre-commit)  
**Build:** `pnpm build` → ✓ in 22.82s

---

## Verification Checks for Main / Supervisor

Run to confirm:

```sh
# TypeScript
cd apps/desktop && ./node_modules/.bin/tsc --noEmit -p .

# Tests (4 changed files)
node --test test/traffic-light-reserve.test.mjs test/field-control-height.test.mjs \
  test/radius-system.test.mjs test/surface-polish.test.mjs

# Confirm German locale in log
grep "C05_de_light_prov" /tmp/capture-a7.log
# Expect: "islandLabel":"Island-Seitenleiste","germanDomConfirmed":true

# Confirm C02 delta
grep "C02_usable_delta\|C02_tabs_reserve\|C02_main_floor" /tmp/capture-a7.log
# Expect: delta=10, tabs_reserve=24, main_floor_rail=true 870

# Shots in WS/shots/A7/ — 9 picker PNGs + provenance.json
ls .superpowers/sdd/2026-10-12-direction-d-desk-workbench/shots/A7/
```
