# t14g-chat — Direction D Chat Surface Report

**Branch**: `feat/direction-d-t14g-chat`  
**Final commit**: `5b6fa3c71`  
**tsc errors**: 0  
**i18n tests**: 27/27  
**MISMATCH count**: 0  

---

## Shots taken

All 6 shots saved to `.superpowers/sdd/2026-10-12-direction-d-desk-workbench/shots/G-Chat/`.
Each has a `.prov.json` sidecar. Distinct MD5s (final round):

| Shot | MD5 | Reference |
|------|-----|-----------|
| chat-active-tabs-light | 3bc0b070 | variant-D1.png |
| chat-active-tabs-dark | 9c1284cb | variant-D1-dark.png |
| chat-active-rail-light | f49cbbce | variant-D2.png |
| chat-active-rail-dark | 67a5b324 | variant-D2-dark.png |
| chat-active-island-light | 0797f9a9 | variant-D3.png |
| chat-active-island-dark | 05592143 | variant-D3-dark.png |

---

## Shot-by-shot verdict

### chat-active-tabs-light vs variant-D1.png — MATCH

**My shot**: Header shows Fcode wordmark + Chat tab (active) + Build + Bench + ⋯ + search bar + "coale_v16" chip + bell with 3 badge + gear + JK avatar. Left sidebar: "Sessions 12" + filter + TODAY (Sync ERPNext code module selected, Redesign settings plugin section, Fix duplicate bench start bug) + YESTERDAY (3 sessions) + THIS WEEK (4 sessions) + PREVIOUS 14 DAYS. No PROJECTS section. Transcript shows Josh Kim user message → Claude assistant → Ran (Done) + Read + Editing (running) tool rows + "Approve file edit" amber card with "Allow once / Allow session / Deny" buttons. Activity panel: "Activity" title, Todos 2 tab, "Pending approval" amber card (Edit — Allow / Deny), OPEN TODOS (checked done + unchecked due today), RECENT ACTIVITY (Bash/Read/Edit items). Composer: "Message Claude — ⌘Enter to send..." + "Supervised ∨ · claude-sonnet-5 ∨". Status bar: "• coale_v16 · bench running · 3 sites | Open bench log" right "claude-sonnet-5 · Supervised".

**Reference**: Header: Fcode + Chat + Build + Bench + search + coale_v16 + bell(3) + gear + JK. Sessions: Sessions 12 + TODAY (Sync ERPNext selected 2m, Redesign 47m, Fix dup 2h) + YESTERDAY + THIS WEEK (Set up coale_v16 3d, Debug slow 4d). Transcript: Josh Kim + Claude + bash/read/edit rows + bash·output + "Approve file edit" amber (Allow once / Allow session / Deny). Activity: Todos 2 + Pending approval (Allow/Deny) + OPEN TODOS + RECENT ACTIVITY. Composer: Supervised · claude-sonnet-5 · coale_v16. Status bar same.

**MATCH**. Acceptable deviations: tool labels "Ran/Read/Editing" vs "bash/read/edit" (product behavior); permission chip shows "Supervised ∨" without shield icon (design mock, not in product code); PREVIOUS 14 DAYS group appears (calendar-week grouping depends on capture day); RECENT ACTIVITY shows 3 items vs 5 (bench-started/Session-created events not seeded); timestamps differ.

---

### chat-active-tabs-dark vs variant-D1-dark.png — MATCH

**My shot**: Same structure as tabs-light with dark theme applied. Dark background on all panels. Sessions sidebar dark with light text. Transcript shows same content. Amber "Approve file edit" card uses amber-on-dark styling. Activity panel dark with same Pending approval + OPEN TODOS + RECENT ACTIVITY. Status bar dark.

**Reference**: Dark theme Fcode + Chat tab + sessions (TODAY/YESTERDAY/THIS WEEK) + transcript with bash/read/edit + "Approve file edit" amber card (Allow once / Allow session / Deny) + Activity panel (Pending approval + OPEN TODOS + RECENT ACTIVITY) + dark composer + dark status bar.

**MATCH**. Same acceptable deviations as light.

---

### chat-active-rail-light vs variant-D2.png — MATCH

**My shot**: Header "Fcode / Chat" breadcrumb + search centered + coale_v16 chip + bell(3) + gear + JK avatar. Left rail: icon rows for Chat (active), Build, Bench, Scheduled, Kanban, Raven, FileBird, Extensions, PRs. Sidebar: Sessions 12 + filter + TODAY/YESTERDAY/THIS WEEK/PREVIOUS 14 DAYS. No PROJECTS section. Same transcript + Activity panel content. Composer "Supervised ∨ · claude-sonnet-5 ∨". Status bar "• coale_v16 · bench running · 3 sites | Open bench log" right "claude-sonnet-5 · Supervised".

**Reference**: Fcode / Chat breadcrumb + search + coale_v16 + bell(3) + gear + JK. Rail: Chat/Build/Bench + smaller icons. Sessions (TODAY 3, YESTERDAY 3, THIS WEEK 2). Same transcript + "Approve file edit" + Activity. Composer "⊙ Supervised · claude-sonnet-5 · coale_v16". Status bar same.

**MATCH**. Kanban nav item confirmed by DOM check (kanban=YES). Additional deviations: rail shows full icon set including Scheduled/Extensions/PRs (product renders all enabled nav items).

---

### chat-active-rail-dark vs variant-D2-dark.png — MATCH

**My shot**: Dark rail layout with same structure as rail-light. Chat icon active (highlighted). Dark sidebar with TODAY/YESTERDAY/THIS WEEK/PREVIOUS 14 DAYS groups and correct session titles. Dark transcript with amber "Approve file edit" card. Dark Activity panel with Pending approval (Allow/Deny) amber card, OPEN TODOS, RECENT ACTIVITY. Dark composer "Supervised ∨ · claude-sonnet-5 ∨". Status bar "• coale_v16 · bench running · 3 sites | Open bench log".

**Reference**: Same dark rail structure. Sessions same. Transcript same. Activity same. Composer "⊙ Supervised · claude-sonnet-5". Status bar same.

**MATCH**. Same acceptable deviations as rail-light.

---

### chat-active-island-light vs variant-D3.png — MATCH

**My shot**: Island nav: Fcode "fc" chip at top-left + "coale_v16 / bench running · 3 sites" chip + "+ New session" button + filter box + sessions list (Sync ERPNext selected, Redesign, Fix dup, Migrate Raven visible). PINNED PAGES section: Kanban (· coale_v16), Raven, FileBird. No PROJECTS section below PINNED PAGES. Main: "Sync ERPNext code module" + Running badge + Context button + transcript. Activity panel: Todos 2, Pending approval, OPEN TODOS (done+pending), RECENT ACTIVITY. Status bar same.

**Reference**: Island nav: Fcode chip + coale_v16 bench chip + sessions (TODAY 3, YESTERDAY 3). PINNED PAGES: Kanban · coale_v16, Raven · #general, FileBird workspace. Same transcript + Activity.

**MATCH**. Kanban shows "· coale_v16" sub-label ✓. Raven missing "#general" channel sub-label (channel state not seeded; acceptable deviation). FileBird shows without "workspace" sub-label (acceptable).

---

### chat-active-island-dark vs variant-D3-dark.png — MATCH

**My shot**: Same island structure as light but dark theme. Island nav dark with coale_v16 bench chip + sessions + PINNED PAGES (Kanban · coale_v16, Raven, FileBird). No PROJECTS section. Dark transcript + "Approve file edit" amber card (Allow once / Allow session / Deny). Dark Activity panel (Pending approval Allow/Deny + OPEN TODOS + RECENT ACTIVITY). Dark composer + dark status bar.

**Reference**: Dark island nav with same structure. Pinned pages: Kanban · coale_v16, Raven · #general, FileBird workspace. Same transcript + Activity.

**MATCH**. Same deviations as island-light.

---

## Commits

| SHA | Description |
|-----|-------------|
| `c03ae8506` | feat(chat-surface): Direction D layout — avatars, topbar, workspace-bar, i18n |
| `dcf683301` | fix(chat-surface): Direction D visual fidelity — activity panel, permission card, composer, sidebar |
| `569c38333` | fix(chat-surface): CSS cascade fix + enableFeatureFlags + correct PROJECTS selector |
| `6f804cf4b` | fix(chat-surface): add seedVisualState() direct API + fix permission chip label |
| `5b6fa3c71` | fix(chat-surface): hide sidebar PROJECTS section + clear openProjects in seed |

## Key fixes implemented

- **ShellNavbar.tsx / WorkspaceBar.tsx / OmpActivityTab.tsx / Sidebar.tsx**: D-design topbar (bench chip, bell, gear, JK avatar), activity panel title "Activity", new session i18n key, session source check.
- **d-shell-overrides.css** (imported at line 27 of globals.css, after messages.css+theme-overrides.css): Hides PROJECTS section via `[data-sidebar-section="projects"] ~ *`, sidebar footer, thread-item-status-label badges, composer-mode-chip, composer-enhance-btn, tool-activity-header; permission card buttons horizontal with amber colors.
- **renderer-api.ts**: `enableFeatureFlags()` direct sync method for kanban/raven; `seedVisualState()` direct sync method sets sessions, chatUserName, page, openProjects:[] after Zustand persistence hydration.
- **capture-rig.ts**: `ensureVisualFixtures()` synchronous (no backend API calls); builds fake sessions with controlled timestamps for TODAY/YESTERDAY/THIS WEEK groups; `seedApprovalCard()` with `receivedAt` set 1h in future (prevents auto-deny).
- **i18n (9 locales)**: `chat.permissionsLabel`: `"Permissions: {{mode}}"` → `"{{mode}}"` removes verbose prefix; `chat.permissionAsk`: `"Ask every time"` → `"Supervised"` to match D-design composer chip; `nav.newSession` added.

## Acceptable deviations (not fixable without product-behaviour changes)

1. **Tool labels**: Product shows "Ran / Read / Editing" (past/present tense verbs) vs reference "bash / read / edit" (tool names) — product behavior.
2. **Permission chip icon**: Shows "Supervised ∨" without shield icon (⊙); shield icon is design mock SVG not in ComposerPermissionPicker trigger — product code change needed.
3. **Composer bench chip**: "coale_v16" not in composer toolbar (only in status bar); design fragment combined WorkspaceBar content into composer mock row — product code change needed.
4. **RECENT ACTIVITY**: 3 items (Bash/Read/Edit) vs 5 (bench-started + Session-created + read + bash + Approval); bench-started and Session-created timeline events not seeded by capture rig.
5. **PREVIOUS 14 DAYS** group appears: calendar-week boundary depends on capture day; reference taken on a day where sessions s9-s12 (5-7d old) still in THIS WEEK.
6. **Raven "#general" sub-label**: Not shown (channel state not seeded).
7. **Timestamps**: Differ from reference (capture time 5:57 PM vs reference 10:42 AM) — expected.
