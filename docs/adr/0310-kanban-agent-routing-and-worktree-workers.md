# ADR 0310: Kanban routes cards to agents and runs extra workers in worktrees

- Status: Accepted
- Date: 2026-10-12
- Deciders: Fcode core
- Related: HD1 (one worker per directory) · [ADR 0309](0309-filebird-and-integrated-terminal.md)

## Context

The Kanban dispatcher starts one generic omp worker per ready card and allows
one worker per project folder (HD1) because two agents editing one checkout
collide. The nine bundled Fcode agents (`frappe-dev`, `frappe-tester`, …) are
never chosen for a card, workers cannot see what sibling cards produced, and
the dispatcher keeps no memory of which agent finishes work.

A survey of ruflo's swarm layer (topologies, consensus, federation, SPARC
phases, AgentDB) found that most of it targets problems Fcode does not have: a
card board already serialises work, and omp already owns subagent execution.

## Decision

1. **Routing is a prompt-level choice, not a session pin.** `pickAgent`
   (`runtime/kanban-router.ts`) scores a card's title and body against each
   non-shadowed agent's name and description and multiplies the score by a
   success prior. The winner is stored on the card (`agent`) and the worker
   prompt tells the worker to delegate with the `task` tool and that agent. omp
   offers no way to pin a custom agent to a top-level session.
2. **No match means the generic worker.** A score below `MIN_SCORE` leaves
   `agent` unset and the prompt unchanged. The `task` agent is never a target.
3. **Learning is a success prior, not a model.** `agentOutcomes` joins runs to
   cards on `agent`. After three finished runs an agent's score is scaled by
   `0.5 + done / (done + failed)`; `reclaimed` runs are a host restart, not a
   failure. The record is shown in the card drawer.
4. **The board is the blackboard.** Workers may call `kanban_list`, and
   `kanban_show` / `kanban_comment` accept a `taskId` for another live card.
   Authorship is still forced from the worker's session, and every call still
   requires a worker session.
5. **Parallelism uses git worktrees, default off.** `maxWorkersPerProject`
   (1–5, default 1) keeps HD1 as the default. The second and later worker in a
   project gets `~/.omp/wt/<branch>-<ts>` on branch `kanban/<cardId8>`, created
   by `addWorktree(…, create)`; the card records `worktreePath` and the worker
   runs there. Creation is idempotent per branch so a retried card resumes its
   own worktree. If the worktree cannot be created the card stays `ready` and
   the failure is reported; it is never claimed into the shared checkout.
6. **Worktrees are not removed automatically.** They hold the worker's output.
   The Worktree panel (work-panel tab and Settings) already lists, clears and prunes them.
7. **Binding ADRs are named in every worker prompt**, so a worker reads
   `docs/adr/` before changing code.

## Consequences

- Cards created before this change have no `agent` and behave as before.
- Routing quality is bounded by agent descriptions; two agents whose
  descriptions overlap tie and resolve by name.
- With `maxWorkersPerProject > 1` the repository accumulates `kanban/*`
  branches until the user merges or deletes them.
- A project folder that is not a git repository cannot host a second worker;
  its extra cards wait and log the git error each tick.
- Rejected from ruflo: swarm topologies, Raft/PBFT/gossip consensus,
  federation, SPARC phases, AgentDB/vector memory, autopilot missions. None
  addresses a problem the board plus omp subagents leaves open.
