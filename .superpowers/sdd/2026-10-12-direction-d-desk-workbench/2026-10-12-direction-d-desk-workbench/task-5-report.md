# Task 5 Report — Primitive restyle + fix rounds

## Status: DONE

## Commits
- `0a6e10662` style(renderer): direction D primitives
- `9d4d94b4c` fix(renderer): field cascade, knob contrast, token vars, accent CTAs, test policy
- `dd64c37da` fix(renderer): restore min-height field contract; update surface-polish pins
- `531b1155f` fix(renderer): revert tsconfig edit, drop re-pinned source-text assertions

---

## Fix Round 1+2 (IRC items 1–9)

### Item 1 — call-site audit (variant="primary")

Audited all 76 `variant="primary"` call sites in TSX (not just literal `btn-primary` strings).

**Dark fill (stays as-is — general confirmations/saves are intentionally dark):**
Most sites: settings forms (save/submit), plugin install, project dialogs, kanban, bench start, etc. These are standard actions where the dark fill is correct per Direction D.

**Accent overrides added (high-signal CTAs):**
- `UpdateBanner.tsx:74` "Restart" button — time-critical update action. Added in `overlays.css .update-notice-actions .btn-primary { background: var(--ds-accent); ... }`.
- `PermissionCard.tsx:188` "Allow once" — time-sensitive tool-permission CTA in transcript. Added in `messages.css .permission-card-actions .btn-primary { background: var(--ds-accent); ... }`.
- **Onboarding**: `OnboardingChecklist.tsx` has no primary CTAs (uses ghost dismiss). `BenchPage.tsx` "Start bench" is a functional action, dark fill appropriate.
- `StartupRecovery.tsx:126` uses raw `className="btn btn-primary"` — recovery retry, dark fill correct.
- `send-btn` already uses `--ds-accent` directly; no change.

### Item 2 — topbar-consistency test + stale toolbar token

- Rewrote `test/topbar-consistency.test.mjs:29` to use `resolveThemeToken(stylesSource, "dark", "--ds-toolbar-height")` asserting the resolved value equals `"48px"` instead of source-text regex.
- Deleted `--ds-toolbar-height: 46px` from `tokens.css` (was shadowed by d-tokens.css; now gone entirely).

### Item 3 — btn-height token

Added `--ds-btn-height: var(--d-ctrl)` to `d-tokens.css`.

### Item 4 — full suite

Tolerated flaky tests pass in isolation (hindsight fast-exit, npm-executable, remote-host-ssh-*, codesign ×2). Full suite run in progress; results appended when available.

### Item 5 — field cascade

**Problem**: `tokens.css:90` had `--ds-settings-radius-ctrl: var(--radius-1)` (4px), overriding the new 8px radius in settings fields. Multiple settings.css rules used `var(--ds-field-height)` (~38px) stacking above the new 28px base.

**Fix in d-tokens.css**: Added redirects:
- `--ds-field-height: var(--d-ctrl)` → all settings selects/triggers/toggle-columns auto-migrate to 28px
- `--ds-settings-radius-ctrl: var(--d-r-ctrl)` → settings fields get 8px radius

**Fix in settings.css**:
- Deleted `.settings-shell .field-*` override (now redundant, resolved identically to base)
- `.settings-pill-select`: removed redundant `min-height` (height alone pins it)
- Toggle-row comment updated: was "20px / ~38px", now "16px / 28px"

**Fix in ui-kit.css**:
- `padding: 9px 11px` → `padding: 5px 11px` for `.field-input/.field-select/.field-textarea`. With 28px height and 2×1px borders, 9px vertical padding clips 13px text (28 - 2 - 18 = 8px content). 5px gives 16px content, adequate.
- `min-height: 64px` on `.field-textarea` → uses `var(--d-textarea-min)` token.

### Item 6 — a11y: dark switch knob contrast

**Problem**: Dark-theme `--ds-switch-knob-on: var(--white)` = `#ffffff` on `#42a2d9` = 2.84:1 < 3:1.

**Fix**: Changed dark-theme `--ds-switch-knob-on: var(--ds-accent-foreground)` = `#0a1f2e` on `#42a2d9` = 5.63:1 ✓. Hover `#56b9f2` = 6.96:1 ✓.

Light theme unchanged: `--surface-base` (white/light) on `#2578ab` = 4.40:1 ✓.

**New test**: `test/d-accent-contrast.test.mjs` — asserts `--ds-switch-knob-on` vs `--ds-accent` ≥ 3:1 in both dark and light themes via `resolveThemeToken`. Both pass.

### Item 7 — token-only metrics

Added to `d-tokens.css`:
```css
--d-toggle-w: 28px; --d-toggle-h: 16px; --d-toggle-knob: 12px; --d-toggle-inset: 2px;
--d-segment-track: 28px; --d-segment-item: 24px;
--d-checkbox: 14px; --d-textarea-min: 64px;
```

Updated components to reference tokens:
- `settings.css` toggle: `width: var(--d-toggle-w)`, `height: var(--d-toggle-h)`, etc.; translateX uses `calc(var(--d-toggle-w) - var(--d-toggle-knob) - 2 * var(--d-toggle-inset))`
- `providers.css` segments: `height: var(--d-segment-track)` / `height: var(--d-segment-item)`
- `ui-kit.css` checkbox: `width/height: var(--d-checkbox)`; textarea: `min-height: var(--d-textarea-min)`
- `.btn-ghost { border: 0; }` — explicitly cancels inherited `border: 1px solid transparent` from `.btn`.

### Item 8 — test policy

Removed source-text/regex-on-CSS btn-primary/btn-secondary assertions from `test/plugins-page-style.test.mjs` entirely (per context.md §4 ban). Replaced by comment referencing visual smoke and `d-accent-contrast.test.mjs`. The tests were effectively loose global-source scans, not behavioral assertions.

### Item 9 — stale comments

- `settings.css:945-948`: Updated comment from "20 px toggle / ~38 px field" to "16 px toggle (via --d-toggle-h) / 28 px field (--d-ctrl)".
- `ui-kit.css:6-7`: Updated comment from "no-stroke tile/field treatment" to "Direction D: panel-card has 1px border + --d-r radius; fields are 28px tall with border-default ring and solid 2px accent ring on focus."

### tsconfig.json

Added `"ignoreDeprecations": "6.0"` to suppress TS5101 (`baseUrl` deprecated in TS 5.9.3). Confirmed: the same warning exists in the base checkout PI-Desktop — pre-existing infrastructure issue that now reaches the "0 errors" gate with this suppression. No type-safety impact.

---

## Tests

**Target tests (22 total)**:
```
node --test test/d-accent-contrast.test.mjs test/plugins-page-style.test.mjs
         test/topbar-consistency.test.mjs test/fixed-dropdown-surfaces.test.mjs
         test/t13-status-token-contrast.test.mjs
→ 22 pass, 0 fail
```

**tsc**: 0 errors (`ignoreDeprecations: 6.0` suppresses pre-existing baseUrl warning that exists at base cc0285ab1 too).

**Full suite** (289 files, 15 batches, all non-hanging): **3,346 pass, 0 fail**.
Skipped 6 tolerated hangers (npm-executable, remote-host-ssh-password, remote-host-ssh-transport,
codesign ×2, hindsight fast-exit) — these pass in isolation per context.md.

**Additional test fixes required by suite run**:
- `test/field-control-height.test.mjs:57` expected `min-height: var(--ds-field-height)` on field base rule (field vocabulary contract) — restored alongside `height: var(--d-ctrl)` in ui-kit.css (both resolve to 28px).
- `test/field-control-height.test.mjs:132` expected `min-height: var(--ds-field-height)` on pill-select — added to settings.css.
- `test/surface-polish.test.mjs:72` (old: `border: 0`) and `:84` (old: `background: color-mix`) — initially re-pinned with new spellings; round 3 reverted these to DELETED per repo policy (source-text pins must not be re-pinned). Pre-existing `doesNotMatch` at original line 83 was accidentally included in the CUT range — restored.

**Fix round 3** (`531b1155f`):
- `tsconfig.json`: reverted `ignoreDeprecations: "6.0"` (out-of-scope; controller confirmed `./node_modules/.bin/tsc --noEmit -p .` = 0 errors without it).
- `test/surface-polish.test.mjs`: deleted the two re-pinned source-text assertions; restored accidentally deleted pre-existing `doesNotMatch` for light-theme segment override.
- `./node_modules/.bin/tsc --noEmit -p .`: exit 0, 0 errors.
- Target tests (surface-polish, plugins-page-style, topbar-consistency, d-accent-contrast): 18 pass, 0 fail.

---

## Visual Smoke (Settings light+dark, Plugins, Dialog)

Build completed (`pnpm build` ✓). Rig ran; screenshots in /tmp/codex-screens/.

**pi-dark-settings.png** (dark):
- Theme/Language/Font triggers: compact 28px height ✓
- Font size segmented: 28px track, 24px items, "Grande" with accent text ✓
- Proxy segmented: compact ✓
- Toggle ON ("Relaxed network mode"): blue track, dark knob visible — a11y fix confirmed ✓
- Toggle OFF ("Keep computer awake"): gray, compact 28×16 ✓

**pi-settings-live.png** (light):
- Same controls; ON toggle shows dark navy knob on blue track ✓
- Select triggers compact ✓

**pi-settings-provider-dialog.png**:
- Dialog over dimmed background; "Add provider" / "Add account" as dark-fill primary buttons ✓
- panel-card corners at --d-r (12px) ✓

**pi-plugins-market.png** (light, rail layout):
- "Install" dark-fill buttons ✓; "Refresh marketplace" dark primary ✓
- Segmented tabs compact ✓

de locale overflow not testable from rig (no locale switch API).

---

## Call-site Audit Decision Table

| Component | Count | Decision |
|---|---|---|
| Settings dialogs (save/submit/apply) | ~35 | Dark fill — standard confirmations |
| Plugin install | ~5 | Dark fill — inventory action |
| BenchPage Start | 1 | Dark fill — functional |
| UpdateBanner Restart | 1 | **Accent** — urgent update CTA |
| PermissionCard Allow once | 1 | **Accent** — time-sensitive in transcript |
| StartupRecovery Retry | 1 | Dark fill — recovery; read from raw class |
| Onboarding Continue/Finish | 0 | No primary CTAs in checklist |
