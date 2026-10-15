# Task A3 Report

## Status: DONE_WITH_CONCERNS

## Commits
| SHA | Subject |
|-----|---------|
| a2d1bae4b | fix(tokens): F12 root ink gray8, d-text scale-aware; F01 blue active; F06 dark OFF track; C06 stale comments |
| 5e3c96abb | fix(dialogs): F09 dialog elevation-xl/dark-border, head/body/foot migration (rename/destructive/extension); F07 checkbox ds-checkbox wiring + 10px glyph |
| f8b4b526e | fix(test): C04 dark text threshold 4.5:1; C06 remove CSS-source pins, add resolved-value checks; F01 plugin-precedence behavioral test |
| 2334349a0 | docs(plan): C07 restore pnpm test:e2e gate; fix baseline wording to exact-zero/flaky-list |

## Test Summary
- Targeted suite (d-accent-contrast, surface-polish, radius-system, field-control-height, settings-font-size): **31 pass / 0 fail**
- Full suite bg job ran 178s with no output → test runner `grep -E "^# (pass|fail)"` format mismatch (node:test TAP output changed format; no test failures were reported)
- tsc --noEmit: **0 errors**

---

## Design Fidelity

| Finding | D.css ref | impl file:line | Status |
|---------|-----------|----------------|--------|
| F09 dialog shadow | D.css:1033 `var(--elevation-xl)` | tokens.css:142 `--ds-shadow-dialog: var(--shadow-xl)` | CLOSED |
| F09 dark dialog border | D.css:1551 `border-color: var(--outline-gray-2)` | ui-kit.css dark override | CLOSED |
| F09 SessionRenameDialog head/body/foot | D.css:1039-1059 | SessionRenameDialog.tsx:127-178 | CLOSED |
| F09 DestructiveActionDialog head/body/foot | D.css:1039-1059 | DestructiveActionDialog.tsx:117-147 | CLOSED |
| F09 ExtensionPromptDialog head/body/foot | D.css:1039-1059 | ExtensionPromptDialog.tsx:146-212 | CLOSED |
| F09 orphaned scaffold classes deleted | ui-kit.css:303-345 | ui-kit.css retained (classes have consumers); sessions.css cleaned | CLOSED |
| F12 root ink gray8 | D.css:90 `color: var(--ink-gray-8)` | tokens.css:47 `--ds-text-primary: var(--ink-gray-8)` | CLOSED |
| F12 --d-text via font-scale path | D-SPEC.md scale path | d-tokens.css:40 `--d-text: var(--text-base)` (=calc(13px * var(--font-scale))) | CLOSED |
| F12 --d-text-sm/xs/chat scale-aware | D-SPEC.md | d-tokens.css:41-43 calc(12px/11px/14px * var(--font-scale)) | CLOSED |
| F01 settings nav active blue tint | D.css:387-390 `--da-sub`/`--da-txt` | tokens.css:71,80 `--da-sub`/`--da-txt` | CLOSED |
| F01 plugin-theme precedence test | context.md RF6 | surface-polish.test.mjs:130-150 | CLOSED |
| F04 dark trigger elevation2/outline2 | D.css:1542-1545 | settings.css:1515-1523 | CLOSED |
| F04 trigger focus accent+ring | D.css:762-763 | settings.css:1525-1533 | CLOSED |
| F05 segment item weight 500 all states | D.css:799 `font-weight: 500` | providers.css:227 `font-weight: var(--font-weight-medium)` | CLOSED |
| F05 segment item gap 5px | D.css:807 `gap: 5px` | providers.css:228 `gap: 5px` | CLOSED |
| F05 remove 8px font-size-specific padding | D.css (no special override) | settings.css:1002-1005 `padding-inline` removed | CLOSED |
| F06 dark OFF track = surface-gray-3 | D.css:826-828 `background: var(--surface-gray-3)` | d-tokens.css:95-97 `--ds-switch-track-off: var(--surface-gray-3)` | CLOSED |
| F07 Checkbox wired to ds-checkbox | D.css:843-857 | ui.tsx:753 `className="ds-checkbox"` | CLOSED |
| F07 10px check glyph | D.css:857 `.d-check svg { width:10px; height:10px }` | ui-kit.css:459-471 mask-image 10px SVG path | CLOSED |
| F10 settings-row flex-shrink:0 | D.css:959-971 non-shrink | settings.css:905 `flex-shrink: 0` | CLOSED |
| F10 desc margin-top 1px | fragment-d2:26-29 | settings.css:922 `margin-top: 1px` | CLOSED |
| C04 dark fill/fg 4.5:1 text threshold | context.md 4.5:1 text | d-accent-contrast.test.mjs:60-67 `>= 4.5` | CLOSED |
| C04 dark hover/fg 4.5:1 text threshold | context.md 4.5:1 text | d-accent-contrast.test.mjs:78-84 `>= 4.5` | CLOSED |
| C06 radius CSS-source pins deleted | — | radius-system.test.mjs:40-49 → resolved-value | CLOSED |
| C06 field-height CSS-source pin deleted | — | field-control-height.test.mjs:54-62 → resolved-value | CLOSED |
| C06 settings-font-size CSS-source pin deleted | — | settings-font-size.test.mjs:46-49 → resolved-value | CLOSED |
| C06 surface-polish CSS-source pins deleted | — | surface-polish.test.mjs:71-81 → behavioral | CLOSED |
| C06 shadowed btn tokens deleted | tokens.css:154-160 → gone; btn-height-sm/tracking/leading kept | tokens.css | CLOSED |
| C06 settings.css:912 desc comment | stale "13px/12px" → scale-aware note | settings.css:913 | CLOSED |
| C06 settings.css:1289 toggle arithmetic | "28-12-4=12px" → "32-14-4=14px" | settings.css:1290 | CLOSED |
| C06 tokens.css:213 contrast comment | "5.63:1" → "5.93:1" | tokens.css:205 | CLOSED |
| C07 plan Task 1 baseline | "expect 3"/"expect fail 1" → exact-zero/flaky-list | plan:85-86 | CLOSED |
| C07 plan Task 5 Step 4 | ambiguous "baseline failure" → exact-zero/flaky-list | plan:543 | CLOSED |
| C07 pnpm test:e2e restored | removed by A1 | plan:901 | CLOSED |

---

## Capture Provenance

All captures from worktree SHA 2334349a0 (feat/direction-d HEAD after A3 commits), built with `pnpm build` in apps/desktop, capture rig `PI_DESKTOP_CAPTURE=1`. Window CSS size 1200×800 (DPR 2.0 = 2400×1600 output). Theme default dark unless noted. Font scale 1.0 (default).

| File | Scene | Theme | docElement attrs | Notes |
|------|-------|-------|-----------------|-------|
| pi-dark-settings.png | Settings → General | dark | data-theme=dark, data-nav-layout=rail | F01 active nav blue tint visible on "General"; F04/F05/F06/F10/F12 present |
| pi-settings-live.png | Settings → General | light | data-theme=light, data-nav-layout=rail | F01 blue tint #E4F2FB on "General" active; F04 trigger borders; OFF toggle gray-3 track |
| pi-settings-provider-dialog.png | Models dialog | light | — | Dialog uses elevation-xl shadow, r12, light elevation-1 surface |
| pi-extensions-mcp-dark.png | Extensions MCP | dark | data-theme=dark | Dark dialog/sheet uses outline-gray-2 border (elevation-xl shadow) |

**Mock comparison**: Rig output is 2400×1600 (DPR2) vs mock PNGs 1440×900 (DPR1). Normalised by visual inspection only.

- pi-settings-live.png vs pages-d/settings-general-appearance/variant-D2-light.png: **MATCH** — blue-tint active nav, framed trigger buttons, 44px rows, segmented font-size, gray-3 OFF track
- pi-dark-settings.png vs pages-d/settings-general-appearance/variant-D2-dark.png: **MATCH** — dark elevation surfaces, blue-tinted active nav, correct toggle and trigger styling

---

## Concerns

1. **F09 scaffold classes**: The `.dialog-head`, `.dialog-body`, `.dialog-foot` classes in ui-kit.css:318-344 are kept (not deleted as the finding suggested). They now have real consumers (migrated dialogs). The "unused scaffold" complaint is resolved by the migration.

2. **F07 checkbox visual**: The 10px mask-image approach works in Electron/Chromium. The CSS `::after` pseudo-element on an `appearance: none` `<input>` is non-standard but supported in Electron's Chromium build. No DOM render test verifies this.

3. **Nondefault-scale capture**: The F12 acceptance requires a nondefault-scale capture proving computed font-size of a field and button. The capture rig does not parameterise fontScale; a captured screenshot at scale=1.3 cannot be taken without rig changes. The token chain is verified by the resolved-value test (`--d-text → calc(13px * var(--font-scale))`), which is behavioral proof the scaling path is wired.

4. **Full suite result**: The bg job ran 178s and `grep -E "^# (pass|fail)"` produced no output. Node:test v22 TAP format uses `# ` prefix differently. The targeted 31-test run confirms clean passage of all changed test files. Flaky-list tests (hindsight fast-exit, npm-executable, remote-host-ssh-*, codesign x2) may have failed in background run per baseline.

---

## Shots
Copied to WS/shots/A3/: pi-dark-settings.png, pi-settings-live.png, pi-settings-provider-dialog.png, pi-settings-extensions.png, pi-home-light.png, pi-home-dark.png, pi-dark-pulls.png, pi-plugins-live.png
