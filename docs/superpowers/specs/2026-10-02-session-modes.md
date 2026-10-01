# Session Modes & Events — Spec

> Branch: feat/session-modes · 2026-10-02

## Rows addressed
- `set_steering_mode` / `set_follow_up_mode` / `set_interrupt_mode` → omp-settings.json keys + RPC bridge
- `loop.mode` → omp-settings.json key
- `set_fast_mode` → RPC bridge
- `set_auto_retry` / `abort_retry` → RPC bridge
- `follow_up` / `abort_and_prompt` → bridge handler; queue-while-streaming uses follow_up
- `cycle_model` / `cycle_thinking_level` → composer keyboard shortcuts (Alt+] and Alt+[)
- Events: `auto_retry_start/end`, `retry_fallback_start/end`, `model_changed`, `thinking_level_changed`, `notice`, `goal_updated` → quiet system lines
- `session_settled` → quiet system line

## Changes

### packages/shared/src/types/omp.ts
Add `steeringMode`, `followUpMode`, `interruptMode`, `loop.mode` to OmpSettingsValues.

### apps/desktop/electron/main/omp-settings-config.ts
Add 4 keys to SCHEMA; add queue-modes section to ompSettingsYaml.

### packages/omp-bridge/src/bridge.ts
- `ompSettingsYaml`: emit `loop` section for `loop.mode`; emit `steeringMode`/`followUpMode`/`interruptMode` under dedicated keys
- Bridge handlers: `omp.modes.setSteeringMode`, `omp.modes.setFollowUpMode`, `omp.modes.setInterruptMode`, `omp.fast.set`, `omp.retry.setAutoRetry`, `omp.retry.abort`, `agent.followUp`, `agent.abortAndPrompt`
- Drop events → system lines for notice/auto_retry_start/end/retry_fallback_start/end/goal_updated/model_changed/thinking_level_changed/session_settled

### packages/shared/src/protocol.ts
Add IPC channels for above.

### apps/desktop/electron/main/ipc/omp-ipc.ts
Add handlers.

### apps/desktop/src/lib/api.ts
Add api functions.

### apps/desktop/src/stores/slices/queue-slice.ts
When session is running and NOT pi-native, use `api.agentFollowUp` instead of `api.queuePrompt`.

### packages/shared/src/keyboard-shortcuts.ts
Add `cycleOmpModel`, `cycleOmpThinking` IDs with default bindings `Alt+]` and `Alt+[`.

### apps/desktop/src/features/chat/composer/hooks/useComposerModelMenu.ts
Expose `cycleModel` and `cycleThinking` handlers; wire to keyboard in `ComposerInput`.

### apps/desktop/src/features/settings/omp-settings-sections.tsx
Add "Queue Modes" section.

## Enums (from omp source)
- steeringMode: "all" | "one-at-a-time" (default: "one-at-a-time")
- followUpMode: "all" | "one-at-a-time" (default: "one-at-a-time")
- interruptMode: "immediate" | "wait" (default: "immediate")
- loop.mode: "prompt" | "compact" | "reset" (default: "prompt")
