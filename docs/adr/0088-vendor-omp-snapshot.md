# ADR 0088: Vendor omp as a pruned snapshot

- Status: Implemented
- Date: 2026-09-30
- Deciders: Fcode core
- Spec: [2026-09-30-vendor-omp-design](../superpowers/specs/2026-09-30-vendor-omp-design.md)

## Context

Fcode built `omp` from a sibling `../oh-my-pi` checkout pinned by SHA, with local patches in `scripts/omp-patches/`. Fresh clones needed a manual sibling checkout, CI cloned upstream on every release, and Fcode-specific omp changes (memory, status RPCs, the models-config flag) had no place to live as normal commits.

## Decision

Commit a pruned snapshot of oh-my-pi `ba344f5e69f28535e7e9a2cf09e5af3643861b73` at `omp/`. Diverge permanently: no upstream sync tooling. Names (`@oh-my-pi/*`, `omp`, `omp --mode rpc`) are unchanged. Dropped: assets, Bazel/nix/Docker/infra, python, session-stats, metaharness, typescript-edit-benchmark, omp `.github`/`.omp`. The binary is not byte-reproducible, so the SHA256 guard is replaced by a live handshake test plus an `omp.build.json` source-hash staleness check.

## Consequences

- About 160 MB (7,503 files) enters git history permanently.
- Fcode owns omp maintenance, including security fixes; upstream fixes are ported by hand or not at all.
- The natives build needs Rust nightly (`omp/rust-toolchain.toml`) and takes ~40 min cold on x64; CI caches it keyed on omp's Rust inputs.
- Vendored omp docs still mention Bazel/`scripts/bazel-natives.ts`; they are left as is.
