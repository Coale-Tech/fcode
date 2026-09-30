# Vendor omp into the Fcode repo — design

Status: draft for review · Date: 2026-09-30 · Path: architectural

## 1. Program context

Fcode's agent brain is omp (oh-my-pi), built from a sibling checkout
(`../oh-my-pi`) at a pinned commit, plus patches in `scripts/omp-patches/`.
Goal of the wider program: make omp part of the Fcode repo, map every omp
feature to an Fcode function/design, and build the frontend for what Fcode
does not yet surface. That program has three sub-projects, each with its own
spec, plan and build:

| # | Sub-project | Output |
|---|---|---|
| 1 | **Vendor omp into Fcode** (this spec) | In-repo `omp/` that builds with no sibling checkout. |
| 2 | Parity map | Matrix: omp feature → omp surface → Fcode surface today → gap → frontend work. Read-only. |
| 3 | Frontend build-out | Slices by priority. First slice: memory (Mnemopi/Hindsight backends, health sidebar in Settings, mental models, bank mission, Frappe bench bootstrap, all LLM work on the active model). |

Sub-projects 2 and 3 are out of scope here. The memory design discussed
earlier (extension + patch workaround) is superseded: once omp is in-tree,
`get_memory_status` and `mnemopi.llmMode = "session"` are ordinary source
changes. That spec is written after vendoring lands.

## 2. Decisions (agreed)

- **Mechanism: pruned snapshot, then diverge for good.** No upstream sync
  script. Fcode owns omp as its agent core. Upstream fixes are ported by
  hand.
- **Names unchanged in this sub-project:** `@oh-my-pi/*` packages, the `omp`
  binary, `omp --mode rpc`. Renaming is a separate change.
- **License:** omp is MIT (Mario Zechner, Can Bölük, Stencil Labs). Keep
  `LICENSE` and `THIRD-PARTY-NOTICES.txt` in `omp/`; record the snapshot
  source in `NOTICE.md`.

## 3. Layout and prune

`PI-Desktop/omp/` is a self-contained workspace: its own `package.json`,
`bun.lock`, `bunfig.toml`, `tsconfig*`, `Cargo.toml`/`Cargo.lock`,
`rust-toolchain.toml`. It stays outside Fcode's pnpm workspace and Cargo
workspace (omp uses bun `catalog:` versions and its own Rust workspace).

Snapshot source: upstream commit `ba344f5e69f28535e7e9a2cf09e5af3643861b73`
plus `scripts/omp-patches/0001-extra-models-config.patch` (`--models-config`),
which is committed separately so its diff stays visible.

**Keep (preliminary, finalized by the trial build in §6 step 1):**
`packages/{coding-agent,ai,agent,tui,utils,natives,catalog,wire,mnemopi,snapcompact,omptype}`,
plus `packages/collab-web` (build-binary.ts runs its `gen:tool-views`),
`packages/stats` (`@oh-my-pi/omp-stats` is a coding-agent dependency),
`packages/browser-relay` (`omp browser-relay install` writes its extension;
drop only if the trial build proves nothing needs it), all `crates/`
(including `crates/vendor/*`), `docs/` (embedded for `omp://` docs),
the `scripts/` used by `natives` and `coding-agent` builds, `types/`,
`patches/`, `rust-toolchain.toml`, `LICENSE`, `THIRD-PARTY-NOTICES.txt`.

**Drop (static-reference audit):** `assets/`, Bazel (`MODULE.bazel*`,
`bazel/`, `BUILD.bazel`), `nix/`, `infra/`, Dockerfiles, `python/`,
`scripts/session-stats`, `packages/metaharness`,
`packages/typescript-edit-benchmark`, omp's `.github` and `.omp`.
Edits this forces:
- root `package.json`: remove the `python/robomp/web` workspace entry.
- `packages/natives` `build`: call `scripts/build-bindings.ts` directly
  (the `host` path is already cargo/napi; `bazel-natives.ts` is dropped).

Size: full upstream is 7,858 files / 178 MB; the drop list saves ~35 MB
(measured from tracked sizes), leaving ~143 MB. To be re-measured.

## 4. Build and CI

`scripts/build-omp.mjs`:
- `ompSource = <repo>/omp`.
- Delete `PINNED_OMP_COMMIT`, the `git rev-parse HEAD` check, the
  sibling-missing error and the patch loop.
- Keep the cross-target loop, staging into `apps/desktop/resources/bin/`
  and the bare host `omp` copy.
- If `omp/node_modules` is absent, run `bun install --frozen-lockfile`
  in `omp/`.
- Write `resources/bin/omp.build.json` `{ sourceHash, builtAt }`, where
  `sourceHash` hashes `git ls-files -s omp`.

Workspace isolation: `pnpm-workspace.yaml` excludes `omp`; root `Cargo.toml`
`exclude = ["omp"]`; `.gitignore` covers `omp/node_modules`, `omp/target`,
`omp/packages/natives/native/*.node`, `omp/packages/coding-agent/dist`;
`biome.json` ignores `omp/`.

`release.yml`:
- Remove "Resolve pinned oh-my-pi commit" and "Checkout pinned oh-my-pi
  (sibling)"; add `bun install --frozen-lockfile` in `omp/`.
- Native-addon cache key:
  `omp-native-<os>-<arch>-ci-${{ hashFiles('omp/crates/**','omp/Cargo.lock','omp/rust-toolchain.toml') }}`,
  path `omp/packages/natives/native/*.node`.
- Native build step unchanged apart from paths
  (`cd omp && OMP_NATIVE_CARGO_PROFILE=ci bun run build:native`),
  including the x64 baseline `RUSTFLAGS` logic (a non-baseline x64 build
  would crash on CPUs without AVX2).

**Drift guard.** The old SHA256-of-binary constant is removed (the build is
not byte-reproducible and the source is now in-repo). Replaced by:
1. Live handshake (kept): `omp-protocol-smoke.test.mjs` spawns the real
   binary and requires protocol v2.
2. Staleness guard (new): the smoke test recomputes `sourceHash` and fails
   with "rebuild with `node scripts/build-omp.mjs`" if the staged binary
   predates the source. Skips when no binary is staged.

Other coupling points to update: `scripts/fcode-doctor.mjs`,
`scripts/check-legal.mjs` (must exclude `omp/` from the upstream-identity
scan; scan scope not yet read), `NOTICE.md`, `README.md`,
`docs/fcode/README.md`, `CHANGELOG.md`, `apps/desktop/package.json`
`bundle:runtime` (unchanged command, new behavior), new ADR 0088.

omp's own tests: keep `test/` dirs in kept packages; CI runs a curated
subset (`mnemopi` and the RPC/memory tests touched later), not omp's
`ci-test-ts` runner (dropped).

## 5. Non-goals

Upstream sync tooling; renaming packages/binary; changing omp behavior
(other than folding in `0001`); the parity map; any frontend work; the
memory feature; rebasing `PI-Desktop-worktrees/*`.

## 6. Rollout

Nothing is committed to Fcode until step 1 passes.
1. **Trial build in a scratch dir:** `git archive` the keep-list at
   `ba344f5e69`, apply `0001`, then `bun install --frozen-lockfile`, the
   host natives build, `bun run build` in `coding-agent`,
   `omp --smoke-test`. Output: final keep/drop list (settles
   `browser-relay`).
2. Import commit: `omp/` + LICENSE + THIRD-PARTY-NOTICES.
3. `--models-config` commit; delete `scripts/omp-patches/`.
4. Wiring commit: `build-omp.mjs`, excludes, `check-legal`, `fcode-doctor`.
5. CI commit: `release.yml`.
6. Docs commit: `NOTICE.md`, READMEs, CHANGELOG, `docs/fcode/README.md`,
   ADR 0088.

## 7. Acceptance

- Fresh clone with no sibling `oh-my-pi`: `node scripts/build-omp.mjs`
  stages `bin/omp`; `omp --smoke-test` exits 0;
  `node --test apps/desktop/test/omp-protocol-smoke.test.mjs` passes
  including the staleness guard; touching a file under `omp/` makes the
  guard fail.
- `pnpm -r --if-present test` and the Rust build are unchanged.
- Dev app starts, a chat turn runs through the vendored omp, `fcode_*`
  host tools register.
- Repo-size delta measured and reported.
- `release.yml` passes `actionlint`. Full release CI cannot run locally; it
  is proven only when the branch runs in GitHub Actions, and the report
  says so.

## 8. Risks

- Natives build needs Rust nightly (from `rust-toolchain.toml`); minutes to
  tens of minutes on a cold cache.
- ~143 MB enters git history permanently: import once as a single commit,
  never re-import.
- Linux/Windows builds unverified until CI runs.
- No upstream sync: security and bug fixes upstream must be ported
  manually; ADR 0088 records this as accepted.
