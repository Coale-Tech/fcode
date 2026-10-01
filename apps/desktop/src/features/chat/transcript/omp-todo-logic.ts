/**
 * Pure helpers for OmpTodoPanel — extracted for unit testability.
 */
import type { OmpTodoPhase } from "@pi-desktop/shared";

/** True when any phase has at least one non-terminal task. */
export function hasActiveTasks(phases: OmpTodoPhase[]): boolean {
  return phases.some((p) =>
    p.tasks.some((t) => t.status !== "completed" && t.status !== "abandoned"),
  );
}
