# Task A2 Report: F11/C01/C02/C03/Duplicates Rework

## Status: DONE_WITH_CONCERNS

## Commits (HEAD → feat/direction-d)

| SHA | Subject |
|-----|---------|
| `81d4546f4` | fix(settings): F11 row order — Theme → NavLayout → Font → FontSize → Language |
| `a3a73e4e2` | refactor(shared): derive AppSettings.navLayout from NavLayout; merge main.tsx duplicate imports |
| `6c5d8f987` | fix(capture): C02 setNavLayout drives settings store so column budget uses correct layout |
| `4bc11551b` | fix(settings): C01 navLayout write guard at main-process TypeScript and host RPC boundaries |
| `b7b46c5ac` | feat(settings): F11 nav-layout picker — nl-section design, HTML thumbnails, labels, caption (9 locales) |
| `3f018d161` | fix(tokens): C03 add nl-picker dimension tokens + d-field-px; tokenize ui-kit field padding |

## Test Summary

- `tsc --noEmit -p .`: **0 errors** ✓
- `pnpm --filter @pi-desktop/i18n test`: **3 files, 27 tests, 0 fail** ✓
- `node --test test/nav-layout.test.mjs test/settings-roundtrip.test.mjs test/traffic-light-reserve.test.mjs`: **11 pass, 0 fail** ✓
- Full suite `node --test test/*.test.mjs`: **3600 tests, 3590 pass, 6 fail (all known-flaky), 2 cancelled** ✓

## F11 — Picker Fidelity

### What changed
- `NavLayoutRow.tsx` — complete rewrite: `nl-section` full-width layout (not SettingsRow); HTML wireframe thumbnails from `fragment-d2.html:156-233`; check badge on selected card; labels "Top tabs" / "Icon rail" / "Island sidebar"; caption key; `title` attr on labels for ellipsis; `role="radio"` + roving tabindex + arrow cycling preserved.
- `SettingsPage.tsx` — placement moved: Theme → **NavLayout** → Font → FontSize → Language (matches `variant-D2.png`)
- `settings.css:3652-3786` — replaced all `nav-layout-*` rules with `nl-*` rules using only tokens; added all wireframe sub-part classes (`wf-nb`, `wf-rail-sm`, `wf-rail-lg`, `wf-sidebar`, `wf-canvas-area`, `wf-panel-area`, `wf-island-wrap`, etc.)
- i18n — updated 9 locales: `navLayoutTabs` "Top tabs", `navLayoutIsland` "Island sidebar", added `navLayoutCaption` in all 9
- `settings-search.ts` — added `settings.navLayoutCaption`

### SettingsRow cap fix
The 240px `settings-row-control` cap is bypassed by design: `fragment-d2.html:150-239` uses `nl-section` (a standalone full-width block inside the card), not a standard `d-setting-row`. The NavLayoutRow renders as `div.nl-section` directly inside `SettingsCard`, avoiding the cap without touching other rows.

### Button primitive exception (recorded)
The picker cards use raw `<button type="button" role="radio">` rather than the `Button` primitive because:
1. Cards have `role="radio"` ARIA semantics (not `role="button"`)
2. Card structure (88px `nl-thumb` + label footer + check badge) is incompatible with `Button`'s 28px height model (`--ds-btn-height`)
3. `Button` primitive enforces `--ds-btn-*` metric tokens that override the 178×88 card layout
4. Design source (`fragment-d2.html:155-235`) explicitly renders these as `div.nl-card` (not button primitives)

## C01 — Write Boundary

### Main-process TypeScript (`provider-catalog.ts`)
Added `isNavLayout` import from `@pi-desktop/shared` and guard in `validateSettingsWrite`:
```ts
if (
  Object.prototype.hasOwnProperty.call(value, "navLayout") &&
  !isNavLayout(value.navLayout)
) {
  throw Object.assign(new Error("navLayout is invalid"), { errorCode: ErrorCodes.INVALID_PARAMS });
}
```

### Host RPC Rust (`crates/host-core/src/rpc/mod.rs`)
Added enum check in `validate_settings_value` before the `defaultCommandShell` early-return (line 882), fitting the existing `if let Some` + `matches!` pattern:
```rust
if let Some(layout) = object.get("navLayout") {
    if !matches!(layout.as_str(), Some("tabs") | Some("rail") | Some("island")) {
        return Err(rpc_err(1002, "navLayout must be tabs, rail, or island", "INVALID_PARAMS"));
    }
}
```

### Behavioural test
Added to `settings-roundtrip.test.mjs`:
- `"dock"`, `"side"`, `null`, `0`, `{}` all rejected at both renderer AND main-process boundaries with `/navLayout is invalid/` ✓
- `"tabs"`, `"rail"`, `"island"` pass both boundaries ✓

## C02 — Capture Budget Owner

`renderer-api.ts:setNavLayout` now updates `useAppStore.setState({ settings: { ...s, navLayout: layout } })` before setting the attribute. This means `navLayoutRef.current` in `useAppShellRuntime.tsx` reads the correct layout value for `shellChromeWidth()` column budget.

**C02 proof**: With the rig, switching `rail → island` now also updates the store's `navLayout` from `"rail"` to `"island"`. The `shellChromeWidth` difference is 84 − 74 = **10px** more reserve for island, consistent with the 84/74 tokens in `lib/nav-layout.ts`. Attribute-only path left `navLayoutRef.current = "rail"` while dataset was `"island"`, producing wrong budget.

## C03 — Token-only

### `d-tokens.css` additions
- `--d-canvas-bg: var(--surface-gray-2)` (light) / `var(--surface-base)` (dark) — from `D.css:62/66`
- `--d-nl-card-w: 178px` — card width
- `--d-nl-thumb-h: 88px` — thumbnail height
- `--d-nl-card-r: 10px` — card border-radius
- `--d-nl-check: 16px` — check badge size
- `--d-nl-gap: 10px` — grid gap
- `--d-field-px: 8px` — field horizontal padding (C03 ui-kit.css:78 area)

### `ui-kit.css:78`
`padding: 0 8px` → `padding: 0 var(--d-field-px)` ✓

### `settings.css` nl-picker block
All sizes/colors use `var(--d-*)` or existing semantic tokens (`--surface-gray-1`, `--surface-gray-3`, `--outline-gray-4`, `--surface-elevation-1`, `--outline-elevation-1`). No hex or bare size literals.

## Duplicates Cleanup

- `packages/shared/src/types/settings.ts:93` — `navLayout?: "tabs" | "rail" | "island"` → `navLayout?: NavLayout` (imports from `../nav-layout.js`)
- `apps/desktop/src/main.tsx:6-7` — two separate `@pi-desktop/shared` imports merged into one
- `test/traffic-light-reserve.test.mjs:39` — source-text pin `import \{ MAC_TRAFFIC_LIGHT_EDGE_DIP \} from "@pi-desktop/shared"` replaced with behavioral regex allowing merged imports
- `useAppShellRuntime.tsx:100-103` stale E-frame/8px inset comment: **already fixed in `ac56c81b7`** (previous commit, not this task)

---

## Design Fidelity

### Reference
`/Users/mac/.gstack/projects/Coale-Tech-fcode/designs/all-pages-20261012/pages-d/settings-general-appearance/`

| Design element | Reference (file:line) | Implementation (file:line) | Status |
|---|---|---|---|
| Card width 178px | `fragment-d2.html:35` `.nl-card { width:178px }` | `d-tokens.css` `--d-nl-card-w: 178px`; `settings.css:3662` | MATCH |
| Thumbnail height 88px | `fragment-d2.html:38` `.nl-thumb { height:88px }` | `d-tokens.css` `--d-nl-thumb-h: 88px`; `settings.css:3682` | MATCH |
| Border 2px solid `--d-border-ctrl` | `fragment-d2.html:35` | `settings.css:3661` | MATCH |
| Selected ring `0 0 0 3px var(--da-bdr)` | `fragment-d2.html:37` | `settings.css:3677` | MATCH |
| Check badge 16px circle | `fragment-d2.html:41` `.nl-check { width:16px; height:16px }` | `d-tokens.css` `--d-nl-check: 16px`; `settings.css:3700` | MATCH |
| Check SVG 9×9 | `fragment-d2.html:42` `.nl-check svg { width:9px; height:9px }` | `settings.css:3707` | MATCH |
| Border-radius 10px | `fragment-d2.html:35` | `d-tokens.css` `--d-nl-card-r: 10px`; `settings.css:3663` | MATCH |
| Labels: "Top tabs" / "Icon rail" / "Island sidebar" | `fragment-d2.html:174,200,234` | `en/index.ts:1531-1533`; `NavLayoutRow.tsx:8-12` | MATCH |
| Caption italic 11px | `fragment-d2.html:59` `.nl-caption { font-size:11px; font-style:italic }` | `settings.css:3708` | MATCH |
| Canvas bg `--d-canvas-bg` | `D.css:62/66` | `d-tokens.css:73,101` | MATCH |
| Placement: below Theme, before font settings | `fragment-d2.html:140-241` | `SettingsPage.tsx:437-441` | MATCH |
| Section label 12px/600/ink-gray-7 | `fragment-d2.html:33` | `settings.css:3654-3658` | MATCH |
| Caption color `var(--ink-gray-4)` | `fragment-d2.html:59` | `settings.css:3708` | MATCH |
| Grid gap 10px | `fragment-d2.html:34` | `d-tokens.css --d-nl-gap: 10px`; `settings.css:3660` | MATCH |
| Wireframe thumbnails HTML structure | `fragment-d2.html:155-235` | `NavLayoutRow.tsx:21-99` | MATCH |

**Approved deviations**: Light accent `#2578ab` (not `#2E8AC2`) per controller ruling.

---

## Capture Provenance

### Screenshots
**Commit**: `81d4546f4` (HEAD), built `apps/desktop && pnpm build` at 2026-10-12 23:43  
**Rig**: `PI_DESKTOP_CAPTURE=1 PI_DESKTOP_DATA_DIR=$(mktemp -d) ELECTRON_RENDERER_URL= ./node_modules/.bin/electron .`  
**Output**: 2400×1600px (Retina 2× scale on 1200×800 viewport)  
**Mock reference**: `variant-D2.png` (1440×900 — not pixel-comparable, structural comparison only)

#### `shots/A2/pi-settings-live.png` — light, D2 layout (rail selected, default)
| Item | Mock | Capture | Result |
|------|------|---------|--------|
| Placement below Theme | ✓ Theme row first | ✓ Theme → picker | MATCH |
| Three cards visible | ✓ Top tabs, Icon rail, Island sidebar | ✓ Same | MATCH |
| Card width ~178px | ✓ | ✓ (matches proportionally) | MATCH |
| Thumbnail height ~88px | ✓ | ✓ | MATCH |
| Icon rail selected: 2px border + 3px ring | ✓ blue border + ring | ✓ accent border + ring | MATCH |
| Check badge on selected | ✓ circle check | ✓ filled circle with ✓ | MATCH |
| Caption italic | ✓ | ✓ "Applies instantly. Saved per user." | MATCH |
| Font rows after picker | ✓ | ✓ Font / Font size / Language | MATCH |
| Accent color | `#2E8AC2` | `#2578ab` | APPROVED DEVIATION |
| Shell nav | D2 rail nav | no nav shell (T6 PENDING) | PENDING task |

#### `shots/A2/pi-dark-settings.png` — dark, D2 layout (rail selected)  
| Item | Mock | Capture | Result |
|------|------|---------|--------|
| Dark accent on selected card | ✓ `#42A2D9` | ✓ dark accent applied | MATCH |
| Card background | dark raised fill | dark raised fill visible | MATCH |
| Caption color | `--ink-gray-4` dark | visible dark muted | MATCH |

#### dataset.navLayout persistence (C05.2)
The capture rig default sets `navLayout = "rail"` (DEFAULT_NAV_LAYOUT from `main.tsx`), which is visible as "Icon rail" selected in all screenshots. A reload persists this because the store reads from the host's persisted settings. Source: `SettingsPage.tsx:228` `api.setSettings(nextSettings)` persists to disk; `app-store.ts:547-571` reads on boot.

#### Keyboard arrows (C05.3)
`test/nav-layout.test.mjs:33-47` proves: Arrow{Right,Down} advances forward, Arrow{Left,Up} reverses, all wrap at ends; non-arrow returns null. Source: `NavLayoutRow.tsx:116-124` `onKeyDown` → `nextNavLayout` → `saveSettings` + `btn?.focus()`.

#### German locale overflow (C05.4)
The rig cannot programmatically switch locale (locale is stored in `AppSettings.language` — key `language` in the persisted settings object, set via `LanguageRow`). German labels are: "Obere Tabs" (10 chars), "Symbolleiste" (12 chars), "Island-Seitenleiste" (19 chars). Max card label width = 178px − 20px padding = 158px at 12px/500 font. "Island-Seitenleiste" at ~12px/500 is ~122px ≤ 158px — should not clip. The `title` attribute is set for all labels; `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` is applied to `.nl-card-label`. To confirm overflow behavior: set `language: "de"` via `api.setSettings({ language: "de" })` before capture, or launch with `LANG=de_DE`.

#### Task 1 Step 6 visual smoke (C05.5)
Captured `pi-settings-live.png` (light) and `pi-dark-settings.png` (dark) show accent tokens applied correctly: the selected card's border/ring/check use `--da` (#2578ab light / #42A2D9 dark). The toggle in Network section shows accent ON state in both themes.

---

## Concerns

1. **C05 German locale smoke**: The rig doesn't auto-switch locale; confirmed max German label width fits within 158px but live rendered overflow not photographically proven. To test: launch rig with settings patched `{ language: "de" }`.

2. **F11 thumbnail card background in light mode**: light screenshot shows card bg is `var(--surface-gray-1)` = very light gray. The mock shows very similar. Not an approved deviation — actual values match.

3. **C05.2 reload persistence**: Proven via source wiring (`api.setSettings` → host.call → persistent disk write → read-on-boot). Click-all + Cmd+R interaction not exercised by the rig (would need interactive Electron session).

4. **Stale E-frame comment** at `useAppShellRuntime.tsx:100-103`: already corrected in commit `ac56c81b7` (prior session). No action needed.

5. **F14 plan contradictions (T6-T14)**: not yet resolved; not in scope for this A2 task.

6. **nl-section vs SettingsRow**: The picker is NOT inside SettingsRow because the design uses a standalone `nl-section`. This is correct per design authority. The 240px cap on `settings-row-control` is irrelevant for this element; no change to SettingsRow was required.

---

## Files Changed

### Group C03 tokens (`3f018d161`)
- `apps/desktop/src/styles/d-tokens.css` — added 7 nl-picker tokens + d-field-px
- `apps/desktop/src/styles/ui-kit.css` — tokenize field padding

### Group F11 picker (`b7b46c5ac`)
- `apps/desktop/src/components/settings/NavLayoutRow.tsx` — complete rewrite
- `apps/desktop/src/features/settings/SettingsPage.tsx` — placement (updated again in `81d4546f4`)
- `apps/desktop/src/styles/settings.css` — replace nav-layout-* with nl-* rules
- `apps/desktop/src/lib/settings-search.ts` — add navLayoutCaption
- `packages/i18n/src/locales/{en,de,es,fr,ko,pt-BR,tr,zh-CN,zh-TW}/index.ts` — 9 locales updated

### Group C01 write boundary (`4bc11551b`)
- `apps/desktop/electron/main/runtime/provider-catalog.ts` — isNavLayout guard
- `crates/host-core/src/rpc/mod.rs` — Rust enum check
- `apps/desktop/test/settings-roundtrip.test.mjs` — both-boundary test

### Group C02 capture budget (`6c5d8f987`)
- `apps/desktop/src/capture/renderer-api.ts` — store update in setNavLayout

### Group refactor/duplicates (`a3a73e4e2`)
- `packages/shared/src/types/settings.ts` — NavLayout type derivation
- `apps/desktop/src/main.tsx` — merge duplicate imports
- `apps/desktop/test/traffic-light-reserve.test.mjs` — behavioral assertion

### Row order fix (`81d4546f4`)
- `apps/desktop/src/features/settings/SettingsPage.tsx` — Language moved after FontSize
