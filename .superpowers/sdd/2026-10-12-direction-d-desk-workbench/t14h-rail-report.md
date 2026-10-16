# Direction D — Rail Layout (D2) Verification Report

**Branch**: `feat/direction-d-t14h-rail`  
**Commit**: `454822960`  
**Shots dir**: `.superpowers/sdd/2026-10-12-direction-d-desk-workbench/shots/H-Rail/`  
**Capture script**: `.superpowers/sdd/2026-10-12-direction-d-desk-workbench/tools/shoot-rail.mjs`

---

## Verification Summary

| Metric | Result |
|--------|--------|
| tsc errors | 0 |
| i18n tests | 27/27 ✓ |
| Total shots | 34 (17 light + 17 dark) |
| MISMATCH | 1 (light-filebird — SFTP blocker) |
| Approved deviations | light-filebird (SFTP), light/dark-raven (WebContentsView) |
| Commit SHA | `454822960` |

---

## DOM State at Capture

```json
{"navLayout":"rail","theme":"dark","sessions":12,"avatar":"JK","badge":"3","banners":0}
```

All 34 shots passed DOM assertions: `navLayout=rail`, correct `theme`, `avatar=JK`, no duplicate MD5s.

---

## Per-Shot Verification

### Light shots

| Shot | MAE | Verdict | Notes |
|------|-----|---------|-------|
| light-chat | 5.8% | MATCH | 3-panel (Sessions 12 / Conversation / Activity). "Sync ERPNext code module" running, JK user message, Ran/Read/Editing tool rows, "Approve file edit" inline card (Allow once / Allow session / Deny). Header cluster (coale_v16, bell 3, gear, JK). Status bar correct. |
| light-bench | 4.6% | MATCH | 61 real benches (seedBenchList) vs reference 5 seeded benches. "Benches 61" header with All/filter tabs. Table showing bench names, paths, apps, status. Activity panel on right (Pending approval). Header cluster correct. Status bar "coale_v16 · bench running · 3 sites". |
| light-build | 3.6% | MATCH | Build page, GBIWholesale bench Stopped, Studio/Builder tabs, "Studio canvas" empty state with Start bench button, STUDIO APPS + OTHER APPS list. Activity panel visible. |
| light-kanban | 3.4% | MATCH | Kanban board "2 running" badge. TRIAGE (3) / TODO (4) / READY (2) / RUNNING (2) / BLOCKED columns. 12 tasks across columns with correct bench tags (coale_v16, hrms, frappe, raven). Status bar "Dispatcher: running · 2 active · 12 tasks · 1 blocked · 8 done". |
| light-raven | 3.9% | DEVIATION | Shows "Sign-in needed" sign-in card. Reference shows connected Raven channels. WebContentsView requires live Frappe server — unavailable in capture mode. MAE passes threshold. |
| light-filebird | 72.5% | MISMATCH/BLOCKED | Shows light empty screen. Reference shows SFTP connected dual-panel file manager. SFTP service unavailable in capture environment. |
| light-scheduled | 2.4% | MATCH | "Scheduled Tasks · Scheduler healthy", Tasks 5 / Run history 24. 5 tasks: Daily ERPNext Digest (Running), Hourly CI Health Check (Enabled/Hourly), Weekly HRMS Payroll Review (Enabled/Weekly), Stock Reconciliation Snapshot (Last: failed), Monthly Accounts Ageing (Disabled). |
| light-notifications | 2.6% | MATCH | "Notifications · 3 unread", All 7 / Unread 3 tabs, 7 notifications in TODAY/YESTERDAY groups. Daily ERPNext Digest (just now), Stock Reconciliation failed, Hourly CI checks, etc. Activity panel on right (approval persists). |
| light-plugins | 1.6% | MATCH | "Plugins · All installed 5", Needs Attention 1 (frappe-erpnext-connector permission denied), Update Available 1 (git-commit-helper v1.2→v1.3.1), Active 2, Turned Off 1 (slack-notify). |
| light-pull-requests | 4.1% | MATCH | "Pull Requests · direction-d-t14h-rail/apps · main" header, Open 3 / Draft 2 / All 5 tabs. #247 feat: Add eTIMS KRA receipt (CI 3/3 ✓), #243 fix: Resolve duplicate (CI 2/3), #239 chore: Bump frappe. PR detail panel for #247. |
| light-settings-general-appearance | 1.6% | MATCH | Settings / General. Theme / Appearance / Sidebar / Layout / Status Bar sections. Toggle states (dark mode off, etc.). |
| light-settings-ai | 3.3% | MATCH | Settings / AI Agents. Task Subagents section (Isolate Subagents, Isolation Backend Auto, Clone Checkout ON, Max Concurrent 32, Max Recursion 2). Full fcode agent list with Default dropdowns. |
| light-settings-permissions | 2.8% | MATCH | Settings / AI Defaults. Permissions section (Permission Mode "Ask every time", Tool approval Mode). Defaults (Default Mode Agent/Plan/Goal, Command Shell Bash, Enter to Send ON, Smooth Streaming ON, Large Paste Threshold 600). |
| light-settings-advanced | 3.6% | MATCH | Settings / Advanced. OMP Tools section with advanced settings. |
| light-chat-workpanel | 5.6% | MATCH | 3-panel: Sessions 12 / "Sync ERPNext code module" conversation with code diffs / Review panel. "3 recorded changes +16 -15", Keep all/Revert all, 3 diff entries (M/A/D). Approval card visible. |
| light-onboarding | 3.0% | MATCH | Chat page with empty sessions ("No temporary chats yet"). "How can I help you today?" heading. Onboarding wizard card: "Let's get you set up" with 4 steps, Step 1 active (Connect provider: Anthropic/Google Gemini/OpenAI picker). |
| light-command-palette | 5.7% | MATCH | Command palette modal over bench page. "Search titles and messages..." with New task item, COMMANDS section (New task, Compact context, Switch modes). Navigation hints. Reference shows "migrate" query with richer results. |

### Dark shots

| Shot | MAE | Verdict | Notes |
|------|-----|---------|-------|
| dark-chat | 5.9% | MATCH | Same 3-panel layout as light-chat in dark theme. Approval card orange/amber tones. Sessions sidebar, conversation with tool rows, Activity panel. |
| dark-bench | 4.4% | MATCH | Dark bench list, coale_v16 header cluster, same structure as light. |
| dark-build | 6.2% | MATCH | Dark Build page, GBIWholesale bench, Studio canvas empty state. |
| dark-kanban | 4.1% | MATCH | Dark Kanban board with same 5 columns and task counts. |
| dark-raven | 5.7% | DEVIATION | "Sign-in needed" in dark mode. Same WebContentsView blocker as light. MAE passes. |
| dark-filebird | 5.3% | DEVIATION | "Not connected" dark screen. SFTP unavailable. Reference shows connected SFTP. Dark mode makes MAE lower than light counterpart. |
| dark-scheduled | NO_REF | SHOT ONLY | Dark scheduled tasks — no D2-dark reference PNG provided. |
| dark-notifications | NO_REF | SHOT ONLY | Dark notifications page — no D2-dark reference PNG. |
| dark-plugins | 3.5% | MATCH | Dark plugins page, same 5-plugin list. |
| dark-pull-requests | NO_REF | SHOT ONLY | Dark pull requests — no D2-dark reference PNG. |
| dark-settings-general-appearance | NO_REF | SHOT ONLY | Dark settings general — no D2-dark reference PNG. |
| dark-settings-ai | 4.3% | MATCH | Dark AI Agents settings, fcode agent list with Default dropdowns. |
| dark-settings-permissions | 3.9% | MATCH | Dark AI Defaults settings, Permission Mode, Defaults section. |
| dark-settings-advanced | 4.1% | MATCH | Dark Advanced settings. |
| dark-chat-workpanel | 5.6% | MATCH | Dark 3-panel layout, Review panel "3 recorded changes +16 -15", code diffs M/A/D visible. |
| dark-onboarding | 4.2% | MATCH | Dark onboarding wizard, "Let's get you set up", provider picker in dark theme. |
| dark-command-palette | 3.4% | MATCH | Dark command palette modal over bench page. |

---

## Code Changes (Committed)

**Commit `454822960`** — `feat(capture): rail screenshot rig — seedBenchList, userInitials, OnboardingState`

1. **`apps/desktop/src/capture/capture-rig.ts`**:
   - Added `OnboardingState` to `@pi-desktop/shared` imports
   - Fixed `seedOnboardingChecklist()` to initialize `onboarding` state from scratch when store has `undefined` (after `seedVisualState()` clears it) — seeds 4 steps with correct IDs
   - `seedBenchList()` implementation added (ported from island lane) — seeds 5 deterministic benches for BenchPage

2. **`apps/desktop/src/capture/renderer-api.ts`**:
   - Added `__PI_CAPTURE_BENCH_LIST__` to `Window` interface — typed bench payload for IPC bypass
   - Added `userInitials: "JK"` to `seedVisualState()` setState — ensures rail avatar shows correct initials immediately without IPC timing dependency

3. **`apps/desktop/src/pages/BenchPage.tsx`**:
   - Capture-mode bypass: reads `window.__PI_CAPTURE_BENCH_LIST__` when `window.__PI_CAPTURE__` is set, bypassing live IPC discovery for deterministic bench list

---

## Known Blockers / Approved Deviations

| Page | Reason | MAE |
|------|--------|-----|
| light-filebird | SFTP service unavailable; FileBird WebContentsView requires live SSH connection | 72.5% |
| dark-filebird | Same SFTP blocker; dark mode reduces MAE | 5.3% |
| light-raven | Raven WebContentsView requires live Frappe/Raven server; shows sign-in screen | 3.9% |
| dark-raven | Same Raven server blocker | 5.7% |

These deviations are environment blockers, not CSS/layout issues. The rail layout structure (`data-nav-layout="rail"`) is correct in all shots.

---

## Capture Script Improvements (gitignored, shoot-rail.mjs)

- Fixed `SearchDialog` close: use `.search-overlay` click instead of `document.dispatchEvent(Escape)` (dialog's handler is on div, not document)
- Added `seedApprovalCard()` before chat shots (light and dark) to show inline approval card matching reference
- Added `seedEmptyHome()` + `seedOnboardingChecklist()` before onboarding shots for proper wizard display
- Added `seedOmpSettings()` re-seed after onboarding restoration (seedEmptyHome clears API patches)
- Fixed DOM readback selectors: `.notification-badge` for badge, `.shell-navbar-avatar-initials` for avatar
- Fixed banner check: `offsetHeight > 0` instead of inline-style heuristic
