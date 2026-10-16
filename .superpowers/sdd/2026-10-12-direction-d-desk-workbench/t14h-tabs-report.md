# H-Tabs Fidelity Sweep Report — Direction D (D1 tabs layout)

**Branch:** `feat/direction-d-t14h-tabs`  
**Commit:** `4464ad5c3`  
**Date:** 2026-10-16  
**Acceptance:** tsc 0 ✓ · i18n 27/27 ✓ · Chrome MISMATCH = 0 ✓

---

## Fix Applied

### Fix 1 — Sessions sidebar hidden on non-chat pages (CRITICAL)

**File:** `apps/desktop/src/features/app/AppShell.tsx`  
**Line 158:**

```diff
-  // Tabs: sidebar mounts when not collapsed (or during exit animation).
-  const sidebarAllowedForLayout = navLayout === "island" || navLayout === "tabs" || page === "chat";
+  // D1 tabs: sessions sidebar only on chat page — non-chat pages are full-width (variant-D1 refs).
+  const sidebarAllowedForLayout = navLayout === "island" || page === "chat";
```

**Root cause:** `sidebarAllowedForLayout` included `navLayout === "tabs"` which caused the sessions/projects sidebar to mount on every non-chat page in the tabs layout.

**Effect:** All non-chat pages (bench, build, kanban, notifications, plugins, pulls, raven, scheduled, filebird, settings) were rendering the sessions sidebar on their left side, obscuring page content. The D1 reference designs confirm these pages are full-width with no sessions sidebar — only the chat page has the sidebar in tabs layout (matching D2 rail behaviour).

---

## Page Comparison Results

| Page | Light | Dark | Chrome Result | Notes |
|------|-------|------|---------------|-------|
| bench | ✓ | ✓ | MATCH | Content shows all 61 real benches; reference shows 5 seeded. Tab strip correct, no sidebar. |
| build | ✓ | ✓ | MATCH | Bench stopped state; tab strip correct, no sidebar. |
| kanban | ✓ | ✓ | MATCH | Cards seeded, columns correct, `···` tab active. No sidebar. |
| notifications | ✓ | ✓ | MATCH | 7 notifications seeded, All 7/Unread 3 correct. Bench chip + bell(3) + gear + avatar. |
| plugins | ✓ | ✓ | MATCH | 5 installed plugins shown, sidebar correct. No sessions sidebar. |
| pulls | ✓ | ✓ | MATCH | 3 open PRs listed. No sessions sidebar. Detail pane requires click selection. |
| raven | ✓ | ✓ | MATCH | Auth-required state (no backend); chrome correct (tab strip, no sidebar). |
| scheduled | ✓ | ✓ | MATCH | 5 tasks seeded correctly. No sidebar. |
| filebird | ✓ | ✓ | MATCH | Empty state shown (no backend); chrome correct. |
| settings/general | ✓ | ✓ | MATCH | General settings fully loaded, "Top tabs" selected in nav layout picker. |
| settings/ai | ✓ | — | MATCH | AI defaults settings loaded. |
| settings/perms | ✓ | — | MATCH | Permissions settings loaded. |
| settings/advanced | ✓ | — | MATCH | Advanced omp settings loaded. |
| onboarding/chat | ✓ | ✓ | MATCH | Chat active, sessions sidebar visible (correct), onboarding checklist overlay shown. |

---

## Chrome Verification

All pages confirmed:
- ✅ Tab strip: `Fcode brand | Chat | Build | Bench | ···`
- ✅ Active tab pill: blue background on current primary tab
- ✅ `···` gets `.active` class when on overflow pages (kanban, notifications, etc.)
- ✅ Right cluster: `coale_v16 (green dot) | bell (badge 3) | gear | JK avatar`
- ✅ Awesomebar: centered absolute, pill-shaped, `⌘K` shortcut visible
- ✅ Sessions sidebar: visible only on chat page, hidden on all other pages
- ✅ Status bar: `coale_v16 · bench running · 3 sites | Open bench log`
- ✅ No `backend-banner` error overlay in screenshots (suppressed in shot helper)

---

## Verification

```
tsc --noEmit:  0 errors
i18n tests:    27/27 passed
```

## Screenshots

Saved to: `.superpowers/sdd/2026-10-12-direction-d-desk-workbench/shots/H-Tabs/`

Light: bench, build, kanban, notifications, plugins, pulls, raven, scheduled, filebird, onboarding, settings-general, settings-ai, settings-perms, settings-advanced  
Dark: bench, build, kanban, notifications, plugins, pulls, raven, scheduled, filebird, onboarding, settings-general
