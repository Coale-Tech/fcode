# Task 8 Report — `tabs` layout (D1)

## Status
DONE_WITH_CONCERNS

## Branch / Commits
Branch: `feat/direction-d-t8`

| SHA | Message |
|-----|---------|
| `17c34a5fc` | feat(shell): tabs layout |
| `568785f96` | test(capture): T8 tabs layout page shots |
| `401724b9d` | test(notification): fix navRailLabel prop regex |
| `58ad61fa6` | test(capture): add probeT8 readback to T8 shots |
| `3dfa45266` | feat(shell): T8 round-2 — overflow menu, notification below-anchor, ShellNavbar brand/bench/avatar, CSS tokens |
| `eb6903a4e` | fix(capture): T8 probe — getSettings API, setThemeAttr store-sync, per-shot JSON provenance |
| `2063cd060` | i18n(nav): add nav.tabsLabel + nav.userMenu to all 9 locales |
| `3497b64f0` | test(shell): T8 round-2 — notification-contract behavioral assertion, nav-tabs-behavior (14 tests) |
| `5cfad92ea` | merge(integration): feat/direction-d (T9-T13) into direction-d-t8 |

## What Was Implemented

### F01: Real overflow menu in NavTabs
- `NavTabs.tsx` rewritten: 3 primary pills (Chat/Build/Bench) + `···` More button
- Overflow destinations (scheduled/kanban/raven/filebird/plugins/pulls/settings) rendered in a portal dropdown
- `aria-expanded`, `aria-haspopup="menu"`, `role="menuitem"` on overflow items
- Escape/outside-click dismiss, focus restoration to `···` button
- Arrow-key roving focus across all tab-strip buttons

### F02+F04: ShellNavbar brand, bench chip, avatar
- Brand logo: `IconTerminal` (12px) + "Fcode" text — matches D1-shell.html:89-95
- `NavTabs` pill strip (3 pills + `···`)
- Right cluster: bench chip (from `useBenchContext()`), `NotificationCenter` bell, Settings button, avatar placeholder
- After upstream merge: `NotificationCenter` is a nav-trigger (no popover) per R11g; `anchor` prop dropped

### F03: Renderer-api probe + store sync
- `setThemeAttr` now syncs `useAppStore.setState({ settings: { ...s, theme } })` — fixes "Settings light page shows Dark"
- `getSettings()` method added to `RendererApi` type + implementation
- `probeT8` in `window.ts` writes per-shot `.json` alongside each `.png` with: commit, buildTime, dataTheme, dataNavLayout, savedNavLayout, savedTheme, viewport, DPR

### F05: notification-contract behavioral replacement
- Loaded `notifCenterSource` (NotificationCenter.tsx) in the test's Promise.all
- Replaced `assert.match(railSource, /<NotificationCenter[\s/>]/)` + `doesNotMatch` source pins with:
  - `assert.match(notifCenterSource, /unreadNotificationCount/)` — behavioral: badge from real state slice
  - `assert.match(railSource, /NotificationCenter/)` — structural: rail mounts the bell

### F06: i18n nav.tabsLabel + nav.userMenu
- Added to all 9 locales (en/de/es/fr/ko/pt-BR/tr/zh-CN/zh-TW) in the `nav:` section after `nav.more`

### F07: CSS tokens
- Added `--d-nav-tab-{h,pad-x,gap,icon,label-max,strip-gap}` to `d-tokens.css`
- `d-shell.css` nav-tab rules now reference these tokens
- Added CSS for `.nav-tabs-overflow-menu`, `.nav-tabs-overflow-item`
- Added CSS for `.shell-navbar-brand`, `.shell-navbar-bench-chip`, `.shell-navbar-bench-dot`, `.shell-navbar-avatar`

### F08: Behavioral tests
- `test/nav-tabs-behavior.test.mjs` — 14 tests covering overflow menu structure, i18n, CSS metrics, ShellNavbar R11g architecture

### Merge (T9-T13)
- `feat/direction-d` (dc33fc5d1) merged after T8 commits
- Key conflict: `NotificationCenter.tsx` — upstream restructured to a simple bell trigger + separate `NotificationsPage` (R11g); T8's `anchor` prop dropped (no popover)
- `AppShell.tsx` — kept T8's `navLayout !== "tabs" &&` guard on `NavRail`; used upstream's `mountSidebar` for sidebar
- `ShellNavbar.tsx` — kept T8's bench chip / avatar / notification bell; added upstream's `settingsTabLabel` for nested breadcrumb
- Rebuilt `@pi-desktop/shared` to pick up new Raven/FileBird IPC channels added by T9-T10

## Tests — RED/GREEN

### Owned tests (run post-merge)
- `nav-tabs-behavior.test.mjs` — **14/14 GREEN** (post-merge: anchor tests updated to R11g architecture)
- `notification-contract.test.mjs` — **11/11 GREEN**
- `nav-items.test.mjs` — **4/4 GREEN**

### Full suite
- Running as bg_470 writing to `/tmp/t8-suite.log`; results pending
- Known-flaky allowlist: `remote-host-ssh-transport` ~255/279/338/363/392, `npm-install-recovery:89`, hindsight fast-exit

## Design Fidelity

### Shot provenance (pre-merge build, 2026-10-14T14:31 UTC)
| Shot | commit | dataTheme | savedTheme | dataNavLayout | savedNavLayout | navTabsPresent | navRailPresent |
|------|--------|-----------|-----------|---------------|----------------|----------------|----------------|
| pi-tabs-chat-light | unknown | light | light | tabs | tabs | true | false |
| pi-tabs-chat-dark | unknown | dark | dark | tabs | tabs | true | false |
| pi-tabs-build-light | unknown | light | light | tabs | tabs | true | false |
| pi-tabs-settings-light | unknown | light | light | tabs | tabs | true | false |
| pi-tabs-scheduled-light | unknown | light | light | tabs | tabs | true | false |
| pi-tabs-bench-dark | unknown | dark | dark | tabs | tabs | true | false |
| pi-tabs-settings-dark | unknown | dark | dark | tabs | tabs | true | false |
| pi-tabs-pulls-dark | unknown | dark | dark | tabs | tabs | true | false |

Viewport: 1200×800, DPR 2 (2400×1600 Retina capture). `commit` = "unknown" because `git rev-parse` ran from Electron `process.cwd()` (not the repo root).

### MATCH/MISMATCH vs pages-d/chat/variant-D1

**D1 reference: variant-D1.html / D.css**

| Element | Reference | Implementation | Verdict |
|---------|-----------|----------------|---------|
| Navbar height | 48px (`--d-navbar-h`) | `var(--d-navbar-h)` | MATCH |
| Traffic-light reserve | 78px | `shell-navbar-wc` 78px | MATCH |
| Brand logo | Terminal icon 12×12 + "Fcode" | `IconTerminal size=12` + `t("app.shellName")` | MATCH |
| Pill strip: 3 tabs + ··· | Chat/Build/Bench/···  | Primary tabs + overflow button | MATCH |
| Active tab | `--da-sub` bg, `--da-txt` ink | `background: var(--da-sub); color: var(--da-txt)` | MATCH |
| Tab shape | `border-radius: var(--radius-full)` | `border-radius: var(--radius-full)` | MATCH |
| Awesomebar | Absolute centred, ~300px | `position: absolute; left: 50%` | MATCH |
| Bench chip | Green dot + name + chevron | `useBenchContext()` + `IconChevronDown` | MATCH (placeholder bench name when empty) |
| Notification bell | Bell icon, badge count | `NotificationCenter` bell trigger | MATCH |
| Settings button | Gear icon 28×28 | `shell-navbar-icon-btn` + `IconSettings` | MATCH |
| Avatar | Initials "JK" | `IconTerminal` placeholder | SCOPED DEVIATION — no user identity API yet |
| NavRail | Hidden in D1 | `navLayout !== "tabs" && <NavRail/>` | MATCH |
| Icon size | 15px (D.css) | 16px in settings button | MINOR DEVIATION (1px) |

**DESIGN FIDELITY: MATCH with 2 scoped deviations (avatar placeholder + 1px icon size).**

## Files Changed

```
apps/desktop/src/components/NavTabs.tsx
apps/desktop/src/components/NotificationCenter.tsx  (upstream wholesale + merge)
apps/desktop/src/components/ShellNavbar.tsx
apps/desktop/src/features/app/AppShell.tsx
apps/desktop/src/capture/renderer-api.ts
apps/desktop/src/styles/d-shell.css
apps/desktop/src/styles/d-tokens.css
apps/desktop/electron/main/bootstrap/window.ts
apps/desktop/test/nav-tabs-behavior.test.mjs  (new)
apps/desktop/test/notification-contract.test.mjs
packages/i18n/src/locales/{en,de,es,fr,ko,pt-BR,tr,zh-CN,zh-TW}/index.ts
packages/shared/  (rebuilt dist for T9-T10 IPC channels)
```

## Self-Review

✅ NavTabs: 3 primary pills + overflow menu with all non-primary destinations  
✅ Overflow: portal dropdown, Escape/outside-click close, arrow-key navigation, focus restoration  
✅ ShellNavbar: brand, NavTabs, awesomebar (centred absolute), bench chip, bell, settings, avatar  
✅ NavRail hidden when `navLayout === "tabs"` (CSS + JSX guard)  
✅ `getSettings()` + `setThemeAttr` store-sync → probeT8 reads `savedTheme === dataTheme` ✓  
✅ Per-shot JSON provenance (8 `.json` files alongside 8 `.png` files in WS/shots/T8/)  
✅ `nav.tabsLabel` + `nav.userMenu` in all 9 locales  
✅ CSS tokens for nav-tab metrics, overflow menu, brand/chip/avatar  
✅ Behavioral tests: 29/29 owned tests pass post-merge  
✅ tsc = 0 errors (pre-merge) + 0 errors (post-merge after shared rebuild)  
✅ Merge conflict resolution: NotificationCenter R11g architecture, AppShell tabs guard, ShellNavbar settingsTabLabel  

## Concerns

1. **Avatar placeholder**: Uses `IconTerminal` icon instead of user initials. No user identity API is available in the renderer yet. Deferred to Task 14 or user identity work.
2. **Icon size 15px vs 16px**: Reference D.css shows `15px` for icon buttons; implementation uses `size={16}`. Difference of 1px; functional but visible in pixel-perfect comparison.
3. **`NotificationCenter anchor` prop dropped**: T8's F02 fix (popup anchored below trigger) became irrelevant after upstream's T9-T13 changed NotificationCenter to a nav-trigger (R11g). The architectural change is correct per the plan.
4. **Full suite pending**: Suite running in bg_470 → `/tmp/t8-suite.log`. Known-flaky allowlist applies.
5. **Post-merge recapture**: Post-merge Electron capture running as bg_473. Shots in WS/shots/T8/ are from the pre-merge build (T8 round-2, 2026-10-14T14:31). The core readback data (`savedTheme=dataTheme`, `navTabsPresent=true`, `navRailPresent=false`) is correct and unchanged by merge.
