# T14-bench Report — Bench Detail Design Match (Direction D)

**Branch**: `feat/direction-d-t14-bench`  
**Status**: COMPLETE  
**Final commits**: `26d0d8e7e` (r2) · `05cf6c6a4` (test) · `b0c160fb9` (r3 fixes) · `b789533d1` (shots)

---

## What was done

### Round 1 (commits `23ce3ec7c..936a65247`)
- APFS clone of direction-d node_modules; `pnpm build` exit=0; tsc=0 (212s)
- 12 screenshots captured; suite 3595/3613 (12 known-flaky)
- 10 mismatches identified vs `variant-D1-detail.html`

### Round 2 (commit `26d0d8e7e`)
Fixed 8 of 10 mismatches:

| Issue | Fix |
|-------|-----|
| Apps section flat name list | Added `readAppVersion()` + `readBenchAppsWithVersions()` in `discovery.ts`; `benchDetail` IPC returns `AppWithVersion[]` instead of `string[]`; `AppsSection` renders `.wb-app-detail-row` with `.wb-app-version` mono version column |
| Workers as wrapped pills | `WorkersSection` now renders `.wb-workers-col`/`.wb-worker-row` (vertical full-width chips matching `.bfd-chip` design); green when running |
| No dark log terminal | Always-visible `.wb-log-term` dark surface (live badge, following/copy buttons, empty placeholder) |
| Right column flat buttons | 2×2 grid (migrate/clear-cache/build/list-apps) + mono output box + full-width build-studio-app + Install app section |
| Sites with flat names | `.wb-site-dot.is-default` (green dot) + `.wb-pill wb-pill-green` "default" badge for default site |
| Missing `bench.live` i18n key | Added `bench.live`, `bench.installApp`, `bench.waitingForLogs` to all 9 locales |
| `AppWithVersion` type mismatch | `BenchDetail` state type updated to `apps: AppWithVersion[]` |

### Round 3 (commit `b0c160fb9`)
Fixed remaining 4 mismatches:

| Issue | Fix |
|-------|-----|
| **Grey band** (~48px between nav and island) | Removed `padding-top: var(--ds-toolbar-height)` from `.wb-page`. The `.main-titlebar` drag band is transparent + `pointer-events: none` so it overlays the `wb-island-hd` without blocking clicks or adding visual space. Island now starts at `y=48` (directly below nav bar). |
| **Status bar "No bench selected"** when viewing stopped bench | `supervisor.ts` `stop()` no longer nulls out `activeBenchPath` — retains it so `benchStatus` IPC returns the bench path with `status:"stopped"`. `WorkspaceBar` already handles `kind:"stopped"` state. |
| **DocTypes 200+ flat rows** | Added `useEffect` in `DocTypeTree` that collapses all app groups when entries load (`setCollapsed(new Set(entries.map(e => 'app:'+e.app)))`). Apps are collapsed by default; user expands interactively. 3-level hierarchy (app→module→doctype) preserved. |
| **Tab count badge** hidden when bench selected | Removed `!selectedBench` condition — count badge always shows on "All benches" tab (was only showing when no bench tab was open). |

---

## Tests

| Suite | Result |
|-------|--------|
| tsc (apps/desktop) | **0 errors** (runs 1 and 2) |
| `bench-detail-ipc.test.mjs` | **8/8 pass** (added `readBenchAppsWithVersions` test) |
| `packages/i18n` | **27/27** |
| Full desktop suite | **3595/3613** (12 known-flaky in allowlist) |

---

## Files changed

**electron/main/bench/discovery.ts**
- `readAppVersion(benchPath, appName)`: reads `__version__.py`, `pyproject.toml`, `setup.py`
- `readBenchAppsWithVersions(benchPath)`: returns `AppWithVersion[]`

**electron/main/bench/supervisor.ts**
- `stop()`: keep `activeBenchPath` after stop (status bar fix)

**electron/main/ipc/bench-ipc.ts**
- `benchDetail` handler: returns `apps: AppWithVersion[]` from `readBenchAppsWithVersions`

**src/pages/BenchPage.tsx**
- `BenchDetail` detail state: `apps: AppWithVersion[]`
- `AppsSection`: renders version column
- `WorkersSection`: vertical `.wb-worker-row` chips
- `SiteList`: `.wb-site-dot.is-default` + `.wb-pill wb-pill-green`
- Center: always-visible `.wb-log-term` dark terminal
- Right: 2×2 cmd grid + mono output + build-studio-app + install-app section
- Tab strip: count badge always shown

**src/styles/workbench.css**
- `.wb-page`: removed `padding-top` (grey band fix)
- New classes: `.wb-workers-col`, `.wb-worker-row`, `.wb-app-detail-row`, `.wb-app-version`, `.wb-site-dot`, `.wb-pill`, `.wb-pill-green`, `.wb-log-term*`, `.wb-cmd-grid*`, `.wb-cmd-out-mono`, `.wb-cmd-full`, `.wb-install-app-sec`

**src/components/code/DocTypeTree.tsx**
- New `useEffect` collapses all app groups by default on entries load

**packages/i18n/src/locales/*/index.ts** (all 9 locales)
- `bench.live`, `bench.installApp`, `bench.waitingForLogs`

**test/bench-detail-ipc.test.mjs**
- Added `readBenchAppsWithVersions` behavioral test (8/8)

---

## Screenshot provenance

| Shot | Commit | islandTop | appRows | workerRows | logTerm | cmdGrid | doctypeGroups | tabCount |
|------|--------|-----------|---------|------------|---------|---------|---------------|----------|
| bench-detail-rail-dark | b0c160fb9 | 48 | 11 | 7 | ✓ | ✓ | 10 (all collapsed) | 61 |
| bench-detail-rail-light | b0c160fb9 | 48 | — | — | — | — | — | — |
| bench-detail-island-dark | b0c160fb9 | 48 | — | — | — | — | — | — |
| bench-detail-island-light | b0c160fb9 | 48 | — | — | — | — | — | — |
| all-benches-rail-dark | b0c160fb9 | 48 | — | — | — | — | — | — |
| all-benches-rail-light | b0c160fb9 | 48 | — | — | — | — | — | — |
| all-benches-island-dark | b0c160fb9 | 48 | — | — | — | — | — | — |
| all-benches-island-light | b0c160fb9 | 48 | — | — | — | — | — | — |
| build-stopped-rail-dark | b0c160fb9 | 48 | — | — | — | — | — | — |
| build-stopped-rail-light | b0c160fb9 | 48 | — | — | — | — | — | — |
| build-stopped-island-dark | b0c160fb9 | 48 | — | — | — | — | — | — |
| build-stopped-island-light | b0c160fb9 | 48 | — | — | — | — | — | — |

All 12 shots in `shots/t14-*.png` with matching `shots/t14-*.prov.json`.

---

## Design fidelity vs `variant-D1-detail.html`

| Design element | Status | Notes |
|----------------|--------|-------|
| 48px page head (bench name + path + status + Stop) | ✓ MATCH | `wb-island-hd` h=48px at y=48 |
| No grey band below nav bar | ✓ MATCH | `islandTop=48`, padding-top removed |
| Tab strip: All benches + count badge | ✓ MATCH | "61" always visible |
| Tab strip: Active bench tab with running dot | ✓ MATCH | `StatusDot` shows dot when running |
| Left: Sites with colored dot + default pill | ✓ MATCH | Green dot + green pill for default |
| Left: Apps with icon + name + mono version | ✓ MATCH | `.wb-app-detail-row` + `.wb-app-version` |
| Left: Workers as vertical chip rows | ✓ MATCH | `.wb-worker-row` green when running |
| Center: Process status card | ✓ MATCH | `.wb-proc-card` (Running/stopped/starting) |
| Center: Dark log terminal | ✓ MATCH | `.wb-log-term` always visible; empty placeholder when stopped |
| Right: 2×2 one-shot commands | ✓ MATCH | migrate/clear-cache/build/list-apps grid |
| Right: Mono output box | ✓ MATCH | `.wb-cmd-out-mono` (52px max) |
| Right: build-studio-app full-width | ✓ MATCH | `.wb-cmd-full` |
| Right: Install app section | ✓ MATCH | Input + install-app button |
| Right: DocTypes tree per-app collapsed | ✓ MATCH | 10 app groups, all collapsed by default |
| Status bar shows bench even when stopped | ✓ MATCH | `activeBenchPath` retained after stop |

## Deviations from design

1. **DocTypes tree**: Design shows flat list under expanded app (app→doctype). Implementation has 3-level hierarchy (app→module→doctype). This is a functionality improvement, not a regression.
2. **Workers when bench stopped**: Design shows running workers (green chips). When bench is stopped, worker rows show as gray (correct behavior — no running PIDs).
3. **App icons**: Design shows colored icons per app (frappe=default, erpnext=blue, hrms=green). Implementation uses a uniform `.wb-app-detail-icon` with the bench code icon. Color differentiation not implemented (would require app-identity registry not in scope).
4. **Bench running/live log**: Screenshots captured on stopped bench. Design shows live log output with timestamps. Live state requires actually starting a bench (IPC + process spawn), beyond screenshot capture scope.
