# Task 6 Review — `feat(shell): direction D navbar + awesomebar`

**Commit:** `d34a12425`  
**Reviewer:** RevTask6  
**Diff scope:** 19 files (275 ins / 50 del)  
**Design authority:** R10 + R11a–k (design wins over brief snippets)

---

## Verification run

| Check | Result |
|---|---|
| `./node_modules/.bin/tsc --noEmit -p .` (apps/desktop) | ✅ exit 0 |
| `node --test test/topbar-consistency.test.mjs test/app-store-sidebar.test.mjs` | ✅ 12/12 |
| `node --test test/work-panel.test.mjs` | ✅ 25/25 |
| `node --test test/sidebar-navigation.test.mjs` | ✅ 22/22 |
| `node --test test/sidebar-collapse-animation.test.mjs` | ❌ **11/12 — 1 FAILURE** |
| `pnpm test:e2e` | Cannot verify — Rust binary absent |

---

## Spec Compliance

- ✅ **Spec compliant** on: `ShellNavbar` component exists and renders outside the inert/hidden wrapper (Review Focus 4 — `AppShell.tsx:145`, `SearchDialog` at line 369 is also outside the inert subtree); navbar `display:flex`+`position:relative` per D.css:119-130 (R11a — not the brief's grid); awesomebar `position:absolute; left:50%; transform:translateX(-50%); width:300px` per D.css:195-199; traffic-light reserves 78px (tabs) / 56px (rail+island) per D-SPEC.md row 1; `d-shell.css` imported after `chrome.css` in `globals.css`; lead-inset block deleted from `chrome.css:706-736`; `--nav-rail-width:60px` re-homed in `d-shell.css:408`; `--ds-window-lead-inset:0px` removed from `tokens.css`; darwin `--ds-pane-lead-inset` darwin rule deleted from chrome.css; `.workspace-bar` → `var(--d-status-h)` in `chat-shell.css`; `.app-shell { flex-direction:column }` + `.app-chat-shell { flex:1; min-height:0 }` per D.css:97-115; `NavTabs` stub present (Task 8 scope, documented); `PAGE_LABEL_KEY` covers all 10 `AppState["page"]` values; i18n keys `nav.chat`, `nav.build`, `nav.bench` added in all 9 locales; pre-existing keys for other pages (`raven.title`, `fileBird.title`, `kanban.title` etc.) confirmed in all locale files; `nav.settings` and `app.shellName` pre-existing in all 9 locales ✓.
- ⚠️ **Cannot verify from diff:** macOS native traffic-light centering (capture rig doesn't render OS chrome); Windows/Linux 124px right-cluster reserve on real hardware; `pnpm test:e2e` 28/28 (Rust binary required).

---

## Strengths

- R11a override documented inline in `d-shell.css` with line-level D.css citations — excellent trace.
- `ShellNavbar` correctly placed before `<PortalVisibilityProvider>`, ensuring the navbar and Cmd-K awesomebar remain accessible in settings mode; `SearchDialog` (`AppShell.tsx:369`) is also outside the inert wrapper.
- Clean cutover: `sidebar-navigation.test.mjs` and `work-panel.test.mjs` both flipped from `assert.match` → `assert.doesNotMatch` for the removed darwin rules, with clear explanatory comments.
- Nav-rail `padding-top: var(--ds-toolbar-height)` correctly removed (the `app-chat-shell` now starts below the 48px navbar, so the rail no longer needs to avoid traffic lights on its own).
- `window-chrome-row` re-anchored to `.app-chat-shell` (position:relative) — `top:0` now means "top of chat body" which is correct for the preview titlebar use-case.
- `PAGE_LABEL_KEY` typed as `Record<AppState["page"], string>` — exhaustive at compile time; no missing entries.
- i18n all 9 locales touched; `nav.chat`/`nav.build`/`nav.bench` are new, all other breadcrumb keys (`raven.title`, `fileBird.title`, etc.) confirmed pre-existing across all locales.
- Design fidelity table in the report is well-cited and accurate on all verified points.

---

## Issues

### Critical (Must Fix)

#### 1. `test/sidebar-collapse-animation.test.mjs:184` — Failing test not updated for lead-inset cutover

**File:** `apps/desktop/test/sidebar-collapse-animation.test.mjs:184`

The test `"the top bar's collapsed lead-in tracks the dock instead of snapping"` (line 127) contains:

```js
assert.match(
  globalStyles,
  /:root\[data-platform="darwin"\] \.conversation-topbar\.ct-collapsed\s*\{[^}]*--ct-lead-inset:\s*var\(--ds-pane-lead-inset\)/,
);
```

This **positively asserts** that the darwin `--ct-lead-inset: var(--ds-pane-lead-inset)` override exists. Task 6 correctly deleted that rule from `chrome.css` as part of the clean lead-inset cutover, but failed to update this test. Result: `11/12 pass, 1 fail` (confirmed by running the suite).

The fix mirrors what was already done in `sidebar-navigation.test.mjs:90-98` and `work-panel.test.mjs:621-624`: flip `assert.match` → `assert.doesNotMatch` and add the cutover comment. This test file was not in the brief's file list, but it references the deleted rule — same category of cleanup that was done for the other two test files.

The implementer report claimed "4–8 failures all from load-flaky allowlist" but this failure is a deterministic CSS assertion, not a flaky I/O test.

---

### Important (Should Fix)

None beyond the Critical above.

---

### Minor (Nice to Have)

#### 2. Awesomebar background token diverges from D.css

**File:** `apps/desktop/src/styles/d-shell.css:483`

Implementation uses `background: var(--ds-bg-hover)` = `var(--surface-alpha-gray-2)` = `#0000000b` in light mode (≈ transparent black, 4% alpha on white = ≈ #F5F5F5).  
D.css:209 specifies `background: var(--surface-gray-1)` = `var(--gray-50)` = `#f8f8f8`.

Visually near-identical, but the token doesn't match the design source. Should be `var(--surface-gray-1)`.

#### 3. `.main-titlebar` height not migrated to `--d-ph-h`

**File:** `apps/desktop/src/styles/chrome.css:488`

Brief §5 specifies changing `.main-titlebar` height to `var(--d-ph-h)`. It remains `var(--ds-toolbar-height)`. Since `d-tokens.css:57` aliases `--ds-toolbar-height: var(--d-navbar-h)` = 48px = `--d-ph-h`, the rendered height is identical. The implementer report (concern #5) acknowledges this and notes it avoids a topbar-consistency test change — but the test currently passes with either token since both resolve identically. No functional consequence; pure naming alignment.

#### 4. `IconSearch size` off by 1

**File:** `apps/desktop/src/components/ShellNavbar.tsx:113`

Brief Step 2: `<IconSearch size={14} aria-hidden />`. Implementation: `size={13}`. The 1px difference is sub-pixel at the 13px text size and won't be noticeable.

#### 5. `data-nav="awesomebar"` attribute missing

**File:** `apps/desktop/src/components/ShellNavbar.tsx:107`

Brief Step 2 shows `data-nav="awesomebar"` on the button. Not present in the implementation. No functional impact; used for automation/testing.

---

## Capture comparison (visual)

| Shot | Mock | Method | Result |
|---|---|---|---|
| `pi-home-light.png` 2400×1600 | `chat/variant-D2.png` 1440×900 | Half-scale RGB sampling | MATCH: navbar right-of-awesomebar (255,255,255 shot vs 249,248,248 mock — both near-white ✓); awesomebar zone present and darker than surround ✓; traffic-light zone empty (rig doesn't render native chrome — expected) |
| `pi-home-dark.png` 2400×1600 | `chat/variant-D2-dark.png` 1440×900 | RGB sampling | MATCH: navbar avg (31,31,31) vs mock (34,34,34) — both near-black dark surface ✓ |
| `pi-dark-settings.png` 2400×1600 | `settings-general-appearance/variant-D2.png` 1440×900 (light) | Row scan | MATCH-THEME-DIFF: shot is dark (29-34 RGB), mock is light — shot is the dark-settings state, mock is light. Navbar rendered in shot confirms it's outside the inert wrapper ✓ |
| `pi-settings-picker-rail.png` 2400×1600 | `settings-general-appearance/variant-D2.png` 1440×900 | RGB sampling | MATCH: center zone avg (253,253,253) shot vs (247,247,246) mock — same near-white ✓ |

---

## Assessment

**Task quality:** ❌ Needs fixes  
**Reasoning:** One deterministic test failure (`sidebar-collapse-animation.test.mjs:184`) caused by an incomplete cutover: two parallel test files were correctly updated for the deleted `--ds-pane-lead-inset` darwin rule, but this third file was missed. All core spec requirements — navbar layout, awesomebar, traffic-light reserves, inert-shell accessibility, lead-inset deletion, i18n 9-locale coverage, tokens-only CSS, design fidelity (R11a override applied) — are correctly implemented. The single fix required is mechanical (flip one `assert.match` to `assert.doesNotMatch` in the collapse animation test).
