<div align="center">

# Fcode

### AI coding agent for Frappe and ERPNext developers

**Fcode is a desktop AI coding agent for Frappe/ERPNext developers — forked from [PI-Desktop](https://github.com/vastsa/PI-Desktop) and powered by omp, giving you a supervised local bench, a Monaco code editor, and Studio/Builder canvas integration alongside a persistent AI agent that understands Frappe's anatomy.**

[![Release](https://img.shields.io/github/v/release/Coale-Tech/fcode?include_prereleases&label=release)](https://github.com/Coale-Tech/fcode/releases)
[![CI](https://github.com/Coale-Tech/fcode/actions/workflows/ci.yml/badge.svg)](https://github.com/Coale-Tech/fcode/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Coale-Tech/fcode)](LICENSE)

[Download](https://github.com/Coale-Tech/fcode/releases/tag/v0.15.7-fcode.1) ·
[Releases](https://github.com/Coale-Tech/fcode/releases) ·
[Issues](https://github.com/Coale-Tech/fcode/issues) ·
[Developer docs](docs/fcode/README.md)

</div>

> **Early preview.** The first Fcode release is an unsigned Intel macOS build. It proves the renamed desktop shell and local packaging path; it is not the completed Frappe IDE described by the project roadmap.

## Current status

Fcode is being built from the PI-Desktop Electron shell. The current preview provides the renamed **Fcode** application, isolated Fcode data directories, project opening, persistent sessions, model-provider configuration, permissions, plugins, and the existing desktop agent workflow.

The following planned work is **not complete in this preview**:

- the omp RPC bridge and bundled omp runtime;
- production Code, Build, and Bench surfaces;
- Frappe bench discovery and supervision;
- Studio and Builder canvas integration;
- Frappe-specific skills and bench tools;
- signed and notarized distribution;
- Apple Silicon, Linux, and Windows Fcode artifacts.

The preview still bundles PI-Desktop's legacy agent runtime. Do not evaluate it as the finished omp-powered Fcode product.

## Download and install

The current artifact supports **Intel macOS (`x64`)** only.

1. Download `Fcode-0.15.7-fcode.1-x64-mac.zip` and its `.sha256` file from the [Fcode 0.15.7 preview release](https://github.com/Coale-Tech/fcode/releases/tag/v0.15.7-fcode.1).
2. Verify the download:

   ```bash
   shasum -a 256 -c Fcode-0.15.7-fcode.1-x64-mac.zip.sha256
   ```

3. Extract the archive and move `Fcode.app` to `/Applications`.
4. Open Fcode from Finder.

This preview is unsigned because no Coale-Tech Apple Developer ID certificate is configured yet. macOS may block the first launch. After verifying the checksum and confirming that the archive came from this repository, right-click **Fcode.app**, choose **Open**, and confirm the prompt. If macOS still retains the download quarantine:

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

- macOS or Linux
- Node.js `>=22.19`
- pnpm `>=10`
- a stable Rust toolchain

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
