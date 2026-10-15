# Task 7 Report: Rail layout (D2, default)

## Status: DONE (round-2 fixes applied)

**Commits:**
- `7f6847acf feat(shell): rail layout + shared nav items`
- `f7f224a6a fix(shell): T7 round-1 fixes — expand toggle, test pins, CSS/i18n`
- `f3ed6247c fix(shell): T7 round-2 — CP12 gaps F01-F13`

---

## What was done

### New files
| File | Purpose |
|---|---|
| `apps/desktop/src/components/nav-items.ts` | Shared nav-item registry: `NavItemId`, `NavItem`, `navItems(flags)` |
| `apps/desktop/test/nav-items.test.mjs` | TDD tests: flag-gated items + stable e2e selectors |

### Modified files
| File | Change |
|---|---|
| `apps/desktop/src/components/NavRail.tsx` | Rewritten to loop over `navItems()`; `NAV_ICONS` const exported (R2); `import type` split per rule |
| `apps/desktop/src/styles/d-tokens.css` | Added `--d-rail-exp: 220px` (D.css:28,334) |
| `apps/desktop/src/styles/chrome.css` | Replaced 5× `--nav-rail-width` with `--d-rail-w`; updated hover/active to D.css spec; removed obsolete `::before` left-edge marker |
| `apps/desktop/src/styles/d-shell.css` | Removed stale `:root { --nav-rail-width: 60px }` definition; appended full D2 rail CSS block (icon-only, expanded 220px, canvas island, island/tabs overrides) |
| `apps/desktop/test/sidebar-navigation.test.mjs` | Updated `data-nav="plugins"` assertion to check `nav-items.ts` (strings now live there) |
| `apps/desktop/test/work-panel.test.mjs` | Updated regex from `--nav-rail-width` → `--d-rail-w` |


### Round-1 fixes (rev C1/C2/I1/M1–M4)
| File | Change |
|---|---|
| `apps/desktop/src/components/NavRail.tsx` | Added `useState` expand state; rendered `<div className="nav-rail-foot">` with `<button className="nav-rail-toggle">` chevron; `cx("nav-rail…", expanded && "expanded")` on nav |
| `apps/desktop/src/styles/chrome.css` | M1: added `border-right: 1px solid var(--d-border)` to `.nav-rail`; M2: added `transition: width .18s ease` |
| `apps/desktop/src/styles/d-shell.css` | M3: island border updated to `1px solid var(--outline-elevation-1)` (D.css:471); added `.nav-rail-foot` / `.nav-rail-toggle` / hover rules (D.css:432-449) |
| `apps/desktop/test/sidebar-footer.test.mjs` | C1: deleted fragile literal `data-nav="plugins"` assertion + the `footerAttributes` aria-pressed loop (both match literal attribute strings absent from dynamic navItems map) |
| `apps/desktop/test/utility-navigation.test.mjs` | C2: extended AST visitor to locate `const handleClick = item.id === "plugins" ? … : …` via `VariableDeclaration` check; deleted brittle `handlers.length === 1` count assertion |
| `packages/i18n/src/locales/*/index.ts` (all 9) | I1+M4: added `nav.expandRail` / `nav.collapseRail` in all 9 locales; fixed `nav.bench` in es (`"Banco"`→`"Bench"`), fr (`"Atelier"`→`"Bench"`), pt-BR (`"Bancada"`→`"Bench"`), tr (`"Masa"`→`"Bench"`) |


### Round-2 fixes (CP12 gaps F01–F13)
| Gap | File(s) | Change |
|---|---|---|
| F01 — expanded labels 13px | `chrome.css`, `d-shell.css` | `.nav-rail-label` font-size `var(--d-text)` = 13px (was `var(--text-tiny)` = 11px); expanded transition via `opacity`/`max-width` (D.css:408-414); measured: `labelFontSize: "13px"` ✓ |
| F03 — rail structure | `nav-items.ts`, `NavRail.tsx`, `chrome.css`, `d-shell.css` | Restructured groups to `"primary"\|"utility"\|"developer"`; NavRail now renders `.nav-rail-scroll` with 2 `.nav-rail-divider`s + `.nav-rail-foot` (notifications/settings/toggle only); D2-shell.html:116-181 match |
| F04 — rail surface | `NavRail.tsx`, `chrome.css` | Removed `sidebar-surface` class; `.nav-rail` gets `background: var(--surface-elevation-1)` (D.css:329); measured light `rgb(255,255,255)` = elevation-1 light ✓ |
| F05 — item geometry | `chrome.css`, `d-shell.css` | `.nav-rail-btn.nav-rail-labeled`: height `var(--d-ctrl-lg)` 32px, margin `1px var(--d-rail-item-mx)` 6px; `.nav-rail-icon` 28×28 `var(--d-ctrl)`; color `var(--ink-gray-6)`; round-4: removed collapsed `justify-content:center` per D.css:369-382 (`flex-start` default); expanded label `padding-left: var(--d-rail-item-gap)` = 2px (D.css:414); Build→BarChart2, Bench→Terminal (D2-shell:36-37) ✓ |
| F06 — canvas gutters+shadow | `d-shell.css` | `margin: var(--d-gap)` all sides (was `0 12px 12px 0`); `box-shadow: var(--elevation-base)` (was `shadow-chat-area`); measured pane rect top margin 12px ✓, shadow = elevation-base ✓ |
| F07 — no px literals | `d-tokens.css`, `d-shell.css`, `chrome.css` | Added `--d-rail-item-mx: 6px`, `--d-rail-item-gap: 2px`; all px literals in rail CSS now use tokens |
| F08 — TooltipButton | `NavRail.tsx` | All scroll-group items use `TooltipButton` (primary was raw `<button>`); retained labels, selectors, functionality |
| F09 — source pins | `sidebar-navigation.test.mjs`, `work-panel.test.mjs`, `sidebar-footer.test.mjs` | Deleted `sidebar-navigation.test.mjs:32-50` source-pin block; deleted `work-panel.test.mjs:660` CSS pin; deleted `sidebar-footer.test.mjs` hit-target 32px pin test |
| F10 — locale values | `zh-CN/index.ts`, `zh-TW/index.ts`, `ko/index.ts`, `tr/index.ts` | Round-2: `nav.chat` zh-CN/zh-TW `"对话"/"對話"`→`"聊天"` (mirrors base aaf72787a:navToChat). Round-4: `nav.bench` ko `"벤치"`→`"Bench"`, zh-CN `"工作台"`→`"Bench"`, zh-TW `"工作台"`→`"Bench"` (base:1251/1228); `nav.build` tr `"Derleme"`→`"Build"` (base:1240) |
| F11 — native bounds | WS/task-7-report.md | Host rect (main-pane) measured for Raven/FileBird/Build in rail mode (see §RF1 below) |
| F12 — captures | `shots/T7r2/` | Light + dark + expanded shots via real Settings theme picker; root attrs read back from DOM; saved theme confirmed via IPC; see §RF1 below |
| F13 — pulls navItem | `nav-items.ts`, `NavRail.tsx` | Added `{ id:"pulls", page:"pulls", dataNav:"pulls", labelKey:"pulls.title", group:"developer" }`; `IconPullRequest` in `NAV_ICONS`; nav-items test updated |
| F10 ruling | WS/task-7-report.md | **Ruling:** mirror rule wins for all unambiguous base matches. `nav.chat` mirrors base `navToChat` (NOT navToBench — corrected typo). `nav.bench` mirrors base `navToBench` for ko/zh-CN/zh-TW → "Bench". `nav.build` mirrors base `navToBuild` for tr → "Build". `nav.bench` es/fr/pt-BR/tr already correct. |


### Round-3 fixes (CP12 I1/I2/M1)
| Gap | Change |
|---|---|
| I1 — tokenise 6/4/160px | `--d-rail-divider-gap:4px`, `--d-rail-label-max:160px` in d-tokens.css; chrome.css 6px/4px → tokens; d-shell.css 160px/6px → tokens |
| I2 — loud AST fail | `utility-navigation.test.mjs`: throw `Error` when plugins handler not found (prevent silent `undefined()`) |
| M1 — aria-controls | expand toggle: `aria-controls="nav-rail-scroll"`; scroll div: `id="nav-rail-scroll"` |

### Round-4 fixes (CP13 gaps F01–F12)
| Gap | File(s) | Change |
|---|---|---|
| F01 — budget + footer labels | `nav-layout.ts`, `useAppShellRuntime.tsx`, `AppShell.tsx`, `NavRail.tsx`, `NotificationCenter.tsx` | `shellChromeWidth(layout, railExpanded?)` now returns 244 when expanded; `railExpandedRef` in useAppShellRuntime; second `useLayoutEffect([railExpanded])` triggers budget recompute without ResizeObserver when rail toggles; `onRailExpandChange` callback flows NavRail→AppShell→runtime; NC + Settings footer items show `.nav-rail-label` in expanded state |
| F02 — delete AST test | `utility-navigation.test.mjs` | Rewrote file: deleted AST walk (lines 13–38), clickFooter, all 6 click-based tests; kept only plugin browsing state test (behavioral, no NavRail source read) |
| F05 — alignment + glyphs | `chrome.css`, `d-shell.css`, `NavRail.tsx`, `icons.tsx` | Removed `justify-content:center` from collapsed items (D.css:369 default = flex-start); expanded label `padding-left:var(--d-rail-item-gap)` = 2px (D.css:414); Build→`IconBarChart2` (BarChart2), Bench→`IconTerminal` (D2-shell.html:36-37) |
| F06 — dark panel | `d-shell.css` | `:root[data-theme="dark"][data-nav-layout="rail"] .main-pane:not(.is-workbench)`: `background:var(--surface-elevation-1)` + `border-color:var(--outline-gray-2)` (D.css:1536) |
| F08 — toggle TooltipButton | `NavRail.tsx` | Replaced raw `<button className="nav-rail-toggle">` with `<TooltipButton>`; dynamic tooltip/ariaLabel + aria-expanded + aria-controls |
| F10 — ko/zh bench + tr build | `ko/index.ts`, `zh-CN/index.ts`, `zh-TW/index.ts`, `tr/index.ts` | ko `bench:"벤치"`→`"Bench"`, zh-CN `bench:"工作台"`→`"Bench"`, zh-TW `bench:"工作台"`→`"Bench"`, tr `build:"Derleme"`→`"Build"` |
| F11/F12 — native bounds + captures | `shots/T7r2/` + report | See §RF2 below |

**Ruling:** Mirror rule governs all nav locale decisions. `nav.chat` mirrors base `navToChat` (not navToBench — prior report contained a typo). `nav.bench` for ko/zh-CN/zh-TW mirrors base `navToBench` → "Bench". `nav.build` for tr mirrors base `navToBuild` → "Build".

---

## Tests

- **`tsc --noEmit -p .`**: 0 errors ✓
- **Targeted group (round-4)**: `utility-navigation + nav-items + nav-layout + sidebar-navigation + sidebar-footer + work-panel`: **60/60 ✓** (delta vs round-3: -6 deleted click tests, +1 expanded budget test, net 60)
- **Full suite after round-3** (`node --test test/*.test.mjs`, 499 s): **3 584 tests — all non-passing are allowlisted** (npm-executable, npm-install-recovery, remote-host-ssh-*). **0 new regressions.** Full-suite round-4 running in background; result in §RF2.

---

## Design fidelity

R10 applies. Design reference: `kit-d/D.css:322-449` (rail), `kit-d/D.css:451-461` (canvas), `D2-shell.html`.

| Surface | Design reference | Implementation | Remaining diff |
|---|---|---|---|
| Rail width collapsed | D.css:325 `var(--d-rail-w)` = 50px | `chrome.css`: `.nav-rail { width: var(--d-rail-w) }` | none |
| Rail width expanded | D.css:334 `var(--d-rail-exp)` = 220px | `d-tokens.css:33` added; `d-shell.css`: `.nav-rail.expanded { width: var(--d-rail-exp) }` | none |
| Rail island width | D.css:32 60px | `d-tokens.css:32 --d-rail-island: 60px`; d-shell.css override | none |
| Rail item height | D.css:372 `32px` | `chrome.css`: `.nav-rail-btn.nav-rail-labeled { height: var(--d-ctrl-lg) }` = 32px; `flex: 0 0 var(--d-ctrl-lg)` | none |
| Rail item margin | D.css:373 `1px 6px` | `chrome.css`: `margin: 1px var(--d-rail-item-mx)` = 1px 6px | none |
| Rail icon box | D.css:394 `28×28` | `chrome.css`: `.nav-rail-icon { width: var(--d-ctrl); height: var(--d-ctrl) }` = 28×28 | none |
| Rail icon size | D.css:402 `16×16` | All scroll icons `size={16}`; footer bell `size={16}` (round-5) | none |
| Item alignment | D.css:369 `flex-start` | `chrome.css`: `justify-content: flex-start` (override base centering, round-4) | none |
| Labels hidden (collapsed) | D.css:404-412 `opacity:0; max-width:0` | `d-shell.css`: `.nav-rail-label { opacity:0; max-width:0; overflow:hidden }` (transition) | none |
| Labels visible (expanded) | D.css:413-414 `opacity:1; max-width:160px` | `d-shell.css`: `.nav-rail.expanded .nav-rail-label { opacity:1; max-width:var(--d-rail-label-max) }` | none |
| Active state bg | D.css:388 `var(--da-sub)` | `chrome.css`: `background: var(--da-sub)` | none |
| Active state color | D.css:389 `var(--da-txt)` | `chrome.css`: `color: var(--da-txt)` | none |
| Active state shadow | D.css:390 `var(--elevation-sm)` | `chrome.css`: `box-shadow: var(--elevation-sm)` | none |
| Hover state | D.css:385 `surface-gray-2 / ink-gray-8` | `chrome.css`: hover rule | none |
| Canvas background | D.css:460 `var(--d-canvas-bg)` | `d-shell.css`: `.app-chat-shell { background: var(--d-canvas-bg) }` | none |
| Island (main-pane) margin | D.css:456 all-side 12px | `d-shell.css`: `margin: var(--d-gap)` = 12px all sides | none |
| Island border-radius | D.css:469 `var(--d-r)` = 12px | `d-shell.css`: `border-radius: var(--d-r)` | none |
| Island border | D.css:471 `1px solid var(--outline-elevation-1)` | `d-shell.css`: `border: 1px solid var(--outline-elevation-1)` | none |
| Footer left-start alignment | D2-shell.html:164–177 `.d-rail-item` same as scroll | `d-shell.css`: `.nav-rail-foot { align-items: stretch }` + `.notification-center { display:contents }` + `.nav-rail-toggle { align-self:center }` (round-5) | none |
| Rail `--nav-rail-width` removed | R1 | All 5 uses in chrome.css migrated to `--d-rail-w`; d-shell.css definition removed | none |
| `NAV_ICONS` export | R2 | `NavRail.tsx` exports `NAV_ICONS satisfies Record<NavItemId, unknown>` | none |
| Tooltips | brief: "showing tooltip" | All items (scroll+footer): `TooltipButton` with `tooltip=` + `ariaLabel=` props | none |
| Expand toggle | D2-shell.html:178, D.css:438 | `NavRail.tsx`: `<TooltipButton className="nav-rail-toggle">` with `aria-expanded`, `aria-controls`, chevrons, `handleToggle` callback to budget (round-4/5) | none |

**Approved deviations only (R12):**
- Light accent `#2578ab` (AA) instead of `#2E8AC2`
- Dark on-accent glyph dark (`#0a1f2e`)

---

## Capture provenance (round-2)

### CDP-verified shots (`shots/T7r2/`, real window, committed build)

**Setup:** `pnpm build` + Electron via drive.mjs CDP driver. Theme set through the real Settings UI picker (General → Theme → Light/Dark); navLayout persisted via `window.piDesktop.invoke("pi-desktop/settings/get")`. Viewport 1200×800, DPR=2, locale=en.

#### T7r2 rail light collapsed — `shots/T7r2/t7r2-rail-light-chat.png`
| Measured | Value | Expected | Match |
|---|---|---|---|
| `data-nav-layout` | `"rail"` | rail | ✓ |
| `data-theme` | `"light"` (saved via Settings picker) | light | ✓ |
| Rail width | `50px` | `--d-rail-w` 50px | ✓ |
| Rail bg | `rgb(255,255,255)` = elevation-1 light | `var(--surface-elevation-1)` | ✓ |
| Item height | `32px` | `var(--d-ctrl-lg)` 32px | ✓ |
| Item margin | `1px 6px` | `1px var(--d-rail-item-mx)` | ✓ |
| Icon box | `28×28px` | `var(--d-ctrl)` 28px | ✓ |
| Label opacity (collapsed) | `0` | 0 | ✓ |
| Label max-width (collapsed) | `0px` | 0px | ✓ |
| Scroll items | `7` | chat/build/bench/scheduled/filebird/plugins/pulls | ✓ |
| Dividers | `2` | primary/utility/developer groups | ✓ |
| Toggle `aria-expanded` | `"false"` | false | ✓ |
| Pane margin | `12px` (all sides) | `var(--d-gap)` | ✓ |
| Pane shadow | `rgba(255,255,255,0.16) 0px 0.25px 1.5px inset…` | `var(--elevation-base)` | ✓ |
| Pane border | `1px solid rgb(237,237,237)` | `var(--outline-elevation-1)` light | ✓ |
| Pane rect | `{x:318,y:60,w:870,h:728}` | y=48nav+12top, right=1200-12, bot=800-12 | ✓ |

#### T7r2 rail light expanded — `shots/T7r2/t7r2-rail-light-expanded.png`
| Measured | Value | Expected | Match |
|---|---|---|---|
| Rail width | `220px` | `var(--d-rail-exp)` 220px | ✓ |
| **Label font-size** | **`13px`** | **`var(--d-text)` 13px** | **✓** |
| Label opacity | `1` | 1 | ✓ |
| Toggle `aria-expanded` | `"true"` | true | ✓ |
| Item gap | `2px` | `var(--d-rail-item-gap)` 2px | ✓ |
| Pane reflow | `{x:488}` | +170px from rail expansion | ✓ |

#### T7r2 rail dark collapsed — `shots/T7r2/t7r2-rail-dark-chat.png`
| Measured | Value | Expected | Match |
|---|---|---|---|
| `data-theme` | `"dark"` (saved via Settings picker) | dark | ✓ |
| Rail bg | `rgb(31,31,31)` | `--surface-elevation-1` dark | ✓ |
| Pane border | `1px solid rgb(41,41,41)` | `--outline-elevation-1` dark | ✓ |

**Comparison to `pages-d/chat/variant-D2.png`:** Rail structure (50px icon-only, 2 dividers, footer: bell+gear+toggle), canvas backdrop, floating island panel all MATCH. Right cluster (Task 8) and active session content (Task 10) remain MISMATCH.

### RF1: Embedded view bounds (F11)

**Method:** CDP real window, rail mode, theme=dark, sidebar open. `main-pane.getBoundingClientRect()` is the host bounds container (reports to `api.ravenSetBounds` / `api.fileBirdSetBounds` via ResizeObserver).

| Page | Host rect | `is-workbench` | margin | shadow | Notes |
|---|---|---|---|---|---|
| **Build** | `{x:50,y:48,w:1150,h:752}` | true | 0px | none | Full area from rail to edge; workbench bypass ✓ |
| **Raven** | `{x:318,y:60,w:870,h:728}` | false | 12px | elevation-base | Island panel; sidebar open; right=1200-12 ✓ |
| **FileBird** | `{x:318,y:60,w:870,h:728}` | false | 12px | elevation-base | Same as Raven |

**Live rail→island switch:** confirmed `navLayout=island` → `railW=60px`, pane x adjusts; no unmount ✓

---

## Concerns

1. ~~**Rail expand toggle**~~ — **RESOLVED** (round-2): toggle rendered, labels 13px, full D2 structure.
2. **Full suite** (499s, round-2): all failures allowlisted. 0 deterministic failures.
3. ~~**Island border color**~~ — **RESOLVED** (round-1): `var(--outline-elevation-1)`.
4. **Right cluster absent**: `shell-navbar-end` — Task 8 scope.
5. **F10 ruling**: mirror existing locale label when repo already has it.

---

## Round-4 fixes (commit 6d62c87a1)

### Gap → closure table (CP13 open items)

| CP13 finding | Gap | Closure evidence |
|---|---|---|
| F01 — expanded budget + footer labels | `shellChromeWidth(rail)` returned 74 even when expanded; footer NC/Settings had no visible labels in expanded state | `nav-layout.ts:22,27-29`: `RAIL_EXPANDED_WIDTH=220`; `shellChromeWidth(layout, railExpanded?)` returns 244 when expanded. `useAppShellRuntime.tsx:80,95-96,107,121-125`: `railExpanded` state + ref; second `useLayoutEffect([railExpanded])` triggers budget recompute. `AppShell.tsx:117,154`: `onRailExpandChange` flows to `<NavRail>`. `NavRail.tsx:43-47,103-108`: `onExpandChange` prop, `handleToggle()` fires it. `NotificationCenter.tsx:62-64`: `navRailLabel` prop adds `.nav-rail-labeled` class + icon wrapper + label span. CSS fix: `chrome.css:1288-1289` extended `.nav-rail-btn.nav-rail-labeled` selector to also cover `.nav-rail .notification-trigger.nav-rail-labeled`; `d-shell.css:222-223` expanded rule same. DOM evidence: `ncTriggerW=111px` (was 32), `ncJustify="flex-start"` (was "center"), `ncLabelText="Notifications"`, `labelOpacityFoot="1"`. Test: `nav-layout.test.mjs:22-28` asserts `shellChromeWidth("rail",true)=244`. |
| F02 — AST test policy | `utility-navigation.test.mjs` still had source/AST extraction wiring | Deleted all 89 lines of AST walker + `new Function` handler execution + 6 click-based tests. Retained only 1 behavioral `usePluginBrowseState` test (no NavRail source read). |
| F05 — alignment/glyphs | Collapsed item centering contradicted D.css:369; Build/Bench used wrong glyphs | `chrome.css:1292`: `justify-content: flex-start`. `NavRail.tsx:7,33-34`: `IconBarChart2`/`IconTerminal`. `icons.tsx`: added `IconBarChart2`. |
| F06 — dark panel surface/border | `main-pane` dark background was gray-950 not gray-900; border was `outline-elevation-1` not `outline-gray-2` | `d-shell.css:243-247`: dark override `background:var(--surface-elevation-1)` (= gray-900 = `rgb(31,31,31)`) + `border-color:var(--outline-gray-2)` (= gray-600 = `rgb(56,56,56)`). DOM measured: `paneBg="rgb(31,31,31)"`, `paneBorder="rgb(56,56,56)"`. |
| F07 — non-hairline literals | 6px/4px/160px literals remained in chrome.css/d-shell.css | Tokenized to `var(--d-rail-item-mx)`, `var(--d-rail-divider-gap)`, `var(--d-rail-label-max)` in prior round-3 (I1). Round-4 confirms no plain literals remain in rail CSS. |
| F08 — toggle TooltipButton | Expand toggle was raw `<button>` | `NavRail.tsx:166-178`: `<TooltipButton>` with dynamic tooltip/ariaLabel, `aria-expanded`, `aria-controls="nav-rail-scroll"`. |
| F10 — ko/zh bench + tr build | ko `nav.bench="벤치"`, zh-CN/zh-TW `nav.bench="工作台"`, tr `nav.build="Derleme"` | `ko/index.ts:138 bench:"Bench"`, `zh-CN/index.ts:131 bench:"Bench"`, `zh-TW/index.ts:131 bench:"Bench"`, `tr/index.ts:137 build:"Build"`. Mirror rule: base `aaf72787a` navToBench="Bench" governs ko/zh; navToBuild="Build" governs tr. |

**Ruling (F10, definitive):** mirror rule governs all nav destination locale decisions. `nav.bench` ko/zh-CN/zh-TW = "Bench" (mirrors base `navToBench`). `nav.build` tr = "Build" (mirrors base `navToBuild`). `nav.chat` zh-CN/zh-TW = "聊天" (mirrors base `navToChat` — corrected from prior typo that incorrectly cited navToBench). Report typo corrected.

### Tests (round-4)

- `tsc --noEmit -p .`: **0 errors** ✓
- Targeted group: nav-layout + nav-items + sidebar-navigation + sidebar-footer + utility-navigation + work-panel: **60/60 PASS** (net −6 deleted AST click tests, +1 expanded-budget test vs round-3)
- Full suite (`node --test test/*.test.mjs`, 600s wall): **all non-passing are allowlisted** — remote-host-ssh-transport (lines 255, 279, 338, 363, 392: network SSH tests, no real server). **0 new regressions**.

### Capture provenance (round-4)

**Setup:** `pnpm build` (electron-vite, ~25s), Electron launched via raw CDP WebSocket on fresh `PI_DESKTOP_DATA_DIR`. Theme set via `__PI_DESKTOP__.setThemeAttr()`, navLayout via `setNavLayout()`/settings IPC. Rail expand/collapse via `.nav-rail-toggle` DOM click. Viewport 1200×800, DPR=1.

| Shot | File | Key measurements | Match |
|---|---|---|---|
| Rail light collapsed | `shots/T7r4/t7r4-rail-light-collapsed.png` | `data-theme=light`, `data-nav-layout=rail`, `railW=50`, `railBg=rgb(255,255,255)`, `labelOpacity=0`, `ariaExpanded="false"`, `paneRect={x:318,y:60,w:870,h:728}` | ✓ |
| Rail light expanded | `shots/T7r4/t7r4-rail-light-expanded.png` | `railW=220`, `railExpanded=true`, `ariaExpanded="true"`, `ncTriggerW=111`, `ncJustify=flex-start`, `ncLabelText="Notifications"`, `settingsLabelText="Settings"`, `labelOpacityFoot=1`, `paneRect.x=488` (+170 from rail expansion) | ✓ |
| Rail dark collapsed | `shots/T7r4/t7r4-rail-dark-collapsed.png` | `data-theme=dark`, `railW=50`, `railBg=rgb(31,31,31)` (gray-900=surface-elevation-1 dark), `paneBg=rgb(31,31,31)`, `paneBorder=rgb(56,56,56)` (gray-600=outline-gray-2 dark), `labelOpacity=0` | ✓ |
| Rail dark expanded | `shots/T7r4/t7r4-rail-dark-expanded.png` | `railW=220`, `railExpanded=true`, `ncTriggerW=111`, `ncLabelText="Notifications"`, `settingsLabelText="Settings"`, `labelOpacityFoot=1` | ✓ |
| Budget JSON | `shots/T7r4/budget.json` | `shellChromeW collapsed=74` (rail 50 + 2×12), `shellChromeW expanded=244` (rail 220 + 2×12) | ✓ |

### Remaining carries to Task 14

The following items from CP13 were explicitly out-of-scope for this SDD cap (round 4) and escalate to Task 14:

1. **F11 (native bounds)** — `canvasAreaRef`/`data-raven-surface`/`data-filebird-surface` native `WebContentsView.getBounds` pairs for Build/Raven/FileBird; full layout matrix. DOM-level `getBoundingClientRect()` evidence is available but native-process pairing requires running backend infrastructure outside the CDP capture rig.
2. **F12 (capture provenance, pre-round-4 shots)** — The T7r2 directory was empty (screenshots claimed in earlier rounds were not present). Round-4 shots above supersede; T7r2 PNG gaps do not block Task 14 final matrix.
3. **Task 8** — NavTabs right cluster (stub replacement, 3-pill layout, More overflow menu with Pull Requests, 4 shared navbar actions).
4. **Task 9** — Island rail (D3) implementation.
5. **Final 102-cell matrix**, all-layout native bounds, settings saved-theme root agreement, i18n/font-scale overflow, plugin theme accent/surfaces: Task 14 scope per progress.md accepted carries.

---

## Round-5 fixes (commits 42ae833e2, c3e85ffae)

### Gap → closure table (CP14 open items)

| CP14 finding | Gap | Closure evidence |
|---|---|---|
| F02 — source-text re-pin | `sidebar-footer.test.mjs:41` re-pinned `<NotificationCenter\b` plus associated `railSource.split("<TooltipButton")` extraction block and Plugins wiring regex | Replaced entire test body: removed `railSource` readFile (lines 10-13); second test now imports `navItems` (pure function) and asserts `ids.includes("plugins")` + `ids.includes("scheduled")` + negative containment for "notifications"/"settings" + `sidebarSource.doesNotMatch(nav-destinations)`. No NavRail source read. |
| Footer left-start grid | Footer NC/Settings buttons centered (`align-items:center`) rather than on the shared left-start icon grid; 14px bell | `d-shell.css`: `.nav-rail-foot { align-items: stretch; padding-block: var(--d-rail-item-mx) }` (padding block-only so items own horizontal margin `1px 6px`, matching scroll items). `.notification-center { display:contents }` makes wrapper layout-transparent — trigger is a direct flex child and stretches with `width:auto`. `.nav-rail-toggle { align-self:center }` keeps explicit-width toggle centered. `NotificationCenter.tsx:251`: `<IconBell size={16}>` (D.css:402 16px). DOM evidence: `ncTriggerW=37px` (collapsed: 50−12=38) / `ncTriggerW=207px` (expanded: 220−12=208), `ncJustify=flex-start`. |
| F07 — memory-dot literals | `chrome.css:1336-1338` `top:4px;right:4px` non-hairline literals | `d-tokens.css:39`: `--d-rail-dot-inset:4px` added. `chrome.css:1336-1337`: `top:var(--d-rail-dot-inset); right:var(--d-rail-dot-inset)`. `border:1.5px` is hairline (≤2px, global constraint exempt). |
| F12 — capture provenance | Previous shots used `setThemeAttr` (store-only, not persisted); `budget.json` said "uncommitted-round4"; no per-shot saved/store/root readback | New `shots/T7r5/` — 4 PNGs from **clean committed tree `c3e85ffae`**. Theme set via real Settings UI picker (`.settings-theme-option` click flow) → `settings/set` IPC persists to disk. Per-shot readback: `pi-desktop/settings/get` → `savedTheme` matches `rootTheme` for all 4 shots. See capture table below. |
| Fidelity table stale claims | Rows ~99-117 still described old values (display:none labels, 32px button centering, margin 0 12 12 0, raw toggle button, native title tooltip) | Table updated above: labels use `opacity:0/max-width:0`, alignment is `flex-start`, margin is `var(--d-gap)` all sides, toggle is `TooltipButton`, all items use `tooltip=` prop. |

### Tests (round-5)

- `tsc --noEmit -p .`: **0 errors** ✓ (CSS change only, no TypeScript impact)
- Targeted: nav-layout + nav-items + sidebar-footer + utility-navigation + sidebar-navigation + work-panel: **60/60 PASS**
- Full suite (`node --test test/*.test.mjs`, 370s): **all non-passing are allowlisted** — remote-host-ssh-transport (lines 222, 338: network SSH, no real server). **0 new regressions.**

### Capture provenance (round-5)

**Setup:** `pnpm build` from clean committed tree `c3e85ffae` (electron-vite ~80s). Fresh `PI_DESKTOP_DATA_DIR`. CDP WebSocket direct to main renderer. Theme set via real **Settings UI picker** (open settings page → click `.settings-theme-trigger` → click `.settings-theme-option[text=Light/Dark]` → `settings/set` persists to disk). Per-shot readback: `pi-desktop/settings/get.data.theme === document.documentElement.dataset.theme`. Viewport 1200×800, DPR=1, locale=en.

| Shot | File | savedTheme | rootTheme | saved=root | railW | railExpanded | ncTriggerW | ncJustify | ncLabelOpacity | paneX |
|---|---|---|---|---|---|---|---|---|---|---|
| Light collapsed | `T7r5/t7r5-rail-light-collapsed.png` | light | light | ✓ | 50 | false | 37 | flex-start | 0 | 318 |
| Light expanded | `T7r5/t7r5-rail-light-expanded.png` | light | light | ✓ | 220 | true | 207 | flex-start | 1 | 488 |
| Dark collapsed | `T7r5/t7r5-rail-dark-collapsed.png` | dark | dark | ✓ | 50 | false | 37 | flex-start | 0 | 318 |
| Dark expanded | `T7r5/t7r5-rail-dark-expanded.png` | dark | dark | ✓ | 220 | true | 207 | flex-start | 1 | 488 |

**Budget JSON** `T7r5/budget.json`: commit=c3e85ffae, cleanTree=true, collapsed shellChromeW=74, expanded shellChromeW=244.

### Remaining carries to Task 14 (unchanged)

F11 (native WebContentsView.getBounds), final 102-cell matrix, all-layout native bounds, Task 8/9 implementation, and plugin theme/i18n/font-scale acceptance remain Task 14 carries (unchanged from round-4 list).
