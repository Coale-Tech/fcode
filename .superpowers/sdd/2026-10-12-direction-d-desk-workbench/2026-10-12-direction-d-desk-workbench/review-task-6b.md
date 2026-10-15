# Task 6 Re-Review — fix commit `a53338e2d`

**Prior findings:** `review-task-6.md` (RevTask6) + supervisor T6-F01..F04 in `supervisor-checkpoint-9.md`  
**Re-reviewer:** RevTask6b  
**Commit scope:** 12 files (64 ins / 24 del) — ShellNavbar.tsx, d-shell.css, sidebar-collapse-animation.test.mjs, 9 locale files

---

## Verification run

| Check | Result |
|---|---|
| `tsc --noEmit -p .` (apps/desktop) | ✅ exit 0 |
| `node --test test/sidebar-collapse-animation.test.mjs` | ✅ **12/12** (was 11/12) |
| `node --test test/topbar-consistency.test.mjs test/app-store-sidebar.test.mjs test/work-panel.test.mjs test/sidebar-navigation.test.mjs` | ✅ 59/59 — no regressions |

---

## Finding-by-finding disposition

### Critical from review-task-6.md

| # | Finding | Disposition |
|---|---|---|
| C1 | `sidebar-collapse-animation.test.mjs:184` — positive assert for deleted darwin rule causes deterministic fail | ✅ **RESOLVED** — 4-line `assert.match` block removed (lines 179–182); commit note cites "no source-text tests" policy. 12/12 pass confirmed. The fix deletes rather than flips to `doesNotMatch`; consistent with policy given that `doesNotMatch` on CSS source text would itself be a source-text test. |

### Supervisor T6-F01 — macOS left-slot geometry (High)

✅ **RESOLVED**

- `d-shell.css:61`: `padding-left: 56px → 76px` (12px outer + 56px d-wc + 8px gap — D2/D3 rail/island)
- `d-shell.css:62`: `padding-left: 78px → 94px` (8px outer + 78px d-wc + 8px gap — D1 tabs)
- Values match design authority: D.css:124-125, D1-shell:81/83, D2-shell:69/71, D3-shell:306.
- Source pin in comment block retains original slot widths (78px/56px) as design-source documentation alongside the correct applied totals.

### Supervisor T6-F02 — Awesomebar + navbar text/keycap fidelity (Medium)

✅ **RESOLVED** — all cited sub-items addressed:

| Sub-item | Required (D.css) | Committed |
|---|---|---|
| Background | `var(--surface-gray-1)` D.css:209 | ✅ `var(--surface-gray-1)` (`#f8f8f8` in comment only, not applied) |
| Font size | 12px D.css:212 | ✅ `var(--d-text-sm)` |
| Padding | 0 32px D.css:213 | ✅ `padding: 0 32px` |
| Icon position | abs left:9px, ink-gray-4 D.css:222-228 | ✅ `.shell-awesomebar-icon { position:absolute; left:9px; color:var(--ink-gray-4) }` |
| Focus ring | border + 2px da-bdr D.css:219-220 | ✅ `border-color:var(--da); box-shadow:0 0 0 2px var(--da-bdr); outline:none` |
| Keycaps | Two 18px bordered chips, font 10/500/gray-5 D.css:1092-1106 | ✅ `<><kbd>⌘</kbd><kbd>K</kbd></>` (mac) / `<><kbd>Ctrl</kbd><kbd>K</kbd></>` (non-mac); CSS: 18px/min-width 18px/10px/500/ink-gray-5/bordered |
| Keycap position | abs right:7px, gap:2px D.css:230-235 | ✅ `.shell-awesomebar-kbd { position:absolute; right:7px; gap:2px }` |
| Awesomebar label | "Search sessions, files, commands…" D1-shell:114 | ✅ `t("nav.awesomebar")` visible label; `t("nav.search")` kept for `aria-label` (screen-reader continuity) |
| `data-nav="awesomebar"` | Minor #5 from prior review | ✅ attribute now present |
| Root breadcrumb weight | `font-weight:500` D.css:190 | ✅ `.shell-navbar-crumb-root { font-weight:500 }` |
| All tokens, no hardcoded colors | reviewer rules | ✅ confirmed — `#f8f8f8` appears only in a documentary comment |

### Supervisor T6-F03 — Current-layout/theme capture evidence (High)

❌ **UNRESOLVED** — commit contains no new screenshots. The 12 files changed are `.tsx`, `.css`, `.test.mjs`, and locale `.ts`. Mixed/pre-navbar capture set named in the original report remains un-replaced. This is a non-code deliverable (captured frames of the running app in 3 layouts × light/dark + Settings-navbar state); no code fix can supply it.

### Supervisor T6-F04 — Native traffic-light centering/drag/interaction (Medium)

❌ **UNRESOLVED** — commit contains no native smoke evidence. This requires a running macOS window with real traffic lights, drag-band test, awesomebar click and Cmd-K. No code commit can substitute for this observation. (Windows/Linux remain truthfully UNVERIFIED as permitted by plan:643.)

---

## Minors from prior review — status

| # | Prior Minor | Status |
|---|---|---|
| M2 | Awesomebar background `var(--ds-bg-hover)` vs design `var(--surface-gray-1)` | ✅ RESOLVED (now `var(--surface-gray-1)`) |
| M3 | `.main-titlebar` height uses `var(--ds-toolbar-height)` not `var(--d-ph-h)` | ⚪ UNCHANGED — both resolve to 48px; not in F01–F04 scope |
| M4 | `IconSearch size={13}` vs brief `size={14}` | ⚪ UNCHANGED — `size={13}` retained; sub-pixel difference; not in F01–F04 scope |
| M5 | `data-nav="awesomebar"` missing | ✅ RESOLVED |

---

## New findings

### Critical
None.

### Important
None.

### Minor
None introduced by this commit.

---

## i18n verification

`nav.awesomebar` added to all 9 locales:

| Locale | Key | Value |
|---|---|---|
| en | `awesomebar` | "Search sessions, files, commands…" |
| de | `"awesomebar"` | "Sitzungen, Dateien, Befehle suchen…" |
| es | `"awesomebar"` | "Buscar sesiones, archivos, comandos…" |
| fr | `"awesomebar"` | "Rechercher sessions, fichiers, commandes…" |
| ko | `awesomebar` | "세션, 파일, 명령 검색…" |
| pt-BR | `awesomebar` | "Pesquisar sessões, arquivos, comandos…" |
| tr | `awesomebar` | "Oturum, dosya, komut ara…" |
| zh-CN | `awesomebar` | "搜索会话、文件、命令…" |
| zh-TW | `awesomebar` | "搜尋工作階段、檔案、指令…" |

All 9 locales confirmed. ✅

---

## Assessment

**Resolved by this commit:** C1 (test), T6-F01 (geometry), T6-F02 (awesomebar fidelity), M2, M5.  
**Still open:** T6-F03 (screenshots — non-code deliverable), T6-F04 (native smoke — non-code deliverable).  
**Unaddressed pre-existing minors:** M3, M4 (neither in T6-F01..F04 scope; both functionally equivalent).  
**Regressions:** None. tsc exit 0, 12/12 collapse-animation, 59/59 combined test suite.

**Task quality:** Source code is now correct for all F01–F02 gaps. Gate remains open on F03/F04 (evidence only, not code).
