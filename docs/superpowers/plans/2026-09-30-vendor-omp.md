# Vendor omp into the Fcode repo — Implementation Plan

> **For agentic workers:** execute task-by-task; steps use `- [ ]` checkboxes. Do not commit to `main`.

**Goal:** Replace the sibling `../oh-my-pi` checkout + pinned-SHA + patch-file workflow with a pruned snapshot of omp committed at `PI-Desktop/omp/`, built by `scripts/build-omp.mjs` from in-repo source.

**Architecture:** `omp/` is a separate root (own `bun.lock`, own Cargo workspace) excluded from pnpm, root cargo and biome. `build-omp.mjs` builds `omp/packages/coding-agent` per target into `apps/desktop/resources/bin/omp-<target>` as today. Byte-reproducibility is not available, so the SHA256 guard is replaced by a live-handshake smoke test plus an `omp.build.json {sourceHash, builtAt}` staleness guard.

**Tech Stack:** bun, Rust nightly-2026-08-12 (natives), pnpm, Node ESM scripts, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-30-vendor-omp-design.md`

## Global Constraints
- Snapshot source: `oh-my-pi` commit `ba344f5e69f28535e7e9a2cf09e5af3643861b73` (git archive of the keep-list), then diverge forever. No sync tooling.
- Names unchanged: `@oh-my-pi/*`, `omp` binary, `omp --mode rpc`.
- Drop: `assets/`, Bazel/nix/infra/Docker files, `python/`, `scripts/session-stats*`, `metaharness`, `typescript-edit-benchmark`, omp `.github/`, omp `.omp/`. Keep: `collab-web`, `stats`, `docs/`, `browser-relay`, `LICENSE`, THIRD-PARTY notices.
- omp root `package.json` workspaces: remove `python/robomp/web`.
- Natives: `packages/natives` `build` calls `scripts/build-bindings.ts` directly; delete `scripts/bazel-natives.ts`; keep `scripts/host-detect.ts` (imported by build-bindings). Keep x64 baseline `RUSTFLAGS="-C target-cpu=x86-64-v2"` (+`+crt-static` on Windows) and `-modern.node`→`-baseline.node` rename in CI.
- `--models-config` change (`scripts/omp-patches/0001-extra-models-config.patch`) lands as a normal source commit; delete `scripts/omp-patches/`.
- Commit sequence: (1) import, (2) models-config, (3) wiring, (4) release.yml, (5) docs.
- Leave untracked `PI-Desktop-worktrees/` and `docs/superpowers/plans/2026-09-29-single-editor-fcode.md` alone.
- `scripts/check-legal.mjs` scans only `apps packages scripts .github NOTICE.md` → `omp/` is out of scope; **no change** to it.

## Review Focus
1. Fresh clone with no sibling `oh-my-pi` builds end to end.
2. Non-AVX2 x64 baseline still produced in CI.
3. `omp/` does not leak into pnpm, root cargo, biome.
4. Stale binary vs changed `omp/` source is detected.
5. Kept `browser-relay`/`collab-web` build deps actually resolve after pruning.
6. Release cache key covers omp Rust inputs.

---

## Task 1: Scratch trial build (nothing committed)

**Interfaces:** produces `/tmp/omp-trial/` with working `omp` binary; keep-list file `/tmp/omp-keep.txt` reused by Task 2.

- [ ] **1.1 Build keep-list and export**
```bash
SRC=/Users/mac/ERPNext/frappe_agent/oh-my-pi
rm -rf /tmp/omp-trial && mkdir -p /tmp/omp-trial
cd $SRC && git archive ba344f5e69f28535e7e9a2cf09e5af3643861b73 | tar -x -C /tmp/omp-trial
cd /tmp/omp-trial
rm -rf assets python .github .omp scripts/session-stats* scripts/bazel-natives.ts \
  packages/metaharness packages/typescript-edit-benchmark
ls -a | grep -Ei 'bazel|nix|docker|BUILD|WORKSPACE|MODULE' # delete each hit that is infra
```
Expected: only infra files listed; delete them with `rm -rf`. Record every path removed in `/tmp/omp-keep.txt` (`git ls-files` diff) for the commit message.

- [ ] **1.2 Edit copies in trial**
  - root `package.json`: delete `"python/robomp/web"` from `workspaces`.
  - `packages/natives/package.json`: `"build": "bun scripts/build-bindings.ts --dest native"` — confirm arg names first: `grep -n "argv\|--dest\|dest" packages/natives/scripts/build-bindings.ts`; use what the script actually parses.
  - Remove root-level references to dropped dirs surfaced by `bun install` errors.

- [ ] **1.3 Apply models-config patch**
```bash
cd /tmp/omp-trial && git init -q && git apply /Users/mac/ERPNext/frappe_agent/PI-Desktop/scripts/omp-patches/0001-extra-models-config.patch
```
Expected: applies clean (patch was generated against this commit).

- [ ] **1.4 Install, natives, binary, smoke**
```bash
cd /tmp/omp-trial
bun install --frozen-lockfile   # if it fails on lock drift from removed workspace: bun install, then keep the new bun.lock for Task 2
bun --cwd=packages/natives run build
cd packages/coding-agent && bun run build
./dist/omp --smoke-test; echo exit=$?
```
Expected: `exit=0`. Binary path: check `scripts/build-binary.ts` output dir if `dist/omp` is wrong.
If `browser-relay` or `collab-web` fail to build after pruning, restore whichever missing dir/dep and re-run; note the decision for the spec.

- [ ] **1.5 Record** size (`du -sh` of pruned tree, `git ls-files | wc -l`) and any extra deletions/keeps for Task 2.

**Gate:** do not proceed unless 1.4 exits 0.

## Task 2: Import commit

**Files:** create `PI-Desktop/omp/**`, `omp/LICENSE`, `omp/THIRD-PARTY-NOTICES*` (keep whatever upstream ships at root); modify `.gitignore`.

- [ ] **2.1** On new branch from `docs/vendor-omp-spec`: `git switch -c feat/vendor-omp`.
- [ ] **2.2** Copy trial tree (without `node_modules`, `.git`, `dist`, `target`, `*.node`) into `PI-Desktop/omp/`, including the `bun.lock` produced in 1.4:
```bash
rsync -a --exclude node_modules --exclude .git --exclude dist --exclude target --exclude '*.node' /tmp/omp-trial/ /Users/mac/ERPNext/frappe_agent/PI-Desktop/omp/
```
- [ ] **2.3** `.gitignore`: append `omp/packages/natives/native/*.node` (omp's own `.gitignore` travels inside `omp/`).
- [ ] **2.4** Verify LICENSE present: `test -f omp/LICENSE`. Commit:
```bash
git add omp .gitignore && git commit -m "chore(omp): import pruned oh-my-pi snapshot at ba344f5e69"
```
Commit body: source commit, dropped paths list from 1.1.

## Task 3: models-config as a source commit

**Files:** modify `omp/**` per patch; delete `scripts/omp-patches/`.

- [ ] **3.1** `cd PI-Desktop && git apply --directory=omp scripts/omp-patches/0001-extra-models-config.patch` (patch paths are relative to omp root; `--directory=omp` prefixes them).
- [ ] **3.2** `git rm -r scripts/omp-patches`.
- [ ] **3.3** Commit: `feat(omp): --models-config flag (was scripts/omp-patches/0001)`.

## Task 4: Wiring

**Files:** modify `pnpm-workspace.yaml`, `Cargo.toml`, `scripts/build-omp.mjs`, `scripts/fcode-doctor.mjs`, `apps/desktop/test/omp-protocol-smoke.test.mjs`, `.gitignore`.
**Interfaces:**
- `build-omp.mjs` writes `apps/desktop/resources/bin/omp.build.json` = `{ "sourceHash": "<sha256 of `git ls-files -s omp`>", "builtAt": "<ISO>" }`.
- Exports/computation of `sourceHash` is duplicated in the smoke test (10 lines; no shared module — YAGNI).

- [ ] **4.1 Workspace excludes**
  - `pnpm-workspace.yaml`: append `- '!omp'` under `packages:`.
  - `Cargo.toml` `[workspace]`: add `exclude = ["omp"]`.
  - `biome.json`: confirm `files.includes` has no `omp` match (`grep -n omp biome.json` → none); no edit.

- [ ] **4.2 Rewrite `scripts/build-omp.mjs`**
  - Delete: `PINNED_OMP_COMMIT`, `OMP_BINARY_SHA256`, sibling lookup (`resolve(repoRoot,"..","oh-my-pi")`), pinned-commit verification, patch-apply section.
  - `const ompSource = resolve(repoRoot, "omp");`
  - node_modules check: if `omp/node_modules` missing, run `bun install --frozen-lockfile` with `cwd: ompSource` (fresh clone works with no manual step).
  - Natives: if `omp/packages/natives/native` has no `*.node` for host, run `bun --cwd=packages/natives run build` in `ompSource` (CI restores cache first; local builds compile).
  - Keep build loop, target list, staging, bare host `omp` copy unchanged.
  - After staging, compute and write `omp.build.json`:
```js
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
const sourceHash = createHash("sha256")
  .update(execFileSync("git", ["ls-files", "-s", "omp"], { cwd: repoRoot }))
  .digest("hex");
writeFileSync(join(binDir, "omp.build.json"),
  JSON.stringify({ sourceHash, builtAt: new Date().toISOString() }, null, 2));
```
  (`binDir` = existing resources/bin variable; reuse the real name found in the file.)
  - Print binary SHA256 as before (informational only).

- [ ] **4.3 Smoke test** (`apps/desktop/test/omp-protocol-smoke.test.mjs`): remove the `OMP_BINARY_SHA256` import (lines ~36–45) and Test 1 (~66–84). Replace with:
```js
test("omp binary is not stale vs omp/ source", { skip: !existsSync(buildJson) }, () => {
  const want = createHash("sha256")
    .update(execFileSync("git", ["ls-files", "-s", "omp"], { cwd: repoRoot }))
    .digest("hex");
  assert.equal(JSON.parse(readFileSync(buildJson, "utf8")).sourceHash, want,
    "omp/ changed since last bundle:runtime — rebuild");
});
```
  `buildJson` = `join(dirname(ompBinary), "omp.build.json")`. Live handshake test unchanged.
  Note: `git ls-files -s` hashes staged/committed content, so uncommitted edits need `git add` to register; state this in the assertion message.

- [ ] **4.4 fcode-doctor** (`scripts/fcode-doctor.mjs` ~L12, L132–143): replace the sibling-checkout check with `existsSync(resolve(repoRoot,"omp","package.json"))` (error if missing) and `omp/node_modules` (warn: run `bun install` in `omp/`). Drop the sha print.

- [ ] **4.5 Verify**
```bash
pnpm install --frozen-lockfile && pnpm -r --if-present test
cargo build --manifest-path Cargo.toml
pnpm -C apps/desktop bundle:runtime
OMP_BIN=apps/desktop/resources/bin/omp node --test apps/desktop/test/omp-protocol-smoke.test.mjs
resources/bin/omp --smoke-test  # exit 0
# staleness must fail:
echo "// x" >> omp/packages/coding-agent/src/index.ts && git add omp && node --test apps/desktop/test/omp-protocol-smoke.test.mjs  # expect failure
git checkout -- omp && git reset -q omp
node scripts/fcode-doctor.mjs
```
  Use the real `src` file that exists if `index.ts` is absent. Also verify a fresh clone: `git clone . /tmp/fc && cd /tmp/fc && pnpm i && pnpm -C apps/desktop bundle:runtime` (no sibling present, moves `oh-my-pi` aside is unnecessary — path is no longer referenced; `grep -rn "oh-my-pi" scripts/*.mjs` must return nothing except comments).
- [ ] **4.6** Launch dev app: chat turn works and `fcode_bench_*`, `fcode_canvas*` tools register (`pnpm -C apps/desktop dev`; inspect tool list).
- [ ] **4.7** Commit: `build(omp): build from in-repo omp/ source; staleness guard replaces SHA pin`.

## Task 5: release.yml

**Files:** `.github/workflows/release.yml` (lines ~177–260).

- [ ] **5.1** Delete steps "Resolve pinned oh-my-pi commit" (`omp-commit`) and "Checkout pinned oh-my-pi (sibling)"; replace the install with `(cd omp && bun install --frozen-lockfile)` step (bun setup step stays).
- [ ] **5.2** Cache restore/save (steps id `omp-native-restore` and the save step): path `omp/packages/natives/native/*.node`; key:
```yaml
key: omp-native-${{ runner.os }}-${{ runner.arch }}-ci-${{ hashFiles('omp/crates/**', 'omp/Cargo.lock', 'omp/rust-toolchain.toml') }}
```
- [ ] **5.3** Native build step: `(cd omp && OMP_NATIVE_CARGO_PROFILE=ci bun run build:native)`; rename loop over `omp/packages/natives/native/*-modern.node`; keep RUSTFLAGS baseline as-is.
- [ ] **5.4** `actionlint .github/workflows/release.yml` → clean. Grep: `grep -n "oh-my-pi\|\.\./" .github/workflows/release.yml` → no sibling refs.
- [ ] **5.5** Commit: `ci(release): build omp from in-repo source`.

## Task 6: Docs

**Files:** `NOTICE.md`, `README.md` (L68, L114), `docs/fcode/README.md` (L17, 19, 30, 52, 89, 127, 185), `CHANGELOG.md`, new `docs/adr/0088-vendor-omp-snapshot.md`.

- [ ] **6.1 NOTICE.md** "### omp (oh-my-pi)": say source is vendored at `omp/`, snapshot of `ba344f5e69f28535e7e9a2cf09e5af3643861b73`, diverged, no upstream sync; copyright holders Mario Zechner, Can Bölük, Stencil Labs, oh-my-pi contributors; license file `omp/LICENSE`. `check-legal.mjs` gate must still pass: `node scripts/check-legal.mjs`.
- [ ] **6.2 READMEs**: remove sibling-checkout prerequisite; state `pnpm -C apps/desktop bundle:runtime` builds from `omp/` (needs bun + Rust nightly on first natives build); drop pinned-SHA mentions.
- [ ] **6.3 CHANGELOG** entry under Unreleased: omp vendored; build no longer needs sibling; SHA guard replaced; size delta from 1.5.
- [ ] **6.4 ADR 0307**: Context (sibling+pin+patch fragility), Decision (pruned snapshot, diverge forever), Consequences (~143 MB permanent in history, maintenance of fork by us, no upstream security fixes automatically, natives need Rust nightly).
- [ ] **6.5** `node scripts/check-legal.mjs` → passes. Commit: `docs: vendored omp (NOTICE, READMEs, CHANGELOG, ADR 0307)`.

## Acceptance (spec §7)
- Fresh-clone build, `omp --smoke-test` exit 0.
- Smoke test passes; fails after touching `omp/` without rebuild.
- `pnpm -r --if-present test` and Rust build unchanged.
- Dev app chat turn + `fcode_*` tools register.
- Size delta reported.
- `actionlint` clean. Full CI (Linux/Windows, baseline natives, cache keys) provable only in GitHub Actions after push; say so in the PR.

## Self-review
- Spec coverage: import (T2), models-config (T3), excludes/build/guard/doctor (T4), CI (T5), docs/ADR (T6), trial gate (T1). check-legal explicitly no-op.
- Placeholders: variable names in build-omp.mjs (`binDir`) and build-bindings argv are confirmed at edit time from the real files; steps say how.
- Consistency: `omp.build.json` keys `sourceHash`/`builtAt` identical in T4.2 and T4.3.
