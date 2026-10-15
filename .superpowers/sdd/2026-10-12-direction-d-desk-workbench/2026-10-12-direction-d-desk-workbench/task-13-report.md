# Task 13 — Direction D Desk Workbench: Final Report

## Status: DONE

## Commits (branch `feat/direction-d-t13`)

| SHA | Subject |
|---|---|
| `7d2164664` | style(settings,palette,onboarding): direction D |
| `9e9dc5fb7` | fix(settings,raven,filebird,onboarding,palette): direction D round 2 |
| `c8a08e28e` | fix(settings): F11 theme→d-seg, Network/Power/QueueModes/Worktrees collapsed; T13-F09 move D-primitives to workbench.css |
| `b3620a490` | fix(t13): D-token dedup, raven/filebird titlebar offset, test fixes |

## Test Results

- `tsc`: **0 errors** (v5.9.3)
- Full suite: **3576 / 3584 pass**, 4 fail — all known-flaky:
  - `npm-executable` family (allowlisted)
  - `remote-host-ssh-transport:355` (allowlisted as `:338`, line shifted)

## Evidence Shots: `WS/shots/T13r2/`

15 PNG screenshots, all with DOM theme == saved theme (IPC round-trip verified).

| File | State | Match |
|---|---|---|
| `settings-general-light-rail.png` | theme=light, nav=rail | ✓ d-seg Light active, Network/Power collapsed, Icon rail selected |
| `settings-general-dark-rail.png` | theme=dark, nav=rail | ✓ dark bg, Dark active, same cards |
| `settings-general-light-tabs.png` | theme=light, nav=tabs | ✓ Top tabs layout card selected |
| `settings-general-light-island.png` | theme=light, nav=island | ✓ Island sidebar card selected |
| `settings-ai-light-rail.png` | theme=light, aiAgents tab | ✓ Task Subagents card, Isolate/Backend/Clone/Concurrency/Recursion, agent model overrides list |
| `settings-ai-dark-rail.png` | theme=dark, aiAgents tab | ✓ same dark |
| `settings-permissions-light-rail.png` | theme=light, permissions tab | ✓ Permissions card, Defaults card, Prompt enhancement card |
| `settings-permissions-dark-rail.png` | theme=dark, permissions tab | ✓ same dark |
| `command-palette-light-rail.png` | palette open, theme=light | ✓ 580px dialog, search input, COMMANDS group, footer legend |
| `command-palette-dark-rail.png` | palette open, theme=dark | ✓ same dark |
| `onboarding-step1-light-rail.png` | wizard step 1, theme=light | ✓ provider picker, Anthropic selected, API key, Continue→ |
| `raven-light-rail.png` | raven disconnected, theme=light | ✓ d-page-head: Raven + amber "Sign-in needed" pill + "Open Raven settings" btn; centered sign-in card |
| `raven-dark-rail.png` | raven disconnected, theme=dark | ✓ same dark |
| `filebird-light-rail.png` | filebird, theme=light | ✓ d-page-head: FileBird + gray "Not connected" pill + kebab (⋯) |
| `filebird-dark-rail.png` | filebird, theme=dark | ✓ same dark |

## Provenance

All shots taken with `bun /tmp/capture-t13.mjs` against:
- Commit: `b3620a490`
- Build: `apps/desktop/out/renderer/` from pnpm build
- Viewport: 1200×800, DPR=2 (2400×1600 native)
- Theme set through `window.__PI_DESKTOP__.setTheme()` (updates Zustand store + DOM data-theme)
- NavLayout set through `window.__PI_DESKTOP__.setNavLayout()` (updates store + DOM data-nav-layout)
- Settings persisted via `window.piDesktop.invoke("pi-desktop/settings/set")` (IPC round-trip)
- Confirmed: `saved.theme == DOM data-theme` for all 15 shots

## Key Design Matches (T13 deliverables)

### G01 – Settings General Appearance
- **ThemeRow**: d-seg with `Light | Dark | System` order (matches `fragment-d1.html`)
- **NavLayout picker**: Three cards (Top tabs / Icon rail ✓ / Island sidebar), caption below
- **Network/Power**: collapsed `sf-sec-btn` accordions

### G05 – Settings AI (Agents & tasks)
- **Task Subagents** card: Isolate toggle, Isolation Backend dropdown, Clone toggle, Max Concurrency/Recursion
- **Agent model overrides**: per-agent Default dropdown; frappe-dev, raven-pm, sdd-supervisor etc.
- **Queue Modes** (collapsed, badge 4): rendered below scroll fold
- **Agent Worktrees** (collapsed): rendered below scroll fold

### F11 – Settings nav CSS
- Settings nav sidebar: `sidebar-surface`/`settings-nav` classes per test contracts
- D-metrics applied: 28px control height, 48px page head

### T13-F09 – D-primitives in workbench.css
- All D primitive classes (d-page-head, d-pill, d-btn, d-seg, raven-page-wrap, fb-*, ob-*)  in `workbench.css`
- D-tokens (--d-ph-h, --da-txt, etc.) owned by `d-tokens.css`; workbench.css contains NO duplicate root blocks

### Raven page
- `d-page-head` (48px): Raven title + amber "Sign-in needed" pill + "Open Raven settings" btn
- Disconnected state: centered sign-in card with `rv-signin-card` styling
- Fix: `padding-top: var(--ds-toolbar-height)` on `raven-page-wrap` clears the absolute main-titlebar

### FileBird page
- `d-page-head` (48px): FileBird title + gray "Not connected" pill + kebab (⋯)
- Fix: same `padding-top` on `filebird-page-wrap`

### Command Palette
- Max-width 580px (`--d-palette-w`), overlay scrim (`--d-overlay-scrim`)
- Footer legend: ↑↓ navigate | ↵ open | Esc close | ⌘K to open

### Onboarding Wizard
- 4-step wizard card: `ob-head` + `ob-layout` (steps sidebar + content) + `ob-foot`
- Provider picker: Anthropic/Gemini/OpenAI radio cards; API key input

## Approved Deviations Applied
- Light accent: `#2578ab` (via `--da`/`--da-h` in d-tokens.css root)
- Dark on-accent: `#0a1f2e` (via `--da-txt` in d-tokens.css dark block)

## i18n
9 locales (en, zh-CN, zh-TW, de, es, fr, ko, tr, pt-BR): 27/27 i18n tests pass.
Keys added: ~90+ (settings nav, d-seg labels, raven/filebird UI, onboarding steps, palette legend, dirty-bar).
