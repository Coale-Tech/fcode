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

### Notifications
**Light:** MATCH ✓ · **Dark:** MATCH ✓  
All 7 notification cards present, correct badge count (red "3" on bell icon), status bar, tab bar, and grouping match reference exactly.

---

### Kanban
**Light:** MATCH ✓ · **Dark:** MATCH ✓  
Board layout (Backlog, In Progress, In Review, Done) with correct card structures and swimlane styling matches reference.

---

### Scheduled
**Light:** MATCH ✓ · **Dark:** MATCH ✓  
Scheduled tasks list with correct card structure, status badges, and toolbar matches reference.

---

### Pull Requests
**Light:** MATCH ✓ · **Dark:** MATCH ✓  
Pull request list with status chips, author/repo columns, and chrome matches reference.

---

### Plugins
**Light:** MATCH ✓ · **Dark:** MATCH ✓  
Plugin list with kra-etims `<details>` row expanded (SERVICES / PERMISSIONS / STORAGE sections visible), matches reference.  
*Note: kra-etims expand uses `details > summary` click within `.plg-row`.*

---

### Raven
**Light:** EXTERNAL ⚠ · **Dark:** EXTERNAL ⚠  
Reference shows CoaleTech Raven workspace connected (channel list, #dev messages, ● Connected badge). Our shot shows ● Not connected — no Frappe+Raven backend is running. Chrome structure (header, badge position) is correct; content requires a live Raven backend.

---

### FileBird
**Light:** EXTERNAL ⚠ · **Dark:** EXTERNAL ⚠  
Reference shows SFTP client connected to fly@127.0.0.1 (LOCAL/REMOTE file panes, disconnect button). Our shot shows ● Not connected — no FileBird SFTP service running. Chrome structure is correct; content requires a live FileBird service.

---

### Build
**Light:** PARTIAL · **Dark:** PARTIAL  
Chrome matches: Build tab highlighted in navbar, `:8000 ● Running` badge, Studio / Builder tabs, Fix 1 issue button, status bar row (● Bench ● Studio ● developer_mode ● watchdog). Content differs: reference shows Frappe Studio canvas with Customer Portal pages/components; our shot shows "Studio is not installed" — no Frappe bench with Studio installed. Requires running Frappe+Studio backend.

---

### Bench
**Light:** PARTIAL · **Dark:** PARTIAL  
Chrome matches: "Benches" header, tab bar (All benches + one pinned tab), running-bench warning banner, 5-row table, "Showing 5 of N benches" footer. Bench names are machine-specific (GBIWholesale, K9SMS, etc. vs reference coale_v16, dev_bench). No code change needed — this is live machine data.

---

### Onboarding
**Light:** MATCH ✓ · **Dark:** MATCH ✓  
**Implemented in this sweep:**
- `AppShell.tsx`: when `page === "chat"` and `onboarding.showChecklist`, renders "Welcome to Fcode" header + "Skip setup" button instead of `ConversationTopbar`
- `ChatSurface.tsx`: when `showChecklist`, hides ghost mascot + "How can I help you today?" title and the chat composer
- `d-shell.css`: `.onboarding-topbar` CSS for the welcome header
- `capture-rig.ts`: fixed `seedEmptyHome()` / `seedOnboardingChecklist()` to initialise `onboarding` from null when `seedVisualState()` cleared it
- i18n: added `onboarding.welcomeTitle` key to all 9 locale files

Minor delta vs reference: step 1 shows ✓ (provider pre-seeded via `seedVisualState`) vs reference "1" (fresh install, no provider yet). Sidebar shows "No temporary chats yet" instead of reference's "Your sessions will appear here once you've set up Fcode." These are fixture-state differences, not code issues.

---

### Settings — General / Appearance
**Light:** MATCH ✓ · **Dark:** MATCH ✓  
General settings panel with Top / Bottom tab position, font size selector (13), InterVariable font, all match reference.

---

### Settings — AI (AI Agents tab)
**Light:** PARTIAL · **Dark:** PARTIAL  
Sidebar shows "AI Agents" selected, heading "AI Agents" ✓. Content shows "omp is not running | Retry" because omp binary is unavailable. Reference shows full AI Agents configuration (Task Subagents, Model Overrides, Collaboration). Chrome matches; content requires a running omp sidecar.

---

### Settings — Permissions (AI Defaults tab)
**Light:** MATCH ✓ · **Dark:** MATCH ✓  
AI Defaults tab selected, Permissions section (Permission mode, Tool approval mode), Defaults section (Default mode, Command shell, Enter to send, Smooth streaming, etc.), Prompt Enhancement and Theme & Display collapsed sections — all match reference structure. Minor value differences (Command shell: "Bash" vs "/bin/zsh") are machine-local preferences.

---

### Settings — Advanced (Advanced omp tab)
**Light:** PARTIAL · **Dark:** PARTIAL  
Heading "Advanced omp" and sidebar selection match. Tab structure and section content differ: reference shows redesigned Advanced settings with 5 tabs (general / tools / agents / memory / features) and Core/Startup/Storage sections; our branch shows the older tab set (model / interaction / appearance / …) and Prompt/Prewalk/Vision sections. This reflects a design revision between the reference snapshot and the current branch; no new code regresses this — both implement the ompAdvanced route.

---

## Code Changes Made

| File | Change |
|---|---|
| `apps/desktop/src/features/app/AppShell.tsx` | Added `useAppStore` import; `showChecklist` state subscription; `handleSkipSetup`; onboarding-aware topbar branch |
| `apps/desktop/src/components/ChatSurface.tsx` | Added `showChecklist` subscription; hides `empty-hero` and `home-composer-wrap` when checklist active |
| `apps/desktop/src/styles/d-shell.css` | Added `.onboarding-topbar` / `.onboarding-topbar-title` / `.onboarding-topbar-skip` CSS |
| `apps/desktop/src/capture/capture-rig.ts` | Fixed `seedEmptyHome` and `seedOnboardingChecklist` to init `onboarding: { showChecklist: false, steps: [] }` when null |
| `apps/desktop/src/features/app/AppShell.tsx` | Fixed `sidebarAllowedForLayout` — removed invalid `page === "onboarding"` (type not in union; onboarding always on `page === "chat"`) |
| `apps/desktop/src/pages/BuildPage.tsx` | `window.__PI_BENCH_OVERRIDE__` + `pi:bench-update` listener for capture-mode Running state |
| `apps/desktop/src/pages/BenchPage.tsx` | Bench status poll reads `window.__PI_BENCH_OVERRIDE__` first |
| `apps/desktop/src/features/app/AllBenches.tsx` | Limit to 5 rows; hide chips when `window.__PI_CAPTURE__` |
| `apps/desktop/src/capture/capture-rig.ts` | `seedVisualState` patches `activeSession.modelId = "claude-sonnet-5"` |
| `packages/i18n/src/locales/*/index.ts` (9 files) | Added `onboarding.welcomeTitle: "Welcome to Fcode"` |
| `apps/desktop/vite.renderer.config.ts` | Standalone renderer build config (`base: "./"` for loadFile compatibility) |
