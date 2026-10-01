# Changelog

All notable changes to Fcode are documented here.
Fcode is a fork of [PI-Desktop](https://github.com/vastsa/PI-Desktop) with the agent brain replaced by [omp](https://github.com/can1357/oh-my-pi).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) on Fcode's own line, starting at 0.16.0.
The two early previews used `0.15.7-fcode.N` (PI-Desktop 0.15.7 plus a prerelease suffix). That scheme sorted below upstream 0.15.7 and was always a prerelease, so the in-app updater (stable releases only) never offered it.
The PI-Desktop release each version is based on is listed in its Compatibility table.

## [Unreleased]
- Fix: macOS builds without a Developer ID signature (current releases) fell into in-app update mode and "Restart to update" did nothing (Squirrel.Mac: "Could not get code signature"); unsigned apps now use the manual download-from-releases flow.
- Bench page: the bench sidebar list is replaced by tabs. An "All benches" tab (filter, All / Running / Failed / version chips, running-first table) plus one closable tab per opened bench, each with a header switcher to jump between benches. Start is disabled with a "Stop <bench> first" cue on every other bench while one runs (the supervisor is single-bench); "Stop all running" is gone. A stopped bench collapses its empty log.
- Build page redesigned header-first: a header shows the bench, site, port and status with one action that fits the state (Start bench, Fix N issues, or Sync files on Builder). A banner under the tabs shows the first failing check with its fix command (Copy, Dismiss), and the sidebar is a plain app list. A bottom status bar always shows the four Studio checks with labels, so health is visible when everything passes. Replaces the hidden-when-passing precondition list.

## [0.17.0] — 2026-10-01
### Changes

- Chat page: new **Activity** tab in the Work Panel (to-do progress, tools-run timeline, changes summary, a "Needs your decision" link to the pending approval) that auto-opens on the first run or permission request of a session. Approval card now stacks Allow this once / Allow for this session / Deny with a consequence line each and a depleting timeout bar. The bench bar (`WorkspaceBar`) now reads the real bench, site and run state instead of always showing "No bench · No site · stopped"; sidebar rows show an always-visible `···` button plus Running / Needs approval labels; the dead single-option mode chip is hidden.
- Fix: omp bridge crashed at start (`approvalMode` out of scope in `main()`), and extension status/widget/title/editor-text updates never reached the renderer (`type` vs `kind` mismatch on `sidecar.ext_ui`).
- Settings → Memory: pick Mnemopi (local), Hindsight (URL, bank, write-only token) or Off, with a live health card (polled every 15 s while open). Memory LLM work (`mnemopi.llmMode=session`) uses the active session model. New omp RPC `get_memory_status`. Saving restarts the agent.
- Session history panel: new "Session history" tab in the Work Panel shows the omp branch tree built from `get_entries`; click a user message to fork the session from it via `branch` (confirm first; the message text is prefilled into the Composer). Copy branch messages via `get_branch_messages`. Export full transcript as HTML via conversation right-click → "Export transcript…" (native save dialog). Right-click → "Copy last reply" copies the most recent assistant text via `get_last_assistant_text`. Right-click → "Save handoff" triggers an ai-memory handoff via `handoff` RPC. Live todo list panel below the transcript tracks phase/task progress from `tool_end` events and `todo_reminder` / `todo_auto_clear` omp events.
- **Command surfaces**: Settings → AI tab now shows three new omp sections: Installed omp Skills (reads `~/.omp/agent/skills.json` + lock; Reveal button opens store dir); omp Usage All-Time (shells `omp stats --json` for aggregated cost/tokens/requests); Agent Worktrees (scans `~/.omp/wt/` to list PR-checkout and task-isolation worktrees). Parity matrix: `/login` and `/models` promoted to `surfaced`; `/git` documented as missing (requires real TTY); `/skill`, `/stats`, `/worktree` now `partial`. New IPC channels: `ompInstalledSkillsList`, `ompHistoricalStats`, `ompWorktreeList`, `ompSkillReveal`.
- DAP session panel: a read-only debugger inspector appears below the transcript while omp's `debug` tool has active sessions. Shows session rows (adapter, program, status badge), stack frames when stopped, and variables from the last query. Driven purely by `tool_end` events — no new IPC. Parity matrix §4.3 `debug` row advances from partial to surfaced.
- DAP panel — breakpoints + run control: add/remove breakpoints (file, line, optional condition) and run-control buttons (continue, step over/in/out, pause, terminate) in the DAP session panel. Optimistic UI with pending/verified/failed states, reconciled from `set_breakpoint`/`remove_breakpoint` `tool_end` events. Channel: `agentPrompt` prompt-path (no direct debug-tool RPC exists in `rpc-types.ts`; see `docs/superpowers/specs/2026-10-03-dap-breakpoints.md`). Reducer extended with `breakpoints`, `pendingCalls`, `debug_tool_start`, `bp_add_optimistic`, `bp_remove_optimistic` actions.
- omp `extension_ui_request editor`: multi-line textarea dialog in the Composer (instead of immediate refusal); submit returns the edited text, Decline / timeout → cancelled. `set_editor_text` injects text into the active Composer draft.
- Settings → Memory → Hindsight: "Local Hindsight server" section detects `hindsight-api`, `uvx`, and `docker` on PATH; Start/Stop buttons manage a supervised local server process; when running, the URL field auto-fills to `http://localhost:<port>`. If the server exits immediately due to a missing LLM API key, state shows "unavailable" with a note to configure `~/.hindsight/config.toml`. No auto-install; the user must install the server separately.
- Context-usage popover: auto-compact toggle reads initial state from `omp.state` and writes via new `omp.auto-compaction.set` RPC. Persisted per omp's session-scoped mechanism; reflected immediately on load.
- **Settings → Extensions**: new section at the bottom of the AI settings tab lists installed omp plugins (npm + marketplace) with name, version, source badge, and enable/disable toggle. Enable/disable writes `disabledExtensions` in `omp-settings.json` and restarts the sidecar. Install from an npm/git spec via a validated text field (`omp plugin install`, no shell, 120 s timeout); uninstall npm plugins with a single click (`omp plugin uninstall`, 60 s timeout). Spec validation rejects local paths and shell metacharacters before spawning. `extensions` and `disabledExtensions` added to `OmpSettingsValues` and the settings schema. New IPC channels: `ompExtensionsList`, `ompExtensionInstall`, `ompExtensionUninstall`, `ompExtensionSetEnabled`.
- omp is vendored at `omp/` (pruned snapshot of oh-my-pi `ba344f5e69`, diverged, no upstream sync). The sibling checkout, pinned-SHA guard and `scripts/omp-patches/` are gone; the `--models-config` change is normal source. A staleness guard (`omp.build.json`) replaces the binary SHA256 check. See ADR 0307.
- One in-app editor: files open in the Files view of Chat's work panel (`fcode.files`, a source-owned CodeMirror fork of the file-manager plugin, `Mod+2`). The separate Monaco Code page, its Changed panel, and the `monaco-editor` dependency are removed.
- Unsaved edits in Files survive a crash or plugin reload as a draft; a recovered draft checks the file on disk before saving, so a Review rollback or agent write can no longer be silently overwritten.
- DocType browser moved to Bench; opening a DocType file opens it in Chat → Files. Migrate needs an explicit site when a bench has several.
- Removed the whole-file `git restore` path; Review snapshot rollback is the only way to undo agent changes.
- `navToCode` shortcut renamed `navToFiles`; custom bindings carry over. Saved `pi.file-manager` tabs move to `fcode.files`.
- omp subagents panel: a compact live list appears below the transcript when omp spawns subagents (status badge, agent name, task). Clicking a row opens a read-only popover with the subagent's message history via `get_subagent_messages`. `irc_message` events forwarded as quiet system lines. New IPC: `omp.subagents.list`, `omp.subagents.messages`.
- Settings → AI → Permissions: tool approval mode selector (Ask every time / Auto-approve reads / Auto-approve all) persisted host-side as `approval-mode.json`; passed to omp via `FCODE_TOOL_APPROVAL_MODE` env var and `--approval-mode` CLI flag; default stays `always-ask`. Changes take effect after the agent restarts.
- Session stats (tokens in/out/cache, cost) surface in the context-usage popover after each turn. Cost is hidden for local/uncounted models. New omp bridge route `omp.session.stats`, IPC `ompSessionStats`, and `api.ompSessionStats()`.

- Settings → Memory: Hindsight mental-model pages list with per-page refresh button; Frappe bench bootstrap action that seeds bench path, sites, and installed apps into the active memory backend (Hindsight HTTP API; Mnemopi explains it manages context automatically).
- omp extension `setStatus` / `setWidget` / `setTitle` UI requests are now rendered: status entries appear in the existing extension status line, widget lines as a collapsible block above the composer, and `setTitle` overrides the session title in the topbar.

- Settings → AI: four new omp settings groups — **Task Subagents** (isolation enabled/backend, worktree clone, max concurrency/recursion), **Eval & Python** (py/js/tools toggles, kernel mode, interpreter path), **Browser** (enabled, headless, CDP URL, relay), **Collab** (relay URL, web URL, display name, auto-start). Settings persist `omp-settings.json`; injected into the omp overlay at sidecar restart via `FCODE_OMP_SETTINGS`. Validated against the omp schema on write (unknown key, wrong type, out-of-range rejected).
- Settings → AI → Task Subagents: per-agent model select for each bundled omp agent (`task`, `sonic`, `scout`, `reviewer`, `security-reviewer`). Selecting a model writes `task.agentModelOverrides.<agent>` to `omp-settings.json`; "Default" clears the entry. Models loaded live from the omp session; gracefully empty when sidecar unavailable. Emitted as `task.agentModelOverrides:` YAML in the overlay.
- Settings → AI: four new omp settings groups — **Task Subagents** (isolation enabled/backend, worktree clone, max concurrency/recursion), **Eval & Python** (py/js/tools toggles, kernel mode, interpreter path), **Browser** (enabled, headless, CDP URL, relay), **Collab** (relay URL, web URL, display name, auto-start). Settings persist in `omp-settings.json`; injected into the omp overlay at sidecar restart via `FCODE_OMP_SETTINGS`. Validated against the omp schema on write (unknown key, wrong type, out-of-range rejected). `task.agentModelOverrides` deferred: it is a free-form agent→model map with no clean fixed-field UI.
- Collab / Share panel: a sticky panel below the transcript surfaces the `/share` snapshot command for omp sessions. Clicking **Share** invokes `/share` via the omp prompt path, captures the resulting URL, and shows it with a one-click Copy button. A **Collab settings** link jumps to Settings → AI → Collab. Live collab (`/collab start`, guest join) remains TUI-only; the panel notes this explicitly. New IPC channel `pi-desktop/omp/share`; new omp bridge route `omp.share`; new pure reducer `omp-collab.ts`.
- Settings → AI: five more omp settings groups — **LSP** (enabled, format/diagnostics on write & edit), **IDA Pro** (enabled, Python interpreter, install dir with folder picker), **MCP** (project config, Markdown results, update injection), **Skills & Commands** (skills enabled, registry URL, custom directories with folder picker, Claude user/project commands), **Hindsight Behavior** (auto recall/retain, retain mode, mental models enabled/auto-seed). Array schema type added to `validateOmpSettings`; user skill dirs appended to Fcode's built-in `fcode-skills` dir in the overlay; Hindsight behavioral settings merged into the single `hindsight:` overlay block to avoid duplicate YAML keys. `display.*`/`theme.*` skipped (TUI-only, no effect under rpc mode); `extensions`/`disabledExtensions` skipped (need a package-manager UI).
- Rich transcript rows for `eval`, `browser`, `computer`, and `ida` tool calls: eval expands to per-cell REPL panels (code + stdout/stderr with language label); browser shows the current URL and display() text output; computer shows automation output text; IDA shows action/database fields and exec output. Screenshots (browser `dest`, computer `path`) are loaded via IPC and rendered inline. All data derived from existing tool_execution result payloads — no new RPC.

- Session modes & events: queue-mode controls (**Steering Mode / Follow-Up Mode / Interrupt Mode / Loop Mode**) added to Settings → AI → Queue Modes and persisted in `omp-settings.json` overlay. `set_steering_mode`, `set_follow_up_mode`, `set_interrupt_mode` wired as session-scoped RPCs; `set_fast_mode`, `set_auto_retry`, `abort_retry` bridged similarly. Queue-while-streaming now calls omp's `follow_up` RPC instead of the native PI queue, so omp handles message ordering internally. omp events `notice`, `auto_retry_start/end`, `retry_fallback_start/end`, `model_changed`, `thinking_level_changed`, `goal_updated`, `session_settled` surface as quiet system lines in the transcript (previously silently dropped). `cycle_model` (`Alt+]`) and `cycle_thinking_level` (`Alt+[`) are global keyboard shortcuts registered in the existing shortcut registry.
- `export_html` now uses omp's configured TUI themes (dark: titanium, light: light) instead of the generic web palette; HTML adapts to the viewer's dark/light preference via CSS `prefers-color-scheme`. Settings → AI → **HTML Export Theme** card lets users override the omp theme names (`theme.dark`, `theme.light`) in `omp-settings.json`. `display.*` settings (smoothStreaming, showTokenUsage, showTurnTime, hideToolActivity, cacheMissMarker, collapseCompacted, shimmer, pinnedAgents) have no effect under `--mode rpc` and are excluded from the overlay (see `docs/superpowers/specs/2026-10-03-display-theme-sync.md`).
## [0.16.0] — 2026-09-29

### Compatibility

| Fcode | PI-Desktop base | omp commit | Bridge protocol | Frappe |
|-------|-----------------|-----------|-----------------|--------|
| 0.17.0 | 0.15.7 | `ba344f5e69f2` | v2 (v1 read-only fallback) | v15, v16 |

### Added

- **Tools work-panel tab** — browser, eval, computer, and IDA sub-panels fed from existing agentMessage events; screenshots bounded to 20, eval cells to 50.
- **Rich transcript rows** for `eval`, `browser`, `computer`, and `ida` tool calls: per-cell REPL panels (code + stdout/stderr with language label), current URL and display() text, automation output, IDA action/database fields and exec output; inline screenshots loaded via IPC.
- **DAP breakpoints + run control** — add/remove breakpoints (file, line, optional condition) and run-control buttons (continue, step over/in/out, pause, terminate) in the DAP session panel; optimistic UI with pending/verified/failed states; stack frames and variables shown when stopped.
- **Session history tab** — new "Session history" tab in the Work Panel shows the omp branch tree; click any user message to fork the session from it (confirm first; message text prefilled into Composer); export full transcript as HTML via right-click → "Export transcript…"; right-click → "Copy last reply" and "Save handoff"; live todo list panel below the transcript tracks phase/task progress from `tool_end` events and `todo_reminder`/`todo_auto_clear` events.
- **omp `extension_ui_request editor`** — multi-line textarea dialog in the Composer for `editor` UI requests; submit returns edited text, Decline/timeout → cancelled; `set_editor_text` injects text into the active Composer draft.
- **Settings → Memory → Local Hindsight server** — Start/Stop buttons manage a supervised local Hindsight server; URL field auto-fills when running; "unavailable" state shown when LLM API key is missing.
- **Settings → Memory**: Hindsight mental-model pages list with per-page refresh; Frappe bench bootstrap action that seeds bench path, sites, and installed apps into the active memory backend.
- i18n: `cycleOmpModel` / `cycleOmpThinking` shortcut labels translated in all 8 non-English locales; key parity test enforces full coverage.
- UI verify harness (`scripts/ui-verify/`): headless screenshot rig for the renderer.

### Changed

- **omp vendored** at `omp/` (pruned snapshot of oh-my-pi `ba344f5e69`, diverged, no upstream sync); sibling checkout, pinned-SHA guard, and `scripts/omp-patches/` removed; `omp.build.json` staleness guard replaces the binary SHA256 check (ADR 0307).
- **Settings → Memory**: pick Mnemopi (local), Hindsight (URL, bank, write-only token), or Off, with a live health card (polled every 15 s while open); Advanced sections surface Mnemopi (~20 keys), Hindsight remaining keys, Sharpshooter, and Local memory pipeline; new backends `sharpshooter` and `local (pipeline)` selectable; saving restarts the agent.
- **Settings → AI** gains eleven new omp settings groups: **Task Subagents** (isolation, worktree clone, max concurrency/recursion; per-agent model overrides for task/sonic/scout/reviewer/security-reviewer), **Queue Modes** (Steering / Follow-Up / Interrupt / Loop Mode), **Eval & Python** (py/js/tools toggles, kernel mode, interpreter path), **Browser** (enabled, headless, CDP URL, relay), **Collab** (relay URL, web URL, display name, auto-start), **LSP** (enabled, format/diagnostics on write & edit), **IDA Pro** (enabled, Python interpreter, install dir), **MCP** (project config, Markdown results, update injection), **Skills & Commands** (skills enabled, registry URL, custom directories, Claude user/project commands), **Hindsight Behavior** (auto recall/retain, retain mode, mental models enabled/auto-seed), **HTML Export Theme** (`theme.dark` / `theme.light` override). Settings persist in `omp-settings.json` and are validated against the omp schema on write.
- **Session modes & events**: queue-mode controls added to Settings → AI → Queue Modes; `set_fast_mode`, `set_auto_retry`, `abort_retry` bridged; omp events `notice`, `auto_retry_start/end`, `retry_fallback_start/end`, `model_changed`, `thinking_level_changed`, `goal_updated`, `session_settled` surface as quiet system lines (previously silently dropped); `cycle_model` (`Alt+]`) and `cycle_thinking_level` shortcuts announced.
- **Settings → Extensions** — lists installed omp plugins (npm + marketplace) with name, version, source badge, and enable/disable toggle; install from npm/git spec via validated text field; uninstall with confirm (DestructiveActionDialog); spec validation blocks local paths and shell metacharacters.
- **Context-usage popover**: auto-compact toggle reads initial state from `omp.state` and writes via `omp.auto-compaction.set` RPC; session stats (tokens in/out/cache, cost) shown after each turn via new `omp.session.stats` bridge route.
- **Collab / Share panel** — sticky panel below the transcript for the `/share` snapshot command; Copy button for the resulting URL; link to Settings → AI → Collab; live collab remains TUI-only.
- bridge/RPC: `bash`/`abort_bash`, `set_event_filter`, `ttsr_triggered` (→ system line); fast-mode/auto-retry toggles in context inspector; "Run shell command…" and "Abort retry" transcript menu items; `subagentId?` on `AgentEventEnvelope`; `todo_reminder`/`todo_auto_clear` event types; `FCODE_BENCH_PATH` set from active bench; parity matrix updated.
- omp extension `setStatus`/`setWidget`/`setTitle` UI requests are now rendered: status entries in the status line, widget lines as a collapsible block above the composer, `setTitle` overrides the session title in the topbar.
- Settings → AI → Permissions: tool approval mode selector (Ask every time / Auto-approve reads / Auto-approve all) persisted as `approval-mode.json`; passed via `FCODE_TOOL_APPROVAL_MODE` env var and `--approval-mode` CLI flag; default stays `always-ask`.
- Settings search now indexes all omp sections; OmpSubagentsList messages popover has focus trap + Esc + return-focus; various omp settings sections show loading/error/sidecar-not-running states instead of blanking; MemoryTab guards config card behind a loading spinner; OmpExtensionsSection requires confirm before uninstall; OmpSessionTreeTab uses DestructiveActionDialog instead of `window.confirm`; share URL and agent model IDs truncate with title tooltip; DAP breakpoint form uses i18n aria-labels.
- One in-app file editor: Files view (`Mod+2`) is now the single in-app editor; separate Monaco Code page, Changed panel, and `monaco-editor` dependency removed; unsaved edits survive crash or plugin reload as a draft (draft checks the file on disk before saving); DocType browser moved to Bench; `git restore` whole-file path removed (Review snapshot rollback is the only undo path); `navToCode` shortcut renamed `navToFiles` (custom bindings carry over; saved `pi.file-manager` tabs move to `fcode.files`).
- `export_html` uses omp's configured TUI themes (dark: titanium, light: light); HTML adapts to the viewer's `prefers-color-scheme`; Settings → AI → HTML Export Theme card lets users override `theme.dark`/`theme.light` in `omp-settings.json`; `display.*` settings excluded from the overlay (no effect under `--mode rpc`).
- `fcode_studio` host tool (always-prompt): publish/unpublish app/page, revert page draft, enable/disable app export; `fcode-studio` skill documents driving Studio pages through exported JSON.
- Parity matrix reconciled against `main` @ 9c26393c4 (54 status changes, 20 new rows; 204 → 224 rows); duplicate CHANGELOG entry for PR #62 deleted; 19 merged worktrees pruned from `fcode-wt/`; `packages/shared/vitest.config.ts` added; `linux-arm64` removed from `build-omp.mjs` targets.

### Fixed

- `fcode_bench_execute` / `fcode_bench_execute_read` no longer fail with `NameError` when `kwargs` contain booleans or null: kwargs are now sent as a Python literal instead of JSON.
- `fcode_bench_execute`, `fcode_bench_execute_read`, and `fcode_bench_run` now return the actual output on failure instead of a keyword-guessed hint (a `DoesNotExistError` traceback was previously reported as "Site does not exist").
- `fcode_bench_execute_read` auto-approves `frappe.client.get_value` and `frappe.client.get_count`.
- `fcode_bench_execute_read` no longer auto-approves any method string that merely begins with an approved prefix; only plain dotted identifiers are matched.
- `fcode-studio` and `fcode-bench` skills passed a Frappe app name to `build-studio-app`; it takes the Studio App name — fixed.
- Build tab never saw `watch-studio` output because Python block-buffers `print()` on a pipe; watcher now runs unbuffered, matching real `watching …` / `synced …` lines.
- omp bridge crash at start (`approvalMode` out of scope in `main()`) fixed; extension status/widget/title/editor-text updates now reach the renderer (`type` vs `kind` mismatch on `sidecar.ext_ui` fixed).
- Security: YAML injection via `agentModelOverrides` key fixed (agent key now `JSON.stringify`-quoted in overlay); `validateOmpSettings` rejects keys with non-identifier chars (newlines, colons, spaces); `file:`/`git+file:`/`svn+`/`hg+` URI schemes blocked in `validateInstallSpec`; collab panel only renders `<a>` for http(s) URLs; Hindsight supervisor strips raw process output from IPC state message; port validated 1024–65535 in `hindsightLocalStart`; `benchRun` validates each `args` element against an identifier-safe regex.
- `inflight-checkpoint.test.mjs` flaky timing fixed (freeze `Date.now()` via `t.mock.timers`); `plugin-mcp.test.mjs` `connectTimeoutMs` 20 → 300.

[0.17.0]: https://github.com/Coale-Tech/fcode/releases/tag/v0.17.0
[0.16.0]: https://github.com/Coale-Tech/fcode/releases/tag/v0.16.0
[0.15.7-fcode.2]: https://github.com/Coale-Tech/fcode/releases/tag/v0.15.7-fcode.2
[0.15.7-fcode.1]: https://github.com/Coale-Tech/fcode/releases/tag/v0.15.7-fcode.1

---

## Release note template

<!-- Copy this block when drafting a new release -->

## [X.Y.Z] — YYYY-MM-DD

### Compatibility

| Fcode | PI-Desktop base | omp commit | Bridge protocol | Frappe |
|-------|-----------------|-----------|-----------------|--------|
| X.Y.Z | 0.15.7 | `<sha12>` | v2 | v15, v16, v17 |

### Added
-

### Changed
-

### Fixed
-

### Removed
-

[X.Y.Z]: https://github.com/Coale-Tech/fcode/releases/tag/vX.Y.Z
