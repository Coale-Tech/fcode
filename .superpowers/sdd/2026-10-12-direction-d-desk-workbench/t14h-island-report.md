# T14H-Island Report — D3 Island Layout Visual Verification

**Branch**: `feat/direction-d-t14h-island`
**Status**: DONE
**Final commit**: `dcd820622`

---

## What was done

### Foundation merges (b904f37ea → 9c6a7c2b0)
- Merged `feat/direction-d-t14g-bench`, `feat/direction-d-t14g-pages`, `feat/direction-d-t14g-settings`, `feat/direction-d-t14g-chat` lanes
- Merged upstream `feat/direction-d` post-integration sync

### feat(island): D3 island sidebar chrome + i18n (b4472a5b5)
- `Sidebar.tsx`: `d3-sb-bench-sub` bench status sub-label (live via `useBenchContext`)
- `d-shell.css`: `.d3-sb-bench-sub`, `.d3-sb-pinned-pages`, `.d3-sb-pinned-row`
- All 9 locales: `nav.pinnedPages`, `workspaceBar.benchRunning`, `workspaceBar.benchStopped`

### feat(island): post-merge polish (88b24320c)
- `NavRail.tsx`: removed label truncation — `overflow: visible; max-width: none` on `.nav-rail-label`
- `d-shell.css`: `.nav-rail-btn.nav-rail-labeled` overflow visible; `.d3-sb-bench-sub::first-letter { text-transform: uppercase }`
- `i18n/en`: `workspaceBar.benchRunning` → `"bench running"` (status bar lowercase; sidebar capitalizes via CSS)

### feat(island): seed all 9 pages + CSS fixes (a39acf92f)
- `capture-rig.ts`: `seedBenchList()` — sets `window.__PI_CAPTURE_BENCH_LIST__` with 5 seeded benches
- `shoot-island.mjs`: viewport 1440×900 via `Emulation.setDeviceMetricsOverride`; seeds: notifications(7), kanban(1), scheduledTasks(1), plugins(5), pullRequests(1), benchList
- `renderer-api.ts`: `"seedBenchList"` added to `CAPTURE_RIG_METHODS`; `__PI_CAPTURE_BENCH_LIST__` to Window interface

### fix(island/bench): BenchPage capture hook (24bb5470d)
- `BenchPage.tsx`: capture hook in `loadBenches()` reads `window.__PI_CAPTURE_BENCH_LIST__`
- `BenchPage.tsx`: status polling effect reads `window.__PI_BENCH_OVERRIDE__`

### fix(island/bench): electron-vite build (7c1b93f8a)
- Identified `npx vite build` used wrong config; correct command is `electron-vite build`
- Rebuilt with correct config → `BenchPage-C-eGXd0D.js` (new hash) with capture hooks compiled in

### fix(island/bench-tabs): Both detail tabs register (dcd820622)
- After `btns[0].click()`, `BenchPage` sets `tab=bench.id` → `AllBenches` unmounts → `btns[1]` gone
- Fix: navigate back to "All benches" tab via `bench-tab-all` between row clicks
- Both `coale_v16` (Running, green) and `dev_bench` tabs now visible in tab strip

---

## Tests

| Suite | Pass | Fail | Notes |
|-------|------|------|-------|
| tsc renderer | 0 errors | — | TypeScript, clean |
| packages/i18n pnpm test | 27/27 | 0 | All locale keys present |

---

## Screenshots (final — 21 shots)

**Branch head**: `dcd820622`
**Build**: `electron-vite build` → `out/renderer/assets/BenchPage-C-eGXd0D.js`
**Viewport**: 1440×900 @ DPR=1 (`Emulation.setDeviceMetricsOverride`)
**Settings readback**: `navLayout=island`, `theme=light/dark`
**Root attr**: `data-nav-layout="island"` confirmed

| Shot | File | Size | Status | Notes |
|------|------|------|--------|-------|
| Light chat | D3-light-chat.png | 198 kB | ✅ MATCH | Permission card, bench running · 3 sites |
| Light bench | D3-light-bench.png | 190 kB | ✅ MATCH | 5 seeded benches, coale_v16 Running, dev_bench tab, yellow banner |
| Light build | D3-light-build.png | 151 kB | ✅ MATCH | Build page structure |
| Light kanban | D3-light-kanban.png | 200 kB | ✅ MATCH | 5 columns (Todo/Running/Review/Blocked/Done), 12 cards, 2 running |
| Light raven | D3-light-raven.png | 98 kB | ⚠️ PARTIAL | No connected state (no WebSocket mock) |
| Light filebird | D3-light-filebird.png | 95 kB | ⚠️ PARTIAL | No connected state (no SFTP mock) |
| Light scheduled | D3-light-scheduled.png | 168 kB | ✅ MATCH | 5 tasks, 24 run history entries |
| Light notifications | D3-light-notifications.png | 193 kB | ✅ MATCH | All 7, Unread 3, TODAY+YESTERDAY sections |
| Light plugins | D3-light-plugins.png | 167 kB | ✅ MATCH | 5 plugins, needs-attention/update-ready/active/turned-off sections |
| Light pulls | D3-light-pulls.png | 169 kB | ✅ MATCH | Pull requests page |
| Light settings | D3-light-settings.png | 147 kB | ✅ MATCH | Settings inside island shell |
| Dark chat | D3-dark-chat.png | 195 kB | ✅ MATCH | Permission card, bench running · 3 sites |
| Dark bench | D3-dark-bench.png | 185 kB | ✅ MATCH | 5 seeded benches, coale_v16 Running, dev_bench tab |
| Dark build | D3-dark-build.png | 146 kB | ✅ MATCH | Build page |
| Dark kanban | D3-dark-kanban.png | 194 kB | ✅ MATCH | 5 columns, cards, running highlight |
| Dark raven | D3-dark-raven.png | 95 kB | ⚠️ PARTIAL | No connected state |
| Dark filebird | D3-dark-filebird.png | 91 kB | ⚠️ PARTIAL | No connected state |
| Dark scheduled | D3-dark-scheduled.png | 161 kB | ✅ MATCH | 5 tasks, history |
| Dark notifications | D3-dark-notifications.png | 189 kB | ✅ MATCH | All 7, Unread 3 |
| Dark plugins | D3-dark-plugins.png | 162 kB | ✅ MATCH | 5 plugins |
| Dark settings | D3-dark-settings.png | 144 kB | ✅ MATCH | Settings dark |

All 21 shots in `shots/H-island/`. Provenance: `shots/H-island/provenance.json`.

---

## Design Fidelity Summary

| Page | Element | Status |
|------|---------|--------|
| **All pages** | 1440×900 viewport | ✅ MATCH |
| **All pages** | Island card (floating rounded) | ✅ MATCH |
| **All pages** | 60px labelled rail (Kanban/Raven/FileBird/Bench/Build/…) | ✅ MATCH |
| **All pages** | Rail labels untruncated ("Scheduled" not "Sched…") | ✅ MATCH |
| **All pages** | 256px permanent sidebar | ✅ MATCH |
| **All pages** | Sidebar bench sub-label "Bench running · 3 sites" | ✅ MATCH |
| **All pages** | Status bar "bench running" lowercase | ✅ MATCH |
| **Chat** | Permission card (Pending approval) | ✅ MATCH |
| **Bench** | 5 seeded benches | ✅ MATCH |
| **Bench** | coale_v16 Running (green) + warning banner | ✅ MATCH |
| **Bench** | Two detail tabs (coale_v16 + dev_bench) | ✅ MATCH |
| **Bench** | Running elapsed time (e.g. "02:47") | ⚠️ MINOR — timer starts at mount, not seeded |
| **Bench** | Footer "5 of 5" vs "5 of 61" | ⚠️ MINOR — only 5 benches seeded |
| **Kanban** | 5 columns + 12 cards + 2 running | ✅ MATCH |
| **Notifications** | All 7, Unread 3, TODAY+YESTERDAY sections | ✅ MATCH |
| **Plugins** | 5 plugins with all 4 status sections | ✅ MATCH |
| **Scheduled** | 5 tasks + 24 run history entries | ✅ MATCH |
| **Raven** | Connected state (messages, thread list) | ⚠️ GAP — requires live WebSocket |
| **FileBird** | Connected state (file tree) | ⚠️ GAP — requires live SFTP |

---

## Known Gaps (carry)

1. **Raven disconnected**: No WebSocket mock; page shows empty/offline state. Full mock requires
   intercepting the Raven IPC layer — deferred.
2. **FileBird disconnected**: No SFTP mock; file tree empty. Same constraint.
3. **Bench elapsed time**: Running timer starts at mount; seeded bench shows "Running" without "02:47"
   style duration. Would need a seeded `startedAt` timestamp in bench status.
4. **Footer count**: Seeded 5 benches → shows "5 of 5"; reference shows "5 of 61" (only 5 rows, but
   total bench count from real FS discovery is 61). Minor — visual row count matches.

---

## Files Changed (this lane)

### Capture / tooling
- `apps/desktop/src/capture/capture-rig.ts` — `seedBenchList()` method
- `apps/desktop/src/capture/renderer-api.ts` — `"seedBenchList"` in CAPTURE_RIG_METHODS
- `.superpowers/sdd/.../tools/shoot-island.mjs` — all 9 pages, 1440×900, bench tab sequence

### Product source
- `apps/desktop/src/pages/BenchPage.tsx` — `__PI_CAPTURE_BENCH_LIST__` + `__PI_BENCH_OVERRIDE__` hooks
- `apps/desktop/src/styles/d-shell.css` — rail label overflow, nav-rail-labeled overflow, bench-sub capitalize
- `apps/desktop/test/island-d3-sidebar.test.mjs` — behavioral tests (14 tests)

### i18n (all 9 locales)
- `packages/i18n/src/locales/en/index.ts` — `benchRunning: "bench running"` (lowercase)
- `packages/i18n/src/locales/de/index.ts` — `nav.pinnedPages`, `workspaceBar.benchRunning`
- `packages/i18n/src/locales/es/index.ts` — same
- `packages/i18n/src/locales/fr/index.ts` — same
- `packages/i18n/src/locales/ko/index.ts` — same
- `packages/i18n/src/locales/pt-BR/index.ts` — same
- `packages/i18n/src/locales/tr/index.ts` — same
- `packages/i18n/src/locales/zh-CN/index.ts` — same
- `packages/i18n/src/locales/zh-TW/index.ts` — same
- `packages/i18n/test/catalogs.test.mjs` — updated test expectations
- `packages/i18n/test/user-facing-copy.test.mjs` — updated copy spot-checks

### Shots
- `.superpowers/sdd/.../shots/H-island/D3-{light,dark}-{chat,bench,build,kanban,raven,filebird,scheduled,notifications,plugins,pulls,settings}.png` — 21 shots
- `.superpowers/sdd/.../shots/H-island/provenance.json` — provenance record

---

## Commit Log

| Commit | Message |
|--------|---------|
| `59b454eb9` | feat(pages): scheduled/notifications/plugins/kanban/pull-requests |
| `1c4068d8a` | fix(bench): direction-d t14g-bench lane verified |
| `b904f37ea` | merge(integration): feat/direction-d-t14g-bench |
| `e1b170819` | merge(integration): feat/direction-d-t14g-pages |
| `84cf4f83d` | merge(integration): feat/direction-d-t14g-settings |
| `c03ae8506` | feat(chat-surface): Direction D layout |
| `f32e1e5f7` | merge(integration): feat/direction-d-t14g-chat |
| `b4472a5b5` | feat(island): D3 island sidebar chrome + i18n |
| `fdee0acdf` | wip(island): session timestamps, chevron, rail i18n |
| `9c6a7c2b0` | Merge upstream feat/direction-d |
| `88b24320c` | feat(island): post-merge polish |
| `a39acf92f` | feat(island): seed all 9 pages, CSS fixes, benchRunning lowercase |
| `24bb5470d` | fix(island/bench): BenchPage capture hook |
| `7c1b93f8a` | fix(island/bench): electron-vite build + reshoot |
| `dcd820622` | fix(island/bench-tabs): click All-benches between row opens |
