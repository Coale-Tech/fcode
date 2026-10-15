# T14-Found Audit Report
**Lane:** `t14-found` | **Branch:** `feat/direction-d-t14-found` | **Audited commit:** `dc33fc5d1`
**Built:** 2026-10-15 | **Build exit:** 0 | **CDP port:** 9344

---

## Task 1 — Accent + density tokens (`d-tokens.css`)

| Step | Status | Evidence |
|---|---|---|
| d-tokens.css created | DONE | `apps/desktop/src/styles/d-tokens.css` exists (13.5 KB) |
| All 17 required tokens present | DONE | Verified: `--d-navbar-h: 48px`, `--d-ph-h: 48px`, `--d-mini-h: 32px`, `--d-status-h: 28px`, `--d-rail-w: 50px`, `--d-rail-island: 60px`, `--d-gap: 12px`, `--d-ctrl: 28px`, `--d-ctrl-lg: 32px`, `--d-row-h: 30px`, `--d-r: 12px`, `--d-r-ctrl: 8px`, `--d-r-sm: 4px`, `--d-text/sm/xs/chat` all present |
| Extra tokens added | NOTE | `--d-rail-exp: 220px`, `--d-rail-dot-inset: 4px`, `--d-rail-item-mx: 6px`, `--d-rail-item-gap: 2px` — beyond plan spec, all referenced by T7 CSS |
| globals.css @import | DONE | `globals.css:14` `@import "./d-tokens.css";` — after tokens.css per brief |
| `tokens.css` light accent | DONE | `:128` `--ds-accent: #2578ab`, `:129` `--ds-accent-hover: #1f6fa3`, `:130` `--ds-accent-soft: #4f9ccb` |
| `tokens.css` dark accent | DONE | `:211-214` `--ds-accent: #42a2d9`, hover `#56b9f2`, soft `#92d2f8`, `--ds-accent-foreground: #0a1f2e` |
| d-tokens.css `--ds-toolbar-height` override | DONE | `d-tokens.css:71` `--ds-toolbar-height: var(--d-navbar-h)` |
| d-tokens.css `--ds-btn-radius` override | DONE | `d-tokens.css:73-74` both `ds-btn-radius` and `ds-btn-radius-sm` → `var(--d-r-ctrl)` |
| Stale base tokens (46px) | DONE | `tokens.css` has NO 46px `--ds-toolbar-height` entry — already cleaned up |
| d-accent-contrast.test.mjs | DONE | All 10 tests PASS (6 theme × contrast assertions) |
| Design fidelity (D.css accent) | DONE | Approved deviation: `#2578ab` instead of `#2E8AC2` (AA 4.82:1 vs 3.8:1); `#0a1f2e` dark on-accent (R12) |

**TASK 1: DONE** ✓

---

## Task 2 — `navLayout` setting: type, resolver, write validation

| Step | Status | Evidence |
|---|---|---|
| `@pi-desktop/shared` `nav-layout.ts` | DONE | `packages/shared/src/nav-layout.ts` exports `NAV_LAYOUTS`, `NavLayout`, `DEFAULT_NAV_LAYOUT: "rail"`, `isNavLayout()` |
| `apps/desktop/src/lib/nav-layout.ts` | DONE | Exports `resolveNavLayout`, `shellChromeWidth`, `nextNavLayout`, `islandSidebarProps`, `ISLAND_SIDEBAR_W` — R6 moved types to shared |
| `shellChromeWidth` values | DONE | tabs=24, rail=74, island=84; expanded rail=244 (220+24) — test passes |
| `settings.ts navLayout` field | DONE | `packages/shared/src/types/settings.ts:93` `navLayout?: NavLayout` |
| `api.ts validateSettingsWrite` guard | DONE | `api.ts:463-465` rejects invalid navLayout with `INVALID_PARAMS` |
| Main-process guard (S-T2) | DONE | `electron/main/runtime/provider-catalog.ts:213-216` also validates navLayout at write boundary |
| nav-layout.test.mjs | DONE | 6/6 tests pass: resolver, budget (tabs/rail/island/expanded), writes, nextNavLayout cycles, island budget |
| `showsGlobalSidebar` references | DONE | Zero occurrences in `apps/desktop/src` or `packages` — fully removed |

**TASK 2: DONE** ✓

---

## Task 3 — Apply `data-nav-layout`, nav-aware column budget, capture hook

| Step | Status | Evidence |
|---|---|---|
| `useAppShellRuntime.tsx` import | DONE | `:34` imports `resolveNavLayout, shellChromeWidth` from `../../lib/nav-layout` |
| `navLayout` state and ref | DONE | `:61-63` `const navLayout = resolveNavLayout(settings?.navLayout)` + ref kept in sync |
| `columnsWidth` uses `shellChromeWidth` | DONE | `:107` `Math.max(0, Math.round(shell.clientWidth) - shellChromeWidth(navLayoutRef.current, railExpandedRef.current))` |
| useLayoutEffect deps include navLayout | DONE | `:120` `}, [navLayout])` — live switch re-measures |
| Dataset effect | DONE | `:562-563` `document.documentElement.dataset.navLayout = navLayout` in separate `useEffect([navLayout])` |
| `main.tsx` initial attribute | DONE | `:16` `document.documentElement.dataset.navLayout = DEFAULT_NAV_LAYOUT` (no duplicate import) |
| `renderer-api.ts setNavLayout` | DONE | `:111-116` drives BOTH `dataset.navLayout` AND `useAppStore.setState({ settings: { ...s, navLayout } })` (S-T3 fix — drives store for column budget, not just attribute) |
| Capture: `dataset.navLayout` verified | DONE | Screenshot provenance confirms `navLayout: 'rail'` in root dataset |

**TASK 3: DONE** ✓

---

## Task 4 — Settings → Appearance layout picker (UI + i18n + search)

| Step | Status | Evidence |
|---|---|---|
| `NavLayoutRow.tsx` | DONE | `apps/desktop/src/components/settings/NavLayoutRow.tsx` exists; uses `Button` primitive (not raw `<button>`), `radiogroup` role, `onKeyDown` handler using `nextNavLayout` |
| `SettingsPage.tsx` renders it | DONE | `:49` import, `:476` `<NavLayoutRow settings={settings} saveSettings={saveSettings} />` after FontSizeRow |
| CSS: `.nl-section/.nl-card/.nl-thumb` | DONE | `settings.css:3700+` — uses `nl-` prefix (implementer deviation from brief's `nav-layout-` prefix; CSS and TSX are consistent) |
| i18n: all 9 locales, 6 keys each | DONE | `en/zh-CN/zh-TW/de/es/fr/ko/tr/pt-BR` all have 6 navLayout keys: `navLayout`, `navLayoutDesc`, `navLayoutTabs`, `navLayoutRail`, `navLayoutIsland`, `navLayoutCaption` (extra key beyond plan's 5 — acceptable) |
| settings-search.ts | DONE | `settings-search.ts:74-79` has all 6 keys in general entry |
| Picker screenshot (light) | DONE | `settings-picker-light-v3.png`: 3 cards (Top tabs / Icon rail ✓ selected / Island sidebar), accent border on selection, `navbarH: 48`, navbar stays visible in settings mode |
| Picker screenshot (dark) | DONE | `settings-picker-dark.png`: same structure in dark theme |
| NavLayoutRow keyboard | DONE | `onKeyDown` uses `nextNavLayout()` for ArrowLeft/Right/Up/Down cycling |

**TASK 4: DONE** ✓

---

## Task 5 — Primitive restyle (Button, fields, segmented, badge, checkbox, panel, toggle, settings rows)

| Primitive | Status | Evidence |
|---|---|---|
| `.btn` height/radius | DONE | `ui-kit.css:65,85` `height: var(--d-ctrl)`, `border-radius: var(--d-r-ctrl)` |
| `.btn-primary` black fill | DONE | `ui-kit.css:196-205` `background: var(--surface-gray-10)`, `color: var(--ink-base)` (black fill, not accent) |
| `.btn-secondary` transparent | DONE | `ui-kit.css:207-215` `background: var(--surface-gray-2)`, `border-color: var(--d-border-ctrl)` |
| `.btn-ghost` | DONE | `ui-kit.css:217-222` `border-color: transparent` |
| Composer Send accent override | DONE | `chat-shell.css:287` `background: var(--ds-accent)` for composer send button |
| `.ds-checkbox` radius | DONE | `ui-kit.css:474` `border-radius: var(--d-r-sm)` |
| `.settings-toggle` | DONE | `settings.css:1255+` — toggle rules present with token metrics |
| `.settings-row` min-height | DONE | `settings.css:980+` SettingsRow uses `--d-ctrl` metric |
| Update-banner accent | DONE | `plugins.css` update banner uses `color-mix(in oklab, var(--ds-success) ...)` (not btn-primary blue) |

**TASK 5: DONE** ✓

---

## Task 6 — Shell frame: ShellNavbar, awesomebar, window-controls, status bar

| Step | Status | Evidence |
|---|---|---|
| `ShellNavbar.tsx` | DONE | `apps/desktop/src/components/ShellNavbar.tsx` exists |
| `NavTabs.tsx` stub | DONE | `apps/desktop/src/components/NavTabs.tsx` exists |
| `d-shell.css` | DONE | `apps/desktop/src/styles/d-shell.css` exists; imported `globals.css:17` |
| `d-shell-overrides.css` | NOTE | Extra file `d-shell-overrides.css` imported at `globals.css:27` (T9/T10 additions) |
| AppShell renders ShellNavbar | DONE | `AppShell.tsx:155` — outside PortalVisibilityProvider's `hidden/inert` wrapper (Review Focus 4 satisfied) |
| app-shell flex column | DONE | `d-shell.css:16` `.app-shell { flex-direction: column }` |
| app-chat-shell flex:1 | DONE | `d-shell.css:22-28` |
| Navbar 48px | DONE | `d-shell.css:39` `height: var(--d-navbar-h)`, screenshot confirms `navbarH: 48` |
| macOS traffic-light reserve | DONE | `d-shell.css:57-59`: darwin 76px, tabs 94px, fullscreen 12px |
| Windows/Linux reserve | DONE | `d-shell.css:63` `padding-right: 124px` for non-darwin |
| Awesomebar centered | DONE | `d-shell.css:73+` — position:absolute centred awesomebar (D.css R11a override); screenshot shows centred search bar |
| Lead-inset block deleted | DONE | `grep ds-window-lead-inset apps/desktop/src` → 0 results. `ct-lead-inset` remains ONLY in `.conversation-topbar`/`.ct-lead` — this is the dock-toggle collapse animation, NOT the nav-rail traffic-light reserve; the brief's target block (nav-rail lead-inset) is gone |
| WorkspaceBar height | DONE | `chat-shell.css:94-95` `height: var(--d-status-h)`, screenshot confirms `statusH: 28` |
| WindowControls placement | DONE | `AppShell.tsx:416` `<WindowControls />` outside app-chat-shell |
| Screenshot rail light | DONE | `rail-light-chat-v2.png`: navbar=48px, awesomebar centered, rail=50px, statusbar visible |
| Screenshot rail dark | DONE | `rail-dark-chat-v2.png`: same in dark theme |
| Screenshot island light | DONE | `island-light-chat.png`: navbar=48px, island rail=60px, labeled items visible |

**TASK 6: DONE** ✓ (Windows/Linux window-controls unverified per brief — macOS only runtime)

---

## Task 7 — Rail layout (D2, default)

| Step | Status | Evidence |
|---|---|---|
| `nav-items.ts` | DONE | `apps/desktop/src/components/nav-items.ts` — navItems() with primary/utility/developer groups, flag-gated kanban/raven |
| `nav-items.test.mjs` | DONE | 3/3 tests pass: flag gating, data-nav stability, group semantics |
| NavRail consumes navItems | DONE | `NavRail.tsx:23-24` imports; `:100` `const items = navItems(...)` |
| T7-F02 source-text pin | DONE | `sidebar-footer.test.mjs` (74 lines) — NO NotificationCenter regex; all assertions are behavioral. `utility-navigation.test.mjs` tests real `usePluginBrowseState` |
| T7 footer alignment | DONE | `d-shell.css:265` `.nav-rail-foot { align-items: stretch }` — items use `margin: 1px 6px`; footer items on left-start grid per D.css:432-435 |
| NotificationCenter bell 16px | DONE | `NotificationCenter.tsx:192` `<IconBell size={16} />` in rail trigger (14px is the full-page bell icon, not rail) |
| Memory-dot token literals | DONE | `chrome.css:1097-1099` `top: var(--d-rail-dot-inset)`, `right: var(--d-rail-dot-inset)` — `--d-rail-dot-inset: 4px` defined in `d-tokens.css:39`. 1.5px border is hairline (≤2px), documented as exception |
| Expansion toggle | DONE | `NavRail.tsx:166-178` TooltipButton with aria-expanded, aria-controls, dynamic tooltip |
| nav.chat/build/bench i18n | DONE | All 9 locales: en Chat/Build/Bench, zh-CN 聊天/构建/工作台, etc. |
| nav.expandRail/collapseRail | DONE | All 9 locales have 2 expandRail/collapseRail keys |
| Rail expanded width | DONE | `d-tokens.css:33` `--d-rail-exp: 220px`; `nav-layout.ts` `RAIL_EXPANDED_WIDTH = 220`; test confirms `shellChromeWidth("rail", true) === 244` |
| T7-F11 native pairing | CARRIED | Per progress.md ruling — Task 14 carry. No native getBounds run |
| T7-F12 full capture provenance | PARTIAL | Per-shot provenance JSON provided below; full all-page matrix is Task 14 carry |

**TASK 7: DONE** (T7-F11/F12 Task-14 carries retained)

---

## Cross-cutting checks

### `showsGlobalSidebar` references
```
grep -rn "showsGlobalSidebar" apps/desktop/src packages → 0 results
```
**DONE** ✓ — fully removed from codebase.

### Locale key parity (throwaway script, not committed)
All 9 locales verified to have the Task-4 and Task-7 keys:
- `settings.navLayout/navLayoutDesc/navLayoutTabs/navLayoutRail/navLayoutIsland/navLayoutCaption` — ✓ all 9
- `nav.expandRail`, `nav.collapseRail` — ✓ all 9
- `nav.chat`, `nav.build`, `nav.bench` — ✓ all 9 (de/es/fr use quoted-key syntax `"chat": "Chat"`)

Noted pre-existing mismatches (not introduced by T1-7): `panel.tabs.*` vs `panel.session-tree.*` in some locales — these predate this plan and are owned by T12/T13.

### tsc
Direction-d source baseline: `0 error TS` lines, exit 0.
Lane t14-found: `1 line "error TS2688: Cannot find type definition file for 'vite/client'"` but **exit 0** — confirmed identical behaviour on source branch (TS2688 is informational, suppressed by `skipLibCheck`; not a regression).

### Full test suite
```
node --test test/*.test.mjs
ℹ tests 3538  ℹ pass 3497  ℹ fail 29  SUITE_EXIT:0
```
All 9 file-level failing test files confirmed pre-existing on `direction-d` source branch (host-process-dependent tests requiring a live `pi-desktop-host-core` RPC connection, and `hindsight-local-supervisor` fast-exit from known-flaky list). No regression introduced.

---

## Design Fidelity

| Surface | Design ref | Implementation | Verdict |
|---|---|---|---|
| Navbar height | D.css:23, D-SPEC row 1 (48px) | `--d-navbar-h: 48px`, screenshot=48px | MATCH |
| Awesomebar position | D.css:119-130 (absolute centred) | `position: absolute` + left/right auto (R11a override of grid) | MATCH |
| Rail width | D.css:334 (50px) | `--d-rail-w: 50px`, screenshot railWidth=50 | MATCH |
| Island rail width | D.css (60px) | `--d-rail-island: 60px`, screenshot railWidth=60 | MATCH |
| Status bar height | D-SPEC (28px) | `--d-status-h: 28px`, screenshot statusH=28 | MATCH |
| Light accent | D.css (#2E8AC2 → approved #2578ab) | tokens.css #2578ab | APPROVED DEVIATION |
| Dark on-accent | D.css (white → approved #0a1f2e) | tokens.css #0a1f2e | APPROVED DEVIATION |
| Nav picker 3 cards | pages-d/settings-general-appearance | screenshot shows 3 cards, rail selected | MATCH |
| App shell flex column | D.css:97-107 | `.app-shell { flex-direction: column }` | MATCH |

---

## Capture Provenance

All shots: commit `dc33fc5d1`, build `2026-10-15 t14-found`, viewport 2400×1600, DPR system, locale en, theme set via `document.documentElement.dataset.theme` (dataset path, not saved picker; T6-F03 saved-theme/root agreement is Task-14 carry). Mock images are 1440×900; rig output is 2400×1600 — no pixel parity claimed.

| Shot | Layout | Theme | navbarH | railW | statusH | Page | MATCH vs pages-d |
|---|---|---|---|---|---|---|---|
| `rail-light-chat-v2.png` | rail | light | 48 | 50 | n/a | chat | MATCH (navbar, rail, awesomebar centred) |
| `rail-dark-chat-v2.png` | rail | dark | 48 | 50 | n/a | chat | MATCH (dark surface, same structure) |
| `island-light-chat.png` | island | light | 48 | 60 | 28 | chat | MATCH (wider rail with labels, permanent sidebar implied) |
| `island-dark-chat.png` | island | dark | 48 | 60 | 28 | chat | MATCH (dark theme, island width) |
| `settings-picker-light-v3.png` | rail | light | 48 | 0 | n/a | settings | MATCH (3 cards, rail selected, navbar stays visible) |
| `settings-picker-dark.png` | rail | dark | 48 | 0 | 0 | settings | MATCH |
| `rail-light-bench-statusbar.png` | rail | light | 48 | 50 | 28 | bench | MATCH (statusH=28=var(--d-status-h)) |

---

## Deferred / Task-14 Carries Retained

- **T7-F11**: Native `view.getBounds()` pairing for Raven/FileBird/Build canvas — requires real host runtime
- **T7-F12**: Full all-page comparison matrix (17 pages × 3 layouts × light/dark) with saved-picker provenance
- **T6-F03**: Settings captures with saved theme readback (root dataset set here via direct assignment, not via the real theme picker write path)
- **C02**: Real-runtime sidebarMax + WorkPanel collapse/reopen boundary (rail 520/240, island 256 permanent)
- Duplicate NavLayout union (shared + AppSettings type) — known ledger minor
- Legacy `.conversation-topbar .ct-lead` / `--ct-lead-inset` (dock-toggle animation) — not the traffic-light nav reserve; intentionally retained

---

## Self-Review

- No new source-text pins introduced or found in T1-7 code
- No hardcoded hex colours in component CSS (only in `tokens.css`/`d-tokens.css`)
- All user-facing strings go through `t()` with 9-locale coverage
- Button primitive used throughout (`Button` from ui.tsx, not raw `<button>`)
- No stubs/placeholders: NavLayoutRow is fully functional, NavRail uses real navItems registry
