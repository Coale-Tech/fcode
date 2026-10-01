# Spec: editor UI request + set_editor_text (2026-10-01)

## Goal
Wire two previously-refused omp `extension_ui_request` methods:
- `editor` — multi-line text prompt dialog (user edits text, submits or cancels)
- `set_editor_text` — inject text into the active Composer draft (fire-and-forget)

## editor
omp sends `{ method: "editor", id, title, prefill? }`.

**Mapping**: `asktool_request` with one question: `{ question: title, options: [],
multiline: true, defaultText: prefill }`. Queued via existing `pendingAsks`.

**UI**: AskToolCard detects `question.multiline` and renders a `<textarea>` instead
of option buttons, pre-filled with `defaultText`. Submit sends `[[text]]`;
Decline/Skip sends `[null]` → `cancelled: true` to omp.

**Response path**: same `asktool.resolve` → `serializeAskAnswers` → bridge sends
`extension_ui_response { id, value }` or `{ id, cancelled: true }`.

## set_editor_text
omp sends `{ method: "set_editor_text", id, text }`. Fire-and-forget; no omp response.

**Mapping**: new `MappedSetEditorText { type: "set_editor_text"; sessionId; text }`.
Bridge emits `sidecar.ext_ui { kind: "editor_text"; sessionId; text }`.
Composer listens via `api.onSidecarExtUi` and calls `setValue(event.text)`.

## Type changes
- `AskToolQuestion`: add `multiline?: boolean; defaultText?: string`
- `SidecarExtUiEvent`: add `{ kind: "editor_text"; sessionId: string; text: string }`

## New i18n keys (all 9 locales)
- `editor.title` — card header when method = editor
- `editor.placeholder` — textarea placeholder

## Acceptance
- `mapExtensionUiRequest` tests: submit path, cancel/null, set_editor_text mapping
- tsc clean in apps/desktop
- UI: textarea shows in AskToolCard when multiline; Composer text updated on editor_text event
