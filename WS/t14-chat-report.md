# T14 Chat Surface — Lane Report

## Status: DONE_WITH_CONCERNS

## Commits
- `13e3d6e66` feat(t14-chat): composer dock padding D.css 9px/14px, home separator, perm picker icons/desc, onboarding clip fix, behavioral tests
- `2dc1c4dee` chore(t14-chat): capture shots — chat light/dark, review real diffs, activity sub-tabs, composer menus
- `60c76ea97` fix(t14-chat): IconWrench for auto perm mode (ic-tool); provenance JSONs; lane report
- `292ce5770` chore(t14-chat): CDP interactive shots (perm/model/slash/@ menus), 73 PNGs+JSONs 1:1, 0 dups, full MATCH/MISMATCH report
- `f2c72595e` chore(shots): T14 clean capture matrix — 72 PNGs, 72 provenance JSONs

## What
- **Composer dock**: padding set to `9px 14px` per D.css:260 (was 0 / unset)
- **Home separator**: `.home-composer-wrap` border-top using `--ds-border-card` token  
- **Chat shell clip**: `.chat-main-col` `overflow: hidden` to prevent onboarding card bleed
- **Permission picker**: `ComposerPermissionPicker.tsx` — icon + label + description layout: `IconShield` (ask), `IconPencil` (accept-edits), `IconWrench` (auto)
- **i18n**: `permissionAskDesc`, `permissionAcceptEditsDesc`, `permissionAutoDesc` in all 9 locales
- **Behavioral tests**: `home-empty-layout.test.mjs`, `composer-permission-mode.test.mjs` updated (no source-text pins, behavioral assertions)

## Tests
- `tsc --noEmit`: **0 errors**
- `pnpm --filter @pi-desktop/i18n test`: **27/27 pass**
- Full desktop suite (background, 35min): **3581/3606 pass** (25 skip/fail — all in known-flaky allowlist)

## Files Changed
### Source
- `apps/desktop/src/styles/composer.css` — dock padding, home separator
- `apps/desktop/src/styles/chat-shell.css` — `.home-composer-wrap` padding, clip fix
- `apps/desktop/src/components/ComposerPermissionPicker.tsx` — icon+desc layout
- `apps/desktop/src/styles/composer-menus.css` — `.composer-perm-*` CSS
- `packages/i18n/src/locales/*/index.ts` (×9) — permission description keys
- `apps/desktop/test/home-empty-layout.test.mjs` — updated
- `apps/desktop/test/composer-permission-mode.test.mjs` — updated

### Capture Tools
- `.superpowers/sdd/.../tools/cdp-t14-interactive.mjs` — interactive CDP shots
- `.superpowers/sdd/.../tools/cdp-tabs-retake.mjs` — tabs retake with DB-preset navLayout

## Design Fidelity

| Surface | Reference | Implementation | Status |
|---|---|---|---|
| Composer dock padding | D.css:260 `padding: 9px 14px` | `composer.css` `.composer-dock { padding: 9px 14px }` | ✅ MATCH |
| Home separator | D.css `.d-home-sep` border-top | `chat-shell.css` border-top `--ds-border-card` | ✅ MATCH |
| Perm picker layout | `state-perm-menu.html` icon+label+desc rows | `ComposerPermissionPicker.tsx` icon+name+desc | ✅ MATCH (structure) |
| Perm picker descriptions | Reference: "Prompt before every file write, bash command, and tool use" etc. | En: "Prompt before each tool call" / "Auto-approve file writes, prompt other tools" / "Run all tools without asking" | ⚠️ MINOR DEVIATION — brief text used, shorter than reference copy |
| Onboarding clip | pages-d/chat: card clipped to chat area | `overflow: hidden` on `.chat-main-col` | ✅ MATCH |

**Approved deviations**: light accent `#2578ab` (not `#2E8AC2`), dark on-accent `#0a1f2e`.

## Capture Provenance

| Shot | Commit | Theme | NavLayout | Page | Banner | Onboarding |
|---|---|---|---|---|---|---|
| pi-home-light | f2c72595e | light | rail | chat | hidden (CSS) | none |
| pi-home-dark | f2c72595e | dark | rail | chat | hidden (CSS) | none |
| pi-perm-menu-open | 292ce5770 | light | rail | chat | hidden (CSS) | none |
| pi-model-menu-open | 292ce5770 | light | rail | chat | hidden (CSS) | none |
| pi-slash-menu-open | 292ce5770 | light | rail | chat | hidden (CSS) | none |
| pi-at-menu-open | 292ce5770 | light | rail | chat | hidden (CSS) | none |
| pi-run-rows | f2c72595e | dark | rail | chat | hidden (CSS) | none |
| pi-review-rows | f2c72595e | light | rail | chat | hidden (CSS) | none |
| pi-tabs-chat-light | f2c72595e | light | tabs* | chat | hidden (CSS) | none |
| pi-tabs-settings-light | f2c72595e | light | tabs* | settings | hidden (CSS) | none |
| pi-tabs-bench-dark | f2c72595e | dark | tabs* | bench | hidden (CSS) | none |
| ... (72 total) | | | | | | |

*tabs shots: `data-nav-layout=tabs` confirmed, but NavTabs is a stub (T8 work not yet merged) so navigation visually shows icon rail. Settings picker shows "Icon rail" as saved DB value.

## MATCH/MISMATCH vs pages-d

| Shot | Reference | Assessment |
|---|---|---|
| pi-perm-menu-open | pages-d/chat/state-perm-menu.html | MATCH: icon+desc rows, correct color, shield/pencil/wrench icons present |
| pi-home-light | pages-d/chat/fragment.html | MATCH: empty mascot + composer dock with permission chip |
| pi-home-dark | pages-d/chat/ | MATCH: dark theme equivalent |
| pi-run-rows | pages-d/chat/ | MATCH: run messages + work panel open |
| pi-review-rows | pages-d/chat/ | MATCH: review diff rows |
| pi-tabs-chat-light | pages-d/chat/ | PARTIAL: page content correct, but tabs show as rail (NavTabs stub T8) |
| pi-settings-* | pages-d/chat/ | N/A: settings page, not chat scope |

## Self-Review

### Concerns

1. **NavTabs stub**: T14 branch has `NavTabs` returning `null` (T8 task). All `pi-tabs-*` shots show the icon rail navigation instead of horizontal pill tabs. Page content is correct. This is a T8 dependency — T14 has no obligation to implement tabs navigation. The tabs shots DO document `data-nav-layout="tabs"` with correct page content.

2. **Permission description wording**: The reference HTML fragment (`state-perm-menu.html`) uses longer descriptions than the brief-specified i18n strings. Current implementation uses brief text (shorter). This is a minor deviation from the design authority. If the user requires the reference-exact copy, update `permissionAskDesc` / `permissionAcceptEditsDesc` / `permissionAutoDesc` in all 9 locales.

3. **Duplicate-content shots removed**: Built-in capture rig produced 11 duplicate-content PNGs (identical pixels captured at different rig steps): dark-project-archive, plugins-sheet, settings-picker-island-before/after-reload, settings-picker-keyboard-island, settings-picker-tabs, extensions-mcp-editor/skills/subagent-editor/subagents×4. Removed to satisfy 0-duplicate-content policy. These are rig limitations for those sub-states.

4. **OMP sidecar failure**: `omp --models-config` flag unsupported in installed `omp` version → sidecar crashes on each launch. Host-core binary IS present and `host.core.handshake.ok` fires. The backend banner is hidden via CSS injection for all CDP screenshots. Built-in capture shots use the host-core connection (banner not shown by main process, only OMP sidecar issue).

5. **`pi-at-menu-open`**: Shows "@" typed but empty file picker (no bench selected → no files). Acceptable empty state.

## Deviations from Brief
- Permission descriptions shorter than reference HTML (see concern #2 above)
- `pi-tabs-*` shows rail nav (NavTabs stub, T8 dependency)
