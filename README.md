<div align="center">

# Fcode

### AI coding agent for Frappe and ERPNext developers

**Fcode is a desktop AI coding agent for Frappe/ERPNext developers — forked from [PI-Desktop](https://github.com/vastsa/PI-Desktop) and powered by omp, giving you a supervised local bench, an in-app file editor, and Studio/Builder canvas integration alongside a persistent AI agent that understands Frappe's anatomy.**

[![Release](https://img.shields.io/github/v/release/Coale-Tech/fcode?include_prereleases&label=release)](https://github.com/Coale-Tech/fcode/releases)
[![CI](https://github.com/Coale-Tech/fcode/actions/workflows/ci.yml/badge.svg)](https://github.com/Coale-Tech/fcode/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Coale-Tech/fcode)](LICENSE)

[Download](https://github.com/Coale-Tech/fcode/releases/tag/v0.17.1) ·
[Releases](https://github.com/Coale-Tech/fcode/releases) ·
[Issues](https://github.com/Coale-Tech/fcode/issues) ·
[Developer docs](docs/fcode/README.md)

</div>

> **Early preview.** Fcode 0.17.1 is an unsigned preview for macOS, Windows, and Linux. It ships the omp agent and the Code, Build, and Bench surfaces; it is not yet the completed Frappe IDE described by the project roadmap.

## Current status

Fcode has replaced the legacy Pi agent runtime with **omp** ([oh-my-pi](https://github.com/can1357/oh-my-pi)) and added the Build (Studio/Builder canvas) and Bench (Frappe bench cockpit) surfaces, an in-app Files editor in Chat's work panel, Frappe bench discovery and supervision, and Frappe-specific skills and bench tools — on top of the inherited shell (isolated Fcode data directories, project opening, persistent sessions, model-provider configuration, permissions, plugins).

The release pipeline builds macOS (arm64 + x64), Linux (x64), and Windows (x64) artifacts. Two things remain incomplete:

- **Signed and notarized distribution.** Apple Developer ID signing and notarization run in CI, but the required secrets are not yet configured, so no signed release has shipped.
- **Bench on Windows.** The Bench tab requires a Frappe bench, which is not supported natively on Windows. The app itself builds and runs on Windows; use WSL2, macOS, or Linux for bench work. PATH is inherited from the parent process on Windows (not sourced from a POSIX login shell).

The current release line is 0.17.x; the latest is [v0.17.1](https://github.com/Coale-Tech/fcode/releases/tag/v0.17.1). Because the builds are unsigned, macOS cannot swap them in place: 0.17.0 and earlier cannot update themselves, so download 0.17.1 from the Releases page once; from then on the update banner links to the download. See [CHANGELOG.md](CHANGELOG.md) for the full history.

## Download and install

Download the asset for your platform from the [Fcode 0.17.1 release](https://github.com/Coale-Tech/fcode/releases/tag/v0.17.1):

| Platform | Asset |
| --- | --- |
| macOS Apple silicon | `Fcode-<version>-arm64.dmg` (or `-arm64-mac.zip`) |
| macOS Intel | `Fcode-<version>-x64.dmg` (or `-x64-mac.zip`) |
| Windows x64 | `Fcode-Setup-<version>.exe`, or `Fcode-Portable-<version>.exe` / `.zip` |
| Linux x64 | `Fcode-<version>.AppImage`, `fcode_<version>_amd64.deb`, or `fcode-<version>-x86_64.rpm` |

On macOS, open the DMG (or extract the ZIP), move `Fcode.app` to `/Applications`, and open it from Finder.

This preview is unsigned because no Coale-Tech Apple Developer ID certificate is configured yet. macOS may block the first launch. After confirming that the download came from this repository's release page, right-click **Fcode.app**, choose **Open**, and confirm the prompt. If macOS still retains the download quarantine:

```bash
xattr -dr com.apple.quarantine /Applications/Fcode.app
open /Applications/Fcode.app
```

The installed application uses:

- product name: `Fcode`
- bundle identifier: `com.coaletech.fcode`
- application data: `~/.fcode`
- development data: `~/.fcode-dev`

## Build from source

### Requirements

- macOS, Linux, or Windows (Bench tab requires macOS, Linux, or WSL2)
- Node.js `>=22.19`
- pnpm `>=10`
- a stable Rust toolchain
- Bun `>=1.2` (omp is vendored in `omp/`; its first native build also needs Rust nightly, installed by rustup on demand) — see [Developer docs](docs/fcode/README.md) for setup

```bash
git clone https://github.com/Coale-Tech/fcode.git
cd fcode
pnpm install

CSC_IDENTITY_AUTO_DISCOVERY=false pnpm -C apps/desktop run pack
```

The unpacked macOS application is written to:

```text
apps/desktop/release/mac/Fcode.app
```

Launch it with:

```bash
open apps/desktop/release/mac/Fcode.app
```

### Development

```bash
pnpm dev
```

### Validation

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
├── crates/host-core          Rust persistence and host services
├── packages/agent-host       Turn queue, approvals, and event handling
├── packages/agent-runtime    Legacy preview agent runtime
├── packages/host-runtime     Sidecar process integration
├── packages/omp-bridge       omp (oh-my-pi) RPC bridge — the current agent brain
└── packages/shared           Shared protocol and application identity
```

Internal `@pi-desktop/*` package names, `pi-desktop/*` IPC channels, and the `pi-desktop-host-core` binary name remain unchanged for upstream compatibility. They are implementation identifiers, not the user-facing product name.

## Release policy

- Preview releases may be unsigned and are marked as GitHub prereleases.
- Release notes must identify supported platforms, signing state, included runtime, and incomplete product surfaces.
- A stable public release requires the omp bridge, Frappe workflows, automated package verification, Developer ID signing, and Apple notarization.
- Checksums accompany manually published artifacts.

## Security and privacy

Fcode is local-first. Project files and sessions remain on the machine unless a configured model provider requires request context. API credentials are stored through the inherited operating-system credential path. There is no mandatory Fcode account and no Fcode telemetry in this preview.

Unsigned preview artifacts do not provide Apple notarization or publisher-identity guarantees. Verify the published checksum before removing quarantine.

## Upstream and license

Fcode is a fork of [vastsa/PI-Desktop](https://github.com/vastsa/PI-Desktop), the open-source desktop agent shell by XingYu Liu. Substantial PI-Desktop code — the Electron shell, Rust host-core, agent-host turn queue, and shared protocol — is retained in this fork. See [`NOTICE.md`](NOTICE.md) for the full attribution and modification record required by LGPL-3.0 §4a.

Licensed under the [GNU Lesser General Public License v3.0](LICENSE). Upstream copyright and license obligations remain in force.
