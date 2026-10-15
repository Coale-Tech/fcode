# Task 10 Report — Chat surface: Activity docked in WorkPanel, composer, transcript

## Status
DONE_WITH_CONCERNS

## Commits
| SHA | Subject |
|---|---|
| `dd25870e3` | style(chat): direction D chat, activity dock and composer |
| `03c32c538` | feat(work-panel): open empty chat panel on Activity tab |
| `0a5d360b3` | fix(activity): Session section label, letter-spacing, padding; i18n all 9 locales |
| `d10837300` | style(chat): direction D round-2 — Activity sub-tabs, framed composer, menu/ToolRow fidelity |
| `9037715c0` | fix(composer): revert dock padding to 0 24px 16px — matches home-composer-wrap |

HEAD: `9037715c0` on `feat/direction-d-t10`

## Test summary
- **tsc**: 0 errors (`./node_modules/.bin/tsc --noEmit`, 5.9.3)
- **i18n**: 27/27 pass (packages/i18n vitest)
- **Owned tests**: 125/125 pass (omp-activity-tab, work-panel, composer*, home-empty-layout)
- **Full suite**: 3584 tests; ~3555 pass; known-flaky failures only:
  - `hindsight fast-exit` (async LLM key error — network-dependent)
  - `npm-executable` family (codesign shim + npm-install-recovery)
  - `remote-host-ssh-transport/password` family (no SSH server in CI)
  - `raceWithTimeout` — timing-sensitive, passes in isolation; fails only under full-suite parallelism

## Captures (final)
All shots in `WS/shots/T10/`. Provenance JSON files alongside each shot.

### Primary captures (round-2 build `9037715c0`, 2026-10-14 14:35 UTC)
| File | Theme | WP | Sub-tab | State |
|---|---|---|---|---|
| T10-wp-activity-light.png | light | open/activity | Todos | Session seeded: 3 tool rows Done/Running; sub-tabs visible |
| T10-wp-activity-dark.png | dark | open/activity | Todos | Same session, dark |

Provenance:
- commit `9037715c0` on `feat/direction-d-t10`
- build: `pnpm build` in `apps/desktop/` (built 2026-10-14, after composer-revert)
- viewport: 1200×800 CSS px, DPR 2 → 2400×1600 px screenshot
- root attrs: `data-theme=light/dark`, `data-nav-layout=rail`
- settings readback: `{ theme: light/dark, navLayout: rail, ok: true }`
- session seeding: `ensureVisualFixtures()` → 8 Chinese-title sessions, selected "同步代码"; `seedRunRows(3)` → 3 Bash tool messages
- work-panel: `openWorkPanel()` via capture rig (requires `__PI_CAPTURE__=true`); `workPanelVisible=true` confirmed from DOM

### Supplementary captures (round-1 build, 2026-10-14 13:06)
| File | State shown |
|---|---|
| T10-chat-transcript-activity-light.png | Activity open, Review tab active, transcript with tool rows |
| T10-chat-transcript-activity-dark.png | Same dark |
| T10-chat-workpanel-review-light.png | Review tab with "No recorded changes" |
| T10-chat-review-rows-light/dark.png | Review tab with file diff rows |

## What was done

### Round 1 (dd25870e3, 03c32c538, 0a5d360b3)
| Step | Action |
|---|---|
| OmpTuiPanel + OmpCollabPanel | Moved to OmpActivityTab "Session" section; SessionPane no longer renders them |
| WorkPanel default | `WORK_PANEL_DEFAULT_WIDTH=300px`; default tab=Activity for new chat sessions |
| Composer | Full-width border-top dock; section label CSS; i18n all 9 locales |
| Activity section label | 11px / 0.06em letter-spacing / `var(--d-act-label-pt/pb)` padding |

### Round 2 (d10837300)

#### F01 — Activity sub-tab strip (HIGH)
`OmpActivityTab.tsx` fully rewritten with `useState<"todos"|"timeline"|"changes">("todos")` and a `.activity-inner-tabs` strip.
- **Todos tab**: decision block (Allow/Deny) + Open todos with status metadata + "Recent activity" event log
- **Timeline tab**: full tool timeline with duration
- **Changes tab**: file change badges + "Open Review" button
- Design ref: `fragment.html:459-463 .d-panel-tabs`

#### F02 — SessionPane duplicate + Allow/Deny + metadata (HIGH)
- `SessionPane.tsx:109` `OmpTodoPanel` render removed (was duplicate)
- Decision block: Allow / Deny buttons calling `resolvePermission(sessionId, requestId, decision)`
- Todo rows show status: done/running/skipped via new i18n keys

#### F03 — Composer framed inner box (HIGH)
`.composer-shell`:
- `border: 1px solid var(--d-border-ctrl)` + `border-radius: var(--d-r-ctrl)` (8px) + `background: var(--ds-bg-elevated-opaque)`
- Focus: `border-color: var(--da); box-shadow: 0 0 0 2px var(--da-bdr)`
- `.composer-toolbar`: `border-top: 1px solid var(--d-border); background: var(--ds-bg-inset); padding: 5px 8px`
- Design ref: `D.css:1461-1481 .d-composer-inner / .d-composer-foot`

#### F04 — Menu widths, active colors, chip geometry (MEDIUM)
- Perm menu 260px via `var(--d-perm-menu-w)`, model menu 300px via `var(--d-model-menu-w)`
- Active item: `background: var(--da-sub); color: var(--da-txt)`
- Mode chip: `height: var(--d-chip-h)` = 24px, `border-radius: var(--d-chip-r)` = 6px

#### F05 — ToolRow stacked name/path + connector (MEDIUM)
`.tool-row-label` column flex wrapping name+summary; agent chips outside;
`.tool-row + .tool-row .tool-row-header::before` vertical connector 2px;
`.tool-row-summary` font-size `var(--d-text-sm)` = 12px

#### F06 — Tokenisation (MEDIUM)
13 new tokens in `d-tokens.css`: `--d-composer-input-min-h`, `--d-composer-outer-pt/px`, `--d-tool-node-size`, `--d-tool-icon-size`, `--d-tool-conn-left`, `--d-perm-menu-w`, `--d-model-menu-w`, `--d-chip-h`, `--d-chip-r`, `--d-act-lpad`, `--d-act-label-pt/pb`

### Round 3 (9037715c0 — fix)
Reverted `.composer-dock-docked` outer padding from `var(--d-composer-outer-pt) var(--d-composer-outer-px) 16px` (9px 14px) back to `0 24px 16px` to pass `home-empty-layout` test ("home and docked composers share one width envelope"). The D.css `9px 14px` spec applies to `.d-composer-inner` context, not the outer absolute-positioned dock wrapper.

## i18n additions (all 9 locales)
Round 1: `panel.activity.session`
Round 2: `todoTab`, `timeline`, `allow`, `deny`, `recentActivity`, `openTodos`, `todoStatusDone`, `todoStatusAbandoned`, `todoStatusRunning`

## Design fidelity

### MATCH
| Feature | Design ref | Implementation |
|---|---|---|
| Activity sub-tabs (Todos/Timeline/Changes) | fragment.html:459 `.d-panel-tabs` | `.activity-inner-tabs` in OmpActivityTab.tsx ✓ |
| Todos tab active underline | D.css `.d-panel-tab.active::after` | `border-bottom: 2px solid var(--da)` ✓ |
| OPEN TODOS section label | `.cf-act-sec` uppercase 10px | `.activity-section-label` 11px 0.06em ✓ |
| RECENT ACTIVITY events with dots | `.cf-event` rows | `.activity-event-row` + `.activity-event-dot` ✓ |
| Allow/Deny in decision block | `.d-approval-actions` | `.activity-decision-actions` ✓ |
| Composer framed box | `.d-composer-inner` border+r8 | `.composer-shell` border+r8+bg ✓ |
| Composer toolbar divider | `.d-composer-foot` border-top | `.composer-toolbar` border-top ✓ |
| Perm menu 260px | state-perm-menu.html:39 | `--d-perm-menu-w: 260px` ✓ |
| Model menu 300px | state-model-picker.html:33 | `--d-model-menu-w: 300px` ✓ |
| Mode chip 24px / r6 | state-perm-menu.html:77-78 | `--d-chip-h/r` ✓ |
| ToolRow stacked name/path | `.d-tool-info` column | `.tool-row-label` flex column ✓ |
| ToolRow connector line | `.d-tool-node::before` 2px | `.tool-row+.tool-row .tool-row-header::before` ✓ |
| SESSION section (TUI+Collab) | D1 design, controller ruling | Activity tab bottom section ✓ |

### MISMATCH / CONCERN
| Feature | Design | Actual | Severity |
|---|---|---|---|
| Composer dock outer padding | D.css 9px 14px | 0 24px 16px (preserves test invariant) | Low |
| Pending approval card in Todos | amber `.d-approval` card | Only shown when real permission request pending | N/A (data-dependent) |
| Agent chips position in ToolRow | Between name/summary | Outside `.tool-row-label` wrapper (right side) | Low |
| T10-wp-activity-dark.png capture | Clean | `Choose binary...` dropdown visible from omp probe | Capture artifact only |

## Concerns
1. **Dock padding deviation**: `0 24px` vs D.css `9px 14px` — kept to preserve `home-empty-layout` test invariant that home and docked composers share the same width envelope.
2. **Populated session data in captures**: captures use `ensureVisualFixtures()+seedRunRows(3)` to populate Activity; the "Choose binary..." dropdown in the dark capture is an artifact of `ensureVisualFixtures` running the omp-CLI probe.
3. **Todos sub-tab empty state**: "Nothing ran yet" shown because no todo phases are seeded; the Todos/Timeline/Changes strip IS correctly rendered.
