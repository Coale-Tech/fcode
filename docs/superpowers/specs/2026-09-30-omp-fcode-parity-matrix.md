# omp ↔ Fcode Parity Matrix

> Generated: 2026-09-30  
> **Status as of 2026-10-01** (reconciled against `main` @ `9c26393c4`, PRs #53–#77)  
> Scope: every user-facing omp capability vs whether/where Fcode surfaces it.  
> Columns: **Capability** | **omp source** | **Fcode surface** | **Status** | **Note**  
> Status values: `surfaced` = fully wired end-to-end · `partial` = wired but incomplete · `missing` = no Fcode surface

Row counts: **surfaced 107** · **partial 31** · **missing 86** · **total 224** (20 rows added; 54 status changes from original)

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
| `follow_up` | `rpc-types.ts:31` | `bridge.ts:877` `agent.followUp`; `omp-ipc.ts:453–461`; `api.ts:1797` `agentFollowUp` | surfaced | Queue-while-streaming: called instead of native PI queue when omp session is streaming |
| `abort` | `rpc-types.ts:32` | `bridge.ts:463` via `agent.stop` / `agent.abort` | surfaced | Two callers: orderly stop and fire-and-forget abort |
| `abort_and_prompt` | `rpc-types.ts:33` | `bridge.ts:888` `agent.abortAndPrompt`; `omp-ipc.ts:463–471`; `api.ts:1800` `agentAbortAndPrompt` | surfaced | Abort current run and immediately send a new prompt |
| `new_session` | `rpc-types.ts:34` | `bridge.ts:636` internal to `ompPrompt` | surfaced | Auto-managed per Fcode session ID |
| `open_session` | `rpc-types.ts:35` | `bridge.ts:634` internal to `ompPrompt` | surfaced | Resumes from stored session dir; falls back to new on GC |

### 1.3 State

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `get_state` | `rpc-types.ts:38` | `bridge.ts:489` via `agent.getStatus`; `bridge.ts:575` via `omp.state` | surfaced | Used for isRunning check and context usage display |
| `set_fast_mode` | `rpc-types.ts:39` | `bridge.ts:860` `omp.fast.set`; `omp-ipc.ts:433–438`; `api.ts:1788` `ompFastSet` | partial | IPC+bridge+API wired; no renderer UI toggle |
| `get_available_commands` | `rpc-types.ts:40` | `bridge.ts:571` via `omp.commands.list` | surfaced | Merged into composer autocomplete (`use-composer-autocomplete.ts:136`) |
| `get_entries` | `rpc-types.ts:41` | `bridge.ts:836` `omp.session.entries`; `omp-ipc.ts:285–291`; `api.ts:1758` `ompSessionEntries`; `OmpSessionTreeTab.tsx:48` | surfaced | Session history tab in Work Panel; renders entry list; click to fork |
| `get_tree` | `rpc-types.ts:42` | `bridge.ts:840` `omp.session.tree`; `omp-ipc.ts:293–297`; `api.ts:1761` `ompSessionTree` | partial | Bridge+IPC+API wired; `OmpSessionTreeTab` uses `get_entries` not `get_tree`; no confirmed renderer consumer |
| `set_todos` | `rpc-types.ts:43` | `bridge.ts:832` `omp.session.setTodos`; `omp-ipc.ts:276–283`; `api.ts:1755` `ompSessionSetTodos` | partial | Bridge+IPC+API wired; `OmpTodoPanel.tsx` reads `todo_reminder` events only, does not call `set_todos` |
| `set_host_tools` | `rpc-types.ts:44` | `bridge.ts:947` auto on handshake | surfaced | Registers `fcode_bench_execute`, `fcode_bench_run`, `fcode_canvas` tools |
| `set_host_uri_schemes` | `rpc-types.ts:45` | none | missing | Not bridged; no custom URI scheme host |
| `set_subagent_subscription` | `rpc-types.ts:46` | `bridge.ts:677` auto on first prompt | surfaced | Level `progress` subscribed once per omp process |
| `set_event_filter` | `rpc-types.ts:47` | none | missing | Not bridged |
| `get_subagents` | `rpc-types.ts:48` | `omp-ipc.ts` via `omp.subagents.list` → `api.ompSubagentList` → `OmpSubagentsList.tsx` | surfaced | Initial snapshot for the compact subagents list |
| `get_subagent_messages` | `rpc-types.ts:49` | `omp-ipc.ts` via `omp.subagents.messages` → `api.ompSubagentMessages` → popover in `OmpSubagentsList.tsx` | surfaced | Read-only message view on row click |
| `get_memory_status` | `rpc-types.ts:40` | `bridge.ts:782` `omp.memory.status`; `omp-ipc.ts` confirmed; `api.ts:1672` `ompMemoryStatus`; `MemoryTab.tsx:29–30` | surfaced | Memory health polling for MemoryTab; refreshed every 15 s while tab is open |

### 1.4 Model

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `set_model` | `rpc-types.ts:52` | `bridge.ts:562` via `omp.models.set` → `apps/desktop/src/features/chat/composer/hooks/useComposerModelMenu.ts:369` | surfaced | Model switcher in composer model menu for omp sessions |
| `cycle_model` | `rpc-types.ts:53` | `bridge.ts:869` `omp.models.cycle`; `omp-ipc.ts:473–477`; `api.ts:1803` `ompCycleModel`; `useAppShellRuntime.tsx:843` keyboard shortcut | surfaced | `Alt+]` cycles models |
| `get_available_models` | `rpc-types.ts:54` | `bridge.ts:560` via `omp.models.list` → `useComposerModelMenu.ts:289` | surfaced | Populates omp model groups in model picker |

### 1.5 Thinking

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `set_thinking_level` | `rpc-types.ts:57` | `bridge.ts:568` via `omp.thinking.set` → `useComposerModelMenu.ts:111` | surfaced | Thinking level picker in model menu |
| `cycle_thinking_level` | `rpc-types.ts:58` | `bridge.ts:872` `omp.thinking.cycle`; `omp-ipc.ts:479–483`; `api.ts:1806` `ompCycleThinkingLevel`; `useAppShellRuntime.tsx:846` keyboard shortcut | surfaced | Keyboard shortcut cycles thinking levels |
| `get_available_thinking_levels` | `rpc-types.ts:59` | `bridge.ts:565` via `omp.thinking.levels` → `useComposerModelMenu.ts:294` | surfaced | Populates thinking level menu |

### 1.6 Queue Modes

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `set_steering_mode` | `rpc-types.ts:62` | `bridge.ts:851`; `omp-ipc.ts:409–415`; `api.ts:1779` `ompModesSetSteeringMode`; `omp-settings-sections.tsx:298` select UI | surfaced | Persisted in `omp-settings.json` overlay; applied at sidecar restart |
| `set_follow_up_mode` | `rpc-types.ts:63` | `bridge.ts:854`; `omp-ipc.ts:417–423`; `api.ts:1782` `ompModesSetFollowUpMode`; `omp-settings-sections.tsx:309` | surfaced | Settings → AI → Queue Modes |
| `set_interrupt_mode` | `rpc-types.ts:64` | `bridge.ts:857`; `omp-ipc.ts:425–431`; `api.ts:1785` `ompModesSetInterruptMode`; `omp-settings-sections.tsx:320` | surfaced | Settings → AI → Queue Modes |

### 1.7 Compaction

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `compact` | `rpc-types.ts:67` | `bridge.ts:478` via `agent.compact` → `apps/desktop/src/lib/commands.ts:17` via `builtin.agent.compact` | surfaced | Triggered from context ring / command palette |
| `set_auto_compaction` | `rpc-types.ts:68` | `bridge.ts:800` `omp.auto-compaction.set`; `omp-ipc.ts:225–230`; `api.ts:1734` `ompAutoCompactionSet`; `ContextUsageInspector.tsx` `onToggleAutoCompaction` → `Composer.tsx` | surfaced | Toggle in context-usage popover; initial state read from `omp.state`; persisted by omp |

### 1.8 Retry

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `set_auto_retry` | `rpc-types.ts:71` | `bridge.ts:863` `omp.retry.setAutoRetry`; `omp-ipc.ts:440–445`; `api.ts:1791` `ompRetrySetAutoRetry` | partial | Bridge+IPC+API wired; no UI toggle in Settings |
| `abort_retry` | `rpc-types.ts:72` | `bridge.ts:866` `omp.retry.abort`; `omp-ipc.ts:447–451`; `api.ts:1794` `ompRetryAbort` | partial | Bridge+IPC+API wired; no UI button in transcript |

### 1.9 Bash (direct shell exec)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `bash` | `rpc-types.ts:75` | none | missing | Direct RPC bash call not used; bash runs via agent tool |
| `abort_bash` | `rpc-types.ts:76` | none | missing | Not bridged |

### 1.10 Session

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `get_session_stats` | `rpc-types.ts:79` | `bridge.ts:804` `omp.session.stats`; `omp-ipc.ts:219–223`; `api.ts:1737` `ompSessionStats`; `ContextUsageInspector.tsx:381–389` | surfaced | Input/output/cache token counts and cost shown in context-usage popover after each turn |
| `export_html` | `rpc-types.ts:80` | `bridge.ts:816` `omp.session.exportHtml`; `omp-ipc.ts:253–259` (native save dialog); `api.ts:1746` `ompSessionExportHtml`; `ChatTranscript.tsx:201–204` `onExportHtml` menu item | surfaced | Right-click → "Export transcript…" opens native save dialog |
| `switch_session` | `rpc-types.ts:81` | none | missing | Sessions managed via new/open; no direct switch call |
| `branch` | `rpc-types.ts:82` | `bridge.ts:583` via `omp.session.branch` → `apps/desktop/src/lib/api.ts:1648` | surfaced | Branch entry exposed in API; wired to sidebar fork gesture |
| `get_branch_messages` | `rpc-types.ts:83` | `bridge.ts:845` `omp.session.branchMessages`; `omp-ipc.ts:300–304`; `api.ts:1764` `ompSessionBranchMessages` | partial | Bridge+IPC+API wired; no confirmed renderer consumer |
| `get_last_assistant_text` | `rpc-types.ts:84` | `bridge.ts:822` `omp.session.lastAssistantText`; `omp-ipc.ts:261–265`; `api.ts:1749` `ompSessionLastAssistantText`; `ChatTranscript.tsx:215` | surfaced | Right-click → "Copy last reply" |
| `set_session_name` | `rpc-types.ts:85` | `bridge.ts:586` via `omp.session.rename` → `api.ts:1651` | surfaced | Session rename wired |
| `handoff` | `rpc-types.ts:86` | `bridge.ts:826` `omp.session.handoff`; `omp-ipc.ts:267–274`; `api.ts:1752` `ompSessionHandoff`; `ChatTranscript.tsx:223–229`; `menu-items.tsx:259` "Handoff" menu entry | surfaced | Right-click → "Save handoff" triggers ai-memory handoff via RPC; toast on save |

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
| `session_settled` | `rpc-types.ts:184` | `bridge.ts:378` in `SYSTEM_LINE_EVENTS`; `emitSystemMessage` at `bridge.ts:1252–1255` | surfaced | Emitted as quiet system transcript line "[omp] Session settled" |

### 2.2 System-Line Events (formerly silently dropped)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `notice` | omp internal | `bridge.ts:372` in `SYSTEM_LINE_EVENTS`; formatted as `[omp] <message>` | surfaced | System notices surface as quiet transcript lines |
| `irc_message` | omp internal | `bridge.ts:888` → `emitSystemMessage` as quiet transcript line | surfaced | Plain-text content forwarded; non-string content silently dropped |
| `todo_reminder` / `todo_auto_clear` | omp internal | `bridge.ts:1222–1226` forwarded as `agent.event`; `events-slice.ts:401–406`; `OmpTodoPanel.tsx` | surfaced | Live phase/task progress panel below transcript |
| `auto_retry_start` / `auto_retry_end` | omp internal | `bridge.ts:373–374` in `SYSTEM_LINE_EVENTS` | surfaced | "[omp] Retrying…" / "[omp] Retry complete" system lines |
| `retry_fallback_start` / `retry_fallback_end` | omp internal | `bridge.ts:375–376` in `SYSTEM_LINE_EVENTS` | surfaced | "[omp] Fallback model: …" / "[omp] Fallback complete" |
| `goal_updated` | omp internal | `bridge.ts:377` in `SYSTEM_LINE_EVENTS` | surfaced | "[omp] Goal: …" system line |
| `model_changed` / `thinking_level_changed` | omp internal | `bridge.ts:378` in `SYSTEM_LINE_EVENTS` | surfaced | "[omp] Model → …" / "[omp] Thinking → …" system lines |
| `ttsr_triggered` | omp internal | `bridge.ts:366` in `DROP_EVENTS` | missing | Silently discarded; no surface |

### 2.3 Subagent Frames

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `subagent_lifecycle` | `rpc-types.ts:423` | `bridge.ts:962` → `agent.event { type: "tool_start"/"tool_end" }` | surfaced | Subagents surface as nested tool rows in transcript |
| `subagent_progress` | `rpc-types.ts:428` | `bridge.ts:1002` → `agent.event { type: "tool_update" }` | surfaced | Progress text shown in tool row |
| `subagent_events` subscription level | `rpc-types.ts:217` | `bridge.ts:899` → `agent.event { subagentId }` | surfaced | `subagent_event` frames relayed with inner event + subagentId; subscription stays at `progress` |
| `command_output` frame | bridge internal | `bridge.ts:1204–1207` | surfaced | One-shot capture for slash-command text; consumed by `ompShareAndForward`; not forwarded to renderer |

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
| `editor` | `rpc-types.ts:485` | `ui-requests.ts:164–179`; `AskToolCard` multiline textarea | surfaced | Multi-line textarea in Composer; submit returns text, Decline/timeout → cancelled |
| `setStatus` | `rpc-types.ts:501` | `ui-requests.ts:202–208` → `MappedExtStatus`; `ExtensionPromptDialog.tsx:20–21` per-session status map | surfaced | Status badges rendered in extension status line |
| `setWidget` | `rpc-types.ts:507` | `ui-requests.ts:210–216` → `MappedExtWidget`; `ExtWidget.tsx:39–49`; mounted at `Composer.tsx:558` | surfaced | Widget lines rendered as collapsible block above composer |
| `setTitle` | `rpc-types.ts:516` | `ui-requests.ts:218–223` → `MappedExtTitle`; `ConversationTopbar.tsx:43` | surfaced | Overrides session tab title in topbar |
| `set_editor_text` | `rpc-types.ts:517` | `ui-requests.ts:225–230` → `MappedSetEditorText`; `Composer.tsx:420–423` | surfaced | Injects ext text into active composer draft |

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
| `/collab` | `commands/collab.ts` | `omp-settings-sections.tsx` Collab group | partial | Collab relay/web/display-name/auto-start settings wired; no live collab peer session panel |
| `/stats` | `commands/stats.ts` | `OmpUsageSection.tsx` (AI tab) + `ContextUsageInspector.tsx` | partial | Historical aggregates via `omp stats --json`; per-session stats in context ring |
| `/settings` | `commands/settings.ts` | partial (text → omp) | partial | Opens TUI settings panel; Fcode has its own settings page |
| `/ssh` | `commands/ssh.ts` | `RemoteHostsPage.tsx` (pi-host SSH pairing; separate system) | partial | omp SSH hosts (`~/.omp/agent/ssh-hosts.json`) are a different registry from Fcode's remote hosts |
| `/git` | `commands/git.ts` | none | missing | `omp git` is a fullscreen interactive TUI requiring a real TTY; not embeddable in Fcode without a terminal panel — infeasible without embedded terminal |
| `/worktree` | `commands/worktree.ts` | `OmpWorktreeSection.tsx` (AI tab) | partial | Lists agent worktrees under `~/.omp/wt/`; no add/clear/prune operations from UI |
| `/share` | `commands/share.ts` | `bridge.ts:900–952` `ompShareAndForward`; `omp-ipc.ts:485–490`; `api.ts:1809` `ompShare`; `OmpCollabPanel.tsx:36` | surfaced | Share panel below transcript: captures `/share` URL and shows one-click Copy |

### 4.3 Built-in Agent Tools

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `bash` (shell execution) | `omp/packages/coding-agent/src/tools/bash.ts` | `bridge.ts:169` tool events → transcript | surfaced | Tool events shown; permission prompt on write ops |
| `read` / `write` / `edit` | `tools/read.ts`, `write.ts` | `bridge.ts:169` tool events | surfaced | |
| `grep` / `glob` | `tools/grep.ts`, `glob.ts` | `bridge.ts:169` tool events | surfaced | |
| `browser` (Playwright) | `tools/browser.ts`, `tools/browser/` | `bridge.ts:169` tool events; `RichToolPanelBrowser.tsx` | partial | Current URL and display() text shown in rich tool row; no live viewport |
| `eval` (Python/JS) | `tools/eval.ts` | `bridge.ts:169` tool events; `RichToolPanelEval.tsx` | partial | Per-cell REPL panels (code + stdout/stderr) in tool rows; no notebook/REPL panel |
| `debug` (DAP) | `tools/debug.ts` | `DapPanel.tsx` (from `tool_end` details); breakpoint add/remove + run control buttons | surfaced | Sessions/frames/variables; add/remove breakpoints; continue/step/pause/terminate via `agentPrompt` path |
| `ida` (IDA Pro) | `tools/ida.ts` | `bridge.ts:169` tool events; `RichToolPanelIda.tsx` | partial | Action/database/exec fields shown in tool row; no IDA window embed |
| `computer` (computer use) | `tools/computer/` | `bridge.ts:169` tool events; `RichToolPanelComputer.tsx` | partial | Automation text and inline screenshots in tool rows; no live viewport |
| `memory_recall` / `memory_retain` | `tools/memory-recall.ts`, `memory-retain.ts` | `bridge.ts:169` tool events | partial | Events shown; no memory management UI |
| `memory_reflect` / `memory_edit` | `tools/memory-reflect.ts`, `memory-edit.ts` | `bridge.ts:169` tool events | partial | Events shown; no memory viewer |
| `ast_edit` | `tools/ast-edit.ts` | `bridge.ts:169` tool events | surfaced | Structural edit shown as tool row |
| `task` (subagent spawn) | `omp/packages/agent/src/` | `bridge.ts:962` subagent frames | surfaced | Subagent rows in transcript via §9 subscription |
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
| Approval mode | `bridge.ts:1042` + `approval-mode-ipc.ts` | `SettingsPage.tsx:479–494` select: always-ask / write / yolo | surfaced | Persisted as `approval-mode.json`; passed to omp via `FCODE_TOOL_APPROVAL_MODE` env + `--approval-mode` flag; default `always-ask` |
| Thinking display mode | `omp/packages/coding-agent/src/modes/settings.ts` `display.smoothStreaming` etc. | `settings-search.ts:106` | partial | Fcode setting controls rendering; omp-native thinking settings not synced |
| Context usage display | `modes/settings.ts` `display.showTokenUsage` | `settings-search.ts:109` | partial | Display preference in Fcode; fed by `ompState().contextUsage` |
| Smooth streaming | `modes/settings.ts:cfgDisplaySmoothStreaming` | `settings-search.ts:103` | partial | Fcode controls renderer interpolation; omp setting not bridged |

### 5.3 Instructions Tab (`instructions`)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| Global instructions | `omp/packages/coding-agent/src/capability/instruction.ts` | `apps/desktop/src/features/settings/agent-sections.tsx:12` | surfaced | Editable in Settings; written to omp's CLAUDE.md / instructions path via overlay |

### 5.4 General Tab (`general`)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| Theme / appearance | `modes/settings.ts:cfgThemeDark/cfgThemeLight` | `omp-settings-sections.tsx` HTML Export Theme card | surfaced | `theme.dark` / `theme.light` override card in Settings → AI; `display.*` excluded (no effect under `--mode rpc`) |
| Network proxy | `omp/packages/ai/src/auth/` | `settings-search.ts:73` | partial | Fcode proxy setting passed to omp via env in overlay |

### 5.5 Memory Backends (Settings → Memory tab)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `memory.backend` selector | `omp/packages/coding-agent/src/memory-backend/settings.ts:12` | `MemoryTab.tsx:32` backend draft; `api.ts` `memorySetConfig`/`memoryGetConfig`; `bridge.ts:183–190` | surfaced | Off / Mnemopi / Hindsight selector with live health card (polled every 15 s) |
| Hindsight settings (URL/bank/token/missions) | `omp/packages/coding-agent/src/hindsight/settings.ts` | `MemoryTab.tsx:56–66`; `bridge.ts:144–153` hindsightLines; `api.ts` `hindsightListMentalModels/RefreshMentalModel/SetBankMission` | surfaced | URL, bank, write-only token, bank mission, retain mission; mental-model list with per-page refresh; Frappe bench bootstrap action |
| Local Hindsight supervisor | `omp internal` | `apps/desktop/electron/main/hindsight-local/supervisor.ts`; `MemoryTab.tsx` Start/Stop | surfaced | Detects `hindsight-api`/`uvx`/`docker` on PATH; manages supervised local server; auto-fills URL field |
| Hindsight behavioral settings (`autoRecall` / `autoRetain` / `retainMode` / `mentalModelsEnabled` / `mentalModelAutoSeed`) | `hindsight/settings.ts` | `bridge.ts:150–154` reads from OmpSettingsValues | partial | bridge.ts reads these keys; absent from `OmpSettingsValues` type (`shared/src/types/omp.ts`) — type gap; no UI can save them |
| Mnemopi settings (22 keys: `mnemopi.dbPath`, `mnemopi.bank`, `mnemopi.autoRecall`, `mnemopi.llmMode`, etc.) | `omp/packages/coding-agent/src/mnemopi/settings.ts` | backend selectable; `llmMode` hardcoded `session` at `bridge.ts:189` | partial | Backend selectable in MemoryTab; individual 22 mnemopi keys absent from `OmpSettingsValues` type; no per-key UI |
| Local memory pipeline (`memories/`) | `omp/packages/coding-agent/src/memories/` | none | missing | No UI, no config |
| Sharpshooter | `omp/packages/coding-agent/src/sharpshooter/` | none | missing | No UI or config |

### 5.6 LSP (Settings → AI → LSP group)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `lsp.enabled` | `omp/packages/coding-agent/src/lsp/settings.ts:8` | `omp-settings-sections.tsx:346` | surfaced | Toggle in Settings → AI → LSP |
| `lsp.formatOnWrite` | `lsp/settings.ts:46` | `omp-settings-sections.tsx:353` | surfaced | |
| `lsp.diagnosticsOnWrite` | `lsp/settings.ts:58` | `omp-settings-sections.tsx:360` | surfaced | |
| `lsp.diagnosticsOnEdit` | `lsp/settings.ts:70` | `omp-settings-sections.tsx:367` | surfaced | |

### 5.7 Eval / Python / JS Kernel (Settings → AI → Eval & Python group)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `eval.py` / `eval.js` enable | `omp/packages/coding-agent/src/eval/settings.ts:8,21` | `omp-settings-sections.tsx:154–170` | surfaced | Toggle in Settings → AI → Eval & Python |
| `python.kernelMode` | `eval/settings.ts:92` | `omp-settings-sections.tsx:176` | surfaced | session vs per-call mode |
| `python.interpreter` | `eval/settings.ts:105` | `omp-settings-sections.tsx:184` | surfaced | |
| `eval.tools.enabled` | `eval/settings.ts:46` | `omp-settings-sections.tsx:163` | surfaced | |

### 5.8 Task / Subagent Isolation (Settings → AI → Task Subagents group)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `task.isolation.enabled` | `omp/packages/coding-agent/src/task/settings.ts:23` | `omp-settings-sections.tsx:62` | surfaced | Git worktree isolation for task agents |
| `task.maxConcurrency` | `task/settings.ts:222` | `omp-settings-sections.tsx` | surfaced | |
| `task.maxRecursionDepth` | `task/settings.ts:258` | `omp-settings-sections.tsx` | surfaced | |
| `isolation.backend` | `task/settings.ts:36` | `omp-settings-sections.tsx:79` | surfaced | container/worktree/off |
| `worktree.clone` | `task/settings.ts:73` | `omp-settings-sections.tsx` | surfaced | |
| `task.agentModelOverrides` | `task/settings.ts:365` | `omp-settings-sections.tsx:54–141`; `bridge.ts:207–222` | surfaced | Per-agent model select for `task`/`sonic`/`scout`/`reviewer`/`security-reviewer`; "Default" clears entry |

### 5.9 Browser (Settings → AI → Browser group)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `browser.enabled` | `omp/packages/coding-agent/src/tools/browser/settings.ts:7` | `omp-settings-sections.tsx:201` | surfaced | Toggle in Settings → AI → Browser |
| `browser.cdpUrl` | `browser/settings.ts:19` | `omp-settings-sections.tsx:213` | surfaced | Attach to existing Chrome |
| `browser.headless` | `browser/settings.ts:57` | `omp-settings-sections.tsx:220` | surfaced | |
| `browser.relay` / `browser.relayUrl` | `browser/settings.ts:32,45` | `omp-settings-sections.tsx:227–238` | surfaced | Remote browser relay; `bridge.ts:136–182` |

### 5.10 IDA Pro (Settings → AI → IDA Pro group)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `ida.enabled` | `omp/packages/coding-agent/src/ida/settings.ts:8` | `omp-settings-sections.tsx:378` | surfaced | IDA Pro integration toggle |
| `ida.python` / `ida.installDir` | `ida/settings.ts:22,35` | `omp-settings-sections.tsx:388–410` | surfaced | Python interpreter + install dir with folder picker |

### 5.11 MCP (Settings → AI → MCP group)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `mcp.enableProjectConfig` | `omp/packages/coding-agent/src/mcp/settings.ts:9` | `omp-settings-sections.tsx:421` | surfaced | omp-side MCP project config toggle |
| `mcp.renderMarkdownResults` | `mcp/settings.ts:33` | `omp-settings-sections.tsx:428` | surfaced | |
| `mcp.notifications` | `mcp/settings.ts:46` | `omp-settings-sections.tsx:435` | surfaced | |
| MCP server CRUD | Fcode-native | `apps/desktop/src/lib/api.ts` `mcpCreate/List/Update/Delete` | surfaced | Fcode manages MCP servers natively; omp reads them via shared config |

### 5.12 Collab (Settings → AI → Collab group)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `collab.relayUrl` | `omp/packages/coding-agent/src/collab/settings.ts:9` | `omp-settings-sections.tsx:244` | surfaced | Session sharing relay URL |
| `collab.webUrl` | `collab/settings.ts:21` | `omp-settings-sections.tsx:257` | surfaced | Web collaboration viewer URL |
| `collab.displayName` | `collab/settings.ts:34` | `omp-settings-sections.tsx:270` | surfaced | Collaborator display name |
| `collab.autoStart` | `collab/settings.ts:46` | `omp-settings-sections.tsx:283` | surfaced | Auto-start collab mode |
| Live collab peer panel | `collab/host.ts`, `collab/guest.ts` | none | missing | Settings configurable; no live collab peer view or guest-join UI |

### 5.13 Extensions / Plugins / Skills (Settings → AI → Extensions / Skills groups)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `extensions` list + install/uninstall | `omp/packages/coding-agent/src/extensibility/settings.ts:10` | `omp-settings-sections.tsx` Extensions section; IPC `ompExtensionsList`/`ompExtensionInstall`/`ompExtensionUninstall`/`ompExtensionSetEnabled` | surfaced | npm + marketplace plugins; enable/disable toggle; install from spec; uninstall npm plugins |
| `disabledExtensions` | `extensibility/settings.ts:12` | `omp-settings-sections.tsx`; `OmpSettingsValues` | surfaced | Written to `omp-settings.json`; sidecar restarts on change |
| `skills.enabled` / `skills.registryUrl` | `extensibility/settings.ts:15,29` | `omp-settings-sections.tsx:446–471` | surfaced | Settings → AI → Skills & Commands |
| `skills.customDirectories` | `extensibility/settings.ts:65` | `omp-settings-sections.tsx:457` | surfaced | Folder picker; appended to built-in `fcode-skills` dir in overlay |
| Skill CRUD (Fcode-native) | Fcode-native | `apps/desktop/src/lib/api.ts` `skillCreate/List/Update/Delete` | surfaced | Fcode manages skills natively |
| `commands.enableClaudeUser/Project` | `extensibility/settings.ts:103,115` | `omp-settings-sections.tsx`; `bridge.ts:312–318` | surfaced | External command source toggles |

### 5.14 Conversation Flow Settings (Settings → AI → Queue Modes group)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| `steeringMode` (all / one-at-a-time) | `modes/settings.ts:676` | `omp-settings-sections.tsx:298`; `bridge.ts:272` | surfaced | Settings → AI → Queue Modes |
| `followUpMode` | `modes/settings.ts:689` | `omp-settings-sections.tsx:309`; `bridge.ts:273` | surfaced | |
| `interruptMode` | `modes/settings.ts:702` | `omp-settings-sections.tsx:320`; `bridge.ts:274` | surfaced | |
| `loop.mode` | `modes/settings.ts:747` | `omp-settings-sections.tsx:331`; `bridge.ts:275` | surfaced | Auto-loop on completion |
| `auto_compaction` toggle | `rpc-types.ts:68` | `ContextUsageInspector.tsx` toggle → `omp.auto-compaction.set` | surfaced | See §1.7 |
| `auto_retry` toggle (Settings) | `rpc-types.ts:71` | API wired (`ompRetrySetAutoRetry`) | partial | API wired; no Settings UI toggle (see §1.8) |

---

## 6. Memory Backends, Sessions, Branching, Compaction

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| Memory backend selector | `memory-backend/settings.ts:12` | `MemoryTab.tsx:32`; `bridge.ts:183–190` | surfaced | Off / Mnemopi / Hindsight with live health card |
| Session persistence | `bridge.ts:661` `SessionStore` | `packages/omp-bridge/src/sessions.ts` | surfaced | Session dir stored per Fcode session ID; survives restart |
| Session branching | `rpc-types.ts:82` | `api.ts:1648` `ompSessionBranch` | surfaced | Exposed in API; wired to fork gesture |
| Session rename | `rpc-types.ts:85` | `api.ts:1651` `ompSessionRename` | surfaced | |
| Context compaction (manual) | `rpc-types.ts:67` | `commands.ts:17` | surfaced | Via compact command or context ring |
| Context compaction (auto) | `rpc-types.ts:68` | `ContextUsageInspector.tsx` + `omp.auto-compaction.set` | surfaced | Toggle in context-usage popover |
| Compaction events display | `rpc-types.ts` `compaction_start/end` | `bridge.ts:173` passthrough | surfaced | Shown in transcript |
| Handoff (ai-memory) | `rpc-types.ts:86` | `ChatTranscript.tsx:223–229`; `menu-items.tsx:259` | surfaced | Right-click → "Save handoff" via `ompSessionHandoff` |
| Session export (HTML) | `rpc-types.ts:80` | `ChatTranscript.tsx:201–204`; `omp-ipc.ts:253–259` | surfaced | Right-click → "Export transcript…" with native save dialog |
| Session stats (tokens/cost) | `rpc-types.ts:79` | `ContextUsageInspector.tsx:381–389` | surfaced | Per-turn input/output/cache counts and cost in context ring |
| Session entries / history | `rpc-types.ts:41` | `OmpSessionTreeTab.tsx:48`; `api.ts:1758` | surfaced | Session history Work Panel tab |
| Tree view | `rpc-types.ts:42` | `api.ts:1761` `ompSessionTree` | partial | Bridge+API wired; no confirmed renderer consumer (tree tab uses entries) |

---

## 7. Models / Providers / Auth

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| omp model list | `rpc-types.ts:54` | `useComposerModelMenu.ts:289` | surfaced | Live list from omp shown in model picker |
| omp model switch | `rpc-types.ts:52` | `useComposerModelMenu.ts:369` | surfaced | |
| omp model cycle | `rpc-types.ts:53` | `useAppShellRuntime.tsx:843` `Alt+]` shortcut | surfaced | |
| omp thinking levels | `rpc-types.ts:59` | `useComposerModelMenu.ts:294` | surfaced | |
| omp thinking level switch | `rpc-types.ts:57` | `useComposerModelMenu.ts:111` | surfaced | |
| omp thinking level cycle | `rpc-types.ts:58` | `useAppShellRuntime.tsx:846` keyboard shortcut | surfaced | |
| omp login providers | `rpc-types.ts:93` | `OmpAccountsSection.tsx` | surfaced | |
| omp OAuth flow | `rpc-types.ts:94` + `extension_ui_request open_url` | `OmpAccountsSection.tsx:30` + `bridge.ts:923` | surfaced | Browser opened; open_url forwarded to shell |
| Fcode-native providers | Fcode-native | `ModelConfigPage.tsx` | surfaced | Parallel provider system (Anthropic, OpenAI, etc.) |
| Auth-broker / auth-gateway | `omp/packages/ai/src/auth-broker/`, `auth-gateway/` | none | missing | omp's internal auth microservices; not exposed — infeasible |

---

## 8. Approval Modes

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| omp approval mode | `approval-mode-ipc.ts`; `bridge.ts` `--approval-mode` flag | `SettingsPage.tsx:479–494` select | surfaced | Ask every time / Auto-approve reads / Auto-approve all; persisted as `approval-mode.json` |
| Per-tool `allow` rule | `bridge.ts:135` overlay: `fcode_bench_execute_read: allow` | none | partial | Read-only bench calls auto-approved; no UI for other per-tool rules |
| Fcode permission mode | Fcode-native | `settings-search.ts:91` `settings.permissionMode` | surfaced | Controls native (non-omp) sessions only |
| Tool permission prompt | `extension_ui_request confirm` | `PermissionCard.tsx` | surfaced | Shown for write ops from omp tools |

---

## 9. IDE-ish Features (LSP, DAP, Browser, Eval)

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| LSP diagnostics on write | `lsp/settings.ts:58` | `omp-settings-sections.tsx:360` | surfaced | Configurable in Settings → AI → LSP |
| LSP format on write | `lsp/settings.ts:46` | `omp-settings-sections.tsx:353` | surfaced | |
| DAP debugger attach | `tools/debug.ts` | `DapPanel.tsx` + breakpoints + run control | surfaced | Sessions/frames/variables; add/remove breakpoints; continue/step/pause/terminate |
| Browser (Playwright) | `tools/browser/` | rich tool row with URL + display() output; inline screenshots | partial | URL and display() text shown; no live browser viewport in Fcode window |
| Python eval (`eval.py`) | `tools/eval.ts` | per-cell REPL panels in tool rows | partial | Code + stdout/stderr with language label; no notebook/REPL panel |
| JS eval (`eval.js`) | `tools/eval.ts` | per-cell REPL panels in tool rows | partial | Same as Python |
| IDA Pro binary analysis | `tools/ida.ts`, `ida/` | rich tool row with action/database/exec fields | partial | Events shown; no IDA window embed |
| Computer use | `tools/computer/` | automation text + inline screenshots in tool rows | partial | Screen interaction events shown; no live viewport |

---

## 10. Stats / Collab-Web

| Capability | omp source | Fcode surface | Status | Note |
|---|---|---|---|---|
| Session stats (tokens, cost, duration) | `omp/packages/coding-agent/src/cli/stats-cli.ts`, `get_session_stats` RPC | `ContextUsageInspector.tsx:381–389`; `OmpUsageSection.tsx` | surfaced | Per-turn in context ring; all-time aggregates via `omp stats --json` |
| Embedded stats client | `omp/packages/stats/src/embedded-client.generated.txt` | none | missing | |
| Collab relay host | `collab/host.ts`, `collab/settings.ts` | settings configurable | partial | Relay/web URL/display-name/auto-start wired; no live peer view or guest-join |
| Collab web viewer | `collab/settings.ts:cfgCollabWebUrl` | settings configurable | partial | URL configurable; no viewer panel |
| Collab guest join | `collab/guest.ts` | none | missing | |
| Collab share (`/share`) | `commands/share.ts` | `OmpCollabPanel.tsx:36`; `api.ts:1809` `ompShare` | surfaced | Share panel captures URL from `/share` command |
| IRC real-time messaging | `irc_message` event | `bridge.ts:888` → `emitSystemMessage` | surfaced | Forwarded as quiet system transcript line |

---

## 11. New Capabilities (added since 2026-09-30 matrix)

| Capability | Location | Status | Note |
|---|---|---|---|
| `get_memory_status` RPC | `bridge.ts:782`; `api.ts:1672` `ompMemoryStatus`; `MemoryTab.tsx:29–30` | surfaced | Memory health polling in Settings → Memory tab |
| `omp.share` / `ompShare` | `bridge.ts:900–952`; `omp-ipc.ts:485–490`; `api.ts:1809`; `OmpCollabPanel.tsx:36` | surfaced | Drives `/share` and captures URL; moved to §10 |
| `agent.followUp` / `agent.abortAndPrompt` bridge channels | `omp-ipc.ts:453–471`; `bridge.ts:877–897` | surfaced | New bridge-level sidecar channels; moved to §1.2 |
| `OmpSessionTreeTab.tsx` | `apps/desktop/src/features/work-panel/OmpSessionTreeTab.tsx` | surfaced | Session entry list; branch-from-entry gesture |
| `OmpTodoPanel.tsx` | `apps/desktop/src/features/chat/transcript/OmpTodoPanel.tsx` | surfaced | Live phase/task progress panel |
| `OmpCollabPanel.tsx` | `apps/desktop/src/features/chat/transcript/OmpCollabPanel.tsx` | surfaced | Share panel with `ompShare` button |
| `MemoryTab.tsx` | `apps/desktop/src/features/settings/MemoryTab.tsx` | surfaced | Full memory settings tab |
| `ExtWidget.tsx` / `ext-ui-state.ts` | `apps/desktop/src/features/chat/composer/ExtWidget.tsx` | surfaced | Renders `setWidget` content above composer |
| `ExtensionPromptDialog.tsx` ext-status | `apps/desktop/src/components/ExtensionPromptDialog.tsx:20–21` | surfaced | `setStatus` badges per session/key |
| `ConversationTopbar` ext-title | `apps/desktop/src/components/ConversationTopbar.tsx:43` | surfaced | `setTitle` overrides tab title |
| Composer `set_editor_text` injection | `apps/desktop/src/components/Composer.tsx:420–423` | surfaced | Injects ext text into composer draft |
| `approval-mode-ipc.ts` | `apps/desktop/electron/main/ipc/approval-mode-ipc.ts` | surfaced | Dedicated IPC for omp tool approval mode |
| Hindsight local supervisor | `apps/desktop/electron/main/hindsight-local/supervisor.ts` | surfaced | Manages local Hindsight process; emits `IPC.event.hindsightLocalStatus` |
| `SYSTEM_LINE_EVENTS` bucket | `bridge.ts:371–378` | surfaced | Events formerly in `DROP_EVENTS` now surface as quiet system lines |
| DAP breakpoints + run control | `DapPanel.tsx`; `apps/desktop/src/features/chat/transcript/DapPanel.tsx` | surfaced | Add/remove breakpoints; continue/step/pause/terminate via `agentPrompt` path |
| Rich tool panels for `eval`/`browser`/`computer`/`ida` | `RichToolPanel*.tsx` | partial | Per-cell REPL output, URL+display text, automation text, IDA fields; inline screenshots; no live viewports |
| HTML export theme override | `omp-settings-sections.tsx` HTML Export Theme card | surfaced | `theme.dark` / `theme.light` override in Settings → AI |

---

## Top Gaps (ranked by user value for Frappe developers)

1. **Mnemopi per-key settings** — `mnemopi.*` keys (22) absent from `OmpSettingsValues` type; `llmMode` hardcoded `session` at `bridge.ts:189`. Bridge reads them from the type, so config is dead. Add the 22 keys to `OmpSettingsValues` and expose a settings section.

2. **`hindsight.autoRecall/autoRetain/retainMode/mentalModelsEnabled/mentalModelAutoSeed`** — `bridge.ts:150–154` reads these from `OmpSettingsValues` but they are absent from the type (`shared/src/types/omp.ts`). Type gap = dead config paths. Add the 5 keys to `OmpSettingsValues`.

3. **`set_fast_mode` / `set_auto_retry` / `abort_retry`** — fully wired IPC/bridge/API but no renderer UI entry points. Small additions to Session Modes settings or composer toolbar.

4. **`get_tree` / `get_branch_messages` / `set_todos`** — bridge+IPC+API wired; no confirmed renderer consumer. `OmpSessionTreeTab` already uses `get_entries`; tree/branch-messages could add depth.

5. **Browser/eval/computer/IDA live panels** — events visible in transcript with rich tool rows; still no live viewports. Browser preview and Python REPL panels would close the IDE gap for Frappe developers testing web forms.

6. **Collab live session** — relay settings configurable; no live peer-view or guest-join panel.

7. **`ttsr_triggered`** — still in `DROP_EVENTS` at `bridge.ts:366`; silently discarded.

8. **`bash`/`abort_bash`, `set_host_uri_schemes`, `set_event_filter`, `switch_session`, `get_messages`/`get_messages_page`** — still missing, no bridge handler.
