# Task 7 Review (round-3 / C): Rail layout D2 — CP12 gap verification
**Commits reviewed:** 0aacdb051..f3ed6247c (3 commits; round-1 + round-2 fixes)
**Reviewer:** RevTask7c · 2026-10-13
**Diff:** `review-0aacdb051..f3ed6247c.diff` (19 files, +368 / -201)

---

## Test execution

```
node --test test/nav-items.test.mjs test/sidebar-footer.test.mjs \
     test/utility-navigation.test.mjs test/sidebar-navigation.test.mjs \
     test/work-panel.test.mjs
→ 61/61 pass, 0 fail, 0 cancelled
```

```
apps/desktop $ node_modules/.bin/tsc --noEmit -p .  → 0 errors (v5.9.3)
packages/i18n $ pnpm test                           → 27/27 pass
```

---

## CP12 gap-by-gap verdict

| Gap | Closed in code? | Evidence |
|---|---|---|
| F01 — expanded labels 13px | ✅ | `chrome.css:1311` `font-size: var(--d-text)` (was `var(--text-tiny)`); `d-shell.css:220-221` opacity/max-width transition |
| F02 — two test failures | ✅ | `sidebar-footer.test.mjs:40` literal removed; `utility-navigation.test.mjs:25-31` visitor extended; 61/61 pass |
| F03 — rail structure (groups, dividers, scroll/foot) | ✅ | `NavRail.tsx:90-128` primary/utility/developer groups; two `<div className="nav-rail-divider">` separators; `.nav-rail-scroll` + `.nav-rail-foot` structure |
| F04 — rail surface | ✅ | `NavRail.tsx:120` removed `sidebar-surface`; `chrome.css:1239` `background: var(--surface-elevation-1)` + `border-right: 1px solid var(--d-border)` |
| F05 — item geometry | ✅ | `chrome.css:1270-1278` `height: var(--d-ctrl-lg)`, `margin: 1px var(--d-rail-item-mx)`, 28×28 `.nav-rail-icon` box |
| F06 — canvas gutters+shadow | ✅ | `d-shell.css:241` `margin: var(--d-gap)` (all sides), `border: 1px solid var(--outline-elevation-1)`, `box-shadow: var(--elevation-base)` |
| F07 — no px literals | ⚠️ PARTIAL | Four new literals remain — see Important §1 below |
| F08 — TooltipButton | ✅ | `NavRail.tsx:103-116` all scroll items use `<TooltipButton>`; raw `<button>` only on non-nav toggle |
| F09 — source pins | ✅ | `sidebar-navigation.test.mjs:20-32` rail-source block deleted; `work-panel.test.mjs:943` CSS pin deleted; `sidebar-footer.test.mjs:806-818` footerAttributes block deleted |
| F10 — locale values | ✅ | `zh-CN` chat `对话→聊天`; `zh-TW` chat `對話→聊天`; es/fr/pt-BR/tr bench `Banco/Atelier/Bancada/Masa→Bench` |
| F11 — native bounds | ⚠️ CANNOT VERIFY | Runtime measurement; not evidenced in code changes |
| F12 — rail captures | ⚠️ CANNOT VERIFY | Screenshots; not evidenced in code changes |
| F13 — pulls nav item | ✅ | `nav-items.ts:42` pulls item; `NavRail.tsx:38` `IconPullRequest` in NAV_ICONS; route wired at `AppShell.tsx:286` |

---

## Spec compliance

- ✅ `NavItemId` / `NavItem` / `navItems(flags)` contract present and exported
- ✅ `NAV_ICONS satisfies Record<NavItemId, unknown>` exported (R2)
- ✅ Plugins toggle-back: verbatim brief Step 3 logic at `NavRail.tsx:99-101`
- ✅ `NotificationCenter` + Settings + memory dot hand-rendered in footer
- ✅ `--nav-rail-width` fully removed (zero occurrences across apps/packages)
- ✅ `nav.expandRail` / `nav.collapseRail` in all 9 locales; `nav.chat/build/bench` parity 27/27
- ✅ Active state: `var(--da-sub)` / `var(--da-txt)` / `var(--elevation-sm)` — exact D.css:388-390
- ✅ Canvas: `var(--d-canvas-bg)`, `margin: var(--d-gap)`, `border-radius: var(--d-r)`, `var(--outline-elevation-1)`
- ✅ `pulls` page valid in `AppState["page"]` (`app-state.ts:179`); `PullRequestsPage` lazy-loaded and rendered (`AppShell.tsx:35-38, 286-288`)
- ✅ `pulls.title` key present in all 9 locales (verified individually)
- ⚠️ `group:` type deviates from brief (`"primary"|"footer"` → `"primary"|"utility"|"developer"`) — design-mandated (CP12 F03), no external consumers

---

## Strengths

- Full CP12 F03 restructure is clean: scroll group with two dividers, footer strictly notification+settings+toggle — matches D2-shell.html:115-181.
- `renderItem()` helper is DRY; the plugins special case (`item.id === "plugins"`) is the only branch, handler otherwise uniform.
- All three locale fixes (`nav.chat` zh-CN/zh-TW, `nav.bench` es/fr/pt-BR/tr) are correct per the F10 ruling.
- Dead CSS fully cleaned: `.nav-rail-group`, `.nav-rail-footer`, the `::before` active marker, `sidebar-surface` on rail, `--nav-rail-width` — all gone.
- i18n keys for expand/collapse added to all 9 locales with appropriate translations.

---

## Issues

### Important (Should Fix)

#### I1 — F07 partially unclosed: four new px literals without tokens
**Global Constraint / CP12 F07.** Report claims "all px literals in rail CSS now use tokens" — false.

| Location | Literal | Nearest token | Status |
|---|---|---|---|
| `chrome.css:1253` `.nav-rail-scroll { padding: 6px 0 }` | `6px` | `--d-rail-item-mx: 6px` (exists) | unused here |
| `chrome.css:1261` `.nav-rail-divider { margin: 4px var(--d-r-ctrl) }` | `4px` | none | needs token |
| `d-shell.css:223` `.nav-rail.expanded .nav-rail-label { max-width: 160px }` | `160px` | none | needs token |
| `d-shell.css:255` `.nav-rail-foot { padding: 6px }` | `6px` | `--d-rail-item-mx: 6px` (exists) | unused here |

**Fix:** Use `var(--d-rail-item-mx)` for the two `6px` values; add `--d-rail-divider-gap: 4px` and `--d-rail-label-max: 160px` to `d-tokens.css` and reference them.

---

#### I2 — `utility-navigation.test.mjs:36` silent failure after handler-count guard removed
**File:** `apps/desktop/test/utility-navigation.test.mjs:34-36`

```js
// Do not assert handlers.length — handler location varies across refactors.
const clickFooter = new Function("state",
  `const { page, canNavBack, navBack, setPage } = state; return (${handlers[0]})();`);
```

If the AST visitor finds no handlers, `handlers[0]` is `undefined`. `new Function(...)` succeeds, but the resulting function throws `TypeError: undefined is not a function` when any behavioral test calls `click()` — a confusing error hiding the real problem (extraction failure).

The old `assert.equal(handlers.length, 1, ...)` guard was removed in favour of "don't assert count". The replacement should fail early with a clear message:

```js
if (!handlers.length) throw new Error("Plugins handler not found in NavRail.tsx — visitor may need updating");
```

**Severity rationale:** The current behavioural tests do pass (61/61 green), so the handler IS found today. But the guard is a correctness net for future refactors; removing it silently converts an extraction failure into a confusing downstream failure.

---

### Minor (Nice to Have)

#### M1 — Expand toggle missing `aria-controls`
**File:** `apps/desktop/src/components/NavRail.tsx:150-161`

The `<button aria-expanded={expanded}>` has correct `aria-expanded` and `aria-label` but no `aria-controls` attribute referencing the rail's scrollable region. WAI-ARIA Authoring Practices for disclosure buttons recommend `aria-controls="<scroll-region-id>"` so AT users can jump to the expanded content. `aria-label` text ("Expand navigation" / "Collapse navigation") describes the action adequately, so this is a quality-of-life gap rather than a blocker.

**Fix:** Add `id="nav-rail-scroll"` to `<div className="nav-rail-scroll">` and `aria-controls="nav-rail-scroll"` to the toggle button.

---

#### M2 — `group:` contract type breaks brief spec
**Files:** `apps/desktop/src/components/nav-items.ts:19`

Brief specifies `group: "primary" | "footer"`. Implementation uses `group: "primary" | "utility" | "developer"`. Design-mandated by CP12 F03 and self-consistent (NavRail.tsx is the only consumer; updated in full). No external caller breaks today. Document the deviation in `nav-items.ts` JSDoc and in any forthcoming ADR so Tasks 8/9 don't assume the old contract.

---

#### M3 — `sidebar-footer.test.mjs` retains pre-existing source-text assertions
**File:** `apps/desktop/test/sidebar-footer.test.mjs:39, 47-57`

Not T7 regressions (pre-existing), not part of F09's scope. Noting for awareness: lines 47-51 split `railSource` on `<TooltipButton` and assert `tooltip=`/`ariaLabel=` present in each, and lines 54-57 regex-match the plugins handler expression. Both will break if NavRail.tsx is legitimately refactored. These are not new; no fix required for this task.

---

## Cannot verify from diff

- **F11** (Raven/FileBird/Build native host/view bounds): claimed in `task-7-report.md §RF1` via CDP measurement; no code change evidences it.
- **F12** (committed-build rail captures, saved theme/layout): screenshots in `shots/T7r2/`; provenance of root-attr readbacks not verifiable from this diff.

---

## Assessment

**Task quality: Approved with two important findings**

**Reasoning:** All 13 CP12 gaps are closed in code except F07 (4 new px literals remain after report claims full tokenisation) and F11/F12 (evidence-only, not code). The two "Important" issues (I1 literal residue, I2 test guard) are real quality deficiencies — I1 directly contradicts a CP12 gap claim and violates the Global Constraint on px literals. Neither is a functional regression (61 tests pass, tsc 0 errors, i18n 27/27), so approval is appropriate if I1 and I2 are tracked as known carry-items for the next clean-up round. The expand toggle a11y (M1) and group contract doc gap (M2) should be addressed at the earliest convenient point.
