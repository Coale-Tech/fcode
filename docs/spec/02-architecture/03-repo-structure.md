# 03. Repo Structure

## 1. Workspace layout

Two workspaces share one repository: pnpm owns every JavaScript package
(`apps/*`, `packages/*`, `docs`), Cargo owns the Rust crate. Root
`package.json` scripts fan out to both.

```text
fcode/                        # repo root (GitHub Coale-Tech/fcode; local checkout dir PI-Desktop)
├── apps/
│ ├── desktop/                # Electron product shell
│ │ ├── electron/
│ │ │ ├── main/               # main process, one module per concern; subdirs ipc/ runtime/ bootstrap/ services/ remote/ bench/ importers/ hindsight-local/
│ │ │ ├── preload/            # renderer and plugin-panel preloads
│ │ │ ├── shared/             # code both main and preload import
│ │ │ └── test/
│ │ ├── src/                  # React renderer
│ │ │ ├── components/         # UI; settings/, workpanel/, plugins/, extensions/, bench/, code/
│ │ │ ├── features/           # domain modules: app, chat, kanban, omp-tools, plugins, projects, scheduled, sessions, settings, voice, work-panel
│ │ │ ├── hooks/              # React hooks
│ │ │ ├── lib/                # framework-free renderer logic and the IPC client
│ │ │ ├── pages/              # routed destinations
│ │ │ ├── stores/             # zustand app store, with slices/ and runtime/
│ │ │ ├── styles/             # CSS split by surface; tokens.css is the design system
│ │ │ ├── assets/             # fonts and brand art
│ │ │ └── capture/            # capture rig for screenshots
│ │ ├── test/                 # node --test suites (*.test.mjs) and helpers/
│ │ ├── resources/            # packaged extraResources: bin/, skills/, fcode-skills/, fcode-agents/, skill-packs/, plugins/, models.dev/
│ │ ├── build/                # icons and macOS entitlements for electron-builder
│ │ ├── index.html
│ │ ├── electron.vite.config.ts
│ │ └── package.json          # also holds the electron-builder config
│ ├── filebird/               # FileBird SFTP client, its own Electron app; out/ ships inside the desktop app
│ ├── fcode-cli/              # `fcode` CLI: drives a running desktop app over its local RACP server
│ └── pi-host/                # headless Fcode host: host-core + omp-bridge over RACP-WS
├── crates/
│ └── host-core/              # Rust privileged host (binary pi-desktop-host-core)
│   ├── Cargo.toml
│   └── src/                  # rpc/, tools/, plus one module per domain
├── omp/                      # VENDORED agent engine; in neither workspace, built with Bun
│ ├── packages/               # agent, ai, browser-relay, catalog, coding-agent, collab-web, mnemopi, natives, omptype, snapcompact, stats, tui, utils, wire
│ └── crates/                 # pi-ast, pi-builtins, pi-diff, pi-edit, pi-iso, pi-natives, pi-shell, pi-vcs, pi-vfs, pi-voice, pi-walker, vendor
├── packages/
│ ├── shared/                 # IPC/protocol contracts, error codes, changelog
│ ├── i18n/                   # shipped UI catalogs plus locale helpers
│ ├── omp-bridge/             # the shipped agent sidecar: Node bridge to the omp binary
│ ├── host-runtime/           # Electron-independent runtime: stdio transports, supervisor, turn lifecycle, host-proxy allowlist
│ ├── agent-host/             # headless Agent Host module: admission, queue, approvals, event log
│ ├── agent-runtime/          # shared Node helpers (provider binding, prompt enhancement, ...); the pi agent loop is retired
│ ├── racp/                   # RACP-WS server and client, device-token pairing
│ ├── voice-runtime/          # local speech-to-text runtime for voice dictation
│ ├── plugin-sdk/             # plugin author types and validators
│ └── plugin-devkit/          # pi-plugin CLI: scaffold, check, pack, publish
├── examples/
│ ├── plugins/                # hello and roundtable sample plugins
│ └── fixtures/sample-project # workspace fixture for E2E scenarios
├── docs/                     # VitePress site and the English source of truth
│ ├── spec/                   # numbered specification domains (see spec/README.md)
│ ├── adr/                    # architecture decision records
│ ├── project/                # board, audits, implementation plans
│ ├── guide/                  # user-facing quick guide
│ ├── zh-CN/                  # path-for-path Chinese mirror of spec/ and guide/
│ ├── image/                  # images embedded by the repository READMEs
│ ├── public/                 # static assets served by the docs site
│ ├── scripts/                # docs-only checks (check-locales.mjs)
│ └── .vitepress/             # site config and theme
├── scripts/                  # repository automation (see scripts/README.md)
├── .github/                  # CI and release workflows, issue templates
├── AGENTS.md                 # mandatory rules for AI coding agents
├── package.json              # root scripts, pnpm workspace
├── pnpm-workspace.yaml
├── Cargo.toml                # Rust workspace; excludes omp/
└── README.md · README.zh-CN.md
```

`omp/` is a vendored snapshot of the oh-my-pi agent engine, not a dependency.
It is excluded from the Cargo workspace (`exclude = ["omp"]`), absent from
`pnpm-workspace.yaml`, and installs with Bun. `scripts/build-omp.mjs` compiles
it (Bun `--compile`, one binary per target) into
`apps/desktop/resources/bin/omp-<platform>-<arch>`, which electron-builder
ships as `bin/omp`. The snapshot diverged from oh-my-pi v18.12.3 (`53a0377db6`, re-snapshotted from `ba344f5e69`) and is not
synced upstream; after changing it, re-run `build-omp.mjs`.

Linked `git worktree` checkouts — for example the `fcode-worktrees/`,
`fcode-wt/`, and git-ignored `PI-Desktop-worktrees/` directories on a
maintainer's workstation — are further working copies of this same repository:
each holds a `.git` file pointing into the main checkout's `.git/worktrees/`,
shares its object store and refs, and contains no distinct source. Exclude them
from repository-wide scans.

## Split-domain facades

Large entry points remain compatibility facades while their implementation is
owned by domain modules. Electron main wires `ipc/`, `runtime/`, `bootstrap/`,
and `services/`; renderer page entry points delegate to `features/app`,
`features/plugins`, and `features/settings`; and host-core facades delegate to
the `plugins/`, `db/`, `providers/`, and `plans/` submodules. The shared
`types.ts` entry point re-exports the domain files under `shared/src/types/`.

The facade paths preserve existing imports and public contracts. New logic
belongs in the domain module that owns its state or process boundary.

Source budgets are reported and enforced by
[`scripts/check-architecture.mjs`](../../architecture/README.md). Its
allowlist records only existing extraction debt with a reason.

## 2. Package responsibilities

### `apps/desktop`
Product entry:
- Electron lifecycle, windows, tray, application menu
- IPC surface between renderer and main
- host-core and sidecar process supervision
- plugin runtime, panels, and views
- packaging configuration

### `apps/filebird`
FileBird, a cross-platform SFTP client built as its own Electron app.
`apps/desktop` builds it with its other workspace dependencies and ships
`out/preload` and `out/renderer` as `Resources/filebird/`.

### `apps/pi-host`
Headless Fcode host (`pi-host` CLI): host-core plus the omp-bridge sidecar
served over RACP-WS, bound to loopback by default. It is the remote-control
deployment target; see the process model, section 7.

### `apps/fcode-cli`
The `fcode` command (`worktree`, `bench`, `session`, `canvas`). It is an
esbuild bundle shipped via `extraResources`; the desktop app writes a shim at
`<userData>/cli/bin/fcode` that sets `FCODE_ENDPOINT_FILE` and runs the bundle
with `ELECTRON_RUN_AS_NODE=1`. It talks to the desktop-resident RACP server
(`racp-local-server.ts`, loopback, owner-role device token in
`<userData>/cli-endpoint.json`, mode 0600). Exit codes: 0 ok, 1 error, 2 Fcode
not running. See [ADR](../../adr/orca-influenced-workflow-capabilities.md).

### `crates/host-core`
Rust host services:
- tools execution
- permission gateway
- plugin host services
- persistence (SQLite, transcripts, artifacts, secrets)
- audit logging

### `packages/omp-bridge`
The shipped agent sidecar:
- bundled to `dist-bundle/bridge.js` and run by Electron main (and `pi-host`)
  as a Node child process
- spawns the bundled `omp` binary in `--mode rpc` and maps its events and
  extension UI requests onto Fcode events
- skill curation, review, and pack logic

### `packages/host-runtime`
Electron-independent runtime shared by the desktop app and `pi-host`:
- stdio transports to host-core and the sidecar, with restart supervision
- turn lifecycle, persistence, and in-flight checkpoints
- plan dispatch and execution; bench and kanban cores
- `HOST_PROXY_ALLOWED`, the allowlist of host methods the sidecar may call back
  into

### `packages/agent-runtime`
Shared Node helpers consumed by Electron main, `host-runtime`, and `pi-host`:
- provider binding and headers, model-capability mapping
- prompt enhancement and templates, session-title summarisation
- project-instruction chain loading, plugin one-shot completion
- proxy and SOCKS5 relays, speech and image-generation helpers

The pi agent loop this package originally wrapped (`DesktopAgentRuntime`, entry
`src/sidecar.ts`) is no longer launched or packaged; the shipped sidecar is
`packages/omp-bridge`.

### `packages/voice-runtime`
Local speech-to-text for voice dictation:
- `VoiceController`, `TranscriptionEngine`, and `ModelManager` with a model
  catalog and downloader
- PCM utilities and Chinese output conversion
- consumed by the main-process voice service

### `packages/shared`
Cross-boundary contracts:
- IPC channel names
- DTO types, split by domain under `src/types/` and re-exported from `types.ts`
- error codes
- protocol versioning
- changelog entries surfaced in the app

### `packages/i18n`
- English source catalog and shipped translated catalogs
- locale registry and resolution helpers
- message ID conventions

### `packages/plugin-sdk`
- manifest types
- host API types
- validators

### `packages/plugin-devkit`
- `pi-plugin` CLI used by plugin authors and the marketplace publish flow
- template scaffolding, manifest check, package, publish

## 3. Runtime data (not in git)

`PI_DESKTOP_DATA_DIR` overrides the default location: `~/.pi-desktop` for a
packaged installation, `~/.pi-desktop-dev` for a development build, which is
how `pnpm dev` runs beside the packaged app (D599).

```text
~/.pi-desktop/
 ├── pi.sqlite               # single DB, host-core owned (03-runtime/04, D086)
 ├── sessions/               # per-session transcript files (D119)
 ├── artifacts/              # plan and goal checkpoint artifacts
 ├── attachments/            # content-addressed prompt attachment blobs (main)
 ├── scratch/<sessionId>/    # session-scoped temporary files
 ├── secrets/
 ├── logs/
 │    ├── app/<category>.log
 │    ├── host/<category>.log
 │    └── agent/<category>.log
 ├── cache/
 ├── plugins/
 │    ├── installed/
 │    ├── data/
 │    ├── logs/
 │    ├── cache/
 │    ├── market/             # catalog and downloaded packages
 │    └── registry.json
 ├── window-state.json       # last main-window bounds (main)
 └── close-behavior.json     # persisted close-to-tray choice (main)
```

## 4. Naming conventions

| Object | Convention |
|---|---|
| JS packages | `@pi-desktop/*` |
| Rust crate | `pi-desktop-host-core` (or `host-core`) |
| IPC channels | `pi-desktop/<domain>/<action>` |
| i18n keys | `domain.section.key` |
| Plugin IDs | reverse-domain style |
| Main-process modules | one file per concern under `electron/main/`; `index.ts` wires them |
| Renderer tests | `apps/desktop/test/<subject>.test.mjs`, never beside the source |
