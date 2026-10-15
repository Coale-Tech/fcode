# Task 1 Report — Accent + Density Tokens (`d-tokens.css`)

## Status: DONE_WITH_CONCERNS

## Baseline (Step 1)

Recorded from PI-Desktop (`/Users/mac/ERPNext/frappe_agent/PI-Desktop/apps/desktop`):
- **tsc errors:** 3 (confirmed)
- **node --test suite:** ~3505 pass / 1 fail (hindsight fast-exit; full suite timed out at 120s)

The worktree (`feat/direction-d`) has 1250 pre-existing tsc errors due to unbuilt workspace packages (`@pi-desktop/shared`, `@pi-desktop/agent-runtime`, etc.) that are listed in `node_modules/@pi-desktop/` but have not been compiled. These are entirely pre-existing — my CSS changes introduce zero TypeScript symbols.

---

## RED Evidence (Step 3)

`node --test test/d-accent-contrast.test.mjs` before implementation:
```
✖ D accent: light accent is text-legible on the page background
✖ D accent: light accent fill carries its foreground label
✖ D accent: light hover keeps the label legible
✖ D accent: dark accent is text-legible on the page background
✖ D accent: dark accent fill carries its foreground label
✖ D accent: dark hover keeps the label legible
tests 6 / pass 0 / fail 6
```

Root cause: existing `#0284c7` (sky-600) has a contrast ratio of ~4.10:1 vs white — below the 4.5 threshold in both directions (on white bg and with white label).

---

## GREEN Evidence (Step 5)

`node --test test/d-accent-contrast.test.mjs` after implementation:
```
✔ D accent: light accent is text-legible on the page background (23ms)
✔ D accent: light accent fill carries its foreground label (13ms)
✔ D accent: light hover keeps the label legible (14ms)
✔ D accent: dark accent is text-legible on the page background (12ms)
✔ D accent: dark accent fill carries its foreground label (12ms)
✔ D accent: dark hover keeps the label legible (11ms)
tests 6 / pass 6 / fail 0
```

Regression suite:
```
node --test test/t13-status-token-contrast.test.mjs test/plugins-page-style.test.mjs
tests 13 / pass 13 / fail 0
```

---

## Files Changed

### `apps/desktop/src/styles/tokens.css` (modified)
- **Lines 127–131** — replaced sky-600 accent with Direction D blue:
  - `--ds-accent: #2578ab` (WCAG 4.82:1 vs white)
  - `--ds-accent-hover: #1f6fa3` (WCAG ~4.95:1 vs white)
  - `--ds-accent-soft: #4f9ccb`
  - `--ds-accent-blue: var(--ds-accent)` (unchanged alias)
- **`:root[data-theme="dark"]` block** — appended dark-specific overrides:
  - `--ds-accent: #42a2d9` (WCAG 6.38:1 on `#171717`)
  - `--ds-accent-hover: #56b9f2` (WCAG ~8.08:1 with `#0a1f2e` label)
  - `--ds-accent-soft: #92d2f8`
  - `--ds-accent-foreground: #0a1f2e` (dark label; white is only 2.8:1 here)

### `apps/desktop/src/styles/d-tokens.css` (new)
- 17 `--d-*` dimension/type-scale tokens from D-SPEC.md
- 3 `--ds-*` aliases: `--ds-toolbar-height`, `--ds-btn-radius`, `--ds-btn-radius-sm`
- Positioned after `tokens.css` so `theme-overrides.css` (plugin themes) still wins

### `apps/desktop/src/styles/globals.css` (modified)
- Added `@import "./d-tokens.css";` on line 14 (after `tokens.css`, before `base.css`)
- Import string matches the helper regex `[A-Za-z0-9-]+\.css` ✓

### `apps/desktop/test/d-accent-contrast.test.mjs` (new)
- 6 WCAG 2.x contrast assertions (3 per theme: background legibility, fill-label, hover-label)
- Uses `loadStyles` + `resolveThemeToken` from `test/helpers/styles.mjs`

---

## Visual Smoke (Step 6) — INFEASIBLE

The worktree has no built output (`apps/desktop/out/` absent). Attempting `pnpm build` failed:
```
[commonjs--resolver] Failed to resolve entry for package "@pi-desktop/shared".
The package may have incorrect main/module/exports specified in its package.json.
```

The workspace packages in `node_modules/@pi-desktop/` are symlinked but not compiled (no `dist/` in each). A full monorepo build (`pnpm build` from the root) would be needed first. The electron capture rig cannot run in this worktree without it.

**Confidence in visual correctness:** high — the accent tokens are literal hex values with no computation, and the contrast math was validated by both manual calculation and the test suite. The `--ds-btn-radius` → `--d-r-ctrl: 8px` chain is a single `var()` hop with no ambiguity.

---

## Self-Review

1. **Plugin theme safety:** `d-tokens.css` loads before `theme-overrides.css` in globals.css (position 14 vs 24) — plugin `--ds-accent` overrides still win. ✓
2. **No dual-support:** the old sky-600 values are fully replaced, not aliased. ✓
3. **No hex outside tokens files:** `d-tokens.css` only contains geometry/size tokens (px values), no colors. ✓
4. **`--ds-accent-foreground` in dark:** only overridden in the dark block; light still uses `var(--white)` from `:root`. ✓
5. **Focus ring (`--focus-default` / `--focus-outline-default`):** these reference `var(--ds-accent)` in the existing `:root[data-theme]` block (tokens.css line 196–197). After the change, light focus ring = #2578ab, dark focus ring = #42a2d9 — both pass 3:1 non-text contrast. No code change needed. ✓

## Concerns

1. **Smoke test infeasible** — workspace packages need compilation before electron-vite build works. A CI environment with a proper `pnpm -r build` step would catch this automatically.
2. **Worktree tsc error count (1250)** is a pre-existing infrastructure issue in the worktree (uncompiled workspace packages), not introduced by this task. The PI-Desktop baseline remains 3.

---

## Commit

```
ed335d666 feat(renderer): direction D accent + density tokens
```

## Test Summary

`d-accent-contrast.test.mjs` 6/6 PASS; `t13-status-token-contrast` 6/6 PASS; `plugins-page-style` 7/7 PASS; tsc errors unchanged (CSS-only change).
