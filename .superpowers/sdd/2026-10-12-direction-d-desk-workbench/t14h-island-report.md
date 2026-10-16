# H-Island Lane Report — Direction D Desk Workbench

**Branch:** `feat/direction-d-t14h-island`  
**Commit:** `88b24320c`  
**Shots:** `.superpowers/sdd/2026-10-12-direction-d-desk-workbench/shots/H-island/`  
**Pages:** 21 shots (11 light + 10 dark — all pages except pulls-dark)

---

## What was built

**4 product files changed:**

### 1. `d-shell-overrides.css` — CSS rules for island mode
- Hide projects section and sessions toolbar in `[data-nav-layout="island"]`
- Bench card name row: flex so chevron floats right (`.d3-sb-bench-name`, `.d3-sb-bench-chevron`)
- Session row timestamps always visible; kebab on hover only
- `[data-sidebar-section="projects"]` hidden globally (upstream merge from chat lane)
- Composer/PermissionCard/tool-activity-header overrides (from chat lane merge)
- **Post-merge**: Hide `.sidebar-pinned-sessions` in island (replaced by `.d3-sb-pinned-pages` icon buttons); give `.sidebar-standalone-sessions` `flex: 1 1 auto` so TODAY/YESTERDAY/THIS WEEK groups fill the sidebar body

### 2. `Sidebar.tsx` — Date-grouped session list for island mode
- `groupSidebarSessionsByTime()` used for all layouts (upstream merge: cleaner `flatMap` version)
- `navLayout === "island"` filter uses `d3Filter` for search
- D3 island sidebar header: bench card (coale_v16 + green dot + chevron + "Bench running · 3 sites"), New session button, Filter sessions input
- PINNED PAGES section: icon buttons for Kanban · coale_v16, Raven · #general, FileBird · workspace

### 3. `capture-rig.ts` — Capture fixtures
- Backend-banner suppression injected as `<style>` element in `ensureVisualFixtures`
- `api.getUserInfo` mocked to return `{ fullName: "Josh Kim" }` → "JK" initials
- Session timestamps backdated via `useAppStore.setState({ sessions: backdated })` so TODAY/YESTERDAY/THIS WEEK groups render with relative times (2m/47m/2h/1d/3d/4d/6d/7d)
- `workspace: null` and `openProjectPaths: []` cleared in fixtures

### 4. `packages/i18n/src/locales/*/index.ts` — i18n keys (all 9 locales)
- `nav.timeGroupToday` added to all 9 locales (en: "Today", de: "Heute", es: "Hoy", fr: "Aujourd'hui", ko: "오늘", pt-BR: "Hoje", tr: "Bugün", zh-CN: "今天", zh-TW: "今天")

### 5. `renderer-api.ts` — seedVisualState() (from chat lane merge, extended)
- Added 3 pinned sessions (`pinned: true`) for fixture-p1/p2/p3 (Kanban · coale_v16, Raven · #general, FileBird workspace)
- Added `userInitials: "JK"`, `openProjectPaths: []`, `workspace: null` to setState
- `mk()` helper accepts optional `pinned` flag

---

## Gates cleared

- **tsc:** 0 renderer errors
- **i18n:** 27/27 (10 renderer-keys + 9 catalogs + 8 user-facing-copy)
- **Build:** `pnpm build` → 5255 modules transformed, no errors

---

## Shots

All 21 shots taken with `shoot-island.mjs` (v13):
- CDP WebSocket screenshot via raw `WebSocket` API (avoids omp `tab.screenshot()` 20s timeout)
- `FCODE_BENCH_ROOTS` set to fake bench root with 5 seeded benches (coale_v16, dev_bench, v15-bench, raven-bench, staging-v16)
- `seedVisualState()` used for sessions (sync, no IPC — avoids host-binary timeout)
- `seedBenchStatus({ benchPath: <coale_v16>, siteCount: 3 })` for bench card
- `seedNotifications(3)` for bell badge
- `enableFeatureFlags({ kanban: true, raven: true })`

### Sidebar chrome (verified on all 21 shots):
- ✅ Bench card: green dot + **coale_v16** + chevron + **Bench running · 3 sites**
- ✅ Session time groups: **TODAY** / **YESTERDAY** / **THIS WEEK** / **PREVIOUS 14 DAYS**
- ✅ Session titles with back-dated timestamps: 47m, 2h, 1d, 3d, 4d, 5d, 6d, 7d
- ✅ **PINNED PAGES**: Kanban · coale_v16, Raven · #general, FileBird · workspace
- ✅ Rail labels: Chat, Build, Bench, **Sched**, Kanban, Raven, FileBird, **Plugins**, PRs, **Inbox**, Settings
- ✅ JK avatar (top-right navbar)
- ✅ No backend-banner overlay on any shot
- ✅ Dark theme correctly darkened on all D3-dark-* shots

### Known non-chrome differences vs. reference (out of H-island scope):
- **Chat**: empty transcript (reference shows active conversation + activity panel) — chat lane scope
- **Kanban**: empty board (reference shows populated cards) — real data required
- **Raven**: "Sign-in needed" modal (reference shows connected workspace) — connection state
- **FileBird**: "Not connected" error (reference shows active SFTP) — plugin state
- **Build**: stopped bench state (reference shows active Frappe Studio) — running bench required
- **Scheduled**: no tasks seeded (reference shows 5 tasks) — data state
- **Plugins**: 2 bundled plugins (reference shows 5 with states) — data state
- **Notifications**: 3 items (reference shows 7) — by design (seedNotifications(3))

---

## Fixtures approach

`FCODE_BENCH_ROOTS` points to a tmpdir with 5 fake bench directories, each containing:
```
<benchName>/
  apps/<app>/<app>/__init__.py  (with __version__ = "16.0.0")
  sites/
```
This causes `discoverBenches()` to find exactly 5 benches without modifying product code or using `PI_DESKTOP_CAPTURE` (which triggers the G-Pages pipeline).

`seedVisualState()` in `renderer-api.ts` is synchronous and creates 15 in-memory sessions (3 pinned + 12 regular) with backdated timestamps. No IPC calls = no timeout risk.

---

## Sched truncation note

The rail label "Sched" (truncated from "Scheduled") is a pre-existing CSS behaviour: the 60px island rail clips `nav-rail-label` at `max-width: 100%` with `text-overflow: ellipsis`. The reference mockup uses hand-crafted session ages. The 7d truncation is in the `nav.timeGroupArchived` group — not introduced by this lane.
