# Extensions Management — Settings UI

**Date:** 2026-10-03  
**Branch:** feat/extensions-mgmt

## Goal

Add a Settings → Extensions section that manages omp extensions (npm plugins and
marketplace plugins) from the Fcode desktop without leaving the app.

## Scope

- List installed omp plugins (`omp plugin list --json` → npm + marketplace)
- Enable / disable via `disabledExtensions` omp-settings key (restarts sidecar)
- Install from npm/git spec (`omp plugin install <spec>`, spawned without a shell,
  120 s timeout, output captured)
- Uninstall by name (`omp plugin uninstall <name>`, 60 s timeout)
- Spec validation rejects local paths and shell metacharacters before spawn

## New IPC channels

| Channel | Action |
|---|---|
| `pi-desktop/omp/extensions/list` | `omp plugin list --json` → `OmpExtensionListResult` |
| `pi-desktop/omp/extensions/install` | validate + spawn install → `OmpExtensionMutateResult` |
| `pi-desktop/omp/extensions/uninstall` | validate + spawn uninstall → `OmpExtensionMutateResult` |
| `pi-desktop/omp/extensions/setEnabled` | toggle `disabledExtensions` + restart |

## New omp-settings keys

`extensions` (array) and `disabledExtensions` (array) added to `OmpSettingsValues`
and `SCHEMA` in `omp-settings-config.ts`.

## UI

`OmpExtensionsSection` rendered at the bottom of the AI settings tab, after
Agent Worktrees.
