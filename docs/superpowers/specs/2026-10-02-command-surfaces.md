# Command Surfaces: /skill, /stats, /git, /worktree, /ssh, /models, /login

_2026-10-02 · feat/command-surfaces_

## Goal

Surface or formally resolve the six omp slash-command rows that remain
`partial` in the parity matrix.

## Decision per row

| Row | Native surface | Status after PR |
|-----|---------------|----------------|
| `/skill` | New **Installed omp Skills** section in AI settings tab: reads `~/.omp/agent/skills.json` + lock from disk in main process via new `ompInstalledSkillsList` IPC channel; shows id, scope, version, store-present badge, and Reveal button | `partial` |
| `/stats` | New **omp Usage** section in AI settings tab: `ompHistoricalStats` IPC shells out to `omp stats --json`, shows aggregated cost/tokens/requests; per-session stats already in ContextUsageInspector | `partial` |
| `/git` | **Skip** — `omp git` is a fullscreen interactive TUI requiring a real TTY and terminal emulator. No omp RPC exposes git data. Fcode already shows repo/branch in the project switcher. Matrix row updated to reflect this. | `missing` (unchanged) |
| `/worktree` | New **Agent Worktrees** section in AI settings tab: `ompWorktreeList` IPC reads `~/.omp/wt/` directories to enumerate omp task-isolation and PR-checkout worktrees; shows path, kind, branch, orphan status | `partial` |
| `/ssh` | **RemoteHostsPage** covers Fcode's own pi-host SSH pairing (different from omp's SSH host registry). omp SSH hosts are stored in `~/.omp/agent/ssh-hosts.json`, a separate system. Matrix updated: remains `partial`. | `partial` (unchanged) |
| `/models` | `OmpAccountsSection` + composer model picker already cover this fully | updated → `surfaced` |
| `/login` | `OmpAccountsSection` already covers this fully | updated → `surfaced` |

## New IPC channels (protocol.ts)

- `ompInstalledSkillsList: "pi-desktop/omp/skills/installed/list"`
- `ompHistoricalStats: "pi-desktop/omp/stats/historical"`
- `ompWorktreeList: "pi-desktop/omp/worktrees/list"`

## New types (omp.ts)

- `OmpInstalledSkillEntry` { id, scope, version?, range?, stored }
- `OmpHistoricalStatsResult` { totalRequests, totalCost, totalTokens, byModel[], syncedAt }
- `OmpWorktreeEntry` { path, kind, branch?, parentRepo?, orphanReason? }

## Constraints

- No omp RPC for skills or worktrees — read files directly from main process.
- `omp stats --json` shells out using the same binary resolution as the sidecar.
- All three sections lazy-load on first render; each shows a spinner then data.
- No enable/disable per skill (omp has no first-class per-skill disable API;
  `ignoredSkills` config mutation is out of scope for this PR).
- No worktree clear from UI (destructive action; out of scope).
