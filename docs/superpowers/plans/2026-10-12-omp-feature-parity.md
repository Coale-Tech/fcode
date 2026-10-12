# Fcode ↔ vendored omp feature parity (swarm plan)

Date: 2026-10-12 · Branch: `feat/v020-gaps` · Status: PLAN (nothing implemented)

## Goal

Close every gap found by the 2026-10-12 omp-utilization audit so Fcode exposes, or deliberately and visibly declines, each vendored omp capability. Audit source: four read-only scout reports (tools, RPC, settings, extensibility). Figures are scout estimates, not measurements; slice owners MUST re-verify their rows against source before building.

## Audit baseline (what is true today)

| Area | Today | Gap |
|---|---|---|
| RPC commands | ~60 of 95+ sent | `get_tree`, `get_messages`, `get_messages_page`, `new_session`, `switch_session`, `set_host_uri_schemes` never sent; `fork` rejected at `bridge.ts` (`native.session.fork`) |
| Settings | 66 keys hand-coded (`OmpSettingsValues`), ~40% of schema | No UI: advisor, edit, exec, DAP, SSH, web, STT/TTS, stream, commit, compaction, retry, stats, blob-broker, secrets, live, session-context, goals, plan-mode |
| Tools | 31 builtin + 3 hidden. `tools.xdev` default ON mounts discoverable tools as `xd://` devices (verified) | Default-off, never preset: `ast_grep`, `checkpoint`/`rewind`, `github`, `security_scan`. Dedicated renderers only for eval/bash/browser/computer/ida/fcode_*/kanban_* |
| Extensibility | skills, packs, curator/review, 9 agents, MCP, memory, collab wired | hooks, plugin discovery, slash-command authoring, compress/cleanse/judgment/security-scan/autoresearch have no UI |
| CLI | none of 45 omp subcommands invoked | `commit`, `stats`, `usage`, `gc`, `ps`, `models`, `config`, `ssh`, `worktree`, `plugin`, `share`, `web-search`, … |
| Modes | RPC only | TUI, ACP, print, setup unreachable |
| Hygiene | | `~/.omp/agent` user config leaks into sessions; dev builds fall back to PATH omp; overlay sets only `modelRoles.default` (subagents ran on machine-level roles); pi-host lacks desktop host tools and env |

## Design decision: data-driven settings (replaces ~20 hand-coded groups)

omp declares every setting once via `register({ id, type, default, values, ui: { tab, group, label, description } })` and `config/all-settings.ts#orderedSettings()` lists them all. Hand-adding keys needs four edits each (shared type, `omp-settings-config.ts` SCHEMA, `ompSettingsYaml`, React section, 9 locales) — that is the reason 60% is uncovered. Instead:

1. **Manifest** — build step runs under Bun, imports `orderedSettings()`, writes `apps/desktop/resources/omp-settings-manifest.json` (descriptors, no secrets' values). Stamped with omp `sourceHash` like `omp.build.json`.
2. **Generic writer** — `OmpSettingsValues` keeps its curated keys; add `advanced: Record<string, unknown>` (dotted id → value). Bridge expands dotted ids into nested overlay YAML. Curated key wins over `advanced`. Values validated against the manifest in the main process (type, enum, min/max).
3. **Generic UI** — one "omp Advanced" settings page rendered from the manifest: tab → group → control, search, "modified" filter, reset-to-default, env-override note. Curated sections stay as-is and their ids are hidden from the generic page.
4. Labels/descriptions come from omp (English). Only page chrome and group names are in the 9 locales. Declared limit; translate groups on demand.

Registry-only settings with no `ui` metadata are hidden (omp's own rule).

## Contract (frozen before the swarm starts)

```ts
// packages/shared/src/types/omp.ts
export interface OmpSettingDescriptor {
  id: string;                       // dotted, e.g. "retry.maxRetries"
  type: "boolean" | "string" | "number" | "enum" | "array" | "record";
  default?: unknown;
  values?: readonly string[];       // enum
  min?: number; max?: number;       // number
  tab: string; group: string;
  label: string; description?: string;
  secret?: boolean;
  options?: readonly { value: string; label: string }[];
}
export type OmpAdvancedSettings = Record<string, unknown>;
// OmpSettingsValues gains:  advanced?: OmpAdvancedSettings
```

IPC (owned by slice A; names fixed here so UI slices can code against them):
`omp.settings.manifest` → `OmpSettingDescriptor[]` · existing `omp.settings.get/set` carry `advanced`.

## File ownership and shared-file rule

Each slice owns the files listed. Shared hot files — `packages/omp-bridge/src/bridge.ts`, `apps/desktop/src/lib/api.ts`, `apps/desktop/electron/main/ipc/register.ts`, `packages/shared/src/types/omp.ts`, `packages/i18n/src/locales/*`, `CHANGELOG.md` — may be edited by any slice **only** with small anchored additions, re-read immediately before each edit; a stale tag means STOP and re-read. No slice reformats or reorders existing lines. CHANGELOG is integration-owned (slices report their entry text instead).
No slice launches Electron or runs the full desktop `node --test` suite (profile/port collisions, 5+ min). Slices run: shared build, `tsc` for their package, vitest for their package, and a bridge/pi-host fake-model smoke where relevant.

## Slices

### Wave 0 — prerequisites (integrator, inline)
- W0.1 Baseline: commit the current 91-file `feat/v020-gaps` working tree in chunks (needs user approval) so slice diffs are attributable.
- W0.2 Land the contract types above in `packages/shared`; `pnpm --filter @pi-desktop/shared build`; baseline `tsc` (3 pre-existing errors only).
- W0.3 Clean up `/tmp` smoke artifacts listed in the session notes (needs user approval).

### Wave 1 — parallel (one `tasks[]` batch)

| ID | Slice | Owns | Acceptance |
|---|---|---|---|
| **A** | Settings manifest + generic writer + IPC | `scripts/gen-omp-settings-manifest.mjs`, hook in `scripts/build-omp.mjs`, `packages/omp-bridge/src/overlay-advanced.ts` (+ one call in `makeOmpOverlay`), `electron/main/omp-settings-config.ts`, `ipc/omp-settings-ipc.ts`, `api.ts` wrapper | Manifest generated from real omp registry, count > 300 entries logged; dotted→nested YAML round-trips (vitest incl. `retry.maxRetries`, `edit.mode`, array/record, quoting); invalid enum/range rejected in main; curated key beats `advanced`; stale manifest (hash mismatch) fails the build check |
| **B** | omp Advanced settings page | `features/settings/OmpAdvancedSettings.tsx` (+ tests), nav entry in settings shell, page/group chrome keys in 9 locales | Renders from a fixture manifest: tab/group/search/modified filter/reset/secret masking/env note; no hard-coded setting ids; typecheck clean |
| **C** | Tools: enablement + renderers | `lib/tool-display.ts` (+ new `tool-renderers/*`), `omp-settings-sections.tsx` "Tools" section | Pinned toggles for `ast_grep`, `checkpoint`(+rewind), `github`, `security_scan` using the exact omp ids (read from `tools/settings.ts`, not guessed); dedicated renderers at minimum for `edit` (diff), `grep`/`glob`, `lsp`, `ast_edit`/`ast_grep`, `todo`, `web_search`, `task`; generic fallback unchanged for the rest; unit tests for display mapping |
| **D** | RPC session surface | `packages/omp-bridge/src/session-rpc.ts` (+ handler registration lines), `api.ts` wrappers, new `features/session-tree/*` panel | `get_tree`, `get_messages_page`, `switch_session`, `new_session` reachable end-to-end from the renderer; tree panel shows branches and can switch/branch; `fork` either implemented via omp `branch`/`fork` or left rejected with a visible reason (decision D2); bridge fake-model test per command |
| **E1** | Hooks, plugins, slash-command authoring | `electron/main/ipc/extensions-mgmt-ipc.ts` additions, new `features/settings/{HooksSection,PluginsSection,CommandsSection}.tsx` | Read omp hook/plugin/command discovery first and document file formats in the PR notes; list/enable/disable/create/delete for each; plugin ops go through bundled `omp plugin`, never PATH omp; tests for config read/write |
| **E2** | Maintenance features: compress, cleanse, judgment, security-scan, autoresearch | new `features/settings/MaintenanceSection.tsx` + IPC; settings via generic path where they are plain keys | First report how each is triggered in omp (tool, slash command, CLI, setting). Wire the triggerable ones to UI actions; report the rest as "setting only" or "not meaningful in a desktop chat" with evidence |
| **F** | omp CLI subcommands | `electron/main/omp-cli.ts` (allowlisted runner using the bundled binary), `features/omp-tools/*` | Triage all 45 commands into {wire, skip-with-reason}; wire at least `commit`, `stats`, `usage`, `gc`, `models`, `ssh`, `worktree`, `share` if meaningful; runner enforces an allowlist, no shell interpolation, streams output, honors the bundled-binary rule; tests for the allowlist and arg building |
| **G** | Hygiene | `packages/omp-bridge/src/bridge.ts` (`resolveOmpBinary`, `makeOmpOverlay` roles/isolation), `electron/main/runtime/*` as needed | (1) dev `OMP_BIN` resolves `apps/desktop/resources/bin/omp-<platform>-<arch>` so dev never uses PATH omp; (2) overlay sets `modelRoles` for subagent roles so subagents run on the configured backend (decision G2); (3) user `~/.omp/agent` leakage handled per decision G1; (4) vitest for resolution order |
| **I** | Non-RPC modes (decision I1) | `electron/main/omp-acp.ts` or terminal handoff, minimal UI | Per decision: TUI handoff opens bundled omp in Fcode's terminal on the same session; ACP launcher exposes `omp acp` for Zed/JetBrains with the bundled binary. Print mode and `omp setup` are declared out of scope with reason in docs |

### Wave 2 — after A lands

| ID | Slice | Owns | Acceptance |
|---|---|---|---|
| **H** | pi-host parity | `apps/pi-host/src/*`, `scripts/bundle.mjs`, `scripts/e2e-remote-host.mjs` | pi-host honors `FCODE_OMP_SETTINGS` (generic writer), memory, approval-mode, `FCODE_BENCH_PATH` env; host tools portable headless (`fcode_bench_*`, `kanban_*`) are registered, display-only ones (`BrowserPreview`, canvas/studio, `GenerateImages`) are documented as desktop-only; e2e script grows checks; bundle smoke passes |

### Wave 3 — integration (me, inline)
- J1 Merge slice reports; apply CHANGELOG `[Unreleased]` entries.
- J2 Full verification: shared build → desktop `tsc` (3 pre-existing errors only) → vitest in `shared`, `omp-bridge`, `i18n`, `agent-runtime`, `host-runtime`, `pi-host` → desktop `node --test --test-timeout=90000` excluding `macos-signing|npm-executable|remote-host-ssh|ssh-` → `scripts/e2e-remote-host.mjs`.
- J3 Real Electron smoke (one run): Advanced page edits a setting → restart sidecar → value visible in overlay YAML and effective in omp (`get_state`/behavior); a default-off tool enabled and called; tree panel switch; plugin list.
- J4 Docs: guide page for omp parity matrix, ADR for the manifest approach, update `docs/spec` omp section; i18n parity check across 9 locales.
- J5 Commit in chunks.

## Decisions (defaults used unless the user overrides)

| ID | Question | Default |
|---|---|---|
| W0.1 | Commit the current tree before the swarm? | Yes, in chunks |
| G1 | Stop `~/.omp/agent` leaking into Fcode sessions? | Isolate: dedicated agent dir under Fcode data dir, one-time optional import of user config |
| G2 | Subagent model backend | Overlay maps subagent roles to the session's default model unless user sets `task.agentModelOverrides` |
| C1 | Default-off tools (`ast_grep`, `checkpoint`, `github`, `security_scan`) | Opt-in toggles, default stay off |
| D2 | `fork` | Implement through omp `branch`/`fork`; drop the "native bridging unsupported" rejection only if omp semantics match |
| I1 | Non-RPC modes | TUI handoff + ACP launcher; print/setup out of scope |
| B1 | i18n for generated labels | English from omp; chrome translated |

## Risks
- Bridge/api/register hot files: concurrent anchored edits; mitigated by the shared-file rule and re-read-before-edit.
- Manifest import under Bun may pull TUI/native modules (`settings-ui.ts` imports `@oh-my-pi/pi-tui`); slice A must import the registry without TUI side effects or stub the TUI import in the generator.
- Settings UI and omp updates drift: the manifest hash check turns drift into a build failure, not a silent mismatch.
- Existing flaky agent-runtime 5000 ms timeouts will blur verification; J2 compares against the pre-swarm baseline.

## Out of scope
- Re-translating omp's setting descriptions into 9 languages.
- Upstream sync of omp (vendored snapshot, no upstream).
- Items already tracked in the earlier gap register (G1–G28) unless listed above.
