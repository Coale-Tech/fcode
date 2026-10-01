# omp ↔ Fcode Parity Matrix

> Generated: 2026-09-30  
> Scope: every user-facing omp capability vs whether/where Fcode surfaces it.  
> Columns: **Capability** | **omp source** | **Fcode surface** | **Status** | **Note**  
> Status values: `surfaced` = fully wired end-to-end · `partial` = wired but incomplete · `missing` = no Fcode surface

---

## 1. RPC Commands (stdin to omp)

### 1.1 Protocol

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `negotiate_protocol` | `omp/packages/coding-agent/src/modes/rpc/rpc-types.ts:26` | `packages/omp-bridge/src/bridge.ts:769` | surfaced | Sent automatically on `ready` frame; v2 required for large results |

### 1.2 Prompting

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `prompt` | `rpc-types.ts:29` | `bridge.ts:685` via `agent.prompt` handler | surfaced | Core chat turn; turnId propagated |
| `steer` | `rpc-types.ts:30` | `bridge.ts:454` via `agent.steer` | surfaced | Live steering during agent run |
| `follow_up` | `rpc-types.ts:31` | none | missing | Never sent by bridge; prompt path is used for all turns |
| `abort` | `rpc-types.ts:32` | `bridge.ts:463` via `agent.stop` / `agent.abort` | surfaced | Two callers: orderly stop and fire-and-forget abort |
| `abort_and_prompt` | `rpc-types.ts:33` | none | missing | Not bridged; no UI equivalent |
| `new_session` | `rpc-types.ts:34` | `bridge.ts:636` internal to `ompPrompt` | surfaced | Auto-managed per Fcode session ID |
| `open_session` | `rpc-types.ts:35` | `bridge.ts:634` internal to `ompPrompt` | surfaced | Resumes from stored session dir; falls back to new on GC |

### 1.3 State

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `get_state` | `rpc-types.ts:38` | `bridge.ts:489` via `agent.getStatus`; `bridge.ts:575` via `omp.state` | surfaced | Used for isRunning check and context usage display |
| `set_fast_mode` | `rpc-types.ts:39` | none | missing | No Fcode UI toggle |
| `get_available_commands` | `rpc-types.ts:40` | `bridge.ts:571` via `omp.commands.list` | surfaced | Merged into composer autocomplete (`use-composer-autocomplete.ts:136`) |
| `get_entries` | `rpc-types.ts:41` | none | missing | History entry access not bridged |
| `get_tree` | `rpc-types.ts:42` | none | missing | Session tree not bridged |
| `set_todos` | `rpc-types.ts:43` | none | missing | No todo/phase UI in Fcode |
| `set_host_tools` | `rpc-types.ts:44` | `bridge.ts:947` auto on handshake | surfaced | Registers `fcode_bench_execute`, `fcode_bench_run`, `fcode_canvas` tools |
| `set_host_uri_schemes` | `rpc-types.ts:45` | none | missing | Not bridged; no custom URI scheme host |
| `set_subagent_subscription` | `rpc-types.ts:46` | `bridge.ts:677` auto on first prompt | surfaced | Level `progress` subscribed once per omp process |
| `set_event_filter` | `rpc-types.ts:47` | none | missing | Not bridged |
| `get_subagents` | `rpc-types.ts:48` | `omp-ipc.ts` via `omp.subagents.list` → `api.ompSubagentList` → `OmpSubagentsList.tsx` | surfaced | Initial snapshot for the compact subagents list |
| `get_subagent_messages` | `rpc-types.ts:49` | `omp-ipc.ts` via `omp.subagents.messages` → `api.ompSubagentMessages` → popover in `OmpSubagentsList.tsx` | surfaced | Read-only message view on row click |

### 1.4 Model

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `set_model` | `rpc-types.ts:52` | `bridge.ts:562` via `omp.models.set` → `apps/desktop/src/features/chat/composer/hooks/useComposerModelMenu.ts:369` | surfaced | Model switcher in composer model menu for omp sessions |
| `cycle_model` | `rpc-types.ts:53` | none | missing | No keyboard shortcut to cycle models in Fcode |
| `get_available_models` | `rpc-types.ts:54` | `bridge.ts:560` via `omp.models.list` → `useComposerModelMenu.ts:289` | surfaced | Populates omp model groups in model picker |

### 1.5 Thinking

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `set_thinking_level` | `rpc-types.ts:57` | `bridge.ts:568` via `omp.thinking.set` → `useComposerModelMenu.ts:111` | surfaced | Thinking level picker in model menu |
| `cycle_thinking_level` | `rpc-types.ts:58` | none | missing | No keyboard shortcut to cycle thinking in Fcode |
| `get_available_thinking_levels` | `rpc-types.ts:59` | `bridge.ts:565` via `omp.thinking.levels` → `useComposerModelMenu.ts:294` | surfaced | Populates thinking level menu |

### 1.6 Queue Modes

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `set_steering_mode` | `rpc-types.ts:62` | none | missing | omp setting `steeringMode` not bridged |
| `set_follow_up_mode` | `rpc-types.ts:63` | none | missing | omp setting `followUpMode` not bridged |
| `set_interrupt_mode` | `rpc-types.ts:64` | none | missing | omp setting `interruptMode` not bridged |

### 1.7 Compaction

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `compact` | `rpc-types.ts:67` | `bridge.ts:478` via `agent.compact` → `apps/desktop/src/lib/commands.ts:17` via `builtin.agent.compact` | surfaced | Triggered from context ring / command palette |
| `set_auto_compaction` | `rpc-types.ts:68` | none | missing | No Fcode UI toggle; auto-compaction state opaque |

### 1.8 Retry

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `set_auto_retry` | `rpc-types.ts:71` | none | missing | Not bridged |
| `abort_retry` | `rpc-types.ts:72` | none | missing | Not bridged |

### 1.9 Bash (direct shell exec)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `bash` | `rpc-types.ts:75` | none | missing | Direct RPC bash call not used; bash runs via agent tool |
| `abort_bash` | `rpc-types.ts:76` | none | missing | Not bridged |

### 1.10 Session

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `get_session_stats` | `rpc-types.ts:79` | none | missing | Token/cost stats not surfaced |
| `export_html` | `rpc-types.ts:80` | none | missing | No transcript export UI |
| `switch_session` | `rpc-types.ts:81` | none | missing | Sessions managed via new/open; no direct switch call |
| `branch` | `rpc-types.ts:82` | `bridge.ts:583` via `omp.session.branch` → `apps/desktop/src/lib/api.ts:1648` | surfaced | Branch entry exposed in API; wired to sidebar fork gesture |
| `get_branch_messages` | `rpc-types.ts:83` | none | missing | Not bridged |
| `get_last_assistant_text` | `rpc-types.ts:84` | none | missing | Not bridged |
| `set_session_name` | `rpc-types.ts:85` | `bridge.ts:586` via `omp.session.rename` → `api.ts:1651` | surfaced | Session rename wired |
| `handoff` | `rpc-types.ts:86` | none | missing | ai-memory handoff not bridged |

### 1.11 Messages

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `get_messages` | `rpc-types.ts:89` | none | missing | Not bridged; transcript comes from event stream |
| `get_messages_page` | `rpc-types.ts:90` | none | missing | Not bridged |

### 1.12 Login / Auth

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `get_login_providers` | `rpc-types.ts:93` | `bridge.ts:578` via `omp.login.providers` → `OmpAccountsSection.tsx:18` | surfaced | Shows provider list in Settings > Models tab |
| `login` | `rpc-types.ts:94` | `bridge.ts:581` via `omp.login.start` → `OmpAccountsSection.tsx:30` | surfaced | Opens OAuth browser flow |

---

## 2. Pushed Events (stdout from omp)

### 2.1 Passthrough Events (→ `agent.event` notification)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `agent_start` | `rpc-types.ts:451` | `bridge.ts:169` → renderer events-slice | surfaced | |
| `agent_end` | `rpc-types.ts:451` | `bridge.ts:863` (field-trimmed) | surfaced | `messages` stripped; only `messageIds` forwarded |
| `turn_start` / `turn_end` | `rpc-types.ts:441` | `bridge.ts:169` | surfaced | |
| `message_start` / `message_update` / `message_end` | `rpc-types.ts:441` | `bridge.ts:169` | surfaced | `messageId` injected per RpcMessageEventFrame |
| `tool_start` / `tool_update` / `tool_end` | `rpc-types.ts:441` | `bridge.ts:179` (renamed from `tool_execution_*`) | surfaced | |
| `compaction_start` / `compaction_end` | `rpc-types.ts:451` | `bridge.ts:169` | surfaced | |
| `error` | `rpc-types.ts:451` | `bridge.ts:169` | surfaced | |
| `prompt_result` | `rpc-types.ts:164` | `bridge.ts:737` | surfaced | Abort/error mapped to `agent.event { type: "error" }` |
| `session_settled` | `rpc-types.ts:184` | none | missing | Frame silently dropped; no PI counterpart |

### 2.2 Silently Dropped Events

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `notice` | omp internal | `bridge.ts:186` | missing | System notices dropped |
| `irc_message` | omp internal | `bridge.ts:888` → `emitSystemMessage` as quiet transcript line | surfaced | Plain-text content forwarded; non-string content silently dropped |
| `todo_reminder` / `todo_auto_clear` | omp internal | `bridge.ts:186` | missing | Todo events dropped |
| `ttsr_triggered` | omp internal | `bridge.ts:186` | missing | TTSR (time-to-summarize) dropped |
| `auto_retry_start` / `auto_retry_end` | omp internal | `bridge.ts:186` | missing | Auto-retry notifications dropped |
| `retry_fallback_start` / `retry_fallback_end` | omp internal | `bridge.ts:186` | missing | Fallback notifications dropped |
| `goal_updated` | omp internal | `bridge.ts:186` | missing | Goal tracking dropped |
| `model_changed` / `thinking_level_changed` | omp internal | `bridge.ts:186` | missing | Model/thinking change notifications dropped |

### 2.3 Subagent Frames

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `subagent_lifecycle` | `rpc-types.ts:423` | `bridge.ts:962` → `agent.event { type: "tool_start"/"tool_end" }` | surfaced | Subagents surface as nested tool rows in transcript |
| `subagent_progress` | `rpc-types.ts:428` | `bridge.ts:1002` → `agent.event { type: "tool_update" }` | surfaced | Progress text shown in tool row |
| `subagent_events` subscription level | `rpc-types.ts:217` | `bridge.ts:899` → `agent.event { subagentId }` | surfaced | `subagent_event` frames relayed with inner event + subagentId; subscription stays at `progress` |

---

## 3. Extension UI Requests

| Method | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `confirm` | `rpc-types.ts:476` | `bridge.ts:944` → `ui-requests.ts:93` → PermissionCard | surfaced | Tool permission dialog |
| `select` | `rpc-types.ts:467` | `bridge.ts:844` → `ui-requests.ts:106` → AskToolCard | surfaced | Multi-option picker |
| `input` | `rpc-types.ts:480` | `bridge.ts:844` → `ui-requests.ts:107` → AskToolCard | surfaced | Free-text input |
| `notify` | `rpc-types.ts:494` | `bridge.ts:918` → system UiMessage in transcript | surfaced | |
| `open_url` | `rpc-types.ts:501` | `bridge.ts:923` → `shell.openExternal` + system message | surfaced | Browser opened; URL shown in transcript |
| `cancel` | `rpc-types.ts:493` | `bridge.ts:904` → pending map cleared | surfaced | Cancels prior pending request |
| `editor` | `rpc-types.ts:485` | `bridge.ts:912` → immediate cancelled response | partial | No editor UI; extension gets refusal instead of user input |
| `setStatus` | `rpc-types.ts:501` | `ui-requests.ts:151` (default: null) | missing | Status badge in TUI status line; no Fcode surface |
| `setWidget` | `rpc-types.ts:507` | `ui-requests.ts:151` (default: null) | missing | TUI widget area; no Fcode surface |
| `setTitle` | `rpc-types.ts:516` | `ui-requests.ts:151` (default: null) | missing | TUI window title; no Fcode surface |
| `set_editor_text` | `rpc-types.ts:517` | `ui-requests.ts:151` (default: null) | missing | Inject text into TUI composer; no Fcode surface |

---

## 4. Slash Commands and Built-in Tools

### 4.1 Slash Command Autocomplete

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| omp slash command list | `omp/packages/coding-agent/src/commands/` (50+ commands) | `apps/desktop/src/hooks/use-composer-autocomplete.ts:136` via `ompCommandsList()` | surfaced | omp commands merged with Fcode native commands in autocomplete |
| Slash command dispatch | `bridge.ts:689` (prompt path) | `apps/desktop/src/features/chat/composer/slash-dispatch.ts:57` | surfaced | Unknown slash commands pass through as prompt text to omp |
| `/compact` (builtin) | `rpc-types.ts:67` | `apps/desktop/src/lib/commands.ts:17` | surfaced | Locally dispatched via `agent.compact` |

### 4.2 Key omp Slash Commands (TUI-centric; passed as prompt text)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `/login` | `commands/login.ts` | `apps/desktop/src/components/settings/OmpAccountsSection.tsx:30` | surfaced | OAuth provider list + login button in Settings → Agent tab |
| `/models` | `commands/models.ts` | `useComposerModelMenu.ts:369` + `OmpAccountsSection.tsx` | surfaced | Model picker in composer + accounts section covers all model-related actions |
| `/skill` | `commands/skill.ts` | `OmpSkillsSection.tsx` (AI tab) + `SkillMarketPanel.tsx` (market) | partial | Installed skills panel shows id/version/scope/reveal; no search/install/publish from UI |
| `/collab` | `commands/collab.ts` | `omp-settings-sections.tsx` Collab group | partial | Collab relay/web/display-name/auto-start settings wired; no live collab UI |
| `/stats` | `commands/stats.ts` | `OmpUsageSection.tsx` (AI tab) + `ContextUsageInspector.tsx` | partial | Historical aggregates via `omp stats --json`; per-session stats in context ring |
| `/settings` | `commands/settings.ts` | partial (text → omp) | partial | Opens TUI settings panel; Fcode has its own settings page |
| `/ssh` | `commands/ssh.ts` | `RemoteHostsPage.tsx` (pi-host SSH pairing; separate system) | partial | omp SSH hosts (`~/.omp/agent/ssh-hosts.json`) are a different registry from Fcode's remote hosts |
| `/git` | `commands/git.ts` | none | missing | `omp git` is a fullscreen interactive TUI requiring a real TTY; not embeddable in Fcode without a terminal panel |
| `/worktree` | `commands/worktree.ts` | `OmpWorktreeSection.tsx` (AI tab) | partial | Lists agent worktrees under `~/.omp/wt/`; no clear/add operations from UI |
| `/share` | `commands/share.ts` | partial (text → omp) | partial | No share UI in Fcode |

### 4.3 Built-in Agent Tools

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `bash` (shell execution) | `omp/packages/coding-agent/src/tools/bash.ts` | `bridge.ts:169` tool events → transcript | surfaced | Tool events shown; permission prompt on write ops |
| `read` / `write` / `edit` | `tools/read.ts`, `write.ts` | `bridge.ts:169` tool events | surfaced | |
| `grep` / `glob` | `tools/grep.ts`, `glob.ts` | `bridge.ts:169` tool events | surfaced | |
| `browser` (Playwright) | `tools/browser.ts`, `tools/browser/` | `bridge.ts:169` tool events | partial | Events shown; no browser viewport in Fcode UI |
| `eval` (Python/JS) | `tools/eval.ts` | `bridge.ts:169` tool events | partial | Events shown; no REPL output panel |
| `debug` (DAP) | `tools/debug.ts` | `DapPanel.tsx` (from `tool_end` details) | surfaced | Read-only session panel: status, frames, variables, breakpoint count |
| `ida` (IDA Pro) | `tools/ida.ts` | `bridge.ts:169` tool events | partial | Events shown; no IDA UI |
| `computer` (computer use) | `tools/computer/` | `bridge.ts:169` tool events | partial | Events shown; no screen capture panel |
| `memory_recall` / `memory_retain` | `tools/memory-recall.ts`, `memory-retain.ts` | `bridge.ts:169` tool events | partial | Events shown; no memory management UI |
| `memory_reflect` / `memory_edit` | `tools/memory-reflect.ts`, `memory-edit.ts` | `bridge.ts:169` tool events | partial | Events shown; no memory viewer |
| `ast_edit` | `tools/ast-edit.ts` | `bridge.ts:169` tool events | surfaced | Structural edit shown as tool row |
| `task` (subagent spawn) | `omp/packages/agent/src/` | `bridge.ts:962` subagent frames | surfaced | Subagent rows in transcript via `§9` subscription |
| `think` | `tools/think.ts` | `bridge.ts:169` tool events | surfaced | Thinking block shown via message content |
| `fcode_bench_execute` | `bridge.ts:214` (host tool) | `bridge.ts:816` via `host_tool_call` | surfaced | Frappe RPC via bridge; auto-approved for read-only methods |
| `fcode_bench_run` | `bridge.ts:240` (host tool) | `bridge.ts:816` via `host_tool_call` | surfaced | Bench commands via bridge |
| `fcode_canvas` / `fcode_canvas_read` | `bridge.ts:253` (host tool) | `bridge.ts:816` via `host_tool_call` | surfaced | Build-tab WebView driving |

---

## 5. Settings Keys vs Fcode Settings Tabs

### 5.1 Models / Providers / Auth (`agent` tab)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| Model provider list | `omp/packages/coding-agent/src/config/model-registry.ts` | `apps/desktop/src/components/settings/ModelConfigPage.tsx` | surfaced | Fcode has its own native provider system; omp list fetched via `ompModelsList` |
| omp login providers | `rpc-types.ts:93` | `apps/desktop/src/components/settings/OmpAccountsSection.tsx` | surfaced | Shown in Settings > Models tab |
| Models config import | `packages/omp-bridge/src/bridge.ts:1043` `--models-config` flag | `apps/desktop/src/features/settings/import-page.tsx` | partial | Importable from Claude Code / Codex / Pi; auto-passed on spawn |

### 5.2 AI / Permissions Tab (`ai`)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| Approval mode | `bridge.ts:1042` hardcoded `--approval-mode always-ask` | `apps/desktop/src/lib/settings-search.ts:91` keyword only | partial | Fcode `permissionMode` controls native sessions only; omp is always `always-ask` |
| Thinking display mode | `omp/packages/coding-agent/src/modes/settings.ts` `display.smoothStreaming` etc. | `settings-search.ts:106` | partial | Fcode setting controls rendering; omp-native thinking settings not synced |
| Context usage display | `omp/packages/coding-agent/src/modes/settings.ts` `display.showTokenUsage` | `settings-search.ts:109` | partial | Display preference in Fcode; fed by `ompState().contextUsage` |
| Smooth streaming | `modes/settings.ts:cfgDisplaySmoothStreaming` | `settings-search.ts:103` | partial | Fcode controls renderer interpolation; omp setting not bridged |

### 5.3 Instructions Tab (`instructions`)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| Global instructions | `omp/packages/coding-agent/src/capability/instruction.ts` | `apps/desktop/src/features/settings/agent-sections.tsx:12` | surfaced | Editable in Settings; written to omp's CLAUDE.md / instructions path via overlay |

### 5.4 General Tab (`general`)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| Theme / appearance | `modes/settings.ts:cfgThemeDark/cfgThemeLight` | `settings-search.ts:62` | partial | Fcode manages Electron theme; omp TUI theme not synced |
| Network proxy | `omp/packages/ai/src/auth/` | `settings-search.ts:73` | partial | Fcode proxy setting passed to omp via env in overlay |

### 5.5 Memory Backends (no Fcode tab)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `memory.backend` selector | `omp/packages/coding-agent/src/memory-backend/settings.ts:12` | none | missing | Backend choice (off/local/mnemopi/hindsight/sharpshooter) not in Fcode UI |
| Mnemopi settings (22 keys) | `omp/packages/coding-agent/src/mnemopi/settings.ts` | none | missing | `mnemopi.dbPath`, `mnemopi.bank`, `mnemopi.autoRecall`, etc. — all missing |
| Hindsight settings (20 keys) | `omp/packages/coding-agent/src/hindsight/settings.ts` | none | missing | `hindsight.apiUrl`, `hindsight.apiToken`, `hindsight.bankId`, etc. — all missing |
| Local memory pipeline | `omp/packages/coding-agent/src/memories/` | none | missing | No UI |
| Sharpshooter | `omp/packages/coding-agent/src/sharpshooter/` | none | missing | No UI |

### 5.6 LSP (no Fcode tab)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `lsp.enabled` | `omp/packages/coding-agent/src/lsp/settings.ts:8` | none | missing | LSP for code intelligence — no toggle |
| `lsp.formatOnWrite` | `lsp/settings.ts:46` | none | missing | |
| `lsp.diagnosticsOnWrite` | `lsp/settings.ts:58` | none | missing | |
| `lsp.diagnosticsOnEdit` | `lsp/settings.ts:70` | none | missing | |

### 5.7 Eval / Python / JS Kernel (no Fcode tab)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `eval.py` / `eval.js` enable | `omp/packages/coding-agent/src/eval/settings.ts:8,21` | none | missing | Python and JS eval backends not configurable |
| `python.kernelMode` | `eval/settings.ts:92` | none | missing | session vs per-call mode |
| `python.interpreter` | `eval/settings.ts:105` | none | missing | |
| `eval.tools.enabled` | `eval/settings.ts:46` | none | missing | |

### 5.8 Task / Subagent Isolation (no Fcode tab)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `task.isolation.enabled` | `omp/packages/coding-agent/src/task/settings.ts:23` | none | missing | Git worktree isolation for task agents |
| `task.maxConcurrency` | `task/settings.ts:222` | none | missing | |
| `task.maxRecursionDepth` | `task/settings.ts:258` | none | missing | |
| `isolation.backend` | `task/settings.ts:36` | none | missing | container/worktree/off |
| `worktree.clone` | `task/settings.ts:73` | none | missing | |
| `task.agentModelOverrides` | `task/settings.ts:365` | none | missing | Per-agent model assignments |

### 5.9 Browser (no Fcode tab)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `browser.enabled` | `omp/packages/coding-agent/src/tools/browser/settings.ts:7` | none | missing | |
| `browser.cdpUrl` | `browser/settings.ts:19` | none | missing | Attach to existing Chrome |
| `browser.headless` | `browser/settings.ts:57` | none | missing | |
| `browser.relay` / `browser.relayUrl` | `browser/settings.ts:32,45` | none | missing | Remote browser relay |

### 5.10 IDA Pro (no Fcode tab)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `ida.enabled` | `omp/packages/coding-agent/src/ida/settings.ts:8` | none | missing | IDA Pro integration for binary analysis |
| `ida.python` / `ida.installDir` | `ida/settings.ts:22,35` | none | missing | |

### 5.11 MCP (partially in Fcode)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `mcp.enableProjectConfig` | `omp/packages/coding-agent/src/mcp/settings.ts:9` | none | missing | omp-side MCP project config toggle — not bridged |
| `mcp.renderMarkdownResults` | `mcp/settings.ts:33` | none | missing | |
| `mcp.notifications` | `mcp/settings.ts:46` | none | missing | |
| MCP server CRUD | Fcode-native | `apps/desktop/src/lib/api.ts` `mcpCreate/List/Update/Delete` | surfaced | Fcode manages MCP servers natively; omp reads them via shared config |

### 5.12 Collab / Stats Web (no Fcode tab)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `collab.relayUrl` | `omp/packages/coding-agent/src/collab/settings.ts:9` | none | missing | Session sharing relay |
| `collab.webUrl` | `collab/settings.ts:21` | none | missing | Web collaboration viewer URL |
| `collab.displayName` | `collab/settings.ts:34` | none | missing | Collaborator display name |
| `collab.autoStart` | `collab/settings.ts:46` | none | missing | Auto-start collab mode |
| Session stats (`get_session_stats`) | `rpc-types.ts:79` | `ContextUsageInspector.tsx`; historical: `OmpUsageSection.tsx` | partial | Per-session stats in context ring; all-time aggregates in AI settings via `omp stats --json` |

### 5.13 Extensions / Plugins / Skills (no Fcode omp tab)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `extensions` list | `omp/packages/coding-agent/src/extensibility/settings.ts:10` | none | missing | omp extension (npm) registry not surfaced |
| `disabledExtensions` | `extensibility/settings.ts:12` | none | missing | |
| `skills.enabled` / `skills.registryUrl` | `extensibility/settings.ts:15,29` | none | missing | omp skill registry not configurable in Fcode |
| `skills.customDirectories` | `extensibility/settings.ts:65` | none | missing | |
| Skill CRUD (Fcode-native) | Fcode-native | `apps/desktop/src/lib/api.ts` `skillCreate/List/Update/Delete` | surfaced | Fcode manages skills natively |
| `commands.enableClaudeUser/Project` | `extensibility/settings.ts:103,115` | none | missing | External command source toggles |

### 5.14 Conversation Flow Settings (TUI-only, no Fcode tab)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `steeringMode` (all / one-at-a-time) | `modes/settings.ts:676` | none | missing | Queue behavior not configurable in Fcode |
| `followUpMode` | `modes/settings.ts:689` | none | missing | |
| `interruptMode` | `modes/settings.ts:702` | none | missing | |
| `loop.mode` | `modes/settings.ts:747` | none | missing | Auto-loop on completion |
| `auto_compaction` toggle | `rpc-types.ts:68` | none | missing | |
| `auto_retry` toggle | `rpc-types.ts:71` | none | missing | |

---

## 6. Memory Backends, Sessions, Branching, Compaction

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| Memory backend selector | `memory-backend/settings.ts:12` | none | missing | Default is `off` for rpc protocol; no Fcode UI to change |
| Session persistence | `bridge.ts:661` `SessionStore` | `packages/omp-bridge/src/sessions.ts` | surfaced | Session dir stored per Fcode session ID; survives restart |
| Session branching | `rpc-types.ts:82` | `api.ts:1648` `ompSessionBranch` | surfaced | Exposed in API; wired to fork gesture |
| Session rename | `rpc-types.ts:85` | `api.ts:1651` `ompSessionRename` | surfaced | |
| Context compaction (manual) | `rpc-types.ts:67` | `commands.ts:17` | surfaced | Via compact command or context ring |
| Context compaction (auto) | `rpc-types.ts:68` | none | missing | `set_auto_compaction` not bridged |
| Compaction events display | `rpc-types.ts` `compaction_start/end` | `bridge.ts:173` passthrough | surfaced | Shown in transcript |
| Handoff (ai-memory) | `rpc-types.ts:86` | none | missing | `handoff` RPC not bridged; ai-memory hooks work via MCP tools |
| Session export (HTML) | `rpc-types.ts:80` | none | missing | No export UI |
| Session stats (tokens/cost) | `rpc-types.ts:79` | none | missing | |
| Tree view / history entries | `rpc-types.ts:41,42` | none | missing | `get_entries` / `get_tree` not bridged |

---

## 7. Models / Providers / Auth

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| omp model list | `rpc-types.ts:54` | `useComposerModelMenu.ts:289` | surfaced | Live list from omp shown in model picker |
| omp model switch | `rpc-types.ts:52` | `useComposerModelMenu.ts:369` | surfaced | |
| omp thinking levels | `rpc-types.ts:59` | `useComposerModelMenu.ts:294` | surfaced | |
| omp thinking level switch | `rpc-types.ts:57` | `useComposerModelMenu.ts:111` | surfaced | |
| omp login providers | `rpc-types.ts:93` | `OmpAccountsSection.tsx` | surfaced | |
| omp OAuth flow | `rpc-types.ts:94` + `extension_ui_request open_url` | `OmpAccountsSection.tsx:30` + `bridge.ts:923` | surfaced | Browser opened; open_url forwarded to shell |
| Fcode-native providers | Fcode-native | `ModelConfigPage.tsx` | surfaced | Parallel provider system (Anthropic, OpenAI, etc.) |
| Auth-broker / auth-gateway | `omp/packages/ai/src/auth-broker/`, `auth-gateway/` | none | missing | omp's internal auth microservices not exposed |

---

## 8. Approval Modes

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| omp approval mode (hardcoded) | `bridge.ts:1042` `--approval-mode always-ask` | none | missing | Hardcoded; no Fcode UI to relax to `auto-edit` or `yolo` |
| Per-tool `allow` rule | `bridge.ts:135` overlay: `fcode_bench_execute_read: allow` | none | partial | Read-only bench calls auto-approved; no UI for other per-tool rules |
| Fcode permission mode | Fcode-native | `settings-search.ts:91` `settings.permissionMode` | surfaced | Controls native (non-omp) sessions only |
| Tool permission prompt | `extension_ui_request confirm` | `PermissionCard.tsx` | surfaced | Shown for write ops from omp tools |

---

## 9. IDE-ish Features (LSP, DAP, Browser, Eval)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| LSP diagnostics on write | `lsp/settings.ts:58` | none | missing | omp runs LSP inside its process; diagnostics not surfaced in Fcode |
| LSP format on write | `lsp/settings.ts:46` | none | missing | |
| DAP debugger attach | `tools/debug.ts` | `DapPanel.tsx` (from `tool_end` details) | surfaced | Read-only sessions/frames/variables; no breakpoint editing |
| Browser (Playwright) | `tools/browser/` | `bridge.ts:169` tool events only | partial | Events shown; no live browser viewport in Fcode window |
| Python eval (`eval.py`) | `tools/eval.ts` | `bridge.ts:169` tool events only | partial | REPL output in tool rows; no notebook/REPL panel |
| JS eval (`eval.js`) | `tools/eval.ts` | `bridge.ts:169` tool events only | partial | Same as Python |
| IDA Pro binary analysis | `tools/ida.ts`, `ida/` | `bridge.ts:169` tool events only | partial | Events shown; no IDA window embed |
| Computer use | `tools/computer/` | `bridge.ts:169` tool events only | partial | Screen interaction events shown; no viewport |

---

## 10. Stats / Collab-Web

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| Session stats (tokens, cost, duration) | `omp/packages/coding-agent/src/cli/stats-cli.ts`, `get_session_stats` RPC | none | missing | No stats tab in Fcode |
| Embedded stats client | `omp/packages/stats/src/embedded-client.generated.txt` | none | missing | |
| Collab relay host | `collab/host.ts`, `collab/settings.ts` | none | missing | Session sharing not surfaced |
| Collab web viewer | `collab/settings.ts:cfgCollabWebUrl` | none | missing | |
| Collab guest join | `collab/guest.ts` | none | missing | |
| IRC real-time messaging | `irc_message` event | `bridge.ts:186` dropped | missing | |

---

## 11. Extension UI Requests — `setStatus` / `setWidget` / `setTitle` (explicitly ignored)

| Method | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `setStatus` | `rpc-types.ts:501` | `ui-requests.ts:151` | missing | TUI status-line widget; no Fcode equivalent |
| `setWidget` | `rpc-types.ts:507` | `ui-requests.ts:151` | missing | TUI composer widget (above/below editor area); no Fcode equivalent |
| `setTitle` | `rpc-types.ts:516` | `ui-requests.ts:151` | missing | TUI window title; no Fcode equivalent |
| `set_editor_text` | `rpc-types.ts:517` | `ui-requests.ts:151` (default) | missing | Inject text into TUI composer; no Fcode equivalent |

---

## Top Gaps (ranked by user value for Frappe developers)

1. **Memory backend selector & Mnemopi/Hindsight config** — `memory-backend/settings.ts`, `mnemopi/settings.ts`, `hindsight/settings.ts` — no Fcode settings tab. Frappe devs benefit most from persistent per-project memory; today omp defaults to `off` for rpc protocol with no UI to enable it. Highest value gap.

2. **omp approval mode not configurable** — `bridge.ts:1042` hardcodes `--approval-mode always-ask`. Experienced users and automated pipelines need `auto-edit` (accept edits, ask on shell) or project-scoped allow-lists. No Fcode UI to relax this per project.

3. **Session stats (tokens / cost)** — `get_session_stats` RPC never called; `omp/packages/stats/` unused. Frappe devs want token burn visibility per session, especially when using expensive reasoning models on large ERPNext codebases.

4. **`setStatus` / `setWidget` / `setTitle` silently ignored** — `ui-requests.ts:151`. Extensions and skills that display progress badges (e.g. eTIMS signing status, build progress) get no visual feedback in Fcode. Implementing even a toast/badge would unblock the skill ecosystem.

5. **Auto-compaction toggle** — `set_auto_compaction` not bridged. Long ERPNext sessions exhaust context windows; today users must manually compact. A Settings toggle to enable auto-compaction at a threshold would be high-impact.

6. **`editor` extension UI request refused immediately** — `ui-requests.ts:124`. Skills that need multi-line text input (e.g. patch review, custom SQL query) get an immediate refusal. Fcode should open a modal editor instead.

7. **Subagent events subscription level** — only `progress` subscribed (`bridge.ts:677`). Full `events` level would expose subagent tool calls, thinking, and errors in the transcript for debugging complex Frappe task chains.

8. **Task / subagent isolation settings** — `task/settings.ts` (worktree clone, max concurrency, merge policy). Frappe devs running parallel migration tasks or multi-bench experiments need these knobs exposed in Settings.

9. **Collab (session sharing)** — `collab/settings.ts`, `collab/host.ts`. Pair-programming or remote review of Frappe app changes is a common workflow; today collab is entirely absent from Fcode.

10. **Browser / eval / DAP as Fcode panels** — tools produce events visible in transcript but no live viewports. A browser preview panel (for Frappe web form testing) and a Python REPL output panel (for `bench execute` results) would close the IDE gap for Frappe developers.
