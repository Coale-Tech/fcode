# Fcode commercial control point

This document records the control-point decision made before the first public build of Fcode
(required gate: must exist before any `v*.*.*` tag is pushed, enforced by `scripts/check-legal.mjs`).

## Decision (C3 — accepted)

Publishing a signed LGPL-3.0 derivative is a one-way door: relicensing afterwards requires
every contributor's consent. This decision therefore blocks the first release.

**The control point is _not_ the source code.** A fork of this repository is a `git clone`
and the LGPL-3.0 licence explicitly permits it. The three assets that a fork does not receive
for free, in order of durability:

### 1. Signed, notarized distribution under Coale-Tech's own Developer ID (durable)

This is the only asset on this list that a fork genuinely cannot reproduce, because a
Developer ID is an identity Apple issues to a specific legal entity — not a file in the repo.
A fork ships unsigned, and Gatekeeper blocks it by default on macOS.

The durable asset is the **ongoing** signed-release pipeline: each tagged build verified by
`scripts/verify-macos-release.sh` and the `release.yml` `verify` job, with the `omp`
binary smoke-tested in an isolated HOME to catch missing hardened-runtime entitlements before
the build is published.

Signing secrets (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
`APPLE_TEAM_ID`) are stored as GitHub Actions secrets under `Coale-Tech/fcode` and are never
committed to the repository.

### 2. The Frappe-specific agent skill pack (copyable — honest limit)

The bundled skill pack at `resources/fcode-skills/` ships as its own `extraResources` entry
(not nested under `resources/skills/`) so `skills.customDirectories` in the omp overlay can
point to it at `<resourcesPath>/fcode-skills`.

**Honest limit:** once committed to a public repository, this pack is copyable. It is a
differentiator only for as long as it keeps growing. Treat it as a lead, not a moat. If
stronger protection is needed, license it separately and ship it from a private channel —
that choice is deferred and must be made before the pack contains material private
IP.

### 3. The pinned, tested omp + bridge protocol pairing (table is copyable, verification is not)

The compatibility table (in `docs/fcode/README.md`) is copyable the moment it is published.
What is not copyable is the ongoing verification that each Fcode release, its pinned omp
commit, its bridge protocol version and Frappe v15–v17 actually work together — verified by
the `omp-protocol-smoke` test in the release chain.

## Coupling note (E30)

`crates/host-core/Cargo.toml` declares `name = "pi-desktop-host-core"` (line 9). This binary
name is coupled to two invocations in `.github/workflows/release.yml`:

- Line ~322: `node scripts/check-linux-host-glibc.mjs target/release/pi-desktop-host-core`
- Line ~432: same (in the pi-host bundle job, now deleted)

The binary name is intentionally kept as `pi-desktop-host-core` for upstream merge
compatibility. **If an upstream PI-Desktop release renames this binary, both release.yml
references and the packaging extraResources entries must be updated in lockstep, or the
Linux glibc floor check will silently pass on the wrong binary.**

This coupling is recorded here so it is a documented decision, not a hidden landmine.

## Summary

| Asset | Fork gets it? | Notes |
|---|---|---|
| Source code | ✓ Yes (LGPL) | Git clone is the licence |
| Signed DMG (Developer ID) | ✗ No | Apple identity non-transferable |
| Skill pack content | ✓ Yes (public repo) | Lead, not moat |
| Compatibility table | ✓ Yes (public docs) | Table copyable; verification not |
| Ongoing signing + smoke pipeline | ✗ No (operational) | Requires the Developer ID |
