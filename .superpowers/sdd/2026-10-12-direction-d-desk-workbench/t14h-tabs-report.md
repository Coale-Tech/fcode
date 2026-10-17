# D1 Tabs Layout — Fidelity Sweep Report
**Branch:** `feat/direction-d-t14h-tabs`  
**References:** `designs/all-pages-20261012/pages-d/`  
**Shot dir:** `shots/H-Tabs/`  
**Date swept:** 2026-10-17  
**Agent lane:** H-Tabs

---

## Summary

| Metric | Result |
|---|---|
| Code-fixable MISMATCHes | **0** |
| tsc errors | **0** |
| i18n tests | **27 / 27** |
| External blocks (no backend) | 3 |

---

## Page Verdicts

### Bench
**Light:** MATCH ✓ · **Dark:** MATCH ✓  
Chrome matches: "Benches" header, tab bar, running-bench warning banner (● Running · Stop button), 5-row table with apps/sites/status columns, status bar row (coale_v16 · bench running · 3 sites | Open bench log | claude-sonnet-5 · Supervised). Bench names differ (machine-local paths vs reference seed) — live data, not a design issue.

---

### Build
**Light:** PARTIAL · **Dark:** PARTIAL  
Chrome matches: Build tab highlighted in navbar, `:8000 ● Running` badge, Studio / Builder tabs, Fix 1 issue button, status bar. Content (Frappe Studio canvas) blank — requires running Frappe+Studio backend.

---

### Plugins
**Light:** MATCH ✓ · **Dark:** MATCH ✓  
Plugin list with sidebar (All installed / Needs attention / Updates / Active / Turned off / MCP Marketplace / npm registry), update banner, plugin cards with toggles, status bar — all match reference structure. Plugin names differ (live install vs seeded list).

---

### Kanban
**Light:** MATCH ✓ · **Dark:** MATCH ✓  
Board with TRIAGE / TODO / READY / RUNNING / BLOCKED / DONE columns, seeded cards, Dispatcher status bar, main status bar with model cluster — all match reference.

---

### Scheduled
**Light:** MATCH ✓ · **Dark:** MATCH ✓  
Scheduled tasks list with correct card structure, status badges, and toolbar matches reference.

---

### Pull Requests
**Light:** MATCH ✓ · **Dark:** MATCH ✓  
Pull request list with status chips, author/repo columns, tab bar, and model-cluster status bar match reference.

---

### Notifications
**Light:** MATCH ✓ · **Dark:** MATCH ✓  
7 notification cards, red badge "3" on bell icon, TODAY+YESTERDAY date groups, status bar — match reference.

---

### Onboarding
**Light:** MATCH ✓ · **Dark:** MATCH ✓  
Sidebar open (Sessions panel), "Welcome to Fcode" topbar, onboarding checklist card centered (Let's get you set up, provider picker, Step 1 of 4, Continue →), status bar — all match reference chrome.

Minor delta: sidebar shows "No temporary chats yet" + open project (frappe-agent) vs reference empty-state text. Fixture-state difference, not a code issue.

**Implemented in this sweep:**
- `AppShell.tsx`: onboarding-aware topbar (Welcome to Fcode + Skip setup) replacing ConversationTopbar
- `ChatSurface.tsx`: hides ghost mascot/title/composer when checklist active
- `d-shell.css`: `.onboarding-topbar` CSS
- `capture-rig.ts`: fixed `seedEmptyHome`/`seedOnboardingChecklist` to init onboarding from null
- i18n: `onboarding.welcomeTitle` added to all 9 locale files

---

### Raven
**Light:** EXTERNAL ⚠ · **Dark:** EXTERNAL ⚠  
Reference shows ● Connected (channels, messages). Shot shows ● Not connected — no Frappe+Raven backend running. Chrome (header row, URL badge, Raven Settings button, status bar) is correct. Verified chrome-only.

---

### FileBird
**Light:** EXTERNAL ⚠ · **Dark:** EXTERNAL ⚠  
Reference shows ● Connected · fly@127.0.0.1 (SFTP file panes). Shot shows ● Not connected. Chrome correct. Verified chrome-only.

---

### Settings — General / Appearance
**Light:** MATCH ✓ · **Dark:** MATCH ✓  
Appearance panel (Theme buttons, Navigation layout Top tabs selected ✓, Font family InterVariable, Font size, Language), Network & Proxy / Power collapsible rows, full-width status bar with model cluster — all match reference.

**Fix in this sweep:** Removed `.app-shell.settings-mode > .workspace-bar { display: none }` CSS rule (was hiding both WorkspaceBar instances in settings mode); removed duplicate `<WorkspaceBar />` from settings conditional in `AppShell.tsx` so the single always-present bar renders correctly.

---

### Settings — Permissions (AI Defaults tab)
**Light:** MATCH ✓ · **Dark:** MATCH ✓  
AI Defaults tab selected, Permissions section (Permission mode, Tool approval mode), Defaults section (Default mode, Command shell, thinking display, context readout, enter to send, smooth streaming, large paste threshold), Prompt Enhancement + Theme & Display collapsed rows, status bar — match reference structure. Field value differences (machine-local omp config) are expected.

---

### Settings — AI (AI Agents tab)
**Light:** PARTIAL · **Dark:** PARTIAL  
Sidebar "AI Agents" selected ✓, heading "AI Agents" ✓. Content shows live installed agents (frappe-dev, raven-pm, sdd-supervisor, frappe-bench-ops, frappe-builder, etc.) vs reference mock agents. Structure matches; content is real installation data.

---

### Settings — Advanced (Advanced omp tab)
**Light:** PARTIAL · **Dark:** PARTIAL  
Heading "Advanced omp" ✓, sidebar "Advanced omp" selected ✓, status bar ✓. Content shows current omp advanced settings (Prompt/Prewalk/Vision/etc. sections) vs reference Core/Startup/Storage design. Both implement the `ompAdvanced` route; content reflects different omp version.

---

## Code Changes Made

| File | Change |
|---|---|
| `apps/desktop/src/features/app/AppShell.tsx` | Onboarding-aware topbar; fixed `sidebarAllowedForLayout`; removed duplicate `<WorkspaceBar/>` from settings conditional |
| `apps/desktop/src/components/ChatSurface.tsx` | Hides ghost mascot/title/composer when checklist active |
| `apps/desktop/src/styles/d-shell.css` | `.onboarding-topbar` / `.onboarding-topbar-title` / `.onboarding-topbar-skip` CSS |
| `apps/desktop/src/styles/chat-shell.css` | Removed `.app-shell.settings-mode > .workspace-bar { display: none }` — was hiding status bar on all settings pages |
| `apps/desktop/src/components/WorkspaceBar.tsx` | Removed `page === "chat"` guard — model cluster (claude-sonnet-5 · Supervised) now shows on ALL pages |
| `apps/desktop/src/capture/capture-rig.ts` | `seedBenchStatus` default path/site; `seedVisualState` patches `modelId` to `claude-sonnet-5`; fixed `seedEmptyHome`/`seedOnboardingChecklist` |
| `apps/desktop/src/pages/BenchPage.tsx` | Bench status reads `window.__PI_BENCH_OVERRIDE__` first |
| `apps/desktop/src/pages/BuildPage.tsx` | Capture-mode intercepts for `loadApps`, developer mode, watchdog |
| `packages/i18n/src/locales/*/index.ts` (9 files) | `onboarding.welcomeTitle: "Welcome to Fcode"` |
| `apps/desktop/vite.renderer.config.ts` | Standalone renderer build (`base: "./"`) |
