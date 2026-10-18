# Task 11 Report — Work Panel, Build, Bench (Round 2)

Commits on `feat/direction-d-t11`:
- Round 1 base: `17f0b5306`
- Round 2: `ef3cd1858` — "style(workbench): direction D T11 round-2 — review diff/header/bench/build fidelity"

Base: `f7f224a6a`  
tsc: 0 errors (`./node_modules/.bin/tsc --noEmit`)  
Tests: 46/46 T11-adjacent pass; pre-existing failures documented below.

---

## Design Fidelity

### Work Panel (`work-panel.css`, `WorkPanel.tsx`)

| Design ref | Token / rule | Impl file | Delta |
|---|---|---|---|
| `D.css .d-mini-head` | `wp-mini-head` + `wp-mini-acts` | `WorkPanel.tsx`, `work-panel.css` | none |
| `D.css` 4-tab strip | `wp-d-tabs` (Review/Browser/Tools/Files) | `WorkPanel.tsx`, `work-panel.css` | none |
| `WORK_PANEL_DEFAULT_WIDTH` | 340px (D spec) | `work-panel-resize.ts:5` | none |
| Review badge count | `wp-d-tab-count` with `reviewCount` | `WorkPanel.tsx` | none |

### Review Panel (`ReviewChangeCard.tsx`, `ReviewTab.tsx`)

| Design ref | Rule | Impl file | Delta |
|---|---|---|---|
| `chat-workpanel/fragment.html` bordered file card | `.wp-review-file` (r8, border) | `ReviewChangeCard.tsx`, `work-panel.css` | none |
| `data-state`, `data-status` attrs | animation/color hooks | `ReviewChangeCard.tsx:190` | none |
| Numbered diff gutter 30px | `.wp-hunk-line .ln { width: 30px }` | `work-panel.css` | none |
| Keep-all / Revert-all summary bar | `.wp-diff-summary` + `keptIds` Set | `ReviewTab.tsx` | none |

### Bench Page (`BenchPage.tsx`, `workbench.css`)

| Design ref | Rule | Impl file | Delta |
|---|---|---|---|
| `pages-d/bench` page-head before tabs | `wb-island-hd` after selectedBench guard | `BenchPage.tsx` | none |
| Installed apps + workers left col | `InstalledAppList`, `WorkerList` sub-components | `BenchPage.tsx` | none |
| `Select`/`Input` primitives | replaced raw `<select>`/`<input>` | `BenchPage.tsx:874,894` | none |
| `wb-proc-card` process panel | bordered card with proc rows | `workbench.css` | none |
| `wb-all-hd` + `wb-all-footer` | 48px header + footer for overview | `workbench.css`, `BenchPage.tsx` | none |

### Build Page (`BuildPage.tsx`, `workbench.css`)

| Design ref | Rule | Impl file | Delta |
|---|---|---|---|
| `pages-d/build/fragment.html` bench hero | `.wb-build-hero-*` + `.wb-app-row` | `BuildPage.tsx`, `workbench.css` | none |
| Segmented Studio/Builder switch | `SegmentedControl` primitive | `BuildPage.tsx` | none |
| `build-title` header | `.build-title { ... }` | `workbench.css` | none |

### Remaining approved deviations
- Light accent `#2578ab` (not #2F6FD5) — confirmed OK per design authority
- Dark on-accent knob `#0a1f2e` — confirmed OK

---

## Test Failures Analysis

### T11-adjacent tests (46 total, all pass)
- `work-panel.test.mjs` — **25/25 pass** (updated: mini-head/wp-d-tabs assertions; 340 default width)
- `work-panel-resize.test.mjs` — **pass** (updated: 360→340 default width)
- `chat-review-entry.test.mjs` — **pass** (data-state/data-status added to card; wp-review-file not wp-diff-file)
- `bench-page.test.mjs`, `bench-detail.test.mjs`, `build-page.test.mjs`, `build-precondition.test.mjs` — all pass

### Full-suite pre-existing failures

| Test | Category | Evidence |
|---|---|---|
| `npm-executable.test.mjs` (5 timeouts) | **npm-executable family** — allowlisted | Identical at `f7f224a6a`; no T11 changes to `npm-executable.ts` |
| `remote-host-ssh-transport` (ssh timeouts) | **remote-host-ssh-transport** — allowlisted | 20s subprocess timeout; unrelated to T11 |
| `hindsight fast-exit` | allowlisted | 20s LLM timeout in CI-like environment |
| `macos-signing` (codesign) | allowlisted | 20s codesign subprocess timeout |

---

## Changed Files (Round 2)

| File | Change summary |
|---|---|
| `src/lib/work-panel-resize.ts` | `WORK_PANEL_DEFAULT_WIDTH` 360 → 340 |
| `src/styles/work-panel.css` | `wp-mini-head`, `wp-mini-acts`, `wp-d-tabs`, `wp-d-tab`, `wp-d-tab-count`, `wp-diff-summary`, `wp-review-file`, `wp-review-file-head`, `wp-review-file-path`, `wp-diff-hunk`, `wp-hunk-meta`, `wp-hunk-line` |
| `src/styles/workbench.css` | `wb-log-hd`, `wb-canvas` frame, `wb-panel` restore, `build-banner` inset, `wb-build-hero-*`, `wb-app-section`, `wb-app-row`, `wb-all-hd`, `wb-all-footer`, `tbody tr { height: 30px }`, `.bench-log-scroll`, `wb-proc-card-*`, `wb-workers`, `wb-worker-chip`, `build-title` |
| `src/components/workpanel/ReviewTab.tsx` | Keep-all/Revert-all bar; `keptIds` Set; per-entry `onKeep` callback |
| `src/components/ReviewChangeCard.tsx` | `wp-review-file` bordered card; `data-state`/`data-status`; numbered diff; Keep/Revert per-file buttons |
| `src/components/workpanel/WorkPanel.tsx` | `wp-mini-head` + `wp-d-tabs`; `activateDTab`; `reviewCount` badge; `messages` from store |
| `src/pages/BenchPage.tsx` | page-head before tabs; `InstalledAppList`+`WorkerList`; `Select`/`Input` primitives; no `BenchSwitcher` |
| `src/components/bench/AllBenches.tsx` | Path+Apps columns; `wb-all-footer`; amber build-banner |
| `src/pages/BuildPage.tsx` | bench hero; `SegmentedControl`; `build-title`; `wb-app-row` grouped apps |
| `src/components/bench/LogView.tsx` | removed inline `color`/`background` from `LOG_SCROLL_STYLE` |
| `electron/main/browser-view.ts` | `ownerTag` parameter; `[${this.ownerTag}-bounds]` in diagnostics |
| `electron/main/index.ts` | `ravenPane` → `new BrowserPane(…, "raven")` |
| `electron/main/services/plugin-services.ts` | `browserPane` → `new BrowserPane(…, "build-canvas")` |
| `test/work-panel.test.mjs` | Updated header test for Direction D mini-head/wp-d-tabs structure |
| `test/work-panel-resize.test.mjs` | Updated default-width assertion 360 → 340 |
