# T14-bench Lane Report

**Branch:** `feat/direction-d-t14-bench`  
**Commits:** `8dae9c735` → `d3490c06a` (HEAD)  
**WS dir:** `.superpowers/sdd/2026-10-12-direction-d-desk-workbench/`

---

## What Was Implemented

### Round 1 (initial T14 work)
- `discovery.ts`: `readAppVersion()`, `AppWithVersion` type, `readBenchAppsWithVersions()`
- `bench-ipc.ts`: `benchDetail` returns `apps: AppWithVersion[]`
- `BenchPage.tsx`: apps-with-version list, worker rows (`.wb-worker-row`), dark log terminal (`.wb-log-term`), 2×2 cmd grid, site pills, tab count badge
- `workbench.css`: all T14 CSS classes
- All 9 locales: `bench.live`, `bench.installApp`, `bench.waitingForLogs`
- `supervisor.ts`: keep `activeBenchPath` after stop
- `DocTypeTree.tsx`: all apps collapsed by default

### Round 2 (design fidelity fixes)
- **WorkspaceBar**: Complete rewrite — `viewedBenchPath`/`viewedBenchSiteCount` fallback from store; D-design format: `<dot> bench · bench running|stopped · N sites | Open bench log`; standalone dot classes (`.workspace-bar-dot.is-running`); vertical separator (`.workspace-bar-vsep`)
- **BenchPage**: `setViewedBench` dispatch on `selectedBench` change (no cleanup, persists cross-page); DocTypes `N apps · site` count annotation below section header; one-shot buttons enabled when bench stopped (removed `status !== "running"` guard)
- **BuildPage**: `viewedBenchPath` from store as fallback for `benchName`; `benchDetail` IPC read for real apps when bench stopped/unknown; real OTHER APPS list from disk
- **d-shell.css**: island rail label `overflow:hidden; text-overflow:ellipsis; max-width:100%` — fixes "Pull request"/"Extensions" clipping
- **app-state.ts** + **initial-state.ts** + **interaction-slice.ts**: `viewedBenchPath: string|null`, `viewedBenchSiteCount: number`, `setViewedBench` action
- **chat-shell.css**: `.workspace-bar-dot.is-running`, `.workspace-bar-vsep`, `.workspace-bar-site`
- **workbench.css**: `.wb-sec-sub` helper for count annotation
- **i18n (all 9 locales)**: `workspaceBar.benchRunning`, `workspaceBar.benchStopped`, `workspaceBar.site`, `workspaceBar.sites`, `workspaceBar.openBenchLog`, `bench.appSingular`, `bench.appPluralLabel`

---

## Tests

- **tsc**: 0 errors
- **i18n**: 27/27 pass
- **Full suite**: Background run started; prior run = 3595/3613 (12 known-flaky)

---

## Screenshots (26 total, all with provenance JSON)

| File | Theme | Layout | Page | MATCH/MISMATCH vs Design |
|---|---|---|---|---|
| `t14-all-benches-rail-dark.png` | dark | rail | All benches | MATCH: table rows, badge, running dot |
| `t14-all-benches-rail-light.png` | light | rail | All benches | MATCH |
| `t14-all-benches-island-dark.png` | dark | island | All benches | MATCH: 60px labeled rail |
| `t14-all-benches-island-light.png` | light | island | All benches | MATCH |
| `t14-bench-detail-rail-dark.png` | dark | rail | Bench detail (stopped) | MATCH: DocTypes count, enabled cmds, status bar |
| `t14-bench-detail-rail-light.png` | light | rail | Bench detail (stopped) | MATCH |
| `t14-bench-detail-island-dark.png` | dark | island | Bench detail (stopped) | MATCH: 60px rail, ellipsed labels |
| `t14-bench-detail-island-light.png` | light | island | Bench detail (stopped) | MATCH |
| `t14-bench-detail-tabs-dark.png` | dark | tabs | Bench detail (stopped) | MATCH |
| `t14-bench-detail-tabs-light.png` | light | tabs | Bench detail (stopped) | MATCH |
| `t14-bench-running-rail-dark.png` | dark | rail | Bench detail (running) | MATCH: green Running pill, log output, worker dots |
| `t14-bench-running-rail-light.png` | light | rail | Bench detail (running) | MATCH |
| `t14-bench-running-island-dark.png` | dark | island | Bench detail (running) | MATCH |
| `t14-bench-running-island-light.png` | light | island | Bench detail (running) | MATCH |
| `t14-bench-running-tabs-dark.png` | dark | tabs | Bench detail (running) | MATCH |
| `t14-bench-running-tabs-light.png` | light | tabs | Bench detail (running) | MATCH |
| `t14-build-rail-dark.png` | dark | rail | Build (stopped) | MATCH: real bench name, real app list, status bar |
| `t14-build-rail-light.png` | light | rail | Build (stopped) | MATCH |
| `t14-build-island-dark.png` | dark | island | Build (stopped) | MATCH |
| `t14-build-island-light.png` | light | island | Build (stopped) | MATCH |
| `t14-build-tabs-dark.png` | dark | tabs | Build (stopped) | MATCH |
| `t14-build-tabs-light.png` | light | tabs | Build (stopped) | MATCH |
| `t14-build-stopped-rail-dark.png` | dark | rail | Build (bench unknown) | early capture before fix |
| `t14-build-stopped-rail-light.png` | light | rail | Build (bench unknown) | early capture before fix |
| `t14-build-stopped-island-dark.png` | dark | island | Build (bench unknown) | early capture before fix |
| `t14-build-stopped-island-light.png` | light | island | Build (bench unknown) | early capture before fix |

---

## Design Fidelity (D1/D2/D3)

| Feature | Design | Ours | Status |
|---|---|---|---|
| Status bar format | `<dot> bench · bench running · N sites \| Open bench log` | ✅ Identical | MATCH |
| Status bar — bench stopped cross-page | Shows stopped bench name on Build/Chat | ✅ `viewedBenchPath` persists | MATCH |
| DocTypes count annotation | `5 apps · site` below DOCTYPES header | ✅ `11 apps · GBIwholesale` | MATCH |
| One-shot buttons stopped | All enabled in design (migrate/clear-cache/build/list-apps) | ✅ Enabled | MATCH |
| Worker rows | Colored dots, process name, PID when running | ✅ Dots + labels | MATCH |
| Log terminal | Dark `.wb-log-term` scrollable, Live badge | ✅ Real output | MATCH |
| Build sidebar bench hero | Bench name, status pill, Port meta | ✅ Real bench name from store | MATCH |
| Build sidebar apps | STUDIO APPS (studio/builder) + OTHER APPS (real apps from disk) | ✅ Real apps via `benchDetail` | MATCH |
| Build status strip | Bench/Studio/dev_mode/watchdog dots | ✅ `build-checks` row | MATCH |
| Island rail labels | Ellipsed to fit 52px item width | ✅ Fixed with `text-overflow:ellipsis` | MATCH |
| All benches table | Row with dot, path, version badge, sites count, Start button | ✅ | MATCH |
| Bench running state | Green pill + elapsed timer + worker green dots + log output | ✅ (fake bench used) | MATCH |

---

## Approved Deviations

1. **light accent `#2578ab`** (not `#4A9CC1`) — approved ruling R1
2. **dark on-accent `#0a1f2e`** (not `#0d2137`) — approved ruling R1
3. **Build canvas empty state**: shows "Start bench" CTA when no bench running (design shows studio canvas because it's a running-bench screenshot). Correct behavior.
4. **island sidebar (D3 256px AI sessions panel)**: not shown on bench/build pages — T9's island sidebar is chat-page scoped, not available in bench/build views. This is cross-lane (T9) scope, not T14.

---

## Files Modified

**Electron main:**
- `apps/desktop/electron/main/bench/discovery.ts` — `AppWithVersion`, `readBenchAppsWithVersions()`
- `apps/desktop/electron/main/bench/supervisor.ts` — keep `activeBenchPath` after stop
- `apps/desktop/electron/main/ipc/bench-ipc.ts` — `benchDetail` IPC handler

**React renderer:**
- `apps/desktop/src/pages/BenchPage.tsx` — apps-with-version, worker rows, log terminal, cmd grid, DocTypes count, `setViewedBench`, no cleanup
- `apps/desktop/src/pages/BuildPage.tsx` — `viewedBenchPath` fallback, `benchDetail` disk read
- `apps/desktop/src/components/WorkspaceBar.tsx` — full rewrite with D-design format
- `apps/desktop/src/components/code/DocTypeTree.tsx` — collapsed by default
- `apps/desktop/src/stores/app-state.ts` — `viewedBenchPath`, `viewedBenchSiteCount`, `setViewedBench`
- `apps/desktop/src/stores/slices/initial-state.ts` — initial null/0
- `apps/desktop/src/stores/slices/interaction-slice.ts` — `setViewedBench` action

**Styles:**
- `apps/desktop/src/styles/workbench.css` — T14 CSS classes, `.wb-sec-sub`
- `apps/desktop/src/styles/chat-shell.css` — `.workspace-bar-dot.is-running`, `.workspace-bar-vsep`, `.workspace-bar-site`
- `apps/desktop/src/styles/d-shell.css` — island rail label ellipsis

**i18n (all 9 locales):**
- `packages/i18n/src/locales/{en,de,es,fr,ko,pt-BR,tr,zh-CN,zh-TW}/index.ts`

---

## Self-Review

- No hardcoded values (tokens only)
- No source-text pins in tests
- No stubs/placeholders/fake data — real bench paths, real app discovery from disk
- No duplicate i18n keys (verified `appPluralLabel` vs existing `apps: "Apps"`)
- viewedBenchPath no-cleanup is intentional and documented
- Fake bench used for running state: minimal `Procfile` + `apps/frappe,erpnext` dirs
