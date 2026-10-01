# Spec: Subagents View (feat/subagents-view)

## Goal
Surface omp's live subagent registry in the chat view and let users read each subagent's message history.

## Rows covered
- `get_subagents` — IPC bridge to query the current subagent list
- `get_subagent_messages` — IPC bridge to fetch one subagent's conversation
- `subagent_events` — forward subagent_event frames alongside existing lifecycle/progress
- `irc_message` — forward as a quiet system transcript line (simple shape)

## Bridge changes (packages/omp-bridge/src/bridge.ts)
- Add `omp.subagents.list` → `get_subagents` in `handleHostFrame`
- Add `omp.subagents.messages` → `get_subagent_messages` in `handleHostFrame`
- Remove `irc_message` from `DROP_EVENTS`; emit as system message with text content
- Forward `subagent_event` frames: relay the inner `payload.event` as `agent.event` tagged with `subagentId` so the renderer can attribute it

## Shared (packages/shared/src/types/omp.ts + protocol.ts)
- `OmpSubagentSnapshot` — {id, index, agent, status, task?, description?, lastUpdate}
- `OmpSubagentListResult` — {subagents: OmpSubagentSnapshot[]}
- `OmpSubagentMessagesResult` — opaque AgentMessage[] wrapper
- IPC channels: `ompSubagentList`, `ompSubagentMessages`

## Renderer (apps/desktop/src)
- `lib/omp-subagents.ts` — pure reducer + types for live subagent state
- `features/chat/transcript/OmpSubagentsList.tsx` — compact list widget
  - Populated by `useOmpSubagents` hook combining `get_subagents` (initial) + agent.event tool lifecycle
  - Status badge, agent name, short task description, running/done count
  - Click row → popover with `get_subagent_messages` rendered via existing MessageRow
- i18n keys: `chat.ompSubagents`, `chat.ompSubagentsLoading`, `chat.ompSubagentsEmpty`

## Test
`test/omp-subagents-reducer.test.mjs` — boundary test: event ordering, unknown id dropped, completion after snapshot
