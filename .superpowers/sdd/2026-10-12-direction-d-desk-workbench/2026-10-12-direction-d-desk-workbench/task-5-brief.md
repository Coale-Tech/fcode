### Task 5: Primitive restyle (Button, fields, segmented, badge, checkbox, panel, toggle, settings rows)

**Files:**
- Modify: `apps/desktop/src/styles/ui-kit.css:125-191` (`.btn*`), `:372-409` (`.ds-checkbox`), `.field-input|select|textarea`, `.panel-card`, badge rules
- Modify: `apps/desktop/src/styles/providers.css:203-229` (`.settings-segment`)
- Modify: `apps/desktop/src/styles/settings.css:388-1000` (`.settings-card-block`, `.settings-row`), `:1229-1305` (`.settings-toggle`)
- Test: existing `test/{fixed-dropdown-surfaces,topbar-consistency,plugins-page-style,t13-status-token-contrast}.test.mjs` + capture screenshots

**Interfaces:** Consumes `--d-*` (Task 1). Produces no new API; `components/ui.tsx` is **not** edited (class names stay), per the AGENTS rule that primitives stay the single implementation.

Spec deltas (from `kit-d/D-SPEC.md` §buttons/inputs/segmented/toggle/rows):

| Primitive | Today | Direction D |
|---|---|---|
| `.btn` | 28px, radius 20px | height `--d-ctrl`, radius `--d-r-ctrl`, 13px, weight 500 |
| `.btn-primary` | accent fill | **black** fill (`--ds-text-primary` on `--ds-bg-primary` label, inverted per theme); accent only for the composer Send button and selected state |
| `.btn-secondary` | filled grey | transparent, 1px `--ds-border-default`, hover `--ds-bg-hover` |
| `.btn-ghost` / `.btn-sm` | — | ghost: no border; sm: 24px, 12px text |
| `.field-input/select/textarea` | min-height ≈36px | height `--d-ctrl` (textarea min 64px), radius `--d-r-ctrl`, border `--ds-border-default`, focus ring `--ds-accent` 2px |
| `.settings-segment` | pill, tall | track `--ds-bg-hover`, items height 24px inside a 28px track, selected = white/elevated + accent text |
| `.settings-toggle` | existing | 28×16 track, 12px knob, on = `--ds-accent` |
| `.ds-checkbox` | existing | 14px, radius `--d-r-sm`, checked = accent |
| `.panel-card` | 16px radius | radius `--d-r`, 1px border, no heavy shadow |
| `.settings-row` | existing | min-height `--d-row-h`+10px, title 13px / desc 12px muted |

- [ ] **Step 1: Baseline screenshots** of Settings → General, Plugins and a dialog (light + dark) for before/after.
- [ ] **Step 2:** For each row above: `read` the owning rule range, then edit the declarations to the Direction D value using only tokens (`height: var(--d-ctrl)`, `border-radius: var(--d-r-ctrl)`, …). `.btn-primary` colours:

```css
.btn-primary {
  background: var(--ds-text-primary);
  color: var(--ds-bg-primary);
  border-color: transparent;
}
.btn-primary:hover:not(:disabled) { background: color-mix(in oklab, var(--ds-text-primary) 85%, var(--ds-bg-primary)); }
```
- [ ] **Step 3:** `grep -rn "btn-primary" apps/desktop/src --include=*.tsx | wc -l` — list call sites; any place that relied on the blue primary to signal "the" action (composer Send, onboarding Continue, update banner) gets an explicit accent modifier **in its own partial**, not by reverting the primitive: composer `.composer-send` already has its own rule — confirm it uses `--ds-accent`; if it inherited `.btn-primary`, add `background: var(--ds-accent); color: var(--ds-accent-foreground)` to it.
- [ ] **Step 4: Run** `node --test test/*.test.mjs` → only the baseline failure; `tsc` baseline.
- [ ] **Step 5: Visual smoke.** Capture Settings/Plugins/dialog light+dark; compare to `pages-d/settings-general-appearance/variant-D2*.png` and `D-components.html` (kit-d). Controls are 28px, segmented fits, no overflow with `de` locale.
- [ ] **Step 6: Commit** `style(renderer): direction D primitives`

---

