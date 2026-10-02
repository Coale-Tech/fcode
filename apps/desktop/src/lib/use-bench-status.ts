/**
 * use-bench-status — shared hook + pure helpers for bench state (B8 fix).
 *
 * Wraps the existing useBenchContext poll; exports pure derivation functions
 * so they can be unit-tested without React or a DOM.
 */

export type BenchStatus = "stopped" | "starting" | "running" | "failed";

export interface BenchStatusSnapshot {
  status: BenchStatus;
  benchPath: string | null;
  site: string | null;
}

/**
 * Maps a bench status to a display label and CSS modifier class.
 * Pure — no side effects; testable without React or a DOM.
 *
 * Note: chat-shell.css only defines `.is-running` and `.is-stopped` on
 * `.workspace-bar-run-state`. "starting" and "failed" map to is-stopped
 * visually; the text label conveys the semantic difference.
 */
export function benchStatusDisplay(status: BenchStatus): { label: string; cls: string } {
  switch (status) {
    case "running":  return { label: "running",   cls: "is-running" };
    case "starting": return { label: "starting…", cls: "is-stopped" };
    case "failed":   return { label: "failed",    cls: "is-stopped" };
    default:         return { label: "stopped",   cls: "is-stopped" };
  }
}

/**
 * Derives whether each bench onboarding step is done.
 * Pure — testable without React or a DOM.
 *
 * bench.select: done when a bench is active (benchPath set) OR a project workspace is set.
 * bench.start:  done when status is "running".
 */
export function deriveBenchOnboarding(
  status: BenchStatus,
  benchPath: string | null,
  workspace: unknown,
): { select: boolean; start: boolean } {
  return {
    select: benchPath !== null || workspace != null,
    start: status === "running",
  };
}

// Re-export useBenchContext under the name useBenchStatus so callers only need
// one import for both the hook and the pure helpers.
export { useBenchContext as useBenchStatus } from "../hooks/use-bench-context";
