# Memory core (Mnemopi + Hindsight + health monitor) — Implementation Plan

> Execute task by task; `- [ ]` checkboxes. Do not commit to `main`. Branch from `docs/memory-spec`.

**Goal:** Fcode users choose Mnemopi (local) or Hindsight (URL+token) memory in Settings; all memory LLM work uses the active session model; a Memory settings page continuously shows backend health.

**Architecture:** omp gets two native changes (`mnemopi.llmMode = "session"`, `get_memory_status` RPC). `omp-bridge` writes memory settings into the overlay and passes the Hindsight token via env. The Electron main process runs a health poller over `get_memory_status` and pushes state events to a new Memory settings tab.

**Tech Stack:** TypeScript (omp under bun, bridge under vitest, renderer React), Electron IPC, node:test for smoke.

**Spec:** `docs/superpowers/specs/2026-09-30-memory-design.md`

## Global Constraints
- Memory LLM calls use the active session model (`session` mode); default for plain omp CLI stays `smol`.
- Hindsight: connect-only (URL + token). Token never written to the overlay file or logs.
- Hindsight probe: `GET /v1/default/banks/{bank}/memories/list?limit=1`, 2 s timeout; 404 = reachable, bank missing → `degraded`.
- `runEphemeralTurn` snapshots full history unless `history` is passed → memory extraction MUST pass bounded `history` and `maxContextBytes`.
- Espresso tokens only in UI; all strings through i18n.
- After editing `omp/`: `git add omp` and rebuild (`CI=1 node scripts/build-omp.mjs`) or the staleness test fails.
- Do not touch `main`, `PI-Desktop-worktrees/`.

## Review Focus
1. Token leakage (overlay file, logs, IPC events).
2. `session` mode when no model is active / model changes mid-extraction (`runEphemeralTurn` throws → must degrade to no-LLM, not crash).
3. `get_memory_status` never throws and never blocks a turn.
4. Poller leaks (timers after session close / window close).
5. Backend switch restarts omp cleanly and reverts kv on failure.

---

## Task 1: omp `llmMode: "session"`

**Files:** `omp/packages/coding-agent/src/mnemopi/config.ts` (type L34), `mnemopi/settings.ts` (enum L216–), `mnemopi/backend.ts` (L535–600), test beside `mnemopi/` (find existing `*.test.ts` with `ls omp/packages/coding-agent/src/mnemopi | grep test`).
**Interfaces:** `MnemopiLlmMode = "none" | "smol" | "remote" | "session"`; provider builder receives `session: AgentSession`.

- [ ] 1.1 Failing test: with `llmMode: "session"` and a fake `session.runEphemeralTurn` returning `{ replyText: "ok" }`, the provider's `llm.complete("p")` resolves `"ok"`, passes `tools:false`, a `history` array (not undefined) and `maxContextBytes`; when `runEphemeralTurn` throws, `complete` resolves `null` and logs a warning.
- [ ] 1.2 Add `"session"` to `MnemopiLlmMode` and to the `values` + `options` in `settings.ts` (label "Session model", description "Use the model of the current chat session").
- [ ] 1.3 In `backend.ts` before the `try { resolveRoleChain(...` block add:
```ts
if (config.llmMode === "session") {
	return {
		...base,
		llm: {
			complete: async (prompt, opts) => {
				try {
					const r = await session.runEphemeralTurn({
						promptText: prompt,
						history: [],
						tools: false,
						maxTokens: opts?.maxTokens,
						maxContextBytes: 256 * 1024,
						signal: typeof opts?.timeout === "number" && opts.timeout > 0 ? AbortSignal.timeout(opts.timeout) : undefined,
					});
					return r.replyText ?? null;
				} catch (e) {
					logger.warn("Mnemopi: session-model completion failed; continuing without LLM.", { error: String(e) });
					return null;
				}
			},
		},
	};
}
```
  Match the real `llm` option shape used by the smol branch just below (`complete` signature at ~L565) and the real `EphemeralTurnOptions` field names (`session/agent-session.ts` ~L9778 and its type); thread `session` into the builder from `start()` (`MemoryBackendStartOptions.session`).
- [ ] 1.4 Read `runEphemeralTurn` result/usage handling (`agent-session.ts` after L9883) and record in the spec whether ephemeral usage counts toward session totals; update spec open question 2.
- [ ] 1.5 Run: `cd omp && bun test packages/coding-agent/src/mnemopi` → pass. Commit `feat(omp): mnemopi.llmMode=session uses the active session model`.

## Task 2: omp `get_memory_status` RPC

**Files:** `modes/rpc/rpc-types.ts` (command union near L38; response union near L268), `modes/rpc/rpc-mode.ts` (`case "get_state"` L1273), `modes/rpc/rpc-client.ts` if it wraps commands (`grep -n get_state modes/rpc/rpc-client.ts`), `memory-backend/runtime.ts`.
**Interfaces:** command `{ id?: string; type: "get_memory_status" }`; response `{ type:"response"; command:"get_memory_status"; success:true; data: MemoryBackendStatus & { latencyMs: number; error?: string } }`.

- [ ] 2.1 Failing test (rpc-mode test file, follow existing pattern for `get_state`): status from a backend whose `status()` throws returns `success:true` with `data.error` set and `data.active === false`.
- [ ] 2.2 Add the types. In `rpc-mode.ts`:
```ts
case "get_memory_status": {
	const t0 = performance.now();
	try {
		const s = await createMemoryRuntimeContext({ session }).status();
		return success(id, "get_memory_status", { ...s, latencyMs: Math.round(performance.now() - t0) });
	} catch (e) {
		return success(id, "get_memory_status", {
			backend: "off", active: false, writable: false, searchable: false,
			latencyMs: Math.round(performance.now() - t0), error: e instanceof Error ? e.message : String(e),
		});
	}
}
```
  Use the file's real response helper (mirror `get_state`) and the real context type accepted by `createMemoryRuntimeContext`.
- [ ] 2.3 `bun test` the rpc-mode tests; commit `feat(omp): get_memory_status rpc`.

## Task 3: Hindsight status probe

**Files:** `omp/packages/coding-agent/src/hindsight/backend.ts` (`status`), `hindsight/client.ts` (~L373 `listMemories` style call).

- [ ] 3.1 Failing test with a local `Bun.serve` mock: 200 → `active/searchable/writable true`; 404 for bank → `active:true, message:"bank missing"`; connection refused → throws error string surfaced (RPC layer turns it into `error`); 2 s timeout enforced (server that never answers).
- [ ] 3.2 Implement `status()` using the client's list call with `limit=1` and `requestTimeoutMs` capped at 2000; never include the token in messages.
- [ ] 3.3 `bun test packages/coding-agent/src/hindsight`; commit `feat(omp): hindsight status probe`.

## Task 4: Bridge — overlay + token env + status call

**Files:** `packages/omp-bridge/src/bridge.ts` (`OverlayOptions` L76, `makeOmpOverlay` L124, `writeOmpOverlay` L157, spawn at ~L1103 and env at spawn site), `bridge.test.ts` (overlay tests at L107+).
**Interfaces:**
```ts
export interface MemoryOverlayConfig {
  backend: "off" | "mnemopi" | "hindsight";
  hindsightUrl?: string;
  hindsightBank?: string;
}
// OverlayOptions gains: memory?: MemoryOverlayConfig
// Bridge gains: getMemoryStatus(sessionId): Promise<MemoryStatus>
```
- [ ] 4.1 Failing tests: (a) `makeOmpOverlay({memory:{backend:"mnemopi"}})` contains `memory:\n  backend: mnemopi` and `mnemopi:\n  llmMode: session`; (b) hindsight config adds `hindsight:\n  apiUrl: "<url>"\n  bankId: "<bank>"` and never any token; (c) `backend:"off"` emits `memory:\n  backend: off`; (d) no `memory` key when option absent (existing tests unchanged). Verify real YAML nesting keys against omp settings ids: `memory.backend`, `mnemopi.llmMode`, `hindsight.apiUrl`, `hindsight.bankId`.
- [ ] 4.2 Append lines in `makeOmpOverlay` (YAML by hand, quote user strings with `JSON.stringify`).
- [ ] 4.3 At spawn: if hindsight token provided, set env `HINDSIGHT_API_TOKEN` (confirm exact env name from the handle at `hindsight/settings.ts:31`) — env only, never overlay.
- [ ] 4.4 Add `getMemoryStatus` sending `{type:"get_memory_status"}` through `ompCall`; unit test with the fake omp used elsewhere in `bridge.test.ts`.
- [ ] 4.5 `pnpm -C packages/omp-bridge test`; commit `feat(omp-bridge): memory overlay, token env, status call`.

## Task 5: Host — settings kv, health poller, IPC

**Files (create/modify, confirm by reading neighbors):** `apps/desktop/electron/main/memory-health.ts` (new), `apps/desktop/electron/main/ipc/memory-ipc.ts` (new, pattern from `ipc/bench-ipc.ts`), IPC channel constants (`IPC.event.benchLog` definition site), where the bridge overlay is built from settings (`electron/main/runtime/session-launch.ts`), `secrets.set` usage for the token.
**Interfaces:**
```ts
export type MemoryHealthState = "off" | "starting" | "ok" | "degraded" | "error";
export interface MemoryHealth { state: MemoryHealthState; status?: MemoryStatus; error?: string; checkedAt: number }
export function classify(prev: {fails:number}, res: MemoryStatus | Error | null, backendOff: boolean): { state: MemoryHealthState; fails: number }
```
Rules: backendOff → `off`; first poll pending → `starting`; error/`status.error` → `error` after 3 consecutive failures else keep previous; `!writable || !searchable || latencyMs>2000 || message includes "bank missing"` → `degraded`; else `ok`.

- [ ] 5.1 Failing table test for `classify` (ok→degraded→error(3 fails)→ok; off short-circuit).
- [ ] 5.2 Implement `memory-health.ts`: one timer per active session, 15 s while renderer reports Memory page open (`memory:setWatching`), else 60 s; clear on session close and app quit; emits `IPC.event.memoryHealth`.
- [ ] 5.3 Handlers: `memory:get` / `memory:set` (kv namespace `memory`; token to `secrets`), `memory:test` (one-shot status with candidate config in a throwaway omp run — reuse launch helper; if too heavy, test = save + restart + poll once and revert on `error`).
- [ ] 5.4 Backend switch = restart omp session (same path as other overlay changes); on failure revert kv, return error.
- [ ] 5.5 `pnpm -C apps/desktop test` for new test; commit `feat(desktop): memory health monitor and IPC`.

## Task 6: UI — Memory settings tab

**Files:** `apps/desktop/src/lib/settings-search.ts` (`SettingsTabId`, `SETTINGS_NAV`, group `agent`), new `apps/desktop/src/components/settings/MemoryTab.tsx` (mirror an existing tab's structure, e.g. how `ProjectMemoryDialog.tsx` is opened), i18n keys in `packages/i18n` (all locales required by its test), sidebar badge component near the settings nav entry.

- [ ] 6.1 Add `"memory"` to `SettingsTabId` and nav entry (Agent group, keywords: memory, mnemopi, hindsight, recall).
- [ ] 6.2 `MemoryTab`: backend radio (Off / Mnemopi local / Hindsight), Hindsight fields (URL, token — write-only, bank) + Test button, status card (state chip, backend, counts, last memory, last recall, latency, error), "Project notes" button opening `ProjectMemoryDialog`. Subscribe to `memoryHealth` event; call `memory:setWatching(true)` on mount, `false` on unmount.
- [ ] 6.3 Badge on the Memory nav entry: green ok / amber degraded / red error / none off.
- [ ] 6.4 i18n strings for all keys; run `pnpm -C packages/i18n test`.
- [ ] 6.5 Render check in the dev app (light + dark): each state visible using a debug override or fake status; capture screenshot. Commit `feat(desktop): Memory settings tab`.

## Task 7: Smoke, docs, PR

- [ ] 7.1 Rebuild omp: `git add omp && CI=1 node scripts/build-omp.mjs`; run `node --test apps/desktop/test/omp-protocol-smoke.test.mjs`.
- [ ] 7.2 Live: spawn built omp with an overlay `memory.backend: mnemopi`, negotiate v2, send `get_memory_status` → `active:true`. Save the script as `apps/desktop/test/memory-status-smoke.test.mjs` (skips when the binary is missing; 120 s timeout like the handshake test).
- [ ] 7.3 Hindsight against a mock server: covered by Task 3 unit tests; live Hindsight only if the user supplies a URL/token.
- [ ] 7.4 Docs: CHANGELOG entry, `docs/fcode/README.md` memory section, new ADR (next free number: `ls docs/adr | sort | tail -1`, add index row in `docs/adr/README.md`), tick spec.
- [ ] 7.5 Full checks for touched packages; `node scripts/check-legal.mjs`; push branch and open PR.

## Acceptance
- Mnemopi selected → Memory tab shows `ok`, counts, latency; agent recalls across sessions.
- Hindsight with wrong URL → `error` with message within 3 polls; correct → `ok`; missing bank → `degraded`.
- `mnemopi.llmMode=session`: memory extraction uses the chat model; no separate model config needed.
- Token absent from `omp-overlay.yml`, logs and IPC events.
- Staleness guard green after rebuild; all new tests pass.

## Self-review
- Spec coverage: §1 omp (T1–T3), §2 config flow (T4–T5), §3 monitor (T5), §4 UI (T6), tests (each task + T7).
- Names to confirm at edit time are called out per step (real `llm` option shape, response helper, env var name, IPC constant site); each says where to read them.
- Later phases (mental models, mission, bench bootstrap, managed Hindsight) are separate plans.
