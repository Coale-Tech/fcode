# Agent Model Overrides — Settings UI

**Row:** `task.agentModelOverrides` (`omp/packages/coding-agent/src/task/settings.ts:365`)

## What

Settings card row for each bundled omp agent (`task`, `sonic`, `scout`, `reviewer`,
`security-reviewer`). A select per agent shows "Default" plus all models from `ompModelsList`.
Selecting a model writes `task.agentModelOverrides.<agent> = "provider/model"` to
`omp-settings.json`; selecting "Default" removes that key.

## Wire-up

Same `omp-settings.json` mechanism as existing groups (PR #62):

1. `OmpSettingsValues` gains `"task.agentModelOverrides"?: Record<string, string>`.
2. `validateOmpSettings` gains a `"record"` branch: object with non-empty string keys and
   non-empty string values; empty string values are silently dropped (clear semantics).
3. `ompSettingsYaml` emits `agentModelOverrides:` under the `task:` section.

## Validation rules

- Value must be a plain object (not array, not null) → throw if not.
- Each key: non-empty string (any agent name, including user-defined) → accept.
- Each value: non-empty string → keep; empty string → drop; non-string → throw.

## UI

Inside the existing "Task Subagents" card, below the recursion depth row. Loads omp model
list async; renders one `SettingsMenuSelect` per bundled agent; gracefully omits model options
when sidecar unavailable.

## Boundary tests (new)

- Unknown agent name accepted.
- Empty string value clears that entry.
- Non-string value rejects.
- Empty-object value accepted (clears all overrides).
- Overlay YAML emits `agentModelOverrides` under `task:` section.
