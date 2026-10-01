# Collab / Share Panel — spec

> 2026-10-02 · feat/collab-panel

## Goal
Surface omp's `/share` (snapshot) and collab settings from Fcode's session pane.

## Feasibility audit

| Row | omp source | Feasible via RPC? | Path |
|---|---|---|---|
| `/share` | `slash-commands/builtin-collaboration.ts` has `handle` | ✅ yes | prompt → `command_output` frame |
| `/collab start/stop` | `handleTui` only (no `handle`) | ❌ no | TUI-only; ACP returns `false`, falls to LLM |
| Collab guest join | `handleTui` only | ❌ no | TUI-only |
| Collab participants | in-memory `CollabHost.participants` | ❌ no | No RPC getter |
| Collab settings | `collab.*` keys | ✅ already | `omp-settings-sections.tsx` Collab card |

Live collab is TUI-only in this omp build. Panel surfaces snapshot share only.

## What ships

1. **Bridge**: handle `command_output` frames; add `omp.share` RPC case.
2. **IPC**: `ompShare` channel → IPC handler → `api.ompShare()`.
3. **Reducer**: `ompCollabReducer` — pure state machine for share state (`idle | loading | url | error`).
4. **Panel**: `OmpCollabPanel` below the transcript (same position as `OmpSubagentsList`).
   - "Share snapshot" button → triggers `/share`, shows resulting URL + copy button.
   - Settings link → opens Settings > AI tab > Collab section.
   - Note about live collab via `omp collab` CLI.
5. **i18n**: 9 locale keys.
6. **Test**: boundary test for `ompCollabReducer` — state transitions + URL extraction.

## Wire: `/share` via prompt path

```
Fcode → bridge "omp.share" → ompCall({ type:"prompt", message:"/share" })
omp → command_output { text: "Share URL: https://..." }  ← bridge captures this
omp → response { agentInvoked: false }  ← ompCall resolves
bridge → respond(hostId, { url, text })
```

`agentInvoked: false` = local slash command; `command_output` arrives before ack.
