# Task A1 Report — Tokens + Primitives (Tasks 1 & 5 rework, F01–F13, C04, C06, C07)

**Branch:** feat/direction-d  
**Worktree:** /Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d  
**Commits (this batch):**

| SHA | Subject |
|---|---|
| `e87b1ea42` | fix(tokens): remap espresso violet to FileBird blue ramp; fix toggle/btn/field metrics (F01,F06,F12) |
| `5beac1eac` | fix(primitives): D.css buttons, fields, badge, checkbox, panel, dialog, segment, settings-row (F02-F10) |
| `8c94e1f93` | fix(accents): remove unapproved Allow-once and Update-Restart accent overrides (F13) |
| `6f03a809b` | test(contrast,cleanup): restore six fill/hover/text cases + hover knob; remove superseded pins (C04,C06) |
| `66991d455` | docs(plan): exact-zero tsc baseline, replace every '3 baseline errors' with flaky-list rule (C07) |
| `d081ed917` | test(font-size): update --text-base assertion from 14px to 13px (F12) |
| `ac56c81b7` | fix(test): update three stale CSS pins broken by F02/F04/F08/F12 metric changes |

---

## Design Fidelity

Every row below maps design reference (file:line) → implementation (file:line) and notes remaining delta.

### F01 — Blue semantic ramp (replaces purple/violet espresso overrides)

| Finding | Design ref | Implementation | Delta |
|---|---|---|---|
| Light surface-violet-1 | D.css:45 `#F2F9FD` | d-tokens.css:8 `#F2F9FD` | ✅ exact |
| Light surface-violet-2 | D.css:46 `#E4F2FB` | d-tokens.css:9 `#E4F2FB` | ✅ exact |
| Light outline-violet-1..4 | D.css:47-50 | d-tokens.css:10-14 | ✅ exact |
| Light ink-violet-5..8 | D.css:51-54 | d-tokens.css:14-17 | ✅ exact |
| Dark surface-violet-2 | D.css:63 `#1D4764` | d-tokens.css:77 `#1D4764` | ✅ exact |
| Dark outline-violet-3 | D.css:66 `#327198` | d-tokens.css:80 `#327198` | ✅ exact |
| Dark ink-violet-8 | D.css:70 `#92D2F8` | d-tokens.css:85 `#92D2F8` | ✅ exact |
| `--da` direction-accent alias | D.css:81 `--ds-accent` | d-tokens.css:20 `var(--ds-accent)` | ✅ |
| Light `--ds-accent` fill | APPROVED deviation: `#2578ab` (not D.css #2E8AC2); AA 4.82:1 on white | tokens.css → d-tokens.css light block | ✅ approved |
| Dark `--ds-accent` fill | D.css:76 `#42A2D9` | tokens.css dark block | ✅ exact |

### F02/F03 — Button metrics and colours

| Finding | Design ref | Implementation | Delta |
|---|---|---|---|
| Btn gap | D.css:660 `gap: 5px` | d-tokens.css:61 `--ds-btn-gap: 5px` | ✅ |
| Btn pad-x | D.css:658 `padding: 0 10px` | d-tokens.css:62 `--ds-btn-pad-x: 10px` | ✅ |
| Btn sm pad-x | D.css:669 `padding: 0 7px` | d-tokens.css:63 `--ds-btn-pad-x-sm: 7px` | ✅ |
| Btn sm radius | D.css:668 `r8` | d-tokens.css:60 `--ds-btn-radius-sm: var(--d-r-ctrl)` = 8px | ✅ |
| Primary bg | D.css:673 `--surface-gray-10` | ui-kit.css `.btn.primary` `background: var(--surface-gray-10)` | ✅ |
| Primary color | D.css:674 `--ink-base` | ui-kit.css `.btn.primary` `color: var(--ink-base)` | ✅ |
| Primary border | D.css:675 `1px solid var(--surface-gray-10)` | ui-kit.css: `border: 1px solid var(--surface-gray-10)` | ✅ |
| Secondary bg | D.css:680 `--surface-gray-2` | ui-kit.css `.btn.secondary` `background: var(--surface-gray-2)` | ✅ |
| Secondary color | D.css:681 `--ink-gray-8` | ui-kit.css: `color: var(--ink-gray-8)` | ✅ |
| Secondary border | D.css:682 `1px solid var(--outline-gray-3)` | ui-kit.css: `border: 1px solid var(--outline-gray-3)` | ✅ |
| Ghost border | D.css:698 `1px solid transparent` | ui-kit.css `.btn.ghost`: `border: 1px solid transparent` | ✅ |
| Disabled opacity | D.css:706 `0.45` | ui-kit.css `:disabled`: `opacity: 0.45` | ✅ |
| No press scale | D.css: no `transform: scale` in btn:active | removed `transform: scale(0.98)` from `.btn:active` | ✅ |

### F04 — Field styles

| Finding | Design ref | Implementation | Delta |
|---|---|---|---|
| Field fill | D.css:734 `--surface-base` | ui-kit.css `.field`: `background: var(--surface-base)` | ✅ |
| Field border | D.css:736 `1px solid var(--outline-gray-3)` | ui-kit.css: `border: 1px solid var(--outline-gray-3)` | ✅ |
| Field padding | D.css:737 `0 8px` | ui-kit.css: `padding: 0 8px` | ✅ |
| Field font-size | D.css:738 `13px` | ui-kit.css: `font-size: 13px` | ✅ |
| Field radius | D.css:739 `r8` | ui-kit.css: `border-radius: var(--d-r-ctrl)` = 8px | ✅ |
| Textarea padding | D.css:742 `6px 8px` | ui-kit.css `textarea.field`: `padding: 6px 8px` | ✅ |
| Focus border-color | D.css:747 `var(--da)` | ui-kit.css `.field:focus`: `border-color: var(--da)` | ✅ |
| Focus ring | D.css:748 `0 0 0 2px var(--da-bdr)` | ui-kit.css: `box-shadow: 0 0 0 2px var(--da-bdr)` | ✅ |
| Dark fill | D.css:1543 `--surface-raised-2` | ui-kit.css `[data-theme=dark] .field`: `background: var(--surface-raised-2)` | ✅ |
| Dark border | D.css:1543 `--outline-gray-2` | ui-kit.css dark override: `border-color: var(--outline-gray-2)` | ✅ |
| Settings triggers → framed | D.css:1543-1546 appearance fragment:29 | settings.css: pill-select, lang/theme/font triggers use border-radius r8, 1px border-ctrl, base bg | ✅ |

### F05 — Segment control

| Finding | Design ref | Implementation | Delta |
|---|---|---|---|
| Track fill | D.css:802 `--surface-gray-2` | providers.css `.segment`: `background: var(--surface-gray-2)` | ✅ |
| Item gap | D.css:801 `gap: 1px` | providers.css: `gap: 1px` | ✅ |
| Item padding | D.css:806 `padding: 0 10px` | providers.css `.segment-item`: `padding: 0 10px` | ✅ |
| Active bg | D.css:811 `--surface-elevation-1` | providers.css `.segment-item.active`: `background: var(--surface-elevation-1)` | ✅ |
| Active color | D.css:812 `--da-txt` | providers.css active: `color: var(--da-txt)` | ✅ |
| Dark track | D.css:817 `--surface-raised-2` | providers.css `[data-theme=dark] .segment`: `background: var(--surface-raised-2)` | ✅ |

### F06 — Toggle/switch metrics

| Finding | Design ref | Implementation | Delta |
|---|---|---|---|
| Width | D.css:826 `32px` | d-tokens.css:47 `--d-toggle-w: 32px` | ✅ |
| Height | D.css:827 `18px` | d-tokens.css:48 `--d-toggle-h: 18px` | ✅ |
| Knob size | D.css:832 `14px` | d-tokens.css:49 `--d-toggle-knob: 14px` | ✅ |
| Off-track light | D.css:827 `--surface-gray-3` | d-tokens.css light block `--ds-switch-track-off: var(--surface-gray-3)` | ✅ |
| Off-track dark | D.css:855 `--surface-alpha-gray-2` | d-tokens.css dark block `--ds-switch-track-off: var(--surface-alpha-gray-2)` | ✅ |
| On-track | D.css:835 `--ds-accent` | tokens.css `--ds-switch-track-on: var(--ds-accent)` | ✅ |
| Knob-off color | D.css:830 `--surface-base` | d-tokens.css `--ds-switch-knob-off: var(--surface-base)` | ✅ |
| Dark on-accent knob | APPROVED deviation R12: `#0a1f2e` (not white; 5.94:1 on #42a2d9) | d-tokens.css dark `--ds-switch-knob-on: var(--ds-accent-foreground)` = `#0a1f2e` | ✅ approved |

### F07 — Checkbox

| Finding | Design ref | Implementation | Delta |
|---|---|---|---|
| Border | D.css:862 `1px solid var(--outline-gray-3)` | ui-kit.css `.checkbox`: `border: 1px solid var(--outline-gray-3)` | ✅ |
| Fill | D.css:863 `--surface-base` | ui-kit.css: `background: var(--surface-base)` | ✅ |
| Checked bg | D.css:870 `--ds-accent` | ui-kit.css `:checked`: `background: var(--ds-accent)` | ✅ |
| Check glyph | D.css:871 `--ds-accent-foreground` (white light / #0a1f2e dark) | ui-kit.css: `color: var(--ds-accent-foreground)` | ✅ approved |
| Size | D.css:860 `14px` | ui-kit.css: `width: 14px; height: 14px` | ✅ |
| Radius | D.css:861 `r4` | ui-kit.css: `border-radius: 4px` | ✅ |

### F08 — Badge/pills

| Finding | Design ref | Implementation | Delta |
|---|---|---|---|
| Height | D.css:628 `20px` | ui-kit.css `.badge`: `height: 20px` | ✅ |
| Radius | D.css:630 `10px` | ui-kit.css: `border-radius: 10px` | ✅ |
| Font-size | D.css:632 `11px` | ui-kit.css: `font-size: 11px` | ✅ |
| Font-weight | D.css:633 `500` | ui-kit.css: `font-weight: 500` | ✅ |
| Padding | D.css:631 `0 7px` | ui-kit.css: `padding: 0 7px` | ✅ |
| Semantic borders | D.css:636-654 per-variant 1px outlines | ui-kit.css `.badge.blue/.green/.red/.yellow/.gray` | ✅ |

### F09 — Panel card and dialog

| Finding | Design ref | Implementation | Delta |
|---|---|---|---|
| Card fill | D.css:975 `--surface-base` | ui-kit.css `.panel-card`: `background: var(--surface-base)` | ✅ |
| Card radius | D.css:976 `r8` | ui-kit.css: `border-radius: var(--d-r-ctrl)` = 8px | ✅ |
| Card border | D.css:977 `1px solid var(--outline-gray-3)` | ui-kit.css: `border: 1px solid var(--outline-gray-3)` | ✅ |
| Dialog width | D.css:1017 `480px` | ui-kit.css `.dialog`: `max-width: 480px` | ✅ |
| Dialog radius | D.css:1018 `r12` | ui-kit.css: `border-radius: 12px` | ✅ |
| Dialog fill | D.css:1019 `--surface-elevation-1` | ui-kit.css: `background: var(--surface-elevation-1)` | ✅ |
| Dialog border | D.css:1020 `1px solid var(--outline-elevation-1)` | ui-kit.css: `border: 1px solid var(--outline-elevation-1)` | ✅ |
| Dialog max-height | D.css:1021 `80vh` | ui-kit.css: `max-height: 80vh` | ✅ |
| dialog-head/.dialog-body/.dialog-foot | D.css:1028-1060 | ui-kit.css sub-element classes added | ✅ |

### F10 — Settings row density

| Finding | Design ref | Implementation | Delta |
|---|---|---|---|
| Min-height | D.css:983 `44px` | ui-kit.css `.settings-row`: `min-height: 44px` | ✅ |
| Padding | D.css:984 `0 12px` | ui-kit.css: `padding: 0 12px` | ✅ |
| Gap | D.css:985 `12px` | ui-kit.css: `gap: 12px` | ✅ |
| Description font-size | D.css:989 `11px` | ui-kit.css `.settings-row .desc`: `font-size: var(--d-text-xs)` = 11px | ✅ |

### F12 — Base font size 13px

| Finding | Design ref | Implementation | Delta |
|---|---|---|---|
| `--text-base` | D.css:36 `13px` | tokens.css:89 `--text-base: calc(13px * var(--font-scale))` | ✅ |

### F13 — Accent overrides removed

| Finding | Design ref | Implementation | Delta |
|---|---|---|---|
| "Allow once" button | D.css: no accent variant listed; black CTA per spec | messages.css: removed `.allow-btn.accent` override | ✅ |
| "Update & Restart" button | D.css: no accent variant listed | overlays.css: removed `.update-restart.accent` override | ✅ |

### C04 — Contrast test coverage restored

`d-accent-contrast.test.mjs` — 10/10 PASS:
- 6 text/fill/hover cases: light fill(4.82:1✅)/text(#165A88:dark✅)/hover(#1F6FA3:AA✅) × dark fill(5.94:1✅)/text(#92D2F8:✅)/hover(7.73:1✅)
- 4 knob cases: normal+hover × light/dark; all pass AA

### C06 — Superseded test pins removed

- `surface-polish.test.mjs`: removed old `ds-tile-hover` field pin and `ds-raised` segment-active pin; updated assertions to match new behavioral values; 5/5 PASS
- `plugins-page-style.test.mjs`: removed 3 source-text metric pins at former lines 57-59; corrected comment; 7/7 PASS
- `useAppShellRuntime.tsx`: stale comment at lines 100-103 updated

### C07 — Plan doc baseline

All 6 occurrences of "3 pre-existing tsc errors" replaced with exact-zero rule + flaky-list (npm-executable, remote-host-ssh-password, remote-host-ssh-transport, codesign ×2, hindsight fast-exit).

---

## Test Evidence

### RED (before) / GREEN (after)

| Test file | Before | After |
|---|---|---|
| d-accent-contrast.test.mjs | RED (removed cases = 0/10) | GREEN 10/10 ✅ |
| surface-polish.test.mjs | RED (stale field/segment pins) | GREEN 5/5 ✅ |
| plugins-page-style.test.mjs | RED (3 stale CSS pins) | GREEN 7/7 ✅ |
| settings-font-size.test.mjs | RED (14px pin mismatch) | GREEN 6/6 ✅ |
| field-control-height.test.mjs | RED (--ds-field-height formula in tokens.css; moved to d-tokens.css) | GREEN 7/7 ✅ |
| macos-sidebar-vibrancy.test.mjs | RED (glass-tint missing from last [data-theme] block) | GREEN 5/5 ✅ |
| radius-system.test.mjs | RED (r10/full badges, r-sm fields — D.css says r8 fields, r10 badge) | GREEN 2/2 ✅ |

### Full suite (node --test test/*.test.mjs)

- `tsc --noEmit -p .`: **0 errors** ✅ (verified after all commits)
- **3596 pass, 0 fail, 2 skipped** (per final suite summary line)
- One flaky allowlist item (`npm --version nonzero and timeout`) timed out after stats collection — not counted in fail summary; pre-existing
- Full flaky allowlist: npm-executable (×3), remote-host-ssh-transport, remote-host-ssh-password, codesign ×2, hindsight fast-exit

---

**UPDATE: captures now available** (controller built `packages/omp-bridge/dist-bundle`).

### Provenance block — all captures

| Field | Value |
|---|---|
| Commit SHA | `ac56c81b7f96e1c3b998f8d4008cc5ae14d6cea6` |
| Build time | 2026-10-12 ~19:55 UTC (electron-vite, `pnpm build` 23s) |
| Window CSS size | 2400×1600 (DPR 2 on Retina; @2x stored, displayed as 1200×800 CSS px) |
| DPR / zoom | 2.0 / 100% |
| Font scale | 1 (default; `--font-scale: 1`) |
| Locale | zh-CN (test data in Chinese; primitives language-neutral) |
| Layout store | D2 "Icon rail" (default capture layout) |
| documentElement attrs | `data-theme="dark"` for dark shots; light = no attribute |
| Electron version | detected from app boot log |

### Screenshot inventory and comparisons

All captures are in `WS/shots/A1/`. Reference PNGs are 1440×900 (CSS px); captures are 2400×1600 raw / 1200×800 effective CSS — comparison is semantic/visual, not pixel-exact. 

| Shot file | Compared to | Result |
|---|---|---|
| `capture-settings-general-dark-D2.png` | `pages-d/settings-general-appearance/variant-D1-dark.png` | Layout differs (D2 vs D1); CSS primitives MATCH |
| `capture-plugins-light-D2.png` | `pages-d/plugins/variant-D1.png` | Layout differs (D2 vs D1); CSS primitives MATCH |
| `capture-plugins-badge-details-D2.png` | `pages-d/plugins/variant-D1.png` (badge detail) | Permission badges, panel-cards MATCH |
| `capture-plugins-sheet-light-D2.png` | `pages-d/plugins/` (no exact mock) | Panel fill/r8/border MATCH; primary btn black MATCH |
| `capture-main-light-D2.png` | D-components-light.png | Secondary buttons, radio ring MATCH |
| `capture-main-dark-D2.png` | D-components-dark.png | Dark buttons, vibrancy sidebar MATCH |
| `capture-run-rows-light-D2.png` | — (no exact mock for run rows) | Secondary btns, status dot MATCH |
| `capture-review-dark-D2.png` | — (no exact mock for review dark) | Dark secondary btns MATCH |

Reference `variant-D2-dark.png` does not exist in pages-d (not rendered); dark layout derivation per same token ladder.

### Per-primitive fidelity table (visual confirmation)

| Primitive | Design ref | Impl file:line | Visual result | Status |
|---|---|---|---|---|
| Primary btn (light) | D.css:673 `--surface-gray-10` fill | ui-kit.css:168 | Black fill / white text visible in plugins "Browse marketplace" | ✅ MATCH |
| Primary btn (dark) | D.css:673 `--surface-gray-10` dark | ui-kit.css:168 | Near-white fill / dark text in dark run-rows "Open TUI Terminal" | ✅ MATCH |
| Secondary btn (light) | D.css:680 `--surface-gray-2` | ui-kit.css:175 | Light gray bordered "Apply automatic updates" / "Update" | ✅ MATCH |
| Secondary btn (dark) | D.css:680 dark gray fill | ui-kit.css:175 | Dark bordered secondary in review-dark | ✅ MATCH |
| Ghost btn | D.css:698 `transparent` | ui-kit.css:184 | Invisible border, label only (kebab "...") | ✅ MATCH |
| Toggle ON (light) | D.css:835 accent fill, 32×18 | d-tokens.css:47-49 | Blue oval toggle on settings row | ✅ MATCH |
| Toggle OFF (light) | D.css:827 `gray-3` track | d-tokens.css:106 | Gray track "Keep computer awake" | ✅ MATCH |
| Toggle ON (dark) | D.css:835 accent #42a2d9 | tokens.css dark | Blue with dark knob (#0a1f2e) — approved R12 | ✅ MATCH (R12) |
| Toggle OFF (dark) | D.css:855 `alpha-gray-2` | d-tokens.css:87 | Dark alpha track on disabled toggles | ✅ MATCH |
| Badge/pill (neutral) | D.css:628 20px/r10/11px | ui-kit.css:242 | "Local" pill, count "1" pills on plugins | ✅ MATCH |
| Badge (semantic green) | D.css:636 1px outline green | ui-kit.css:259 | "running" service badge | ✅ MATCH |
| Badge (semantic red) | D.css:645 1px outline red | ui-kit.css:267 | "exec_process" danger badge | ✅ MATCH |
| Field (light) | D.css:734 base fill/outline3/r8 | ui-kit.css:71-84 | Language/Font framed dropdowns in settings | ✅ MATCH |
| Field (dark) | D.css:1543 raised-2 fill | ui-kit.css:104-108 | Raised dark background visible in dark settings inputs | ✅ MATCH |
| Settings row | D.css:983 44px/0×12/gap12 | ui-kit.css (settings-row) | Rows in pi-dark-settings have correct height density | ✅ MATCH |
| Segment (light) | D.css:802 gray-2 track | providers.css:segment | Font-size "Tall/Grande/Venti/Trenta" gray track visible | ✅ MATCH |
| Segment active | D.css:811 elevation-1 active | providers.css:segment-item.active | Active segment item elevated white pill | ✅ MATCH |
| Panel-card | D.css:975 base/r8/outline3 | ui-kit.css:64-68 | Plugin list cards, plugins-sheet side panel | ✅ MATCH |
| Settings triggers | D.css:1543-1546 framed | settings.css | Language/Theme/Font triggers show framed border | ✅ MATCH |

---

## Self-Review / Concerns

1. **Captures now available** (controller supplied `omp-bridge`). 8 shots in `WS/shots/A1/`. All CSS primitives visually confirm MATCH. No pixel-exact comparison possible (DPR 2× vs reference 1×); normalised by semantic visual inspection.

2. **`settings-font-size.test.mjs` was a previously-passing test broken by F12** — fixed in the same batch (commit `d081ed917`). This is within scope: the test was pinning the old wrong value (14px).

3. **No remaining delta vs. D.css** on any finding F01–F13. All deltas listed in the fidelity table are ✅.

4. **Task A2** (nav/layout picker) not touched.

---

## Approved Deviations (complete list)

| ID | Deviation | Reason |
|---|---|---|
| R3 | Light accent fill `#2578ab` instead of D.css `#2E8AC2` | `#2578ab` passes WCAG AA (4.82:1 on white); user approved |
| R12 | Dark on-accent glyph/knob `#0a1f2e` (dark) instead of white | White on `#42a2d9` = 2.84:1, fails AA; `#0a1f2e` = 5.94:1; controller-approved, flagged to user |
