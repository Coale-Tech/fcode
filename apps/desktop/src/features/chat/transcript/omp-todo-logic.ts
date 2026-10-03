/**
 * Pure helpers for OmpTodoPanel — extracted for unit testability.
 */
import type { OmpTodoPhase, OmpTodoItem, OmpSessionSetTodosResult } from "@pi-desktop/shared";

/** True when any phase has at least one non-terminal task. */
export function hasActiveTasks(phases: OmpTodoPhase[]): boolean {
  return phases.some((p) =>
    p.tasks.some((t) => t.status !== "completed" && t.status !== "abandoned"),
  );
}

/**
 * Return a new phases array with one task's status toggled.
 * Toggles between "completed" and "pending".
 */
export function toggleTaskStatus(
  phases: OmpTodoPhase[],
  phaseIdx: number,
  taskIdx: number,
): OmpTodoPhase[] {
  return phases.map((phase, pi) => {
    if (pi !== phaseIdx) return phase;
    return {
      ...phase,
      tasks: phase.tasks.map((task, ti): OmpTodoItem => {
        if (ti !== taskIdx) return task;
        return { ...task, status: task.status === "completed" ? "pending" : "completed" };
      }),
    };
  });
}

/**
 * Call set_todos RPC and apply the returned phases to the store.
 *
 * On error: leaves the store unchanged, returns { ok: false, error }.
 * Agent-wins: if getCurrentPhases() !== prevPhases when the RPC returns,
 * an agent event updated the store mid-flight — discard RPC result.
 */
export async function editTodosWithRevert(opts: {
  prevPhases: OmpTodoPhase[];
  nextPhases: OmpTodoPhase[];
  /** Read the current store value (to detect an agent-wins race). */
  getCurrentPhases: () => OmpTodoPhase[];
  /** Write phases to the store. */
  setPhases: (phases: OmpTodoPhase[]) => void;
  /** Calls the set_todos RPC. */
  callSetTodos: (phases: OmpTodoPhase[]) => Promise<OmpSessionSetTodosResult>;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await opts.callSetTodos(opts.nextPhases);
    // Agent-wins: if the store changed mid-flight, discard RPC result.
    if (opts.getCurrentPhases() !== opts.prevPhases) {
      return { ok: true };
    }
    opts.setPhases(result.phases);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
