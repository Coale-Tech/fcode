# Changelog

All notable changes to Fcode are documented here.
Fcode is a fork of [PI-Desktop](https://github.com/vastsa/PI-Desktop) with the agent brain replaced by [omp](https://github.com/coaletech/oh-my-pi).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- omp (oh-my-pi) replaces the Pi agent brain via `packages/omp-bridge`
- Three new IDE surfaces: Code tab (Monaco), Build tab (Studio/Builder), Bench tab
- Bench discovery: auto-scans configured roots for Frappe benches
- `fcode_bench_execute`, `fcode_bench_run`, `fcode_canvas`, `fcode_canvas_read` host tools
- `fcode_canvas` force-acquires the shared canvas for agent-driven actions and shows a visible "Agent is using this canvas" banner in the Build tab, restoring the previous owner afterward
- Developer ID signed and notarized macOS distribution under Coale-Tech
- Legal attribution (`NOTICE.md`) and commercial-control-point decision record
- `scripts/check-legal.mjs` gates every release against upstream identity leakage
- `scripts/build-omp.mjs` builds and stages the omp binary from a pinned oh-my-pi commit
- `pnpm fcode:doctor` contributor setup checker
- `pnpm fcode:dev` single-command contributor workflow

### Changed
- `appId`: `net.aiuo.pi-desktop` → `com.coaletech.fcode`
- `productName`: `PI-Desktop` → `Fcode`
- Auto-updater `RELEASES_URL` repointed to `Coale-Tech/fcode`
- macOS artifact name: `Fcode-${version}-${arch}-mac.${ext}`
- Signing identity: Coale-Tech Developer ID (replaces upstream DUV63RKYTW)
- Skills pack shipped as a separate `fcode-skills` resource directory

### Removed
- Windows build target (no bench transport available; will be added in a future release)
- `mirror-to-cnb.yml` workflow (mirrored to upstream owner's registry)
- `pi-host-bundle` release job (bundled the replaced Pi brain)

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
