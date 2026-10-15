# Task 7 Review: Rail layout (D2, default)

**Commit:** `7f6847acf feat(shell): rail layout + shared nav items`
**Reviewer:** RevTask7 · 2026-10-13

---

## Test suite results

Full suite ran (`node --test test/*.test.mjs`, 300 s budget, completed in ~118 s):

| Metric | Count |
|---|---|
| Total tests | 3 578 |
| Pass | 3 570 |
| **Fail** | **5** |
| Cancelled (suite error) | 1 |

**4 pre-existing / allowlisted failures** (time-sensitive / external dependency):
- `fast exit with LLM key error → unavailable state with message` (6 085 ms — LLM key not present)
- `npm --version nonzero and timeout reject the selected tool` (15 005 ms — npm fixture timeout)
- `short install budgets cap validation and include its time in both install stages` (5 166 ms — install budget)
- `forward rejects fast, with the ssh diagnostic, when ssh exits instead` (5 578 ms — SSH fixture)

**1 new T7 regression** (see Critical §1 and §2 below):
- `the nav rail exposes settings, plugins, scheduled tasks and notifications` — 3 ms, deterministic, not flaky.
  `utility-navigation.test.mjs` suite is also ✖ (counted as the 1 cancelled).

## TypeScript

Project-local `node_modules/.bin/tsc --noEmit -p .` (v5.9.3) → **0 errors** ✓  
Global `/usr/local/bin/tsc` is v6.0.3 and emits pre-existing `TS5101: Option 'baseUrl' is deprecated`; not a T7 regression.

---

## Spec Compliance

- ✅ `nav-items.ts` contract fully matches brief: types, order, flag-gating, all 8 dataNav values.
- ✅ `navItems` test verbatim from brief, RED→GREEN.
- ✅ `NAV_ICONS` exported with `satisfies Record<NavItemId, unknown>` (R2).
- ✅ Plugins toggle-back: `page === "plugins" ? (canNavBack() ? navBack() : setPage("chat")) : setPage("plugins")` — exact match to brief Step 3.
- ✅ `NotificationCenter` and `Settings` button hand-rendered (not in navItems loop).
- ✅ Memory dot preserved: `<span className="memory-status-dot memory-status-dot-rail" data-health={mHealth} …/>` inside Settings TooltipButton (confirmed from full test suite run that dumps NavRail source).
- ✅ `--nav-rail-width` fully removed: zero occurrences in `apps/`, `packages/` (`grep` over all `.ts .tsx .css .mjs` clean).
- ✅ i18n keys `nav.chat/build/bench` present in all 9 locales (added Task 6 — no locale files in T7 diff; keys verified by direct inspection of all 9 `packages/i18n/src/locales/*/index.ts`; parity test 27/27).
- ✅ D.css:388 active state: `var(--da-sub)` / `var(--da-txt)` / `var(--elevation-sm)` — implementation matches design exactly. Brief's `color-mix()` suggestion is superseded by D.css per R10.
- ✅ Canvas island: `background: var(--d-canvas-bg)`, `margin: 0 var(--d-gap) var(--d-gap) 0`, `border-radius: var(--d-r)` (d-shell.css:514-522).
- ✅ Rail icon-only in collapsed mode via `:root[data-nav-layout="rail"] .nav-rail-label { display: none }` (d-shell.css:484).
- ✅ Primary buttons use `title={t(item.labelKey)}` for tooltip; footer uses `TooltipButton`.
- ✅ `is-workbench` carve-out correct: `AppShell.tsx:201` applies the class; d-shell.css:518/524 skips island wrap for workbench pages.
- ✅ `--d-rail-exp: 220px` token added (d-tokens.css:33 citing D.css:28,334).
- ⚠️ **Cannot verify from diff:** embedded-view bounds matrix (3 layouts × 3 pages) — implementer deferred to Tasks 11/13; canvas geometry verified from DOM only for Build page.

---

## Strengths

- Spec-exact `nav-items.ts`: contract, order, flags, dataNav values, and exported `NAV_ICONS` are all correct on first read.
- Removed `::before` left-edge bar and migrated all 5 `--nav-rail-width` uses in a single clean cutover.
- `sidebar-navigation.test.mjs` correctly updated to check `navItemsSource` for relocated selectors.
- d-shell.css layout-scoped overrides (rail / island / tabs) are neatly structured with design-reference comments throughout.

---

## Issues

### Critical (Must Fix)

#### C1 — `sidebar-footer.test.mjs:40` regression: `data-nav="plugins"` no longer literal in NavRail.tsx

**File:** `apps/desktop/test/sidebar-footer.test.mjs:40`

```js
assert.match(railSource, /data-nav="plugins"/);  // FAILS after T7
```

After Task 7 the `data-nav` attributes are rendered dynamically via `navItems()` — `data-nav={item.dataNav}`. The literal string `data-nav="plugins"` no longer appears in `NavRail.tsx`. `sidebar-navigation.test.mjs` was correctly updated (lines 608–611) but `sidebar-footer.test.mjs` was not.

**Fix:** Mirror the `sidebar-navigation.test.mjs` pattern — read `navItemsSource` and assert:
```js
assert.match(navItemsSource, /dataNav:\s*"plugins"/);
```

---

#### C2 — `utility-navigation.test.mjs` AST visitor regression: plugins handler no longer inline

**File:** `apps/desktop/test/utility-navigation.test.mjs:21–26`

The TypeScript AST visitor finds `onClick` JSX attributes whose expression text includes `page === "plugins"`. In the old code the handler was inline on `onClick={...}`; Task 7 extracted it to `const handleClick = item.id === "plugins" ? … : …` and passes `onClick={handleClick}`. The visitor finds 0 handlers; `assert.equal(handlers.length, 1, …)` fails.

```
✖ test/utility-navigation.test.mjs (1927ms)
```

**Fix:** Update the visitor to also look for variable declarations whose initialiser text includes `page === "plugins"`, or search the full AST rather than only JSX onClick attributes. The toggle logic is still in `NavRail.tsx` — the test just needs to locate it correctly.

---

### Important (Should Fix)

#### I1 — D2 expand toggle button not rendered in NavRail.tsx (R11c, plan-mandated)

**D2-shell.html:178:** `<button class="d-rail-toggle" title="Expand sidebar">…</button>` inside `.d-rail-foot`.  
**D.css:432–449:** styles `.d-rail-foot` (top-border divider) and `.d-rail-toggle` (28×28 button, hover state).  
**design-authority.md R11c:** "D2 rail has the expanded 220px state; do not drop it."

The CSS infrastructure is correct — `--d-rail-exp: 220px`, `.nav-rail.expanded { width: var(--d-rail-exp) }`, label-reveal, and expanded-item dimensions all present in `d-shell.css`. However, no toggle button is rendered in `NavRail.tsx`; the 220px state is CSS-only dead code, unreachable by users. Since Task 7 is **the D2 rail task**, the button belongs here (the brief's Steps don't spell it out, but D.css/D2-shell.html unambiguously place it in the D2 rail and R11c is binding).

**Fix:** Add to NavRail.tsx footer group a `<button className="nav-rail-toggle" onClick={toggleRailExpanded} title={t("nav.expandRail")}>` with a chevron icon, and wire `expanded` state (local `useState` or store slice). The CSS is ready; it is ~10 lines of JSX.

---

### Minor (Nice to Have)

#### M1 — `.nav-rail` missing `border-right: 1px solid var(--d-border)` (D.css:330)

**D.css:330:** `.d-rail { border-right: 1px solid var(--d-border); }`  
**chrome.css:1229–1242:** `.nav-rail { … }` — no `border-right`.

The `sidebar-surface` class provides background but not the right-border separator. Visual separation between rail and canvas may be insufficient per design in D2 mode.

#### M2 — `.nav-rail` missing `transition: width .18s ease` (D.css:333)

**D.css:333:** `.d-rail { … transition: width .18s ease; }`  
Not present on `.nav-rail`. Expand/collapse (once I1 is fixed) will be instantaneous rather than animated.

#### M3 — Island border uses `--d-border` instead of `--outline-elevation-1` (D.css:471)

**d-shell.css:521:** `border: 1px solid var(--d-border)`  
**D.css:471:** `.d-panel { border: 1px solid var(--outline-elevation-1) }`  
Implementer acknowledged; `--d-border` = `outline-gray-2` is lighter. Brief says "1px border" without colour; mild deviation. `--d-border` was used consistently elsewhere.

#### M4 — i18n translation value deviations from brief (Task 6 scope, not in T7 diff)

All 9 locales have `nav.chat`, `nav.build`, `nav.bench`; parity test 27/27 passes. However several values differ from the brief's prescribed translations:

| Locale | Key | Brief says | Actual |
|---|---|---|---|
| `zh-CN` | `nav.chat` | 聊天 | 对话 |
| `zh-TW` | `nav.chat` | 聊天 | 對話 |
| `es` | `nav.build` | Compilación | Build |
| `es` | `nav.bench` | Bench | Banco |
| `fr` | `nav.bench` | Bench | Atelier |
| `pt-BR` | `nav.bench` | Bench | Bancada |
| `tr` | `nav.bench` | Bench | Masa |

These were set in Task 6; the brief's "mirror existing locale" instruction allows some latitude. Flag for Task 6 owner to confirm intent.

---

## D2 expand toggle: Task 7 vs Task 9?

**Confirmed: the expand toggle belongs to Task 7.**

- D2-shell.html:178 shows `<button class="d-rail-toggle">` as part of the D2 rail's `<div class="d-rail-foot">`.
- D.css:432–449 styles `.d-rail-foot` and `.d-rail-toggle` inside the rail section (§7: "Icon Rail, D2 only").
- Task 7's brief = "rail layout (D2, default)" — this is the only task that owns the D2 rail structure.
- Task 9 = "island layout (D3)" — the toggle button is not a D3 artifact.
- The CSS and token exist; only the JSX button (~10 lines) is missing.

See I1 above.

---

## Assessment

**Task quality:** ❌ Needs fixes

**Reasoning:** Two deterministic test regressions (C1, C2) were introduced by moving nav-item data out of NavRail.tsx without updating `sidebar-footer.test.mjs` and `utility-navigation.test.mjs` — these are the only failures not in the pre-existing allowlist (3 570/3 578 otherwise pass). The core spec deliverables (nav-items contract, CSS tokens, i18n keys, NAV_ICONS, Plugins toggle, memory dot) are correct; once the two test files are patched and the expand toggle button rendered (I1), the task can be approved.
