### Task 13: Settings workbench, Raven/FileBird frame, command palette, onboarding

**Files:** `features/settings/SettingsPage.tsx` + `settings.css`; `pages/{RavenPage,FileBirdPage}.tsx` chrome only; `components/SearchDialog.tsx` + `session-search.css`; onboarding (`grep -rln "onboarding" apps/desktop/src/components apps/desktop/src/features | head`) + its partial.
**Test:** `settings-*.test.mjs`, `fixed-dropdown-surfaces.test.mjs`, capture.

- [ ] **Step 1: Settings.** Two-panel workbench: nav rail panel 240px (`--d-r`, group labels 11px uppercase, items `--d-row-h` with 14px icon, active = accent tint), content panel with cards `--d-r`. **Keep instant per-field save** (decision 3); do not add a Save/Discard bar. Palette from `pages-d/settings-*/notes.md`.
- [ ] **Step 2: Raven/FileBird.** Only the thin Fcode frame (page head `--d-ph-h` with title + reload/open-external buttons) changes. Embedded view content is untouched. In all 3 layouts the host div fills the canvas minus the head; re-report bounds on layout change (Review Focus 1).
- [ ] **Step 3: Command palette** (`SearchDialog`): 13px items, 11px uppercase group labels with dashed separators, matched text in `--ds-accent`, focused row `--d-r-ctrl` + accent tint + 2px offset focus outline.
- [ ] **Step 4: Onboarding.** Step 1 follows `pages-d/onboarding/`. Steps 2 and 3 have **no approved mockup** (decision 4): restyle by primitives/tokens only and list them in the PR as needing design review.
- [ ] **Step 5: Verify** settings search (Cmd-K → "layout" finds Settings → General), plugin themes (`plugin:*`) still win over the D accent (Review Focus 6), capture the 17 reference pages.
- [ ] **Step 6: Commit** `style(settings,palette,onboarding): direction D`

---

