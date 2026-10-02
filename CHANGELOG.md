# Changelog

All notable changes to Fcode are documented here.
Fcode is a fork of [PI-Desktop](https://github.com/vastsa/PI-Desktop) with the agent brain replaced by [omp](https://github.com/can1357/oh-my-pi).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) on Fcode's own line, starting at 0.16.0.
The two early previews used `0.15.7-fcode.N` (PI-Desktop 0.15.7 plus a prerelease suffix). That scheme sorted below upstream 0.15.7 and was always a prerelease, so the in-app updater (stable releases only) never offered it.
The PI-Desktop release each version is based on is listed in its Compatibility table.

## [Unreleased]

## [0.17.1] — 2026-10-02

### Compatibility

| Fcode | PI-Desktop base | omp commit | Bridge protocol | Frappe |
|-------|-----------------|-----------|-----------------|--------|
| 0.17.1 | 0.15.7 | `ba344f5e69f2` | v2 (v1 read-only fallback) | v15, v16 |

### Fixed

- Chat showed "Working…" forever and the Activity tab stayed empty. The omp bridge forwarded omp's raw frames, which carry no `sessionId`/`turnId`, so the host rejected every event. The bridge now stamps the active prompt's ids and converts omp assistant messages to PI messages with streamed text and thinking deltas.
- Tool approvals hung. omp asks "Allow tool: …" as an `Approve`/`Deny` select that the bridge mapped to an empty question card, and the answer was routed to host-core instead of omp. Approvals now show the permission card and Allow/Deny reaches omp, so the tool runs or is declined.
- macOS builds without a Developer ID signature (current releases) fell into in-app update mode and "Restart to update" did nothing (Squirrel.Mac: "Could not get code signature"); unsigned apps now use the manual download-from-releases flow.

### Changed

- Bench page: the bench sidebar list is replaced by tabs. An "All benches" tab (filter, All / Running / Failed / version chips, running-first table) plus one closable tab per opened bench, each with a header switcher to jump between benches. Start is disabled with a "Stop <bench> first" cue on every other bench while one runs (the supervisor is single-bench); "Stop all running" is gone. A stopped bench collapses its empty log.
- Build page redesigned header-first: a header shows the bench, site, port and status with one action that fits the state (Start bench, Fix N issues, or Sync files on Builder). A banner under the tabs shows the first failing check with its fix command (Copy, Dismiss), and the sidebar is a plain app list. A bottom status bar always shows the four Studio checks with labels, so health is visible when everything passes. Replaces the hidden-when-passing precondition list.
- Chat page: new **Activity** tab in the Work Panel (to-do progress, tools-run timeline, changes summary, a "Needs your decision" link to the pending approval) that auto-opens on the first run or permission request of a session. Approval card now stacks Allow this once / Allow for this session / Deny with a consequence line each and a depleting timeout bar. The bench bar (`WorkspaceBar`) now reads the real bench, site and run state instead of always showing "No bench · No site · stopped"; sidebar rows show an always-visible `···` button plus Running / Needs approval labels; the dead single-option mode chip is hidden.

## [0.17.0] — 2026-10-01

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
