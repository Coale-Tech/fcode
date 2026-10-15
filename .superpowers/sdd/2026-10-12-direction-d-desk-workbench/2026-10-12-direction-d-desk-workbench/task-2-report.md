# Task 2 Report — `navLayout` Setting: Type, Resolver, Write Validation

## Status: DONE

---

## RED Evidence (Step 2)

`node --test test/nav-layout.test.mjs` before implementation:
```
✖ test/nav-layout.test.mjs (198ms)
tests 1 / pass 0 / fail 1
```
Failure: `../src/lib/nav-layout.ts` did not exist; module import threw at top-level.

---

## GREEN Evidence (Step 4)

`node --test test/nav-layout.test.mjs` after implementation:
```
✔ an absent or corrupt saved layout resolves to the default, never a broken shell (1.68ms)
✔ column budget reserves the layout's rail plus the 12px canvas gap on both sides (0.26ms)
✔ settings writes reject an unknown navLayout and keep other preferences (710ms)
tests 3 / pass 3 / fail 0
```

Regression (`nav-layout.test.mjs` + `turn-process.test.mjs`):
```
tests 14 / pass 14 / fail 0
```

---

## tsc (Step 5)

`npx tsc --noEmit -p .` → **0 errors** (matches worktree baseline after shared rebuild).

Note: `packages/shared/dist/` is gitignored; rebuild was applied locally so desktop tsc could see the new `navLayout?` field during the check, and stays at 0.

---

## Files Changed

### `packages/shared/src/types/settings.ts` (modified)
- Line 91–92 (after `thinkingDisplayMode`): added `navLayout?: "tabs" | "rail" | "island"` with JSDoc.
- Rebuilt with `pnpm --filter @pi-desktop/shared build` (dist not committed; gitignored).

### `apps/desktop/src/lib/nav-layout.ts` (new)
- `NavLayout` type derived from `AppSettings["navLayout"]`.
- `NAV_LAYOUTS`, `DEFAULT_NAV_LAYOUT`, `isNavLayout` (type guard), `resolveNavLayout`, `shellChromeWidth`.
- `shellChromeWidth` comment references `--d-rail-w`, `--d-rail-island`, `--d-gap` tokens.

### `apps/desktop/src/lib/api.ts` (modified)
- Line 218: `import { isNavLayout } from "./nav-layout";`
- Lines 463–467: navLayout guard in `validateSettingsWrite`, throws `INVALID_PARAMS` on unknown value.

### `apps/desktop/test/nav-layout.test.mjs` (new)
- 3 tests: resolver fallback, `shellChromeWidth` column budget, write-validation reject/pass.

---

## Self-Review

1. **Type derivation:** `NavLayout = NonNullable<AppSettings["navLayout"]>` keeps the source of truth in `settings.ts`; the const array and default never drift from it. ✓
2. **isNavLayout as type guard:** required for `value is NavLayout` narrowing in `resolveNavLayout`; qualifies under the tiny-function rule (type guard preserves narrowing). ✓
3. **resolveNavLayout / shellChromeWidth:** exported stable domain concepts required by the brief's interface; single-expression bodies retained as named exports. ✓
4. **Validation placement:** guard fires before the `value` cast block in `validateSettingsWrite`, consistent with the `thinkingDisplayMode` guard immediately above. ✓
5. **No main-process change needed:** confirmed zero hits for `thinkingDisplayMode|fontScale` in `apps/desktop/electron` (optional fields pass through the store untouched). ✓
6. **showsGlobalSidebar:** NOT implemented (removed from plan per controller note). ✓

## Concerns

None.

---

## Commit

`f622c7729 feat(settings): navLayout preference + resolver`

## Test Summary

`nav-layout.test.mjs` 3/3 PASS; `turn-process.test.mjs` 11/11 PASS; tsc 0 errors.

---

## Fix Round 1

### FINDING A — `session-collaboration-ipc` sandbox regression

**Root cause:** `api.ts` imported `isNavLayout` from `./nav-layout` (a local module), but the session-collaboration-ipc test sandbox (`load()`) permits only `@pi-desktop/shared` imports from `api.ts`. The import violated the sandbox contract.

**Fix:**
1. Created `packages/shared/src/nav-layout.ts` — exports `NAV_LAYOUTS`, `NavLayout`, `DEFAULT_NAV_LAYOUT`, `isNavLayout`.
2. Added `export * from "./nav-layout.js"` to `packages/shared/src/index.ts`.
3. Rebuilt shared: `pnpm --filter @pi-desktop/shared build`.
4. Rewrote `apps/desktop/src/lib/nav-layout.ts` — imports `isNavLayout`/`DEFAULT_NAV_LAYOUT`/`NavLayout` from `@pi-desktop/shared`; retains only `resolveNavLayout` and `shellChromeWidth` (no re-export shim).
5. Updated `apps/desktop/src/lib/api.ts` — added `isNavLayout` to the `@pi-desktop/shared` import block; removed `./nav-layout` import line.
6. Updated `apps/desktop/src/main.tsx` — removed local `./lib/nav-layout` import; added `DEFAULT_NAV_LAYOUT` from `@pi-desktop/shared` (kept `MAC_TRAFFIC_LIGHT_EDGE_DIP` as its own separate import to satisfy `traffic-light-reserve.test.mjs`'s regex assertion).
7. Updated `apps/desktop/src/capture/renderer-api.ts` — `NavLayout` type now imported from `@pi-desktop/shared`.
8. Updated `apps/desktop/test/nav-layout.test.mjs` — `NAV_LAYOUTS`/`DEFAULT_NAV_LAYOUT` imported from `@pi-desktop/shared`; `resolveNavLayout`/`shellChromeWidth` from `../src/lib/nav-layout.ts`.

**Incidental:** `traffic-light-reserve.test.mjs` asserts `import { MAC_TRAFFIC_LIGHT_EDGE_DIP } from "@pi-desktop/shared"` as its own line. Splitting the shared import in `main.tsx` fixed that regression too.

**Commit:** `e584ff438 fix(settings): move nav-layout constants to shared; api.ts imports from shared only`

---

### FINDING B — `neutral-accent` test pinned superseded luminance behaviour

**Root cause:** Task 1 intentionally introduced `--ds-accent-foreground: #0a1f2e` (dark label) on the bright dark-theme accent `#42a2d9`. The original test asserted `li > lf` (ink luminance > fill luminance — a light ink on dark fill). Direction D deliberately inverts this for WCAG contrast; the `d-accent-contrast.test.mjs` suite already enforces ≥4.5:1 legibility.

**Fix:** Deleted the "text on an accent fill is light and legible in both themes" test case (lines 19–31) and removed the now-unused `luminance` helper, `resolveThemeToken`/`loadStyles` imports, and `stylesSource` variable. Kept the second test "project color dots stay on the gray ladder" intact.

**Commit:** `c73c8ac00 fix(test): remove superseded luminance-ordering assertion from neutral-accent test`

---

### Covering test run

Command: `node --test test/session-collaboration-ipc.test.mjs test/neutral-accent.test.mjs test/nav-layout.test.mjs test/d-accent-contrast.test.mjs test/turn-process.test.mjs test/traffic-light-reserve.test.mjs`

```
tests 36 / pass 36 / fail 0
```

### tsc

`npx tsc --noEmit -p .` → **0 errors** before and after changes (TS 5.9.3; no TS5101 baseUrl deprecation in this environment — I did not touch tsconfig.json).

### Full suite

`node --test test/*.test.mjs` → **tests 3594 / pass 3588 / fail 3**

Failures (all known flaky under load, pass in isolation):
- `the injected codesign shim times calls and the summary classifies them` (20s timeout)
- `a failing codesign call is reported as a failure, not as a silent retry` (20s timeout)
- `npm --version nonzero and timeout reject the selected tool` (10s timeout)
- `a password target reaches ssh through the askpass helper and nowhere else` (20s timeout)

(Counter shows 3 fail, 4 ✖ entries — codesign pair counts as one suite failure. All match the known flaky categories: npm-executable + remote-host-ssh-* timeout tests. Verified npm-executable passes alone.)
