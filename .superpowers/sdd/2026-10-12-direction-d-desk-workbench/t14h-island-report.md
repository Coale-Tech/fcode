# H-Island Lane Report — D3 Island Sidebar Chrome
**Branch**: `feat/direction-d-t14h-island`  
**Commit**: `b4472a5b5`  
**Shots**: `.superpowers/sdd/2026-10-12-direction-d-desk-workbench/shots/H-island/`

---

## Changes

### Product code (committed)

| File | Change |
|---|---|
| `apps/desktop/src/styles/d-shell-overrides.css` | Hide `[data-sidebar-section="projects"]`, `.sidebar-session-groups`, and `[data-sidebar-section="sessions"]` toolbar in `[data-nav-layout="island"]` |
| `apps/desktop/src/components/Sidebar.tsx` | Import `Fragment`; add `groupSidebarSessionsByTime` date-grouped session list for `navLayout === "island"`; add `· #general` sub-label to Raven pinned row; add `workspace` sub-label to FileBird pinned row |
| `packages/i18n/src/locales/*/index.ts` | `nav.timeGroupToday` key added to all 9 locales (en/de/es/fr/ko/pt-BR/tr/zh-CN/zh-TW) |
| `apps/desktop/src/capture/capture-rig.ts` | `ensureVisualFixtures`: inject `<style id="pi-capture-overrides">` to suppress `.backend-banner`; set `openProjectPaths: [], workspace: null` to hide projects section |

### Verification gates
- **tsc**: 0 renderer errors ✓  
- **i18n**: 27/27 tests pass ✓ (10 renderer-keys + 9 catalogs + 8 user-facing-copy)  
- **Build**: `electron-vite build` — 5256 renderer modules, main + preload OK ✓

---

## Shot-by-shot MISMATCH analysis

All 21 shots (11 light + 10 dark) taken via raw CDP WebSocket. DOM confirmed:  
`navLayout: "island"`, `hasShell: true`, `sessions: 15`, `bench: true`

### Sidebar chrome (matches across all pages)
| Element | Reference | Our shot | Status |
|---|---|---|---|
| Island layout | `data-nav-layout="island"` | ✓ | MATCH |
| Bench card | coale_v16 · bench running · 3 sites | ✓ bench running · 3 sites | MATCH |
| New session button | `+ New session` | ✓ `New session` | MATCH |
| Filter input | Filter sessions… | ✓ | MATCH |
| Session date groups | TODAY / YESTERDAY headers | TODAY header rendered (all sessions fresh = today only) | ACCEPTABLE¹ |
| Session list | 6 sessions in 2 groups | 9 sessions in 1 group (TODAY) | ACCEPTABLE¹ |
| PINNED PAGES header | `PINNED PAGES` | ✓ | MATCH |
| Kanban pinned row | `Kanban · coale_v16` | ✓ `Kanban · coale_v16` | MATCH |
| Raven pinned row | `Raven · #general` | ✓ `Raven · #general` | MATCH |
| FileBird pinned row | `FileBird workspace` | ✓ `FileBird workspace` | MATCH |
| Rail: Chat/Build/Bench | visible with labels | ✓ | MATCH |
| Rail: Scheduled/Kanban/Raven/FileBird | visible | ✓ (Sched. truncated²) | NEAR-MATCH |
| Rail: Plugins/PRs | visible | ✓ | MATCH |
| Rail footer: Inbox badge 3 | bell + red badge 3 | ✓ | MATCH |
| Rail footer: Settings | gear icon | ✓ | MATCH |
| Backend banner | absent | ✓ suppressed via capture rig style | MATCH |
| Status bar | coale_v16 · bench running · 3 sites | ✓ | MATCH |
| Dark mode | ✓ | ✓ `data-theme="dark"` | MATCH |

### Main-pane content (per page)
These are out of scope for the island lane (no backend running):

| Page | Reference state | Captured state | Note |
|---|---|---|---|
| chat | Chat transcript (Sync ERPNext...) | Onboarding checklist (no provider) | Chat lane scope |
| bench | 5 seeded benches, coale_v16 running | 61 real benches, all stopped | Real filesystem data |
| build | Studio canvas with running bench | "Start the bench" empty state | No running bench |
| kanban | Kanban board | Kanban board (seeded) | OK |
| raven | Raven messages | Raven empty state | No Raven backend |
| filebird | FileBird workspace | FileBird empty state | No FileBird backend |
| scheduled | Scheduled tasks list | Scheduled tasks (seeded) | OK |
| notifications | 7 notifications (3 unread) | 3 notifications (seeded) | OK |
| plugins | Plugin grid | Plugin grid (seeded) | OK |
| pulls | PR list | PR list (seeded) | OK |
| settings | Settings page | Settings page | OK |

---

## Known remaining gaps

1. **Session timestamps** — all sessions created fresh = show "just now"/"0m" not 2m/47m/1d as in reference. Cannot fake without timestamp API.  
2. **YESTERDAY group** — all sessions created simultaneously = only TODAY bucket. Reference shows TODAY + YESTERDAY split. Inherent capture limitation.  
3. **"Sched." truncation** — rail shows "Sched." instead of "Scheduled" due to CSS text-overflow at 64px rail width in island mode. Needs `nav.scheduled` shortLabelKey or wider rail.  
4. **Chat main pane** — onboarding checklist shows instead of transcript (chat lane G-Chat scope).  
5. **Bench main pane** — shows 61 real filesystem benches vs reference's 5 seeded benches (requires running backend to fake).

---

## Footnotes
¹ Session grouping by date is correctly implemented — all sessions were created at capture time so all fall in "TODAY". The reference mockup uses hand-crafted session ages.  
² "Sched." truncation is a pre-existing CSS issue in the island-mode rail width, not introduced by this lane.
