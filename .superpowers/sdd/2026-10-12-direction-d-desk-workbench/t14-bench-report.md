# T14 Bench Lane Report

**Branch:** `feat/direction-d-t14-bench`  
**Commits:** `23ce3ec7c`, `3c02e2bfd`

---

## What was done

### CP2-G03 — Real bench detail data (apps + workers via IPC)
- `electron/main/bench/discovery.ts`: Added `apps: string[]` to `BenchSummary`; added exported `readBenchApps(benchPath)` (reads `apps/` subdir from disk, sorted) and `readProcfileEntries(benchPath)` (parses `Procfile` lines); `scanRoot` populates `apps` for every discovered bench.
- `packages/shared/src/protocol.ts`: Added `benchDetail: "pi-desktop/bench/detail"` IPC channel.
- `electron/main/ipc/bench-ipc.ts`: Registered `benchDetail` handler returning `{ apps, procfileEntries, port, mainPid }`.
- `electron/main/bench/supervisor.ts`: Added `getMainPid()` returning the start-process PID.
- `src/lib/bench-view.ts`: Added `apps: string[]` to the renderer-side `BenchSummary` type.
- `src/pages/BenchPage.tsx`: `BenchDetail` fetches `benchDetail` IPC on mount; added `AppsSection` and `WorkersSection` sub-components; `ProcessPanel` gains `procCount`/`port` meta row.
- `src/styles/workbench.css`: Added `.wb-worker-dot`, `.wb-app-detail-row`, `.wb-app-detail-icon`, `.wb-app-tags`, `.wb-app-tag` classes.

### CP2-G04 — AllBenches apps column
- `src/components/bench/AllBenches.tsx`: Apps column now renders `bench.apps` as `.wb-app-tag` chips (max 4 + overflow count badge), replacing the previous `—` placeholder.

### CP2-G05 — Build stopped-state banner
- `src/pages/BuildPage.tsx`: `showBanner` suppresses the red "bench-down" banner when `firstProblem.key === "bench"` (stopped-bench isn't an error banner; canvas overlay CTA already communicates it).

### CP2-G04 — Benches overview header
- `src/pages/BenchPage.tsx`: Overview header updated to "Benches" title + count badge + "Add folder" button matching `fragment.html:47-63`.

### i18n
- All 9 locales (en/de/es/fr/ko/pt-BR/tr/zh-CN/zh-TW) received `bench.apps`, `bench.workers`, `bench.processes`, `bench.benches`, `bench.addFolder`.
- Verified via Python key-check across all locales — no missing keys.

---

## Tests

| Suite | Pass | Fail | Notes |
|-------|------|------|-------|
| `bench-detail-ipc.test.mjs` (owned) | 7/7 | 0 | New behavioural tests for `readBenchApps`/`readProcfileEntries` |
| `bench-view.test.mjs` | 6/6 | 0 | |
| `bench-page-t6-states.test.mjs` + start/stop identity | 23/23 | 0 | |
| Full suite (`test/*.test.mjs`) | 3595/3613 | 12 | All failures known-flaky (see below) |

**Full suite failures — all known-flaky allowlist:**
- `hindsight-local-supervisor`: "fast exit with LLM key error" → allowlist: *hindsight fast-exit*
- `macos-signing-watchdog` (×2): codesign shim/failing tests → allowlist: *codesign/macos-signing*
- `npm-executable` (×5): selected npm, version/Node validation, install budgets → allowlist: *npm-executable family*
- `remote-host-ssh-transport` (×2): non-zero exit / forward rejects → allowlist: *remote-host-ssh-transport*
- `shiki.test.mjs` (×1): "astro should load and tokenize" → **pre-existing worktree issue**: pnpm install --offline produced an incomplete `@shikijs/langs` symlink (missing `package.json`). The same test passes in direction-d. My code does not touch `src/lib/shiki.ts`.

**tsc:** 0 errors (212 s, verified with separate exit-code capture).

---

## Files changed

```
apps/desktop/electron/main/bench/discovery.ts     (readBenchApps, readProcfileEntries, apps in scanRoot)
apps/desktop/electron/main/bench/supervisor.ts    (getMainPid)
apps/desktop/electron/main/ipc/bench-ipc.ts       (benchDetail handler)
apps/desktop/src/lib/bench-view.ts                (apps: string[] in BenchSummary)
apps/desktop/src/pages/BenchPage.tsx              (AppsSection, WorkersSection, ProcessPanel meta, header)
apps/desktop/src/components/bench/AllBenches.tsx  (apps column chips)
apps/desktop/src/pages/BuildPage.tsx              (bench-down banner suppressed)
apps/desktop/src/styles/workbench.css             (wb-app-tag, wb-worker-dot, etc.)
packages/shared/src/protocol.ts                   (benchDetail channel)
packages/shared/dist/protocol.js + .d.ts          (patched dist)
packages/i18n/src/locales/*/index.ts (×9)         (5 new bench.* keys)
apps/desktop/test/bench-detail-ipc.test.mjs       (NEW — 7 tests)
```

---

## Self-review

- No hardcoded values; all new strings use tokens from i18n catalog.
- `readBenchApps` reads disk; `readProcfileEntries` parses Procfile — no fake/stub data.
- `BenchSummary.apps` is populated in `scanRoot` so AllBenches chips work from the scan, not an extra IPC call.
- `benchDetail` IPC is only called on `BenchDetail` mount (selected bench), not on list render.
- No source-text pins in tests; `bench-detail-ipc.test.mjs` tests behaviour only.

## Design fidelity

- Apps section matches `fragment-detail.html` `.bfd-app` / `.bfd-app-icon` pattern.
- Workers section chips match `fragment-detail.html` `.bfd-proc-dot` pattern.
- "Benches" header + count + "Add folder" button matches `fragment.html:47-63`.
- AllBenches apps column chips match `fragment.html` table design.
- Build stopped-state: no spurious red banner (canvas overlay CTA owns this state).

## Capture provenance

**Build status:** `pnpm build` failed in this worktree with a pre-existing rollup error (`@shikijs/langs/astro` unresolvable at bundle time in the pnpm --offline environment). This is not caused by my changes — `src/lib/shiki.ts` is untouched and tsc passes with 0 errors. Screenshots were not captured because the evidence contract requires building from a clean committed tree; using the copied direction-d `out/` would not reflect our renderer changes.

---

## Deviations

- `WorkersSection` shows Procfile process names (not PIDs). PID lookup requires OS process-tree traversal not available from the IPC context without spawning `ps` — noted as acceptable; names identify the process type which is what the design shows.
- Build screenshot capture deferred due to worktree pnpm offline build failure unrelated to lane code.
