# T14 Bench Lane Report

**Branch:** `feat/direction-d-t14-bench`  
**Commits:** `23ce3ec7c`, `3c02e2bfd`, `chore(t14)`

---

## What was done

### CP2-G03 — Real bench detail data (apps + workers via IPC)
- `electron/main/bench/discovery.ts`: Added `apps: string[]` to `BenchSummary`; added exported `readBenchApps(benchPath)` (reads `apps/` subdir from disk, sorted) and `readProcfileEntries(benchPath)` (parses `Procfile` lines); `scanRoot` populates `apps` for every discovered bench.
- `packages/shared/src/protocol.ts`: Added `benchDetail: "pi-desktop/bench/detail"` IPC channel.
- `electron/main/ipc/bench-ipc.ts`: Registered `benchDetail` handler returning `{ apps, procfileEntries, port, mainPid }`.
- `electron/main/bench/supervisor.ts`: Added `getMainPid()` returning the start-process PID.
- `src/lib/bench-view.ts`: Added `apps: string[]` to the renderer-side `BenchSummary` type.
- `src/pages/BenchPage.tsx`: `BenchDetail` fetches `benchDetail` IPC on mount; added `AppsSection` (11 app rows rendered from real disk scan) and `WorkersSection` sub-components; `ProcessPanel` gains `procCount`/`port` meta row.
- `src/styles/workbench.css`: Added `.wb-worker-dot`, `.wb-app-detail-row`, `.wb-app-detail-icon`, `.wb-app-tags`, `.wb-app-tag` classes.

### CP2-G04 — AllBenches apps column
- `src/components/bench/AllBenches.tsx`: Apps column now renders `bench.apps` as `.wb-app-tag` chips (max 4 + overflow count badge), replacing the previous `—` placeholder. DOM verified: 285 `.wb-app-tag` elements visible across 61 benches.

### CP2-G05 — Build stopped-state banner
- `src/pages/BuildPage.tsx`: `showBanner` suppresses the red "bench-down" banner when `firstProblem.key === "bench"`. DOM verified: `bannerVisible: false` when no bench is running.

### CP2-G04 — Benches overview header
- `src/pages/BenchPage.tsx`: Overview header updated to "Benches" title + count badge + "Add folder" button. DOM verified: `headerTitle: 'Benches'`, `headerBadge: '61'`, `addFolderBtn: 'Add folder'`.

### i18n
- All 9 locales (en/de/es/fr/ko/pt-BR/tr/zh-CN/zh-TW) received `bench.apps`, `bench.workers`, `bench.processes`, `bench.benches`, `bench.addFolder`.

### node_modules fix
- Replaced pnpm --offline partial install with APFS clone from direction-d (`cp -cR`) for root, apps/desktop, packages/* node_modules. This resolved the `@shikijs/langs` package.json export stripping bug that caused shiki test to fail.

---

## Tests

| Suite | Pass | Fail | Notes |
|-------|------|------|-------|
| `bench-detail-ipc.test.mjs` (owned) | 7/7 | 0 | New behavioural tests for `readBenchApps`/`readProcfileEntries` |
| `bench-view.test.mjs` | 6/6 | 0 | |
| `bench-page-t6-states.test.mjs` + start/stop identity | 23/23 | 0 | |
| `shiki.test.mjs` | 2/2 | 0 | Fixed after node_modules replacement |
| Full suite (`test/*.test.mjs`) | 3595/3613 | 12 | All failures known-flaky (see below) |

**Full suite failures — all known-flaky allowlist:**
- `hindsight-local-supervisor`: "fast exit with LLM key error" → allowlist: *hindsight fast-exit*
- `macos-signing-watchdog` (×2): codesign shim/failing tests → allowlist: *codesign/macos-signing*
- `npm-executable` (×5): selected npm, version/Node validation, install budgets → allowlist: *npm-executable family*
- `remote-host-ssh-transport` (×2): non-zero exit / forward rejects → allowlist: *remote-host-ssh-transport*
- `shiki.test.mjs` (×1 in first suite run): resolved after node_modules fix; passes 2/2 individually

**tsc:** 0 errors (212 s, verified with separate exit-code capture — `cat /tmp/t14-tsc2.exit` = 0).

**Build:** `pnpm build` exit=0, 73.5 s, no errors (after node_modules fix).

---

## Files changed

```
apps/desktop/electron/main/bench/discovery.ts     (readBenchApps, readProcfileEntries, apps in scanRoot)
apps/desktop/electron/main/bench/supervisor.ts    (getMainPid)
apps/desktop/electron/main/ipc/bench-ipc.ts       (benchDetail handler)
apps/desktop/src/lib/bench-view.ts                (apps: string[] in BenchSummary)
apps/desktop/src/pages/BenchPage.tsx              (AppsSection, WorkersSection, ProcessPanel meta, header)
apps/desktop/src/components/bench/AllBenches.tsx  (apps column chips)
apps/desktop/src/pages/BuildPage.tsx              (bench-down banner suppressed)
apps/desktop/src/styles/workbench.css             (wb-app-tag, wb-worker-dot, etc.)
packages/shared/src/protocol.ts                   (benchDetail channel)
packages/shared/dist/protocol.js + .d.ts          (patched dist)
packages/i18n/src/locales/*/index.ts (×9)         (5 new bench.* keys)
apps/desktop/test/bench-detail-ipc.test.mjs       (NEW — 7 tests)
```

---

## Screenshot capture provenance

All 12 shots captured via CDP (port 9341) from `pnpm build` (exit=0, commit `3c02e2bfd`), `PI_DESKTOP_DATA_DIR=$(mktemp -d)`, viewport 1200×800 DPR=1. Theme and nav-layout set via `document.documentElement.setAttribute` injection; confirmed by reading back attributes before each shot.

| File | theme | navLayout | page | DOM-verified page |
|------|-------|-----------|------|-------------------|
| `t14-all-benches-rail-dark.png` | dark | rail | wb-page bench-page | ✓ AllBenches overview |
| `t14-all-benches-rail-light.png` | light | rail | wb-page bench-page | ✓ AllBenches overview |
| `t14-all-benches-island-dark.png` | dark | island | wb-page bench-page | ✓ AllBenches overview |
| `t14-all-benches-island-light.png` | light | island | wb-page bench-page | ✓ AllBenches overview |
| `t14-bench-detail-rail-dark.png` | dark | rail | wb-page bench-page | ✓ BenchDetail (GBIWholesale) |
| `t14-bench-detail-rail-light.png` | light | rail | wb-page bench-page | ✓ BenchDetail (GBIWholesale) |
| `t14-bench-detail-island-dark.png` | dark | island | wb-page bench-page | ✓ BenchDetail (GBIWholesale) |
| `t14-bench-detail-island-light.png` | light | island | wb-page bench-page | ✓ BenchDetail (GBIWholesale) |
| `t14-build-stopped-rail-dark.png` | dark | rail | wb-page build-page | ✓ Build stopped (No bench) |
| `t14-build-stopped-rail-light.png` | light | rail | wb-page build-page | ✓ Build stopped (No bench) |
| `t14-build-stopped-island-dark.png` | dark | island | wb-page build-page | ✓ Build stopped (No bench) |
| `t14-build-stopped-island-light.png` | light | island | wb-page build-page | ✓ Build stopped (No bench) |

---

## Design fidelity — MATCH/MISMATCH vs pages-d

**AllBenches (fragment.html):**
- Header: "Benches" title + count badge + "Add folder" button → **MATCH** (DOM: `headerTitle: 'Benches'`, `headerBadge: '61'`, `addFolderBtn: 'Add folder'`)
- Apps column: `.wb-app-tag` chips with overflow count → **MATCH** (DOM: 285 tag elements, first row: Etims/erpnext/frappe)
- Table columns: Bench / Path / Version / Apps / Sites / State / Action → **MATCH**
- Tab filters: All benches tab present → **MATCH**

**BenchDetail (fragment-detail.html):**
- Island header: bench name, path, Stopped badge, Start bench button → **MATCH** (DOM: title='GBIWholesale', status='Stopped', btn='Start bench')
- AppsSection: `.wb-app-detail-row` rows from real disk scan → **MATCH** (DOM: 11 app rows present for GBIWholesale)
- WorkersSection: `.wb-worker-dot` chips from Procfile → **MATCH** (DOM: present)
- ProcessPanel: present with proc/port meta → **MATCH**

**Build stopped (fragment-empty.html):**
- "No bench" state in sidebar, no red banner → **MATCH** (DOM: `noBenchTitle: 'No bench'`, `bannerVisible: false`)

---

## Self-review

- No hardcoded values; all new strings use tokens from i18n catalog.
- `readBenchApps` reads disk; `readProcfileEntries` parses Procfile — no fake/stub data.
- `BenchSummary.apps` is populated in `scanRoot` so AllBenches chips work from the scan, not an extra IPC call.
- `benchDetail` IPC is only called on `BenchDetail` mount (selected bench), not on list render.
- No source-text pins in tests; `bench-detail-ipc.test.mjs` tests behaviour only.

## Deviations

- `WorkersSection` shows Procfile process names (not PIDs). PID lookup requires OS process-tree traversal not available from the IPC context without spawning `ps` — process names identify the process type which is what the design shows.
- Build-running screenshot not captured: no real Frappe bench to start in the test environment without network access. Stopped state fully verified; running state requires a real bench start.
