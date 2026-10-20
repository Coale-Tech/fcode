# ADR 0311: Adopt Harness² techniques in skill self-improvement

- Status: Accepted
- Date: 2026-10-20
- Deciders: Fcode core

## Context

Fcode's background skill review (`skill-review.ts`) proposes skills from a session transcript, lints them, and stages them for approval. It had no evidence discipline, no tree-level validation, no record of whether past edits helped, and no way to test a change.

[Harness²](https://github.com/google-research/harness2) (Google Research, Apache-2.0) edits an agent *harness* (always-on instructions, skills, scripts) from execution evidence. Nine of its techniques transfer to Fcode. Harness² itself has no ground truth: it judges harnesses by comparing rollouts. omp's `ratchet` tool is the ground-truth counterpart and is not used here.

## Decision

Adopt all nine, grounded in Fcode's surface (`AGENTS.md`, `CLAUDE.md`, `<name>/SKILL.md`, `scripts/*.py`).

| # | Technique | Where |
|---|---|---|
| 1 | Evidence-discipline prompt: repeated pattern = signal, one-off = noise, every edit cites a moment, `KEEP_BASE` is valid | `skill-review.ts` |
| 2 | Validate the proposed tree; retry once with the exact errors; then drop the offending proposals | `harness-validate.ts` (shared), `runOnePassWithRetry` |
| 3 | Evidence is data, not instructions (`EVIDENCE_BOUNDARY`) | `skill-review.ts`, `harness-omp.ts` |
| 4 | Verdicts `helped / hurt / no observed effect / confounded` and lessons `cue / lesson / evidence / confidence`, `NO_ENTRY` allowed; persisted in the review ledger and the per-domain library | `skill-review.ts`, `harness-library.ts` |
| 5 | Split passes: procedure (INV) vs domain (DOM) | `skills.review.passes` = `single` (default) or `split` |
| 6 | Facts go to project memory, not global skills | facts are staged as `kind:'fact'`; approval appends a bullet under `## Project facts (Fcode self-improve)` in the project's `AGENTS.md` |
| 7 | Component ladder: script > skill > always-on, with an always-on budget | prompts; `validateHarnessTree` |
| 8 | Blind anonymised selection among candidates | `harness-select.ts` |
| 9 | Contrastive Propose–Probe–Compose loop, parallel or sequential, `R = 4k` rollouts and `P = 3k` proposer stages per task | `harness-recursion.ts`, `harness-omp.ts`, `harness-rpc.ts`; JSON-RPC `skills.harness.run` |

### Deliberate deviations from upstream

- **Item 8 is an Fcode adaptation, not an upstream strength.** Upstream's selection pool is only the `k` finals; the base is excluded and the selector cannot abstain. Fcode puts the unmodified base in the pool under a shuffled anonymous id, so choosing it means "adopt nothing". A selector failure also falls back to the base.
- **Item 9 is on demand, never in an interactive turn.** It is off by default (`skills.harness.enabled`), costs many model calls, and stages its winner as ordinary pending proposals. It never applies anything.
- **Item 6 writes into `AGENTS.md`, not into mnemopi/hindsight.** Those backends cannot be written from the bridge without a live omp session. `AGENTS.md` is always loaded, visible in git, and reversible. Approval fails and keeps the pending file if the project directory is missing or unwritable; Fcode does not commit in the user's project.
- **The always-on cap scales with the real base** (`surfaceForBase`: `max(6000, base + 2000)`). omp's 6000 is `COMPACT_MAX_CHARS` for the skill-description list, not a limit on `AGENTS.md`, and a flat cap would reject every real project.
- **Staging only covers skills.** A winning candidate's changes to `AGENTS.md`, `CLAUDE.md` or scripts are returned as `unstagedEdits` and are not applied.

### Rollout isolation (item 9)

- Each rollout runs in a `git worktree add --detach` copy of the project at `HEAD`. Uncommitted changes are not included. The worktree is removed afterwards and the project tree is never written.
- The candidate harness is overlaid: `AGENTS.md`/`CLAUDE.md` at the root, skills at `.claude/skills/<name>/SKILL.md`.
- omp runs with `--tools read,write,edit,glob,grep,find` (no `bash`, no web, no sub-agents), an empty `HOME` and `PI_CODING_AGENT_DIR` so the user's own skills and memory do not leak, and only the auth database copied in. `--no-skills` is not used for rollouts: it sets `skills = []` and would make every skill candidate a no-op.
- Because rollouts have no `bash`, tasks that need to run commands cannot be replayed faithfully. This is a known ceiling.

## Settings

`skills.review.passes` (`single`), `skills.harness.enabled` (false), `skills.harness.k` (1–4, 1), `skills.harness.mode` (`parallel`), `skills.harness.model` (empty = omp default). Shown in the "Background Skill Review" card in Settings.

## Consequences

- Review proposals are validated before staging; invalid trees fall back to the base instead of failing silently.
- The harness loop's cost is `4k` rollouts plus `3k` proposer stages; token cost is not reported because omp's print mode does not expose usage.
- Upstream prompts are adapted; see `NOTICE.md` for the Apache-2.0 attribution.
- Not done: using `ratchet` for ground-truth gating of harness edits.
