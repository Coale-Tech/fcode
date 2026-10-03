import type { AgentHostBridge } from "../agent-host-bridge";
import type { AgentSidecar } from "../agent-sidecar";
import type { HostProcess } from "../host-process";

/** Mutable process handles shared by the runtime adapters and lifecycle code. */
export type RuntimeState = {
  host: HostProcess | null;
  sidecar: AgentSidecar | null;
  agentHostBridge: AgentHostBridge | null;
  /**
   * One omp process per running Kanban worker, keyed by session id. omp's
   * working directory is fixed when its process spawns, so a worker that must
   * run in its card's folder (and alongside other workers) needs its own.
   */
  workerSidecars: Map<string, AgentSidecar>;
};

/** The omp process that owns `sessionId`: its worker's, else the shared one. */
export function sidecarForSession(state: RuntimeState, sessionId?: string): AgentSidecar | null {
  return (sessionId ? state.workerSidecars.get(sessionId) : undefined) ?? state.sidecar;
}

/** Every live omp process: the shared one plus one per running worker. */
export function allSidecars(state: RuntimeState): AgentSidecar[] {
  return [...(state.sidecar ? [state.sidecar] : []), ...state.workerSidecars.values()];
}
