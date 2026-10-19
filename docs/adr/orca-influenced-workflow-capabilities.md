# ADR: Worktree workflow, review notes, local CLI and fan-out

- Status: Accepted for implementation
- Date: 2026-10-19

## Context

Parallel agent work in Fcode already creates git worktrees (Kanban workers,
task isolation) but the user could not provision them with local files, see
them as workspaces, drive the app from a terminal, or compare several agents on
one prompt. The shipped RACP-WS server (`packages/racp`) is only reachable
through the headless `pi-host`.

## Decision

1. **Worktree provisioning.** After `git worktree add`, `.worktreeinclude`
   entries are copied and `.worktreeshare` entries are symlinked from the main
   checkout (`electron/main/worktree-provision.ts`). Paths escaping the repo
   are skipped. `OMP_WORKTREE_DIR` overrides the worktree root.
   `clearWorktree` refuses paths outside that root because RACP
   `worktree/remove` is remotely reachable.
2. **Review notes.** Line notes attach to the diff in the Review tab and are
   sent as one batched prompt to the active session
   (`src/lib/review-notes-prompt.ts`).
3. **Worktrees as workspaces.** The sidebar lists the active repo plus its
   worktrees under Sessions (the Projects section is hidden by
   `d-shell-overrides.css`). `benchForPath` maps a worktree of a bench app to
   its bench; the Bench page follows the workspace.
4. **Local RACP server and `fcode` CLI.** The desktop app starts a loopback
   RACP server (`racp-local-server.ts`) with nine added operations
   (`worktree/*`, `bench/*`, `canvas/*`, catalog in `packages/shared/src/racp.ts`).
   Host operations live in `@pi-desktop/host-runtime`; a host that does not
   supply one replies `CAPABILITY_UNAVAILABLE` (pi-host does not supply
   worktrees, bench or canvas). The CLI token has the `owner` role, written to
   `<userData>/cli-endpoint.json` (0600). The `fcode` shim sits in
   `<userData>/cli/bin`; `FCODE_CLI_DIR` lets FileBird terminals put it on PATH.
   Exit codes: 0 ok, 1 error, 2 not running. Request timeout 120 s.
5. **Fan-out.** One prompt runs in N worktrees (`runtime/fanout.ts`), each with
   its own agent and model, reusing Kanban's `startWorkerSession`. Worktrees
   are created one by one, then the variants' omp workers start concurrently.
   A variant's worker is released when its turn ends (or its prompt fails).
   Adopt refuses a dirty main checkout, auto-commits the variant's worktree
   changes, then `git merge --no-ff`.

## Consequences

- The CLI only works while the desktop app runs; external terminals must add
  `<userData>/cli/bin` to PATH.
- A cold omp worker takes 20 to 50 s to start, so a fan-out run shows
  "Starting…" for that long.
- The ACP track is deliberately excluded.
- Review notes attach only to tool messages carrying `details.review`, which
  only the Rust host-core `Write`/`Edit` produces. omp-backed sessions emit
  lowercase `write`/`edit` without it, so the Review tab is not reachable from
  an omp turn yet.
- A fan-out column is "running" until its session reports a finished turn
  (`latestTurnResults`), so a variant blocked on a permission prompt is not
  adoptable. The compare view survives tab and session switches.
