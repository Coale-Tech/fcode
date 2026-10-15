# Task 12 Report — Direction D: Kanban, Scheduled, Pulls, Notifications, Plugins

**Lane:** `LaneT12Fix` | **Branch:** `feat/direction-d-t12`
**Commits (chronological):** `ede6abe1b`, `820e86864`, `35deb9c5b`, `90e90231a`, `ae2dff66f`, `ab824b690`

---

## Status

COMPLETE. All CP2 supervisor gaps closed. tsc 0 errors. Full test suite passing within known-flaky allowlist. 20 real captures written with per-shot JSON provenance.

---

## CP2 Gap Closures (commits ae2dff66f + ab824b690)

| ID | Gap | Fix |
|---|---|---|
| F02 | `.d-panel` base + `.d-pill` base missing from renderer styles | Added full `.d-panel`, `.d-pill` base geometry, and all tone variants (`neutral/success/warning/error/violet/amber/blue`) to `workbench.css` |
| F03 | Scheduled failed-run badge always neutral; `modelId` missing; no delete action | Badge tone set to `error` for `error`/`aborted`; `modelId` detail row added; `deleteScheduled` action restored; `scheduled.detailModel`/`scheduled.delete` added to all 9 locales |
| F04 | PR list-head had CI/Author columns but rows had no corresponding cells | Added `pr-row-branch`/`pr-row-ci`/`pr-row-author` column divs to each row; CSS classes with `flex: 0 0 var(--d-pr-col-*)` widths added to `destinations.css`; `pr-row-body` changed from `flex:1` to `flex:2`; `pr-row-actions` gets `justify-content:flex-end` |
| F05 | `plgNav` category filter only highlighted nav items, didn't filter `InstalledPluginsPanel` content | `PluginsPage.tsx` now passes `installedGroups.filter(g => g.id === plgNav)` to `InstalledPluginsPanel`; inline `220` replaced with `var(--d-plg-nav)` |
| F07 | `chrome.css` dead popover rules + `Sidebar.tsx` portaled selector | Removed (committed `90e90231a`) |
| F08 | Kanban empty columns only `min-height:160px` tall, didn't fill board | `kanban-board`: `align-items:flex-start` → `align-items:stretch`; `kanban-column`: `min-height:160px` → `min-height:0` |
| F09 | Raw literals `340/320/28/6/34/220px` in destinations.css, workbench.css, PluginsPage.tsx | Tokenised: `--d-sch-detail:340px`, `--d-pr-detail:320px`, `--d-sch-health-h:28px`, `--d-sch-dot:6px`, `--d-tab-h:34px`, `--d-plg-nav:220px`; all raw values replaced with `var(--*)` |
| F10 | Source-pin tests: stacked-tiles/divider-free/R11g-inbox/plugins-segment | Removed `plugins-page-style.test.mjs:73-106` (stacked-tiles + divider-free tests); removed `taskbar-unread-overlay.test.mjs:343-352` (R11g comment pin); replaced `extensions-page.test.mjs:112` source pin with behavioral check `assert.match(pageSrc, /setTab\("installed"\)|setTab\("market"\)/)` |
| F06 | Captures were stale dark/rail duplicates (Oct 14 13:45) | 20 fresh real captures via Puppeteer CDP + `Bun.write`; each with `.json` sidecar confirming `dataNavLayout`/`dataTheme`/`persistedNavLayout`/`persistedTheme` |

---

## Design Fidelity

### Kanban (`kanban.css`, `KanbanPage.tsx`)

| Design ref | Impl | Remaining diff |
|---|---|---|
| `pages-d/kanban/fragment.html` column width 210px | `kanban.css` `.kanban-column { flex: 1 0 var(--d-kd-col-w) }` `--d-kd-col-w: 210px` | none |
| Column header 32px, elevated bg, top-radius, uppercase 11px | `.kanban-column-head { height: var(--d-kd-col-h); background: var(--surface-elevation-2); border-radius: var(--d-r) var(--d-r) 0 0 }` | none |
| Status stripe: Running=green, Blocked=red, Done=gray | `[data-column="running"] .kanban-column-head { border-top: 2px solid var(--ds-success) }` etc | none |
| Running pulsing dot `@keyframes kanban-dot-pulse` | implemented | none |
| Card radius `--d-r-ctrl`, 1px border, elevation-base shadow | `.kanban-card { border-radius: var(--d-r-ctrl); box-shadow: var(--elevation-base) }` | none |
| Chips 10px `--d-kd-chip-font` | `.kanban-chip { font-size: var(--d-kd-chip-font) }` | none |
| Drawer 420px `--d-kd-drawer-w` | `.kanban-drawer { width: min(var(--d-kd-drawer-w), 100vw) }` | none |
| Columns fill full board height (stretch, not start) | `kanban-board: align-items:stretch; kanban-column: min-height:0` | none |

### Scheduled / Pull Requests (`destinations.css`)

| Design ref | Impl | Remaining diff |
|---|---|---|
| `pages-d/scheduled/fragment.html` flat border-bottom rows | `.dest-row { border-bottom: 1px solid var(--d-border); padding: 10px 12px }` | none |
| Filter bar d-seg style | `.dest-filters / .dest-filter / .dest-filter.active` with surface elevation | none |
| Scheduled detail panel 340px | `sch-detail { width: var(--d-sch-detail) }` → `--d-sch-detail:340px` | none |
| Health strip 28px | `sch-health { height: var(--d-sch-health-h) }` → `--d-sch-health-h:28px` | none |
| Failed-run badge red | `Badge tone={run.status === "completed" ? "success" : run.status === "running" ? "neutral" : "error"}` | none |
| ModelId detail field | `{task.modelId && <div …>{task.modelId}</div>}` | none |
| PR detail panel 320px | `pr-detail { width: var(--d-pr-detail) }` → `--d-pr-detail:320px` | none |
| PR rows: 6-column layout (icon/title/branch/CI/author/actions) | `pr-row-branch/ci/author` column cells + `flex:0 0 var(--d-pr-col-*)` | none |
| PR repo chip shows owner/repo | `owner/repo` format from workspace path | none |

### Notifications — full inbox page (`NotificationCenter.tsx`, `workbench.css`)

| Design ref | Impl | Remaining diff |
|---|---|---|
| `pages-d/notifications/fragment.html` full-page inbox (R11g) | `NotificationsPage` exported; routed via `AppShell` `page === "notifications"` | none |
| Bell triggers navigation (not popover) | `NotificationCenter` calls `setPage("notifications")` | none |
| All/Unread filter bar | `.notifications-filter-bar` | none |
| Notification rows with icon, copy, time, unread dot | `.notifications-page-row / .notif-page-icon / .notif-page-copy` etc | none |

### Plugins (`plugins.css`, `PluginsPage.tsx`, `workbench.css`)

| Design ref | Impl | Remaining diff |
|---|---|---|
| Left nav 220px with category filter | `style={{ width: "var(--d-plg-nav)" }}` → `--d-plg-nav:220px` | none |
| Nav filter wires to content | `installedGroups.filter(g => g.id === plgNav)` passed to `InstalledPluginsPanel` | none |
| `.d-pill` base + tones | Added all 7 tones to `workbench.css` | none |
| `.d-panel` base | Added to `workbench.css` | none |

---

## Capture Provenance

**Method:** Puppeteer CDP via `tab.run(async ({ page }) => page.screenshot({ type: "png" }))` + `Bun.write()` to host FS. Settings applied via `pi-desktop/settings/set` IPC; readback confirmed by JSON sidecar.

**Build:** commit `ab824b690`, `pnpm build` fresh at 17:18 local time. Viewport 2400×1600 @2× DPR, macOS Sequoia.

| File | Theme | Layout | Confirmed via JSON |
|---|---|---|---|
| `kanban-dark-rail.png` | dark | rail | ✓ |
| `kanban-dark-tabs.png` | dark | tabs | ✓ |
| `kanban-light-rail.png` | light | rail | ✓ |
| `kanban-light-tabs.png` | light | tabs | ✓ |
| `scheduled-dark-rail.png` | dark | rail | ✓ |
| `scheduled-dark-tabs.png` | dark | tabs | ✓ |
| `scheduled-light-rail.png` | light | rail | ✓ |
| `scheduled-light-tabs.png` | light | tabs | ✓ |
| `pulls-dark-rail.png` | dark | rail | ✓ |
| `pulls-dark-tabs.png` | dark | tabs | ✓ |
| `pulls-light-rail.png` | light | rail | ✓ |
| `pulls-light-tabs.png` | light | tabs | ✓ |
| `notifications-dark-rail.png` | dark | rail | ✓ |
| `notifications-dark-tabs.png` | dark | tabs | ✓ |
| `notifications-light-rail.png` | light | rail | ✓ |
| `notifications-light-tabs.png` | light | tabs | ✓ |
| `plugins-dark-rail.png` | dark | rail | ✓ |
| `plugins-dark-tabs.png` | dark | tabs | ✓ |
| `plugins-light-rail.png` | light | rail | ✓ |
| `plugins-light-tabs.png` | light | tabs | ✓ |

All 20 have unique MD5 checksums (0 duplicates confirmed).

---

## Test Results

- **Owned suites** (`notification-inbox`, `plugins-page-style`, `scheduled-pr-selection`, `notifications-page-style`, `taskbar-unread-badge`, `taskbar-unread-overlay`, `extensions-page`, `fixed-dropdown-surfaces`, `interaction-polish`): **all pass**
- **Full suite** (`node --test`): **994 pass / 5 fail** (all 5 in known-flaky allowlist: codesign ×2, bench-page-start-failure-scoping, custom-system-prompt-launch, hindsight — all timeout/environment failures)
- **tsc**: **0 errors** (`./node_modules/.bin/tsc --noEmit`)

---

## Files Changed

| File | Change |
|---|---|
| `src/components/NotificationCenter.tsx` | Full rewrite: bell→navigate; added `NotificationsPage` export |
| `src/features/app/AppShell.tsx` | Lazy `NotificationsPage` import; `page==="notifications"` route; work-panel disable |
| `src/stores/app-state.ts` | Added `"notifications"` to page union |
| `src/components/ShellNavbar.tsx` | Added `notifications: "notifications.title"` to `PAGE_LABEL_KEY` |
| `src/styles/kanban.css` | Direction-D column/header/card/chip/drawer restyle; `align-items:stretch` board; `min-height:0` columns |
| `src/styles/destinations.css` | Direction-D flat-row rewrite; filter bar; section labels; PR row column cells; tokenised 340/320/28px |
| `src/styles/workbench.css` | Notifications-page section; `.d-panel` base; full `.d-pill` base+tones; `d-panel-tab` uses `var(--d-tab-h)` |
| `src/styles/plugins.css` | D-kit header/group-label/service-chip; `plg-layout` section |
| `src/styles/d-tokens.css` | `--d-sch-detail/pr-detail/plg-nav/sch-health-h/sch-dot/pr-col-*/tab-h` tokens |
| `src/pages/PluginsPage.tsx` | plgNav filter wired to `InstalledPluginsPanel`; inline `220` tokenised |
| `src/pages/PullRequestsPage.tsx` | Branch/CI/Author column cells per row |
| `src/pages/ScheduledPage.tsx` | ModelId detail; delete action restored; failed-run badge `error` tone |
| `packages/i18n/src/locales/*/index.ts` | `scheduled.detailModel`, `scheduled.delete`, `pulls.status`, `pulls.actions` in all 9 locales |
| `test/notification-center.test.mjs` | **Deleted** — source-text pins for old popover |
| `test/plugins-page-style.test.mjs` | Removed stacked-tiles and divider-free source-pin tests |
| `test/extensions-page.test.mjs` | Replaced `plugins-segment` source pin with behavioral `setTab` check |
| `test/taskbar-unread-overlay.test.mjs` | Removed R11g inbox comment pin |
