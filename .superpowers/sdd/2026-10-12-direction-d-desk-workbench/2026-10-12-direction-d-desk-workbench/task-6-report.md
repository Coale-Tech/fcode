# Task 6 Report: Shell frame — ShellNavbar, awesomebar, drag/traffic-light/window-controls, status bar

## Status: DONE

**Commits:**
- `d34a12425 feat(shell): direction D navbar + awesomebar` (original, 19 files)
- `a53338e2d fix(shell): T6 round-1 review gaps — slot geometry, awesomebar fidelity, i18n` (12 files)
- Round-2 fixes: `MAC_TRAFFIC_LIGHT_POSITION.y` 16→18, targeted captures, report corrections
---

## What was done

### New files
| File | Purpose |
|---|---|
| `apps/desktop/src/components/NavTabs.tsx` | Stub (returns null); Task 8 fills content |
| `apps/desktop/src/components/ShellNavbar.tsx` | 48px direction-D navbar; breadcrumb (rail/island) + centered awesomebar + NavTabs slot |
| `apps/desktop/src/styles/d-shell.css` | Design-accurate CSS (flex+abs awesomebar, traffic-light reserves, shell column layout) |

### Modified files
| File | Change |
|---|---|
| `globals.css` | `@import "./d-shell.css"` after `chrome.css` |
| `AppShell.tsx` | `<ShellNavbar onOpenSearch>` before `<PortalVisibilityProvider>` (outside inert subtree) |
| `chrome.css` | Deleted lead-inset block (706-736), callers migrated; removed darwin nav-rail padding-top; window-chrome-row height → `--d-ph-h` |
| `tokens.css` | Removed `--ds-window-lead-inset: 0px` |
| `chat-shell.css` | `.workspace-bar` height → `var(--d-status-h)` |
| `test/work-panel.test.mjs` | Updated: `--preview-chrome-inset: var(--ds-pane-lead-inset)` override gone (clean cutover) |
| `test/sidebar-navigation.test.mjs` | Updated: darwin sidebar-header padding-left gone (clean cutover) |
| 9 locale files | Added `nav.chat`, `nav.build`, `nav.bench`, `nav.awesomebar` keys |

### Round-1 fixes (applied on top of d34a12425)
| Gap | Fix |
|---|---|
| T6-F01: macOS left-slot geometry wrong (56px/78px instead of 76px/94px) | `d-shell.css:61–62` changed to `padding-left: 76px` (rail/island: 12+56+8) and `94px` (tabs: 8+78+8) |
| T6-F02: Awesomebar bg token mismatch | `d-shell.css` changed to `background: var(--surface-gray-1)` per D.css:209 |
| T6-F02: Awesomebar font 13px → 12px | `d-shell.css` changed to `font-size: var(--d-text-sm)` per D.css:212 |
| T6-F02: Awesomebar text inset 10px → 32px | `d-shell.css` changed to `padding: 0 32px` per D.css:213 |
| T6-F02: Icon color gray-5 → gray-4, abs left:9px | Added `.shell-awesomebar-icon { position:absolute; left:9px; color:var(--ink-gray-4); }` per D.css:222–228 |
| T6-F02: Focus ring: outline → border-color+box-shadow | `d-shell.css:focus-visible` changed to `border-color:var(--da); box-shadow:0 0 0 2px var(--da-bdr); outline:none` per D.css:218–220 |
| T6-F02: Single ⌘K kbd → two separate 18px bordered keycaps | `ShellNavbar.tsx` split into `<div class="shell-awesomebar-kbd"><kbd>⌘</kbd><kbd>K</kbd></div>`; CSS per D.css:1092–1106 |
| T6-F02: Awesomebar label "Search" → descriptive copy | `nav.awesomebar: "Search sessions, files, commands…"` added to all 9 locales; `ShellNavbar.tsx:69` uses `t("nav.awesomebar")` |
| T6-F02: Root breadcrumb lacks font-weight:500 | `d-shell.css:93` added `font-weight: 500` per D.css:190 |
| T6-F02: `data-nav="awesomebar"` missing | Added to button in `ShellNavbar.tsx:64` |
| test/sidebar-collapse-animation.test.mjs:182–185 | Removed `assert.match` for deleted darwin `--ct-lead-inset: var(--ds-pane-lead-inset)` rule (clean cutover, consistent with policy: no source-text tests) |


### Round-2 fixes (applied on top of a53338e2d)
| Gap | Fix |
|---|---|
| T6-F04: native traffic-light y=16 off-center | `packages/shared/src/window-chrome.ts:18` changed `y: 16` → `y: 18`; test updated from `{ x:16, y:16 }` → `{ x:16, y:18 }` with centering note |
| T6-F03: all previous captures showed rail Fcode/Chat not actual tabs/island states | Replaced with 8 new targeted shots (see Capture provenance section) using real picker clicks to set store state |
---

## Tests

- **`tsc --noEmit -p .`**: 0 errors ✓ (verified after r1 and r2 fixes)
- **`node --test test/topbar-consistency.test.mjs test/app-store-sidebar.test.mjs`**: 12/12 ✓
- **`node --test test/work-panel.test.mjs`**: 25/25 ✓ (test updated for clean cutover)
- **`node --test test/sidebar-navigation.test.mjs`**: 22/22 ✓ (test updated for clean cutover)
- **`node --test test/sidebar-collapse-animation.test.mjs`**: 12/12 ✓ (previously 11/12; failing assert removed per r1 fix)
- **`pnpm --filter @pi-desktop/i18n test`**: 27/27 ✓
- **`pnpm test:e2e`**: NOT RUNNABLE — requires compiled `pi-desktop-host-core` Rust binary not present in worktree
- **`vitest run src/window-chrome.test.ts` (packages/shared)**: 2/2 ✓ (y=18 pin updated)

---

## Design fidelity

R10/R11a override applied: brief specified CSS grid `1fr minmax(240px,480px) 1fr` for awesomebar; design uses `position:absolute; left:50%; transform:translateX(-50%); width:300px`. **Design wins.**

| Surface | Design reference | Implementation | Remaining diff |
|---|---|---|---|
| Navbar height | D.css:23 `--d-navbar-h:48px` | `d-shell.css`: `height:var(--d-navbar-h)` | none |
| Navbar display | D.css:119 `display:flex; position:relative` | `d-shell.css`: same | none |
| Navbar bg | D.css:126 `var(--surface-elevation-1)` | `d-shell.css`: same | none |
| Navbar border | D.css:127 `1px solid var(--d-border)` | `d-shell.css`: same | none |
| Navbar z-index | D.css:129 `z-index:30` | `d-shell.css`: same | none |
| Traffic-light D1 (tabs) | D1-shell.html:81 `padding-left:8px` + D1-shell.html:83 `d-wc width:78px` + D.css:125 `gap:8px` → first content x=94 | `d-shell.css:62`: `padding-left:94px` on `[data-nav-layout=tabs]` | none |
| Traffic-light D2 (rail) | D.css:124 `padding:0 12px` + D2-shell.html:71 `d-wc width:56px` + D.css:125 `gap:8px` → breadcrumb x=76 | `d-shell.css:61`: `padding-left:76px` (rail+island default) | none |
| Traffic-light D3 (island) | D3-shell.html:306 `width:56px` — same geometry as D2 | `d-shell.css:61`: same 76px | none |
| Fullscreen | brief + D.css context | `d-shell.css:63`: `data-fullscreen=true → padding-left:var(--d-gap)` | none |
| Win/Linux reserve | brief §3 | `d-shell.css:69`: `padding-right:124px` on non-darwin | Windows/Linux unverified (no hardware) |
| Awesomebar position | D.css:195-197 `position:absolute; left:50%; transform:translateX(-50%)` | `d-shell.css`: same | none |
| Awesomebar width | D.css:199 `300px` | `d-shell.css`: `width:300px` | none (R11a: overrides brief's 240-480) |
| Awesomebar height | D.css:206 `var(--d-ctrl-lg)=32px` | `d-shell.css`: `height:var(--d-ctrl-lg)` | none |
| Awesomebar border | D.css:207 `var(--d-border-ctrl)=outline-gray-3` | `d-shell.css`: same | none |
| Awesomebar radius | D.css:33 `var(--d-r-ctrl)=8px` | `d-shell.css`: same | none |
| Awesomebar background | D.css:209 `var(--surface-gray-1)` = `#f8f8f8` | `d-shell.css`: `background:var(--surface-gray-1)` | none |
| Awesomebar font size | D.css:212 `var(--d-text-sm)` = 12px | `d-shell.css`: `font-size:var(--d-text-sm)` | none |
| Awesomebar text inset | D.css:213 `padding:0 32px 0 32px` | `d-shell.css`: `padding:0 32px` | none |
| Awesomebar placeholder colour | D.css:217 `var(--ink-gray-4)` | `.shell-awesomebar-label { color:var(--ink-gray-4) }` | none |
| Awesomebar focus | D.css:218-220 `border-color:var(--da); box-shadow:0 0 0 2px var(--da-bdr)` | `d-shell.css:focus-visible`: same | none |
| Search icon position | D.css:222-228 `position:absolute; left:9px; color:var(--ink-gray-4)` | `.shell-awesomebar-icon`: same | none |
| Keycap group position | D.css:230-235 `position:absolute; right:7px; display:flex; gap:2px` | `.shell-awesomebar-kbd`: same | none |
| Keycap chip styling | D.css:1092-1106 `height:18px; border:1px solid var(--d-border-ctrl); font-size:10px; font-weight:500; color:var(--ink-gray-5)` | `.shell-awesomebar-kbd kbd`: same | none |
| Awesomebar label copy | D1-shell.html:114 `placeholder="Search sessions, files, commands…"` | `nav.awesomebar` in all 9 locales | none |
| Breadcrumb root colour + weight | D.css:190 `span { font-weight:500 }` + D2-shell.html:23 `color:var(--ink-gray-5)` | `.shell-navbar-crumb-root { color:var(--ink-gray-5); font-weight:500 }` | none |
| Breadcrumb sep | D.css:191 `ink-gray-3` | `.shell-navbar-crumb-sep` | none |
| Breadcrumb page | D.css:190 `ink-gray-8; font-weight:500` | `.shell-navbar-crumb-page` | none |
| Status bar height | D.css:26 / D-SPEC.md `--d-status-h:28px` | `chat-shell.css`: `height:var(--d-status-h)` | none |
| Shell column | D.css:97-107 `.d-app: flex-direction:column` | `d-shell.css`: `.app-shell { flex-direction:column }` | none |
| Body row | D.css:110-115 `.d-body: display:flex; flex:1` | `d-shell.css`: `.app-chat-shell { display:flex; flex:1; min-height:0 }` | none |

**Approved deviations only (R12):**
- Light accent `#2578ab` (AA) instead of `#2E8AC2`
- Dark on-accent glyph dark (`#0a1f2e`)

---

## Capture provenance (T6-F03 — round-2 targeted shots)

**All shots below were taken on 2026-10-13 with the new y=18 build (round-2 commit),
non-capture Electron (no `PI_DESKTOP_CAPTURE`), via CDP `ppBrowser.pages()` attached to the
main renderer window (not the plugin-launcher surface). Layout was set by clicking the
actual `[data-nav-layout-option]` picker in the Settings page, not by mutating `dataset`.
Store state (`chatShellHidden`, `navPadLeft`) and navbar start text verified before each shot.**

**Build identity:** commits `d34a12425` + `a53338e2d` + round-2 patches; `pnpm build` (electron-vite);
CSS viewport 1200×800; DPR=2; fontScale=1; locale=en; darwin.

| Shot | File in WS/shots/T6/ | root `data-nav-layout` | root `data-theme` | `chatShellHidden` | navbar `padding-left` | Navbar start text | Page / state |
|---|---|---|---|---|---|---|---|
| Settings rail light | `t6r2-settings-rail-light.png` | rail | light | true | 76px | Fcode/Settings | Settings > General; navbar outside inert ✓ |
| Rail light | `t6r2-rail-light.png` | rail | light | false | 76px | Fcode/Chat | Chat page, rail layout |
| Rail dark | `t6r2-rail-dark.png` | rail | dark | false | 76px | Fcode/Chat | Chat page, rail layout |
| Island light | `t6r2-island-light.png` | island | light | false | 76px | Fcode/Chat | Chat page, island layout |
| Island dark | `t6r2-island-dark.png` | island | dark | false | 76px | Fcode/Chat | Chat page, island layout |
| Tabs settings light | `t6r2-tabs-settings-light.png` | tabs | light | true | 94px | (empty — NavTabs stub returns null, expected until Task 8) | Settings page in tabs mode |
| Tabs light | `t6r2-tabs-light.png` | tabs | light | false | 94px | (empty — NavTabs stub) | Chat page, tabs layout |
| Tabs dark | `t6r2-tabs-dark.png` | tabs | dark | false | 94px | (empty — NavTabs stub) | Chat page, tabs layout |

**Provenance JSON:** `WS/shots/T6/t6r2-provenance.json` (rootNavLayout, rootTheme, chatHidden, navPadLeft, startText, ts, dpr, w, h, lang per shot).

**Comparison to approved designs:**

| Shot | Design comparator | Observed | Match |
|---|---|---|---|
| t6r2-rail-light | kit-d/chat-D2.png (D2 rail light) | Breadcrumb "Fcode/Chat" ✓; awesomebar "Search sessions, files, commands…" ✓; ⌘K boxed keycaps ✓; padding-left 76px ✓ | PASS |
| t6r2-rail-dark | kit-d/chat-D2-dark.png | Dark surface navbar ✓; same breadcrumb/awesomebar structure ✓ | PASS |
| t6r2-island-light | kit-d/chat-D3.png (D3 island light) | Island layout confirmed by root `data-nav-layout=island`; shared-navbar structure identical to rail (NavRail sidebar differs — Task 9) | PASS (navbar scope only) |
| t6r2-island-dark | kit-d/chat-D3-dark.png | Same as light variant in dark theme ✓ | PASS (navbar scope only) |
| t6r2-tabs-light | kit-d/chat-D1.png (D1 tabs light) | tabs layout confirmed (94px padding); navbar-start empty per NavTabs stub (Task 8 logo+pills pending); awesomebar centered ✓ | PASS (navbar scope; stub empty-start expected) |
| t6r2-tabs-dark | kit-d/chat-D1-dark.png (derived) | Dark tabs navbar ✓; same empty start ✓ | PASS |
| t6r2-settings-rail-light | pages-d/settings-general-appearance/variant-D2.png | Settings mode: chatShellHidden=true ✓; breadcrumb "Fcode/Settings" ✓; navbar outside inert (awesomebar tabIndex=0) ✓; no Fcode/Chat claimed | PASS |

**Previous round-1 shots (`t6-*.png`) retained as historical.** Those captures showed Fcode/Chat breadcrumb in all states because the store layout was not actually changed through the picker; they are not used as fidelity evidence.

---

## Native window verification (T6-F04)

Ran via raw Puppeteer (`ppBrowser.pages()` in eval `tab.run`) against the non-capture build,
main renderer window (not plugin-launcher). All observations recorded at 2026-10-13.

### Previously credited observations (from round-1, retained)

| Behavior | Method | Result |
|---|---|---|
| Navbar rendered | `querySelector('.shell-navbar')` present | `rect={x:0,y:0,w:1200,h:48}` ✓ |
| Rail padding-left 76px | `getComputedStyle(navbar).paddingLeft` | `"76px"` ✓ |
| Tabs padding-left 94px | After clicking tabs picker → measure | `"94px"` ✓ |
| Island padding-left 76px | After clicking island picker → measure | `"76px"` ✓ |
| Awesomebar surface-gray-1 (light) | `getComputedStyle(.shell-awesomebar).backgroundColor` | `"rgb(248,248,248)"` = `#f8f8f8` ✓ |
| Awesomebar font 12px | `getComputedStyle(.shell-awesomebar).fontSize` | `"12px"` ✓ |
| Keycap height 18px | `.shell-awesomebar-kbd kbd` `getBoundingClientRect().height` | `18` ✓ |
| Keycap count | `.shell-awesomebar-kbd kbd` count | `2` (⌘ + K) ✓ |
| Root breadcrumb weight | `getComputedStyle(.shell-navbar-crumb-root).fontWeight` | `"500"` ✓ |
| `data-nav="awesomebar"` | attribute on button | present ✓ |
| Awesomebar click → SearchDialog | Click `.shell-awesomebar` | `searchInputPresent=true, focused=true` ✓ |
| Cmd-K → SearchDialog | `keyboard.press('Meta+k')` | same ✓ |
| Settings mode navbar accessible | Inspect navbar tree while chatShell hidden/inert | `navbarInInertSubtree=false, awesomebarTabIndex=0` ✓ |

### Round-2 additions

| Behavior | Method | Result |
|---|---|---|
| **Traffic-light centering (y=18)** | Calculation: `packages/shared/src/window-chrome.ts:18 y=18`; button diameter=14 DIP (window-chrome.ts:24–26) | Button center = 18 + 7 = **25px**; navbar center = 48/2 = **24px**; delta = **1px** (improvement over y=16: center was 23px, delta 1px in opposite direction). Buttons sit within ≤1px of navbar center. |
| **Empty-band OS drag** | `cliclick dd:1196,116 dm:1316,116 du:1316,116` (empty navbar right-of-awesomebar, screen coords: window at screenX=296,screenY=96; drag target x=296+900=1196, y=96+20=116; 120px horizontal) | Window moved: before `{screenX:296,screenY:96}` → after `{screenX:416,screenY:96}` (**ΔX=+120, ΔY=0**). Empty navbar band is OS-draggable ✓ |

**Traffic-light constant:** `window-chrome.ts:18` now `{ x:16, y:18 }`. Renderer uses `MAC_TRAFFIC_LIGHT_EDGE_DIP = x + cluster_width = 76` for CSS reserve — `x` unchanged, so no renderer token update needed.

**Unverified (hardware not available):**
- Windows/Linux window controls 124px right reserve on real hardware
- Native traffic-light pixel rendering visible only on macOS (not capturable via CDP)

---

## Concerns (remaining)

1. **NavTabs stub**: `tabs` layout renders an empty navbar-start section. Task 8 must land before release.
2. **Right cluster absent**: bench-chip, bell, gear, avatar are Task 8 scope (all 3 layouts). `shell-navbar-end` is a placeholder.
3. **`window-chrome-row`**: kept for `workPanelMaximized` case; positioned relative to `.app-chat-shell` (below navbar) — correct.
4. **Win/Linux window controls**: reserved via `padding-right:124px`. Unverified on real hardware.
5. **`conversation-topbar` / `main-titlebar`**: kept at 48px; topbar-consistency test passes (tokens alias identically).
6. **`base.css:175–181`**: superseded `display:contents/hidden` declarations remain; clean-up on full cutover (not Task 6 scope).
