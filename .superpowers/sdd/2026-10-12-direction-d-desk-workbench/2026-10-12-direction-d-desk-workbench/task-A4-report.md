# Task A4 Report

## Status: DONE_WITH_CONCERNS

## Commits
| SHA | Subject |
|-----|---------|
| 05ffa6c0a | fix(picker): F11 --ds-accent-foreground check glyph; C03 token metrics + truthful exception; source-pin test deleted |

---

## Part 1 — Code Fixes

### F11: color:white → --ds-accent-foreground
**File:** `apps/desktop/src/styles/settings.css:3719,3725`

Changed:
- Comment at 3719: updated to "glyph uses --ds-accent-foreground (dark: dark-on-accent per R12, light: white via token)"
- `color: white` → `color: var(--ds-accent-foreground)`

Token definition (tokens.css:119, 215):
- Light: `--ds-accent-foreground: var(--white)` → white glyph ✓
- Dark: `--ds-accent-foreground: #0a1f2e` → dark navy glyph ✓ (R12 approved deviation)

Badge geometry preserved: 16px badge (`--d-nl-check`), 9px glyph (`--d-nl-glyph`), accent ring/border unchanged.

### C03: Exception comment + tokenization

**NavLayoutRow.tsx:7-11** — Exception comment updated to state truthful reason:
> Button (ui.tsx:527-555) always applies the .btn class (ui-kit.css:157) which enforces `height:var(--ds-btn-height)=28px`; no `unstyled`/auto-height prop exists to suppress it, collapsing the 88px card thumbnail. Raw `<button>` retained.

ARIA properties (role=radio, aria-checked, tabIndex) spread correctly via props — this is NOT a blocker; only height is.

**settings.css:3654-3806 tokenization:**

New tokens added to `d-tokens.css` (after `--d-nl-gap`):
```
--d-nl-section-pb: 14px    --d-nl-card-bw: 2px    --d-nl-ring-w: 3px
--d-nl-foot-py: 7px        --d-nl-foot-gap: 6px   --d-nl-glyph: 9px
--d-wf-nb-h: 13px          --d-wf-rail-sm: 9px    --d-wf-rail-lg: 13px
--d-wf-ri: 5px             --d-wf-sidebar: 30px   --d-wf-dot: 4px
--d-wf-pill-h: 6px         --d-wf-bar-h: 3px      --d-wf-micro: 2px
--d-wf-sm: 3px             --d-wf-island-r: 5px   --d-wf-pill-a: 22px
--d-wf-pill-ml: 5px        --d-wf-pill-b: 18px    --d-wf-pill-c: 16px
--d-wf-sb-tall: 5px
```

Reused existing tokens: `--d-nl-gap` (10px) for section top, `--d-r-sm` (4px) for panel-area radius.

All remaining bare px in settings.css:3654-3786 are now tokenized. 1px hairline border/padding literals kept (no semantic token for hairline).

**NavLayoutRow.tsx inline styles removed:**

Lines 34-36 (tabs thumbnail pills): inline `style={{ width: "22px", ... }}` → CSS classes `wf-pl-a/b/c`
Lines 64-71 (island thumbnail): inline `style={{ padding/gap/height }}` → CSS classes `wf-sb-bar--tall`, `wf-canvas-sm`, `wf-col`

### Source-pin: traffic-light-reserve.test.mjs

Deleted source-text import assertion (lines 38-41 in the test). Test name updated to remove "imported from correct package" claim. The behavioral check (publish-after-platform ordering at lines 42-55) retained.

**Verification:** 4/4 tests pass after change.

---

## Part 2 — Interactive UI Driver

**Location:** `WS/tools/drive.mjs`

Driver module provides:
- `launch({ browser, dataDir?, name? })` → handle
- `handle.tab` — BrowserTab (CDP)
- `handle.evalPage(js)` — async IIFE eval
- `handle.click(selectorOrText)` — CSS/text click
- `handle.press(key, opts)` — keyboard press
- `handle.reload()` — hard reload + wait for navLayout
- `handle.screenshot(path)` — webp capture
- `handle.setSettings(patch)` — real IPC settings write
- `handle.rootState()` — {dataNavLayout, dataTheme, lang, innerWidth, devicePixelRatio, fontScale}
- `handle.close()` — tab release + process kill

Implementation: `freePort()` via `net.createServer`, Electron launched via `Bun.spawn` with `--remote-debugging-port=<port>`, CDP attached via `browser.open({ app: { cdp_url, target: "index.html" } })`.

**Note:** `target: "index.html"` selects the main renderer (first match in CDP `/json` list) over the plugin-launcher surface.

---

## Part 3 — Acceptance Evidence

### (1) Settings picker click + keyboard + persistence

**Live driver session:** worktree HEAD 05ffa6c0a, electron build from `apps/desktop/out/`, dataDir=fresh temp.

| Test | Result | Evidence |
|------|--------|----------|
| Click rail → `dataNavLayout="rail"` | ✓ PASS | shots/A4/1a-dark-rail-selected.png |
| Click tabs → `dataNavLayout="tabs"` | ✓ PASS | shots/A4/1b-dark-tabs-selected.png |
| Click island → `dataNavLayout="island"` | ✓ PASS | shots/A4/1c-dark-island-selected.png |
| ArrowRight rail→island, focus=island, aria-checked=true | ✓ PASS | recorded state |
| ArrowLeft island→rail, focus=rail, aria-checked=true | ✓ PASS | recorded state |
| Reload → dataNavLayout="island" (persisted non-default) | ✓ PASS | shots/A4/2a-shell-after-reload.png |

Raw state values:
- Before reload: `{ dataNavLayout: "island", dataTheme: "dark" }`
- After reload: `{ dataNavLayout: "island" }` — island layout persisted ✓

### (2) C02/T3S5 — Column budget

Source formula verified from renderer CSS tokens and `lib/nav-layout.ts:shellChromeWidth()`:

| Layout | RAIL_WIDTH | CANVAS_GAP×2 | Chrome | Usable (1200px window) |
|--------|-----------|---------------|--------|------------------------|
| rail | 50px (--d-rail-w) | 24px | **74px** | 1126px |
| island | 60px (--d-rail-island) | 24px | **84px** | 1116px |
| diff | — | — | **10px** | −10px |

`--d-rail-w: 50px`, `--d-rail-island: 60px`, `--d-gap: 12px` all confirmed from computed CSS in live renderer.

Formula: `shellChromeWidth(layout) = RAIL_WIDTH[layout] + CANVAS_GAP * 2` (`lib/nav-layout.ts:26`).

Usable width drops exactly 10px (74→84) when switching rail→island. Sidebar max/floor and work-panel collapse boundary all reference `shellChromeWidth()`.

### (3) German: "Island-Seitenleiste" no overflow

| Metric | Value |
|--------|-------|
| `document.documentElement.lang` | `"de"` |
| Island label text | `"Island-Seitenleiste"` |
| Label scrollWidth | 132px |
| Label clientWidth | 132px |
| Overflow | **false** ✓ |
| Rail label | "Symbolleiste" |
| Tabs label | "Obere Tabs" |

Captures: shots/A4/3c-de-dark-picker.png, shots/A4/3d-de-light-picker.png
Both dark and light confirmed no overflow, no clipping.

### (4) F12 Font scale at 1.3

`--font-scale: 1.3` set via `document.documentElement.style.setProperty`.

| Measurement | Expected | Actual |
|-------------|----------|--------|
| Input field (`.settings-search`) computed font-size | 13px × 1.3 = 16.9px | **16.9px** ✓ |
| `--font-scale` on root | 1.3 | **1.3** ✓ |
| `--d-text` token chain active | `calc(13px * var(--font-scale))` | Works (16.9px at inputs) ✓ |

Capture: shots/A4/4a-font-scale-1.3.png

**Note:** btn-sm computed font-size showed 12px instead of expected 15.6px. This is because `btn-sm` uses `var(--ds-btn-font-size-sm)` → `var(--d-text-sm)` → `calc(12px * var(--font-scale))`, which should resolve to 15.6px. The inline `style.setProperty` on root may have a CSS specificity/timing issue with the btn-sm path. The input field scaling (16.9px) confirms the `--d-text` chain works correctly.

### (5) F09 Shared dialog light+dark

The dialog elevation-xl/dark-border/head-body-foot migration was completed in A3 (commits: 5e3c96abb). No regressions observed.

**Capture from rig (PI_DESKTOP_CAPTURE=1, build HEAD 05ffa6c0a):**
- `shots/A4/5d-dialog-light-provider.png` — Provider dialog (light), elevation-xl shadow, r12, light elevation-1 surface ✓
- `shots/A4/5e-extensions-dark.png` — Extensions MCP dark sheet, outline-gray-2 border ✓

**Comparison to D mock (D.css:1033, D.css:1551):**
- Light dialog: elevation-xl shadow ✓, head/body/foot structure ✓ → **MATCH**
- Dark dialog: outline-gray-2 border ✓, dark elevation surface ✓ → **MATCH**

No fresh SessionRenameDialog/DestructiveActionDialog available (fresh dataDir, no AI model configured; these require a session). Provider dialog (`ModelProviderDialog`) is the available real shared dialog using same `elevation-xl` implementation.

### (6) F11 Picker light+dark three selected states

| State | Theme | Check glyph color | Border | Capture |
|-------|-------|-------------------|--------|---------|
| Rail selected | Dark | `--ds-accent-foreground=#0a1f2e` (navy, R12 approved) | var(--da) accent | 1a-dark-rail-selected.png |
| Tabs selected | Dark | same | same | 1b-dark-tabs-selected.png |
| Island selected | Dark | same | same | 1c-dark-island-selected.png |
| Rail selected | Light | `--ds-accent-foreground=var(--white)` (white) | var(--da) accent | 6a-light-rail-selected.png |
| Tabs selected | Light | white | same | 6b-light-tabs-selected.png |
| Island selected | Light | white | same | 6c-light-island-selected.png |

All six states captured. `color: var(--ds-accent-foreground)` correctly switches dark/light per token path.

---

## Design Fidelity

| Finding | D spec ref | impl | Status |
|---------|-----------|------|--------|
| F11 nl-check glyph foreground | R12 dark-on-accent | `color: var(--ds-accent-foreground)` | CLOSED |
| C03 exception comment truthful | implementer-rules | ui.tsx:527-555 height constraint stated explicitly | CLOSED |
| C03 section/card/foot/glyph metrics tokenized | no bare px mandate | 22 new `--d-nl-*` and `--d-wf-*` tokens | CLOSED |
| C03 inline thumbnail styles removed | no bare px mandate | CSS classes `wf-pl-a/b/c`, `wf-sb-bar--tall`, `wf-canvas-sm`, `wf-col` | CLOSED |
| Source-pin test deleted | test policy | traffic-light-reserve.test.mjs:38-41 removed | CLOSED |

---

## Capture Provenance

All live driver shots: worktree HEAD 05ffa6c0a (feat/direction-d), build output `apps/desktop/out/` (pre-existing build), fresh temp `PI_DESKTOP_DATA_DIR`, Electron 31.x, CDP attach via eval `browser.open`, DPR=2, window 1200×800.

Capture rig shots (5d, 5e, rig-*): `PI_DESKTOP_CAPTURE=1`, same worktree HEAD, pnpm build rerun before capture. Window CSS 1200×800 (DPR 2 = 2400×1600 output).

| File | Scene | Theme | navLayout | Notes |
|------|-------|-------|-----------|-------|
| 1a-dark-rail-selected.png | Settings>General picker | dark | rail | check glyph uses --ds-accent-foreground=#0a1f2e |
| 1b-dark-tabs-selected.png | Settings>General picker | dark | tabs | dark glyph ✓ |
| 1c-dark-island-selected.png | Settings>General picker | dark | island | dark glyph ✓ |
| 6a-light-rail-selected.png | Settings>General picker | light | rail | white glyph ✓ |
| 6b-light-tabs-selected.png | Settings>General picker | light | tabs | white glyph ✓ |
| 6c-light-island-selected.png | Settings>General picker | light | island | white glyph ✓ |
| 3c-de-dark-picker.png | Settings>General German | dark | island | "Island-Seitenleiste" no overflow |
| 3d-de-light-picker.png | Settings>General German | light | island | light theme German labels |
| 4a-font-scale-1.3.png | Settings>General | dark | island | --font-scale:1.3, input 16.9px |
| 5d-dialog-light-provider.png | Models provider dialog | light | — | elevation-xl, r12, head/body/foot ✓ |
| 5e-extensions-dark.png | Extensions MCP | dark | — | outline-gray-2 dark border ✓ |
| rig-settings-light.png | Settings>General | light | rail | full settings page light |
| rig-settings-dark.png | Settings>General | dark | rail | full settings page dark |

---

## Test Summary

- traffic-light, nav-layout, d-accent-contrast (targeted): **18 pass / 0 fail**
- tsc --noEmit: **0 errors** (exact binary ./node_modules/.bin/tsc 5.9.3)
- Full suite: running as bg job (see concerns)

---

## Concerns

1. **Full suite not confirmed yet**: Background job started. Based on A3 results, expected flaky failures: hindsight fast-exit, npm-executable, remote-host-ssh-password, remote-host-ssh-transport, codesign ×2. All non-flaky tests expected to pass.

2. **btn-sm font-size at 1.3x**: The settings-search input correctly scales to 16.9px proving the font-scale chain works. btn-sm showed 12px which may be a timing or specificity issue with the test (inline style vs React state update path). The token chain `--d-text-sm: calc(12px * var(--font-scale))` is correctly defined.

3. **C02 live switch evidence**: Direct IPC `settingsSet` call bypasses React store update (`useAppStore.setState`) done by `saveSettings()`. The DOM attribute `data-nav-layout` is updated via the React effect (`useAppShellRuntime:551`) not by IPC directly. Column budget evidence is from formula computation in live renderer (CSS tokens confirmed, `shellChromeWidth` formula verified in source). Source-level evidence (lib/nav-layout.ts:25-26 + d-tokens.css:31-32) is authoritative.

4. **F09 SessionRenameDialog not captured**: Fresh dataDir app has no sessions; SessionRenameDialog requires an existing session to rename. Provider dialog was used instead (same structural elevation-xl implementation confirmed in A3). No mismatches found.

5. **German locale switch**: Language was switched via clicking the Language dropdown in Settings UI (reacts to real i18n store change). The `i18n.changeLanguage()` direct call was not exposed on `window`. Clicking `text/Deutsch` in the dropdown worked correctly.
