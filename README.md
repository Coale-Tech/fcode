<div align="center">

# Fcode

### AI coding agent for Frappe and ERPNext developers

**Fcode is a desktop AI coding agent for Frappe/ERPNext developers — forked from [PI-Desktop](https://github.com/vastsa/PI-Desktop) and powered by omp, giving you a supervised local bench, an in-app file editor, and Studio/Builder canvas integration alongside a persistent AI agent that understands Frappe's anatomy.**

[![Release](https://img.shields.io/github/v/release/Coale-Tech/fcode?include_prereleases&label=release)](https://github.com/Coale-Tech/fcode/releases)
[![CI](https://github.com/Coale-Tech/fcode/actions/workflows/ci.yml/badge.svg)](https://github.com/Coale-Tech/fcode/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Coale-Tech/fcode)](LICENSE)

[Download](https://github.com/Coale-Tech/fcode/releases) ·
[Changelog](CHANGELOG.md) ·
[Issues](https://github.com/Coale-Tech/fcode/issues) ·
[Developer docs](docs/fcode/README.md)

</div>

> **Early preview.** The newest release is the unsigned [v0.18.6](https://github.com/Coale-Tech/fcode/releases/tag/v0.18.6) for macOS, Windows, and Linux. It ships the omp agent and the Code, Build, and Bench surfaces; it is not yet the completed Frappe IDE described by the project roadmap.

## Contents

- [What Fcode is](#what-fcode-is)
- [Features](#features)
- [Download and install](#download-and-install)
- [First run](#first-run)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Where Fcode keeps your data](#where-fcode-keeps-your-data)
- [Current status and limitations](#current-status-and-limitations)
- [Build from source](#build-from-source)
- [Architecture](#architecture)
- [Documentation](#documentation)
- [Release policy](#release-policy)
- [Security and privacy](#security-and-privacy)
- [Contributing](#contributing)
- [Upstream and license](#upstream-and-license)

## What Fcode is

Fcode is a desktop app where an AI agent works on your Frappe and ERPNext code alongside you. The agent is **omp** ([oh-my-pi](https://github.com/can1357/oh-my-pi)), vendored in this repository and run as a local child process. Fcode adds what a Frappe developer needs around it:

- a **bench cockpit** that finds your local benches, starts and stops them, and streams their logs;
- a **Build** surface that embeds Frappe Studio and Builder so you and the agent see the same canvas;
- **Frappe skills and bench tools** so the agent can query a site, run `bench` commands and drive the canvas, each behind an approval prompt;
- a desktop shell inherited from PI-Desktop: projects, persistent chats, model providers, permissions, plugins, scheduled tasks and voice input.

Fcode supports Frappe **v15 and v16** benches.

## Features

### Chat and the agent

- **Persistent chats per project.** Each chat keeps its own omp session and runs in the project's folder, so history never leaks between chats. Temporary chats are available for throwaway questions.
- **Bring your own model.** Configure any provider supported by omp (API key or custom endpoint) under **Settings → AI → Models**. The model chip on each chat shows the model that answers; `Alt+]` cycles models and `Alt+[` cycles the thinking level.
- **Approvals with risk levels.** Every tool call that changes something asks first. Permission cards show omp's reason, a Low / Medium / High risk label, and three choices: Allow this once, Allow for this session, Deny. Read-only shell commands (`git status`, `git log`, `ls`, `cat`, `grep`, …) can run without a prompt (**Settings → Tools → Approvals**).
- **Work panel** (`Mod+J`) beside the chat:
  - **Activity**: to-do progress, a timeline of tools run, a changes summary and a link to any pending approval.
  - **Files** (`Mod+2`): the in-app editor. Unsaved edits survive a crash as a draft.
  - **Tools**: browser screenshots, eval cells, computer-use and IDA output from the agent.
  - **Session history**: the conversation tree; fork from any earlier message, export the transcript as HTML.
  - **Worktrees**: add, clear and prune git worktrees.
- **Git bar** above the composer: branch picker plus Pull, Push and Create PR, each sent to the agent as a prompt.
- **Integrated terminal** under the chat (`` Ctrl+` ``): real shell tabs in the session's workspace that keep running while you switch pages.
- **Context and cost.** The context popover shows tokens in/out, cache and cost per session, with an auto-compaction toggle.
- **Subagents, queue modes and slash commands.** omp's task subagents, steering/follow-up queue modes, `/learn` (write a reusable skill) and `/share` are exposed in the UI.
- **Debugging (DAP).** Breakpoints with conditions, continue/step/pause controls, stack frames and variables.

### Frappe and ERPNext

- **Bench page** (`Mod+4`): discovers benches under `~/ERPNext` (or a folder you choose with **Bench folder…**), shows each bench's version and sites, and starts or stops one bench at a time with live logs. Quitting Fcode stops the whole bench process tree (honcho, gunicorn, redis). Extra search roots can be added with `FCODE_BENCH_ROOTS`.
- **Build page** (`Mod+3`): opens Frappe **Studio** and **Builder** for the running bench. A header shows the bench, site, port and status with the one action that fits (Start bench, Fix N issues, Sync files); a status bar keeps the four Studio checks visible.
- **Bench tools for the agent**, registered by the omp bridge:

  | Tool | What it does | Approval |
  | --- | --- | --- |
  | `fcode_bench_execute` | `bench --site <site> execute <method>` | Read-only methods (`frappe.client.get`, `get_list`, `get_value`, `frappe.db.count`, …) run without a prompt; everything else asks |
  | `fcode_bench_run` | `migrate`, `clear-cache`, `build`, `build-studio-app`, `list-apps`, `install-app` | Always asks |
  | `fcode_canvas` | Navigate, click, fill and evaluate in the Build canvas | Always asks |
  | `fcode_canvas_read` | Snapshot, console and screenshot of the canvas | No prompt |
  | `fcode_studio` | Publish/unpublish Studio apps and pages, revert drafts, toggle app export | Always asks |

- **Bundled Frappe skills** that teach the agent Frappe's conventions: DocType development, API development, app hooks, bench operations, Studio, Builder and frappe-ui (`apps/desktop/resources/fcode-skills/`).

### Workspace tools

- **FileBird** (nav rail): a full SFTP client inside Fcode with local and remote panes, transfers, saved connections and remote terminals. Secrets stay in the OS keychain under "Fcode FileBird".
- **Raven** (Settings → Raven): open your Frappe site's Raven chat in its own browser session, which the agent cannot reach. Fcode stores no Frappe credentials.
- **Scheduled tasks**: run prompts on a schedule, start from six templates (daily digest, weekly repo review, standup, dependency check, test sweep, inbox triage), see success rate and duration on the Runs tab, and import/export tasks as JSON.
- **Kanban** (off by default; Settings → Kanban): a task board whose cards each run their own agent in their own folder, several at once, with priorities, parent/child links, comments and run history.
- **Pull requests**: list open and draft pull requests for the current project and hand one to the agent.
- **Extensions**: install omp plugins from npm or git, enable, disable or remove them (Settings → Extensions). Fcode also loads desktop plugins and MCP servers.
- **Voice input** (`Mod+Shift+V`).

### Memory

The agent can remember facts across sessions (**Settings → Memory**):

| Backend | Where it runs |
| --- | --- |
| Mnemopi (default) | Local SQLite and vector store inside the agent process; no service needed |
| Hindsight | A Hindsight server you connect to, or one Fcode starts locally |
| Off | No memory |

A health card shows whether memory is working. You can also write a short user profile (`USER.md`) that is added to every session. Recalled text is stripped of prompt-injection patterns and secrets before it reaches the model.

### Interface

- Light and dark themes; FileBird follows Fcode's theme.
- Languages: English, 简体中文, 繁體中文, Deutsch, Español, Français, 한국어, Português (Brasil), Türkçe.
- Searchable settings (`Mod+,`), global search (`Mod+K`) and a command palette (`Mod+Shift+P`).
- In-app "What's new" shows each release's highlights in your language.

## Download and install

Download the asset for your platform from the newest build on the [Releases page](https://github.com/Coale-Tech/fcode/releases):

| Platform | Asset |
| --- | --- |
| macOS Apple silicon | `Fcode-<version>-arm64.dmg` (or `-arm64-mac.zip`) |
| macOS Intel | `Fcode-<version>-x64.dmg` (or `-x64-mac.zip`) |
| Windows x64 | `Fcode-Setup-<version>.exe`, or `Fcode-Portable-<version>.exe` / `.zip` |
| Linux x64 | `Fcode-<version>.AppImage`, `fcode_<version>_amd64.deb`, or `fcode-<version>-x86_64.rpm` |

Each release also publishes `latest-mac.yml`, `latest.yml` and `latest-linux.yml` with the SHA-512 of every installer. To check a macOS download:

```bash
shasum -a 512 Fcode-<version>-x64.dmg | awk '{print $1}' | xxd -r -p | base64
# compare with the sha512 for the same file in latest-mac.yml
```

### macOS

Open the DMG (or extract the ZIP), move `Fcode.app` to `/Applications`, and open it from Finder.

The build is unsigned because no Coale-Tech Apple Developer ID certificate is configured yet, so macOS may block the first launch. After confirming that the download came from this repository's release page, right-click **Fcode.app**, choose **Open**, and confirm. If macOS still keeps the download quarantined:

```bash
xattr -dr com.apple.quarantine /Applications/Fcode.app
open /Applications/Fcode.app
```

### Windows

Run `Fcode-Setup-<version>.exe`, or use the portable `.exe` / `.zip` without installing. Windows SmartScreen may warn about an unrecognised publisher; choose **More info → Run anyway**.

### Linux

Make the AppImage executable and run it, or install the `.deb` / `.rpm` with your package manager:

```bash
chmod +x Fcode-<version>.AppImage && ./Fcode-<version>.AppImage
sudo apt install ./fcode_<version>_amd64.deb
sudo dnf install ./fcode-<version>-x86_64.rpm
```

### Updates

The Windows installer and the Linux AppImage update in place from the in-app update banner. An unsigned macOS app cannot replace itself, so on macOS the banner links to the download; install the new DMG over the old app.

### Uninstall

Quit Fcode, delete the application, then remove its data if you no longer need it (see [Where Fcode keeps your data](#where-fcode-keeps-your-data)). On macOS:

```bash
rm -rf /Applications/Fcode.app ~/.fcode "$HOME/Library/Application Support/Fcode" \
  ~/Library/Preferences/com.coaletech.fcode.plist
```

## First run

1. **Add a model.** Open **Settings → AI → Models** and add a provider with an API key or endpoint. Pick it as the default.
2. **Open a project.** `Mod+O` opens a folder; each project has its own chats.
3. **Point Fcode at your benches.** Open the Bench page (`Mod+4`). Benches in `~/ERPNext` are found automatically; otherwise use **Choose bench folder…**. A bench needs `sites/` with a `site_config.json`.
4. **Start a bench and chat.** Start the bench from the Bench page, then ask the agent about a site, a DocType or an app. It will ask before it changes anything.
5. **Optional:** pick a memory backend in **Settings → Memory**, and turn on Kanban or Raven if you use them.

## Keyboard shortcuts

`Mod` is `⌘` on macOS and `Ctrl` on Windows and Linux. All bindings can be changed in **Settings → Shortcuts**.

| Action | Default |
| --- | --- |
| Chat / Files / Build / Bench | `Mod+1` / `Mod+2` / `Mod+3` / `Mod+4` |
| New task | `Mod+N` |
| Open project | `Mod+O` |
| Search | `Mod+K` |
| Command palette | `Mod+Shift+P` |
| Settings | `Mod+,` |
| Toggle sidebar | `Mod+B` |
| Open work panel | `Mod+J` |
| Integrated terminal | `` Ctrl+` `` |
| Stop the agent | `Mod+.` |
| Cycle model / thinking level | `Alt+]` / `Alt+[` |
| Voice input | `Mod+Shift+V` |
| Plugin launcher | `Alt+Space` |
| Show or hide the window | `Alt+Shift+W` |
| Back / forward | `Mod+[` / `Mod+]` |
| Zoom in / out / reset | `Mod+=` / `Mod+-` / `Mod+0` |

## Where Fcode keeps your data

| What | Location |
| --- | --- |
| Chats, settings, logs, plugins, FileBird data | `~/.fcode` |
| Development builds (`pnpm dev`) | `~/.fcode-dev` |
| Electron profile (browser views, cache) | macOS `~/Library/Application Support/Fcode`, Windows `%APPDATA%\Fcode`, Linux `~/.config/Fcode` |
| API keys and FileBird secrets | the operating system's credential store (Keychain on macOS) |
| Agent configuration overlay | `~/.fcode/omp-overlay.yml` (written by Fcode on every agent start) |

Application identity: product name `Fcode`, bundle identifier `com.coaletech.fcode`.

## Current status and limitations

The current release line is 0.18.x. The newest release is the unsigned [v0.18.6](https://github.com/Coale-Tech/fcode/releases/tag/v0.18.6), which includes everything in 0.18.5, the first stable build since 0.17.1. See [CHANGELOG.md](CHANGELOG.md) for the full history.

The release pipeline builds macOS (arm64 and x64), Linux (x64) and Windows (x64). Known gaps:

- **Unsigned builds.** Apple Developer ID signing and notarization run in CI, but the required secrets are not configured, so no signed release has shipped. Windows builds are not code-signed either.
- **Bench on Windows.** Frappe bench does not run natively on Windows. The app runs on Windows; use WSL2, macOS or Linux for bench work. On Windows, PATH is inherited from the parent process instead of a login shell.
- **One running bench at a time.** The bench supervisor runs a single bench; stop it before starting another.
- **Live collaboration** (`/share` aside) is available only in omp's terminal UI.

| Fcode | PI-Desktop base | omp commit | Bridge protocol | Frappe |
| --- | --- | --- | --- | --- |
| 0.18.6 | 0.15.7 | `ad66aa91e6e7` | v2 (v1 read-only fallback) | v15, v16 |

## Build from source

### Requirements

| Tool | Version |
| --- | --- |
| OS | macOS, Linux or Windows (Bench needs macOS, Linux or WSL2) |
| Node.js | `>= 22.19` |
| pnpm | `>= 10` |
| Rust | latest stable (the first omp native build also pulls nightly through rustup) |
| Bun | `>= 1.2` |

omp is vendored in `omp/`. Its first native build is slow when cold (about 40 minutes on x64).

### Build and run

```bash
git clone https://github.com/Coale-Tech/fcode.git
cd fcode
pnpm install

# unpacked app for local testing
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm -C apps/desktop run pack
open apps/desktop/release/mac/Fcode.app        # macOS
```

For full installers (host-core, omp binary, then electron-builder):

```bash
pnpm -C apps/desktop run build:host-release
node scripts/build-omp.mjs
pnpm -C apps/desktop run dist                  # output in apps/desktop/release/
```

### Development

```bash
pnpm dev
```

Development builds use `~/.fcode-dev`, so they never touch an installed Fcode's data.

### Validation

Run before every commit:

```bash
pnpm typecheck
pnpm lint
pnpm test
node scripts/check-architecture.mjs
```

## Architecture

```text
Fcode
├── apps/desktop              Electron main process and React renderer
│   ├── electron/main         windows, IPC, bench supervisor and discovery, agent sidecar
│   ├── src                   renderer: pages, chat, work panel, settings
│   └── resources             bundled Frappe skills, plugins, model catalog
├── apps/filebird             FileBird SFTP client embedded in Fcode
├── apps/pi-host              headless agent host (RACP WebSocket server)
├── crates/host-core          Rust persistence (SQLite) and host services
├── omp/                      vendored omp (oh-my-pi) agent
├── packages/omp-bridge       JSON-RPC bridge between Fcode and `omp --mode rpc`
├── packages/agent-host       turn queue, approvals and event handling
├── packages/agent-runtime    legacy preview agent runtime
├── packages/host-runtime     sidecar process integration
├── packages/i18n             UI translations (9 locales)
├── packages/plugin-sdk       plugin API and dev kit (with plugin-devkit)
├── packages/voice-runtime    voice input
└── packages/shared           shared protocol, shortcuts, changelog, app identity
```

How a turn flows:

```text
renderer ──IPC──▶ main process ──NDJSON──▶ omp-bridge ──JSON-RPC v2──▶ omp --mode rpc
                      │                                                    │
                      ├── bench supervisor (start/stop/logs)               ├── model provider
                      └── host-core (SQLite: chats, turns, checkpoints)    └── host tools: fcode_bench_*, fcode_canvas*, fcode_studio
```

Internal `@pi-desktop/*` package names, `pi-desktop/*` IPC channels and the `pi-desktop-host-core` binary name are kept for upstream compatibility. They are implementation identifiers, not the product name.

## Documentation

| Document | Covers |
| --- | --- |
| [docs/fcode/README.md](docs/fcode/README.md) | Developer reference: bridge protocol, omp overlay, host tools, memory, release build, test matrix, common failures |
| [CHANGELOG.md](CHANGELOG.md) | Every release with its compatibility row |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [SECURITY.md](SECURITY.md) | Reporting vulnerabilities |
| [docs/plugin-development.md](docs/plugin-development.md) | Writing desktop plugins |
| [docs/adr/](docs/adr/) | Architecture decision records |
| [NOTICE.md](NOTICE.md) | Upstream attribution |

## Release policy

- Releases are cut with `node scripts/release.mjs <version> --tag`; `scripts/check-release-docs.mjs` refuses a tag while any version surface, changelog locale or README disagrees.
- Preview releases may be unsigned and are marked as GitHub prereleases. An unsigned stable release needs the explicit `allow_unsigned_stable` workflow input.
- Release notes state supported platforms, signing state, the bundled omp commit and incomplete surfaces.
- A fully stable public release requires the omp bridge, Frappe workflows, automated package verification, Developer ID signing and Apple notarization.
- Every release publishes SHA-512 checksums in its `latest*.yml` files.

## Security and privacy

Fcode is local-first. Project files and chats stay on your machine; only the context a model request needs is sent to the provider you configured. API keys and FileBird secrets are kept in the operating system's credential store. There is no Fcode account and no telemetry.

- The agent asks before every state-changing tool call unless you change the approval mode.
- The Raven and work-panel browser views are separate from the agent and cannot call FileBird.
- The Electron app loads only from its own ASAR archive, ignores Node inspect flags and encrypts cookies at rest.
- Unsigned builds carry no Apple notarization or publisher-identity guarantee. Verify the checksum before removing quarantine.

Report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## Contributing

Issues and pull requests are welcome at [Coale-Tech/fcode](https://github.com/Coale-Tech/fcode). Read [CONTRIBUTING.md](CONTRIBUTING.md) first; every change needs passing validation and, for user-facing changes, a CHANGELOG entry.

## Upstream and license

Fcode is a fork of [vastsa/PI-Desktop](https://github.com/vastsa/PI-Desktop), the open-source desktop agent shell by XingYu Liu. Substantial PI-Desktop code — the Electron shell, Rust host-core, agent-host turn queue and shared protocol — is retained. The agent is [omp (oh-my-pi)](https://github.com/can1357/oh-my-pi), vendored in `omp/`. See [`NOTICE.md`](NOTICE.md) for the full attribution and modification record required by LGPL-3.0 §4a.

Licensed under the [GNU Lesser General Public License v3.0](LICENSE). Upstream copyright and license obligations remain in force.
