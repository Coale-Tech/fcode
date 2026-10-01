# DAP Panel — Breakpoints + Run Control

## Goal
Let users add/remove breakpoints and issue run-control commands (continue,
step over/in/out, pause, terminate) from the DAP session panel.

## Channel
**Prompt-path only.** `rpc-types.ts` exposes no `run_tool` or `invoke_tool`
command (evidence: `omp/packages/coding-agent/src/modes/rpc/rpc-types.ts`,
`RpcCommand` union, exhaustive). DAP sessions live inside omp's `DebugTool`
state machine, inaccessible from the `bash` RPC. The only mutation channel is
`agentPrompt` → omp `prompt` → LLM turn → `debug` tool call.

Prompt format: `[debug:<action>] file="..." line=N condition="..."`.

## Reducer changes
- New state: `breakpoints: ReadonlyMap<string, DapBreakpoint>` (key `file:line`)
  and `pendingCalls: ReadonlyMap<string, { action, file, line }>`.
- New actions: `bp_add_optimistic`, `bp_remove_optimistic`, `debug_tool_start`.
- `tool_result` extended with optional `toolCallId` + `isError` for reconciliation.

## Optimistic flow
1. User submits add-bp form → `bp_add_optimistic` (pending=true) + `agentPrompt`.
2. Agent fires `tool_start` → `debug_tool_start` stores `callId→{file, line}`.
3. Agent fires `tool_end` → `tool_result` reconciles from `details.breakpoints`.
4. Error path: `isError=true` + `set_breakpoint` → removes the optimistic bp.

## Limit
Run-control buttons are disabled unless a session is active/stopped.
Because the channel is a full LLM turn, each action takes 1–3 s (model round-trip).
