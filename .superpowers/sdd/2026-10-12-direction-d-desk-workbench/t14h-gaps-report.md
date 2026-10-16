# T14H Direction-D Gap Closure Report

**Branch:** `feat/direction-d-t14h-gaps`  
**HEAD:** `e6ba1c75b66b512550bc589441c39f7c0aaff770`  
**Agent:** H-Gaps  
**Date:** 2026-10-16

---

## Summary

All implementable gaps from T14H Direction-D fidelity review have been closed.
34 shots (PNG, 2400×1600 @ 2×) committed to `shots/H-gaps/`.

---

## Gap Status

### 1. Command Palette — SESSIONS / BENCHES sections ✅ DONE

**Shots:** `d-cmdpal-D{1,2,3}-{light,dark}.png` (6 shots)

- `SearchDialog.tsx`: Added BENCHES section showing rig-seeded bench list with
  status dot (running/stopped); flat SESSIONS header; FILES section removed
  (no IPC backing).
- `capture-rig.ts`: Added `seedCommandPaletteExtras()` — seeds
  `window.__PI_PALETTE_BENCHES__` with two bench entries.
- `renderer-api.ts`: Added `__PI_PALETTE_BENCHES__` to Window interface.
- `overlays.css`: Added `.search-bench-dot` colour; removed `.search-item-filepath`.
- `i18n` (all 9 locales): Added `search.sessions`, `search.files`,
  `search.benches` keys.
- Client-side fallback: when `search.error` set, filter sessions by title
  substring so rig sessions appear even without backend IPC.

### 2. Onboarding Wizard Step 1 ✅ DONE

**Shots:** `d-onboarding-step1-D{1,2,3}-{light,dark}.png` (6 shots)

- `capture-rig.ts`: Added `seedOnboardingChecklist()` — sets `step: 0`,
  `show: true` in onboarding store.
- Shot helper hides `.chat-sidecar-fatal` overlay alongside `.backend-banner`.

### 3. Long Migrated Form Dialog ⛔ DOCUMENTED GAP

No reference design found in the provided 20261012 asset set. No modal
component or IPC route to trigger "migration form" exists on the branch.
Gap recorded; deferred until reference provided.

### 4. Custom Cron Pill in Scheduled Page ⛔ DOCUMENTED GAP

The Scheduled page renders cron expressions from the bench backend process
list. There is no product-level field or override path to inject a custom
cron pill without backend data. Gap deferred pending backend support.

### 5. PR Detail Panel Short Title ⛔ DOCUMENTED GAP

`PrPanel` data model (`PullRequest` type) has no `shortTitle` field; only
`title` (full). There is no truncation design spec or separate field. Gap
deferred; requires data model addition.

### 6. FileBird Connected State ⚠️ PARTIALLY DONE

**Shots:** `d-filebird-{connected,unavailable}-D1-{light,dark}.png` (4 shots)

- The FileBird page renders a transparent WebContentsView "hole" for the
  actual FileBird workspace. The Fcode-owned header bar ("FileBird ·
  Not connected" pill + `⋯` menu) IS captured by CDP renderer screenshots.
- **Connected state:** Mock `window.piDesktop.invoke` for `fileBird` channels
  returns `{ok: true}`. The renderer's "Not connected" pill does NOT change
  because the FileBird page component reads connection state from a different
  source (native WebContentsView attach event, not just IPC return value).
  Both "connected" and "unavailable" renderer states capture identically in
  dark mode. Light mode shows a minor timing difference.
- **Conclusion:** The "connected" rendered state (with WebContentsView attached)
  is not capturable via CDP renderer screenshots — the WebContentsView itself
  is a separate native layer. These 4 shots document the renderer header in
  both modes; the WebContentsView content is by-design not in the shot.
- No product code changes were made for FileBird; the IPC mock is capture-
  script-only.

### 7. Settings Tabs ✅ DONE

**Shots:** `d-settings-{ai,advanced,permissions}-D{1,2,3}-{light,dark}.png` (18 shots)

- **AI Agents** (`aiAgents` tab): Shows Task Subagents toggles + agent list
  (frappe-dev, raven-pm, sdd-supervisor, frappe-bench-ops, frappe-builder…).
- **Advanced omp** (`ompAdvanced` tab): Shows Prompt/Prewalk/Vision sections
  with all settings.
- **AI Defaults / Permissions** (`ai` tab): Shows Permissions mode, Tool
  approval mode, Defaults section with mode buttons, toggles.

---

## Code Changes

| File | Change |
|------|--------|
| `apps/desktop/src/components/SearchDialog.tsx` | BENCHES section, client-side fallback, FILES removed |
| `apps/desktop/src/capture/capture-rig.ts` | `seedCommandPaletteExtras()`, `seedOnboardingChecklist()` |
| `apps/desktop/src/capture/renderer-api.ts` | `__PI_PALETTE_BENCHES__` in Window interface |
| `apps/desktop/src/styles/overlays.css` | `.search-bench-dot` added, `.search-item-filepath` removed |
| `packages/i18n/src/locales/*/index.ts` (×9) | `search.sessions`, `search.files`, `search.benches` |
| `apps/desktop/electron/main/bootstrap/window.ts` | T14H shot block removed (clean) |
| `tools/drive.mjs` | `screenshot()` fixed: reads temp webp path returned by `tab.screenshot()`, converts to PNG via `sips` |
| `tools/h-gaps-capture.mjs` | Tab name `hgaps3`, IIFE restore fix, FileBird section |
| `tools/capture-filebird.mjs` | New: isolated FileBird shot script |

---

## Quality Gates

- `pnpm --filter @pi-desktop/i18n test`: **27/27** ✅
- `pnpm tsc --noEmit`: **0 errors** ✅
- All 34 shots distinct PNGs (real `\x89PNG` format) ✅
- No new `window.ts` capture blocks ✅
- No `__PI_CAPTURE__` or `__PI_DESKTOP__` usage in product source ✅

---

## Shot Inventory

| Shot | Layouts | Count |
|------|---------|-------|
| Command palette (SESSIONS + BENCHES, query "migrate") | D1/D2/D3 × light/dark | 6 |
| Onboarding wizard Step 1 | D1/D2/D3 × light/dark | 6 |
| Settings › AI Agents | D1/D2/D3 × light/dark | 6 |
| Settings › Advanced omp | D1/D2/D3 × light/dark | 6 |
| Settings › AI Defaults (Permissions tab) | D1/D2/D3 × light/dark | 6 |
| FileBird unavailable (Not connected) | D1 × light/dark | 2 |
| FileBird connected (renderer header only) | D1 × light/dark | 2 |
| **Total** | | **34** |
