# Session Data (feat/session-data)

**Date:** 2026-10-02  
**Scope:** Surface omp session-level RPCs and events missing from Fcode.

## What gets built

| Feature | RPC/event | Surface |
|---|---|---|
| Transcript export | `export_html` | Conversation menu "Export transcript…" → native save dialog |
| Copy last reply | `get_last_assistant_text` | Conversation menu "Copy last reply" |
| Handoff | `handoff` | Conversation menu "Create handoff" (ai-memory) |
| Set todos | `set_todos` | IPC `ompSessionSetTodos` (API only; UI reads from events) |
| Todo panel | `todo_reminder` / `todo_auto_clear` events | Float panel below transcript |
| Session tree | `get_tree` / `get_entries` / `switch_session` / `get_branch_messages` | Work panel "Session history" tab |

## What's skipped and why

- `get_messages_page` — no real feature needs it; `get_messages` paging already handled internally by omp
- `follow_up` / `abort_and_prompt` — out of scope
- Full handoff UI — `handoff` just triggers omp's ai-memory integration; the saved path is shown as a toast

## Stack

Each feature follows the PR #56–#63 pattern:
`omp RPC → bridge route → packages/shared protocol.ts+types/omp.ts → omp-ipc.ts → api.ts → UI`

Todo events: removed from `DROP_EVENTS` in bridge; forwarded as `agent.event`; events-slice updates `sessionTodoPhases` state.

Session tree: new `"session-tree"` work panel tab kind; `OmpSessionTreeTab` component fetches `get_entries` on mount, renders as flat list grouped by branch; clicking an entry calls `switch_session`.

## Boundary tests

- `todoReducer`: clear + update from flat todos
- Export filename sanitisation (path segments stripped)
