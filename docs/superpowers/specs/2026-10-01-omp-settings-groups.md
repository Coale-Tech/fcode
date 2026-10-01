# omp Settings Groups

**Date**: 2026-10-01  
**Branch**: feat/omp-settings-groups  

## Goal
Expose four groups of omp settings in the Fcode Settings UI, persisted host-side and injected into the omp overlay on sidecar restart.

## Groups & Keys

| Group | Key | Type | Enum/range |
|-------|-----|------|------------|
| Task | `task.isolation.enabled` | bool | – |
| Task | `isolation.backend` | enum | auto/apfs/btrfs/zfs/reflink/overlayfs/projfs/block-clone/rcopy |
| Task | `worktree.clone` | bool | – |
| Task | `task.maxConcurrency` | number | 0–256 |
| Task | `task.maxRecursionDepth` | number | -1–32 |
| Eval | `eval.py` | bool | – |
| Eval | `eval.js` | bool | – |
| Eval | `eval.tools.enabled` | bool | – |
| Eval | `python.kernelMode` | enum | session/per-call |
| Eval | `python.interpreter` | string | – |
| Browser | `browser.enabled` | bool | – |
| Browser | `browser.cdpUrl` | string | – |
| Browser | `browser.relay` | bool | – |
| Browser | `browser.relayUrl` | string | – |
| Browser | `browser.headless` | bool | – |
| Collab | `collab.relayUrl` | string | – |
| Collab | `collab.webUrl` | string | – |
| Collab | `collab.displayName` | string | – |
| Collab | `collab.autoStart` | enum | off/view/control |

`task.agentModelOverrides` skipped — it is a `record` type (agent name → model ID map) with no clean fixed-field UI; a dedicated agent editor is the appropriate surface.

## Mechanism
- Single `omp-settings.json` in `dataDir`, validated on write.
- `FCODE_OMP_SETTINGS` env var (JSON) passed to bridge process.
- Bridge reads it in `main()` and passes to `writeOmpOverlay` → merged into YAML sections.
- IPC: `ompSettingsGet` / `ompSettingsSet`; set restarts sidecar.
- UI: 4 new `SettingsCard` sections appended to the AI tab.
