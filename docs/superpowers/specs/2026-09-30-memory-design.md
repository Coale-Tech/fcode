# Agent memory in Fcode (Mnemopi + Hindsight) — Design

Status: draft for review. Depends on [vendor-omp](2026-09-30-vendor-omp-design.md) (landed): changes below are ordinary edits under `omp/`.

## Problem

Fcode has only user-written project notes (kv `projectMemory`, 32 KB cap, injected by `agent-runtime/src/project-memory-prompt.ts`). omp already ships two memory backends (`memory.backend`: `mnemopi`, `hindsight`) but Fcode neither configures them, surfaces them, nor monitors them.

## Goals

1. User picks a backend (Mnemopi local default, Hindsight connect-only) in Settings.
2. A **Memory** Settings page that continuously shows backend health.
3. All memory LLM work uses the **active session model** (user requirement).
4. Later phases: mental-model/knowledge pages, bank mission, Frappe bench bootstrap.

Non-goals: managed local Hindsight server (later); replacing project notes (stay; complementary).

## Design

### 1. omp changes (`omp/`)
- `mnemopi.llmMode` gains `"session"` (enum today: `none|smol|remote`, default `smol`; resolution in `mnemopi/backend.ts` ~L535–560). `session` resolves the LLM from the running session's current model instead of `resolveRoleChain("memory",…)`. Default stays `smol` for the CLI; Fcode's overlay sets `session`.
- New RPC command `get_memory_status` → returns `MemoryBackendStatus` (`memory-backend/types.ts`: backend, active, writable, searchable, scope, retainBank, recallBanks, working/episodic/triple counts, lastMemory, lastRecall) plus `error?: string` and `latencyMs`. Added to `rpc-types.ts` next to `get_state`. Calls `backend.status()`; never throws — failures become `error`.
- Hindsight `status()` must probe reachability (URL + token) and report `error` on failure. Health/bank endpoints are unverified: confirm against the Hindsight client in `omp/` before implementing; if no cheap probe exists, use the bank-list call.

### 2. Config flow
Fcode host kv namespace `memory` → `makeOmpOverlay` (`packages/omp-bridge/src/bridge.ts`) writes into `omp-overlay.yml`: `memory.backend`, `mnemopi.llmMode: session`, Hindsight `url`, `bank`. Token via host `secrets.set` (never in overlay; passed by env to the omp child). Changing backend restarts the omp session (same path as other overlay changes).

### 3. Health monitor
`apps/desktop/electron/main/memory-health.ts`: polls `get_memory_status` per active session — 15 s while the Memory page is open, 60 s otherwise. States: `off` (backend none), `starting`, `ok`, `degraded` (active but not writable/searchable, or latency > 2 s), `error` (`error` set or 3 consecutive poll failures). Pushed to the renderer as an event following `IPC.event.benchLog` in `electron/main/ipc/bench-ipc.ts`. A sidebar badge shows the state colour outside Settings.

### 4. UI
New `memory` `SettingsTabId` in the Agent group (`src/lib/settings-search.ts`): backend selector, Hindsight URL/token/bank fields with Test button, status card (state, counts, last memory, last recall, latency, error text), link to project notes dialog. Espresso tokens only.

### 5. Later phases (separate plans)
Mental-model pages, bank mission, bench bootstrap (seed memory from bench apps/DocTypes on first open).

## Errors
Hindsight unreachable → `error` state with message; agent turns still run (memory hooks already fail soft in omp). Bad token → `error`, Settings shows re-enter prompt. Backend switch failure → revert kv value, toast.

## Testing
- omp: unit test `llmMode: session` resolves session model; `get_memory_status` returns error rather than throwing when backend throws.
- Bridge: overlay contains expected keys per backend; token absent from overlay file.
- Monitor: state machine table test (ok→degraded→error→ok) with fake status source.
- Smoke: run built omp with Mnemopi, call `get_memory_status`, expect `active:true`. Hindsight only against a real/mock HTTP server.

## Open questions
1. Resolved: Hindsight probe. `omp/packages/coding-agent/src/hindsight/client.ts` has no health call. Probe `GET /v1/default/banks/{bank}/memories/list?limit=1` (~L373) with a 2 s timeout; latency and HTTP error feed `latencyMs`/`error`. A 404 for the bank means reachable but bank missing (`degraded`; `createBank` PUT exists to fix it).
2. Resolved: `AgentSession.runEphemeralTurn` (`session/agent-session.ts` ~L9778) runs on the session's current model, does not modify session history or persisted state, and does not block a main turn. It snapshots the whole history unless `history` is passed, so memory extraction must pass a bounded `history` and `maxContextBytes`. **Usage/cost accounting was silently omitted** — ephemeral turns never called `authStorage.usage.observe`, so broker deployments did not attribute their token burn. Fixed: `usage.observe` is now called after the done event, following the same pattern as the main turn handler (L3618). Test: `test/rpc-get-memory-status.test.ts` `runEphemeralTurn usage accounting`.
