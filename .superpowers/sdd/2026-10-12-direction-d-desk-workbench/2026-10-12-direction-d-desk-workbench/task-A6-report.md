# Task A6 Report
## Test Suite Results (A6 run)

```
3594 tests / 30 suites
3576 PASS / 11 FAIL / 5 CANCELLED / 2 SKIPPED
Node duration 354645ms
```

vs CP6 baseline (3601 tests / 3578 PASS / 12 FAIL / 9 CANCELLED):
- −7 tests: settings-font-size.test.mjs deleted (6 tests) + traffic first-paint pin deleted (1 test)
- VG1 (npm-install-recovery "missing npm→select→validate→remember→retry→load once"): **NOW PASSES** ✔
- All 11 FAIL are in allowlisted categories: hindsight×1, codesign×2, npm-executable×6, ssh-transport×2
- 5 CANCELLED: all ssh-password (timing, pre-existing environment issue)
- No new non-allowlisted failures introduced


**Branch:** feat/direction-d  
**A6 commit:** 1897a9dd2e6add3b28d57b67665bd83fa6999807
**TypeScript diagnostics:** 0 (tsc --noEmit -p ., confirmed ×3 across edits)  
**Build:** pnpm build succeeded (apps/desktop, renderer + main)  
**Capture rig run:** PI_DESKTOP_CAPTURE=1, fresh tmpdir, ELECTRON_RENDERER_URL=, 129s elapsed, CAPTURE_DONE confirmed

---

## Per-Finding Disposition

| Finding | Status | Evidence |
|---------|--------|----------|
| **C03 — Button primitive** | **CLOSED** | NavLayoutRow.tsx:5 imports Button from `../ui`; :136 uses `<Button variant="ghost" role="radio" ... data-nav-layout-option={id}>`. Misleading comment about API impossibility removed (was lines 7–11). CSS in settings.css overrides .btn geometry via `.nl-card { height: auto; display: flex; flex-direction: column; ... }` |
| **C03 — remaining picker tokens** | **CLOSED** | d-tokens.css: `--d-nl-focus-offset: 2px` (line after 109), `--d-nl-caption-pt: 4px`, `--d-wf-border: 1px` added. settings.css: `outline-offset: var(--d-nl-focus-offset)`, padding-top `var(--d-nl-caption-pt)`, all 1px inset/thumb/wireframe borders use `var(--d-wf-border)` |
| **F09 — extension viewport override** | **CLOSED** | settings.css: removed `.extension-prompt-dialog { max-height: calc(100dvh - 48px); overflow-y: auto }`. Generic `.dialog` contract (80vh/hidden + dialog-body scroll) now applies without exception |
| **C06 — source/wiring test pins** | **CLOSED** | `test/settings-font-size.test.mjs` deleted entirely (all 6 tests were source/regex pins). `traffic-light-reserve.test.mjs`: first-paint source-order/indexOf test (lines 38–50) deleted. No new pins introduced |
| **C02 — actual shell budget trace** | **CLOSED** | Capture rig log (run 3): `C02_rail {"navLayout":"rail","shellClientWidth":1200,"chromeW":74,"usableWidth":1126}` → `C02_island {"navLayout":"island","shellClientWidth":1200,"chromeW":84,"usableWidth":1116}` → `C02_usable_delta 10 (expect 10)` → `C02_clientWidth_stable true 1200 1200`. Measured via real picker click (clickPicker dispatches MouseEvent → React onClick → saveSettings), setPage(chat), `.app-shell.clientWidth` |
| **C05 — picker interaction shots** | **CLOSED** | All 9 shots captured and copied to WS/shots/A6/ with provenance.json. Tabs-selected, island-selected, rail-selected (3 picker states). Focus + ArrowRight keyboard navigation (NAV_LAYOUTS=["tabs","rail","island"]; ArrowRight from rail→island). Island-before-reload + island-after-reload (renderer `window.location.reload()` proves persistence). German light + dark (IPC language→de triggers settingsChanged→i18n.changeLanguage). Per-image provenance in shots/A6/provenance.json |

---

## C02 Budget Numbers (from capture rig console log)

```
C02_rail         {"navLayout":"rail",   "shellClientWidth":1200,"chromeW":74,"usableWidth":1126}
C02_island       {"navLayout":"island", "shellClientWidth":1200,"chromeW":84,"usableWidth":1116}
C02_usable_delta 10 (expect 10)
C02_rail_restored{"navLayout":"rail",   "shellClientWidth":1200,"chromeW":74,"usableWidth":1126}
C02_clientWidth_stable true 1200 1200
```

- Rail chrome = 74px (RAIL_WIDTH=50 + 2×CANVAS_GAP=24)
- Island chrome = 84px (RAIL_WIDTH=60 + 2×CANVAS_GAP=24)
- Usable width drops by exactly 10px when switching rail→island
- Shell clientWidth is stable across layout switches (1200px CSS = 2400px physical at DPR 2)

---

## C05 Shots Index

| File | State |
|------|-------|
| pi-settings-live.png | General/Appearance, light, rail selected (baseline) |
| pi-settings-picker-tabs.png | Tabs card selected |
| pi-settings-picker-island.png | Island card selected |
| pi-settings-picker-rail.png | Rail card selected (default) |
| pi-settings-picker-focus.png | Keyboard focus on checked (rail) card |
| pi-settings-picker-keyboard-island.png | After ArrowRight: island focused+selected via onKeyDown→saveSettings |
| pi-settings-picker-island-before-reload.png | Island selected, before reload |
| pi-settings-picker-island-after-reload.png | After reload: island still selected (proves IPC persistence) |
| pi-settings-picker-de-light.png | German locale, light theme |
| pi-settings-picker-de-dark.png | German locale, dark theme |

---

## Files Changed in A6 commit (1897a9dd2)

| File | Change |
|------|--------|
| `apps/desktop/src/components/settings/NavLayoutRow.tsx` | Button import + usage; removed false comment |
| `apps/desktop/src/styles/d-tokens.css` | Added 3 tokens (focus-offset, caption-pt, wf-border) |
| `apps/desktop/src/styles/settings.css` | nl-card Button geometry override; F09 override removed; tokens consumed |
| `apps/desktop/test/settings-font-size.test.mjs` | **DELETED** |
| `apps/desktop/test/traffic-light-reserve.test.mjs` | First-paint source pin deleted |
| `apps/desktop/electron/main/bootstrap/window.ts` | C05 + C02 capture rig shots injected after pi-settings-live |

---

## Verification Checks for Main Agent

```
# TypeScript (must be exactly 0 errors)
cd apps/desktop && ./node_modules/.bin/tsc --noEmit -p .

# Full test suite (background, report PASS/FAIL totals)
cd apps/desktop && node --test test/*.test.mjs

# Expected passing baseline: ~3578 PASS / ≤12 FAIL / 9 CANCELLED
# (VG1/VG2 remain supervisor-classified open issues, not new regressions)
```

---

## Non-Blocking Honest Notes

- **German locale shots**: IPC `settings/set` with `language: "de"` triggers `settingsChanged` event → `initLanguageSync()` calls `i18n.changeLanguage("de")`. This path is already wired; the shots show labels in German. Full all-selection/all-theme German picker matrix is a Task14 carry per CP6 open deferred item 1.
- **Persisted reload**: The "after-reload" shot proves island persists across `window.location.reload()` (renderer-only). Full native app restart (cold boot) remains a Task14 carry.
- **Keyboard shot name**: `keyboard-island` (not `keyboard-tabs`) because NAV_LAYOUTS=["tabs","rail","island"] means ArrowRight from rail (idx 1) → island (idx 2). Documented in provenance.json.
- **C06 literal cleanup**: Remaining non-tokenised literals in settings.css (e.g. `44px`, `12px`, `24px`) are in UNTOUCHED rules outside this task's scope; the supervisor's C06 disposition explicitly only required the named pins (`settings-font-size:49`, `traffic-light-reserve:38–50`) and the mentioned touched-row metrics (`gap5/desc1/trigger-ring2/check-gap6/glyph10` — already tokenised in prior A4/A5 sessions).
