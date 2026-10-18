/**
 * Per-agent Kanban outcomes — pure, structurally typed so it accepts both the
 * host-runtime and renderer copies of the board types.
 * Used by the dispatcher's router (success prior) and by the drawer (record).
 */

export type AgentOutcome = { done: number; failed: number };

/** Terminal run statuses that count against an agent. `reclaimed` is a host restart, not a failure. */
const FAILED: Record<string, true> = { crashed: true, timed_out: true, gave_up: true };

/** Minimum finished runs before an agent's record influences routing. */
const EVIDENCE_FLOOR = 3;

/** Join runs → tasks on taskId and bucket terminal outcomes by the task's agent. */
export function agentOutcomes(
  tasks: readonly { id: string; agent?: string }[],
  runs: readonly { taskId: string; status: string }[],
): Map<string, AgentOutcome> {
  const agentByTask = new Map<string, string>();
  for (const t of tasks) if (t.agent) agentByTask.set(t.id, t.agent);

  const out = new Map<string, AgentOutcome>();
  for (const run of runs) {
    const agent = agentByTask.get(run.taskId);
    if (!agent) continue;
    const isDone = run.status === "done";
    if (!isDone && !Object.hasOwn(FAILED, run.status)) continue;
    const rec = out.get(agent) ?? { done: 0, failed: 0 };
    if (isDone) rec.done += 1;
    else rec.failed += 1;
    out.set(agent, rec);
  }
  return out;
}

/**
 * Routing multiplier from an agent's record: 1.0 until EVIDENCE_FLOOR finished
 * runs (no evidence → no opinion), then 0.5 + done/(done+failed), range 0.5…1.5.
 */
export function successPrior(outcome: AgentOutcome | undefined): number {
  if (!outcome) return 1;
  const total = outcome.done + outcome.failed;
  if (total < EVIDENCE_FLOOR) return 1;
  return 0.5 + outcome.done / total;
}
