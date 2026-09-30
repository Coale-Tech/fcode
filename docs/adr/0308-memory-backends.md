# ADR 0308: Memory backends — Mnemopi default, Hindsight connect-only, session-model LLM

- Status: Accepted for implementation
- Date: 2026-09-30
- Deciders: Fcode core
- Spec: [2026-09-30-memory-design](../superpowers/specs/2026-09-30-memory-design.md)

## Context

Fcode has only user-written project notes (kv `projectMemory`, 32 KB cap, injected at prompt time). omp already ships two memory backends — `mnemopi` (local SQLite + vector store) and `hindsight` (remote HTTP service) — but Fcode neither configures them, surfaces them, nor monitors them. The project notes stay; memory is complementary.

## Decision

1. **Mnemopi is the default backend.** It requires no external service and runs entirely in the omp child process. Hindsight is connect-only (no managed local server in this phase).
2. **`mnemopi.llmMode` gains a `"session"` value** (beside the existing `none | smol | remote`). When set, memory extraction resolves the LLM from the running session's current model (`AgentSession.runEphemeralTurn`) instead of the dedicated `memory` role chain. Fcode's `makeOmpOverlay` always writes `mnemopi.llmMode: session` so memory work uses the model the user already paid for.
3. **Config flows through the host kv namespace `memory`** into `omp-overlay.yml` (written by `packages/omp-bridge/src/bridge.ts`). Keys: `memory.backend`, `mnemopi.llmMode: session`, Hindsight `url` and `bank`. The Hindsight token is passed as an env variable (`HINDSIGHT_TOKEN`) — never written to the overlay file on disk. Changing the backend restarts the omp session, following the same path as other overlay changes.
4. **A new `get_memory_status` RPC command** returns `MemoryBackendStatus` (backend, active, writable, searchable, scope, bank counts, last-memory and last-recall timestamps, `latencyMs`) plus an optional `error` string. It never throws — backend failures become `error`.
5. **Hindsight probe** uses `GET /v1/default/banks/{bank}/memories/list?limit=1` with a 2 s timeout. A 404 for the bank means reachable but bank missing (`degraded`; `createBank` can fix it). Non-2xx or network error becomes `error`.
6. **A poll loop in Electron main** (`apps/desktop/electron/main/memory-config.ts`) drives the health monitor: 15 s while the Memory settings page is open, 60 s otherwise. States: `off` (backend `none`), `starting`, `ok`, `degraded` (active but not writable/searchable, or latency > 2 s), `error` (error set or 3 consecutive poll failures). Results are pushed to the renderer as IPC events; a sidebar badge shows the state colour.
7. **A Memory tab in Settings** (Agent group) shows: backend selector, Hindsight URL/token/bank fields with Test button, status card (state, counts, last memory, last recall, latency, error text), and a link to the project notes dialog. Espresso design tokens only.

## Consequences

- omp's `mnemopi/backend.ts` gains a `session` branch; the CLI default (`smol`) is unchanged.
- The overlay writer must strip the Hindsight token key before serialising to YAML.
- Memory turns run on the session model and do not appear in session history (ephemeral turns); usage accounting follows omp's existing ephemeral-turn path.
- Managed local Hindsight server, mental-model pages, bank-mission, and bench-bootstrap seeding are deferred to later phases.

## Alternatives

- **Always use `smol` / role-chain LLM for memory:** rejected — user requirement is that memory work uses the active session model.
- **Single backend only (Mnemopi):** rejected — Hindsight support keeps enterprise/team setups viable without architecture changes later.
- **Token in overlay file:** rejected — overlay is written to disk; secrets must not be in files outside the OS keychain / env.
