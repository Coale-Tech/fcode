# Changelog

All notable changes to Fcode are documented here.
Fcode is a fork of [PI-Desktop](https://github.com/vastsa/PI-Desktop) with the agent brain replaced by [omp](https://github.com/can1357/oh-my-pi).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
- Stop shipping `packages/agent-runtime/dist-bundle` as `Resources/agent-runtime`; omp-bridge is the only bundled agent runtime.
- Code tab rebuilt as a full IDE surface: nested collapsible file tree with filter, Monaco editor loaded
  fully offline (no cdn.jsdelivr.net), tab strip, breadcrumb, status bar (branch/Ln/Col/language),
  Cmd+S save, Cmd+P quick-open palette; "Changed this session" right panel with DiffEditor vs git HEAD
  and per-file Keep/Revert; Frappe DocType browser (app→module→DocType grouping, migrate badge for
  git-dirty doctype JSONs, Run migrate button wired to bench run); nav rail adds text labels under Chat /
  Code / Build / Bench icons and removes the stuck tooltip on labelled items
- Subscribe to omp subagent progress on session open; map `subagent_lifecycle`/`subagent_progress` frames to `agent.event` rows with `parentToolCallId`+`agentName` for SubagentTopology UI
- Public Frappe skill set: nine `fcode-*` skills under `apps/desktop/resources/fcode-skills/` covering routing, DocType development, API development, app hooks, bench operations, frappe-ui, Fcode host tools, Studio, and Builder
- Pass `FCODE_DATA_DIR` and `FCODE_RESOURCES_PATH` to the omp bridge sidecar so the packaged app uses the bundled `Resources/bin/omp` binary and writes its overlay to the app data directory instead of the `~/.fcode-dev` default

- Wire ten omp sidecar methods end-to-end: `ompModelsList`, `ompModelsSet`, `ompThinkingLevels`, `ompThinkingSet`, `ompCommandsList`, `ompState`, `ompLoginProviders`, `ompLoginStart`, `ompSessionBranch`, `ompSessionRename` via new `omp-ipc.ts` registrar and `api.ts` exports; handle `sidecar.fatal` and `open_url` notifications in `wireSidecar`.
- Wire composer UI to omp: model picker sources from `omp.models.list` (fcode-* providers first), selection via `omp.models.set`; thinking levels from `omp.thinking.levels`, committed via `omp.thinking.set`; context window from `omp.state` after each turn; slash autocomplete merges `omp.commands.list` (Pi commands take precedence); unknown slash commands pass through to omp as prompt text.
- omp-bridge logs binary path, negotiated protocol version, and host-tool registration result to stderr; failed registration (and protocol downgrade) surfaces as an app toast
- Settings: hide MCP / Skills / Subagents tabs (omp owns them); add omp accounts panel (login providers + Log in buttons); agent-only MODE_CYCLE; fork via omp.session.branch, rename via omp.session.rename for native-pi sessions; replace "Native Pi" / "Pi" badge with "omp"; remove PlanApprovalBar.

## [0.15.7-fcode.2] — 2026-09-29

### Compatibility

| Fcode | omp commit | Bridge protocol | Frappe |
|-------|-----------|-----------------|--------|
| 0.15.7-fcode.2 | `ba344f5e69f2` | v2 (v1 read-only fallback) | v15, v16 |

### Added
- omp (oh-my-pi) replaces the Pi agent brain via `packages/omp-bridge`
- Three new IDE surfaces: Code tab (Monaco), Build tab (Studio/Builder), Bench tab
- Bench discovery: auto-scans configured roots for Frappe benches
- `fcode_bench_execute`, `fcode_bench_run`, `fcode_canvas`, `fcode_canvas_read` host tools
- `fcode_canvas` force-acquires the shared canvas for agent-driven actions and shows a visible "Agent is using this canvas" banner in the Build tab, restoring the previous owner afterward
- Release pipeline for Developer ID signed and notarized macOS builds under Coale-Tech (needs the signing secrets in Actions; this preview ships unsigned)
- Legal attribution (`NOTICE.md`) and commercial-control-point decision record
- `scripts/check-legal.mjs` gates every release against upstream identity leakage
- `scripts/build-omp.mjs` builds and stages the omp binary from a pinned oh-my-pi commit
- `pnpm fcode:doctor` contributor setup checker
- `pnpm fcode:dev` single-command contributor workflow
- Windows x64 packaging: `scripts/build-omp.mjs` cross-compiles the omp binary for `win32-x64`, and the release pipeline builds an NSIS installer, portable EXE, and ZIP (the Bench tab remains macOS/Linux-only — no POSIX bench transport exists on Windows)
- Release CI provisions Bun, the pinned oh-my-pi sibling checkout, and its native `pi_natives` addon (built via oh-my-pi's own local cargo/napi `host` path — no bazel needed) before packaging, so `bundle:runtime` actually runs in a release build. The addon is cached per OS/arch/pinned-commit (`actions/cache`) since the cold compile takes ~5min on arm64 but ~42min on every x64 runner class; the build job's timeout is 120 minutes to give the uncached path room alongside macOS notarization.

### Changed
- `appId`: `net.aiuo.pi-desktop` → `com.coaletech.fcode`
- `productName`: `PI-Desktop` → `Fcode`
- Auto-updater `RELEASES_URL` repointed to `Coale-Tech/fcode`
- macOS artifact name: `Fcode-${version}-${arch}-mac.${ext}`
- Signing identity: Coale-Tech Developer ID (replaces upstream DUV63RKYTW)
- Skills pack shipped as a separate `fcode-skills` resource directory
- Renderer adopts Frappe's Espresso design system (Raven primitives, InterVariable font) with light and dark themes; the `system` default is unchanged
- App frame: a 60px nav rail (Chat, Code, Build, Bench; Scheduled, Plugins, Notifications, Settings) beside a 256px context sidebar and a rounded content island; Bench and Build render their own context sidebar and island
- Status and accent colours resolve from Espresso tokens; the primary button is solid gray and hues are reserved for status

### Removed
- `mirror-to-cnb.yml` workflow (mirrored to upstream owner's registry)
- `pi-host-bundle` release job (bundled the replaced Pi brain)

### Fixed
- `pnpm fcode:doctor` no longer exits on Windows: it warns that the Bench tab needs macOS, Linux, or WSL2 and runs the remaining checks
- The "bench command not found" failure on Windows now says bench is not supported natively and points to WSL2/macOS/Linux instead of `source env/bin/activate`
- Docs: Windows runs the app but not the Bench tab, and inherits PATH from the parent process instead of reading a POSIX login shell

[0.15.7-fcode.2]: https://github.com/Coale-Tech/fcode/releases/tag/v0.15.7-fcode.2

---

## Release note template

<!-- Copy this block when drafting a new release -->

## [X.Y.Z] — YYYY-MM-DD

### Compatibility

| Fcode | omp commit | Bridge protocol | Frappe |
|-------|-----------|-----------------|--------|
| X.Y.Z | `<sha12>` | v2 | v15, v16, v17 |

### Added
-

### Changed
-

### Fixed
-

### Removed
-

[X.Y.Z]: https://github.com/Coale-Tech/fcode/releases/tag/vX.Y.Z
