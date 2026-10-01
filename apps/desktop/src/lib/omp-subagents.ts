/**
 * Pure reducer for the live omp subagent registry shown in the compact
 * SubagentsList widget (feat/subagents-view).
 *
 * Populated by two sources:
 *   1. get_subagents snapshot (action "snapshot")
 *   2. tool_start/tool_end agent.events where toolName === "task" (actions "started"/"ended")
 *
 * The reducer is keyed by toolCallId (= omp subagent id from lifecycle frames).
 */

export type OmpSubagentStatus =
  | "running"
  | "completed"
  | "failed"
  | "aborted"
  | "timed_out"
  | "stopped"
  | "denied";

export interface OmpSubagentEntry {
  id: string;
  agent: string;
  task?: string;
  status: OmpSubagentStatus;
  startedAt: number;
}

/** Actions dispatched into the reducer. */
export type OmpSubagentsAction =
  | {
      /** Full snapshot from get_subagents — merges, does not replace. */
      type: "snapshot";
      subagents: ReadonlyArray<{
        id: string;
        agent: string;
        status: string;
        task?: string;
        description?: string;
        lastUpdate: number;
      }>;
    }
  | { type: "started"; id: string; agent: string; task?: string; startedAt: number }
  | { type: "ended"; id: string; status: string };

function normalizeStatus(raw: string): OmpSubagentStatus {
  const VALID: OmpSubagentStatus[] = [
    "running",
    "completed",
    "failed",
    "aborted",
    "timed_out",
    "stopped",
    "denied",
  ];
  return VALID.includes(raw as OmpSubagentStatus)
    ? (raw as OmpSubagentStatus)
    : "completed";
}

/**
 * Reduce an OmpSubagentsAction into a new state map (keyed by subagent id).
 * The map is never mutated — a new Map is returned on every change.
 */
export function ompSubagentsReducer(
  state: ReadonlyMap<string, OmpSubagentEntry>,
  action: OmpSubagentsAction,
): ReadonlyMap<string, OmpSubagentEntry> {
  switch (action.type) {
    case "snapshot": {
      const next = new Map(state);
      for (const sa of action.subagents) {
        const existing = next.get(sa.id);
        if (existing) {
          // Only update status if snapshot says it's terminal and current is running.
          const newStatus = normalizeStatus(sa.status);
          if (existing.status === "running" && newStatus !== "running") {
            next.set(sa.id, { ...existing, status: newStatus });
          }
        } else {
          next.set(sa.id, {
            id: sa.id,
            agent: sa.agent,
            task: sa.task ?? sa.description,
            status: normalizeStatus(sa.status),
            startedAt: sa.lastUpdate,
          });
        }
      }
      return next;
    }

    case "started": {
      const next = new Map(state);
      next.set(action.id, {
        id: action.id,
        agent: action.agent,
        task: action.task,
        status: "running",
        startedAt: action.startedAt,
      });
      return next;
    }

    case "ended": {
      const existing = state.get(action.id);
      // Drop events for unknown ids — no ghost entries.
      if (!existing) return state;
      // Only update if still running (idempotent for duplicate ended events).
      if (existing.status !== "running") return state;
      const next = new Map(state);
      next.set(action.id, { ...existing, status: normalizeStatus(action.status) });
      return next;
    }

    default:
      return state;
  }
}
