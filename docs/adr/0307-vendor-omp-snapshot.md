# ADR 0307: Vendor omp as a pruned snapshot

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

## Update: re-snapshot at v18.12.3

The snapshot was refreshed from `ba344f5e69` (v18.3.1-38) to release v18.12.3 (`53a0377db6`). Method, so the next refresh is repeatable: check out the target tag in an oh-my-pi worktree, `git apply --3way` the diff of Fcode's own omp changes (`git diff --relative=omp <import-commit> HEAD -- omp`) onto it, resolve conflicts, regenerate the RPC wire schema (`bun run gen:rpc` in `packages/coding-agent`), then rsync into `omp/` with the same prune set and re-apply the two import-time edits (drop the `python/robomp/web` workspace in the root `package.json`; `packages/natives` `build` is `bun scripts/build-bindings.ts`). The "no sync tooling" decision stands: this is a manual, occasional refresh, and Fcode's changes remain ordinary commits in `omp/`.
