/**
 * Pure reducer for the DAP session inspector panel (feat/dap-panel).
 *
 * Populated entirely from tool_end agent.events where toolName === "debug".
 * The result.details field carries DebugExecutionDetails from omp, which
 * may contain snapshot, sessions, stackFrames, and variables.
 *
 * No IPC routes needed — all data comes from the existing agentMessage event.
 */

export type DapSessionStatus =
  | "launching"
  | "configuring"
  | "stopped"
  | "running"
  | "terminated";

export interface DapSessionSnap {
  id: string;
  adapter: string;
  program?: string;
  status: DapSessionStatus;
  stopReason?: string;
  frameName?: string;
  breakpointCount: number;
}

export interface DapFrameSnap {
  id: number;
  name: string;
  source?: string;
  line?: number;
}

export interface DapVarSnap {
  name: string;
  value: string;
  type?: string;
}

export interface DapPanelState {
  sessions: ReadonlyMap<string, DapSessionSnap>;
  frames: readonly DapFrameSnap[];
  variables: readonly DapVarSnap[];
}

const VALID_STATUSES: readonly DapSessionStatus[] = [
  "launching",
  "configuring",
  "stopped",
  "running",
  "terminated",
];

function normalizeStatus(raw: unknown): DapSessionStatus {
  return VALID_STATUSES.includes(raw as DapSessionStatus)
    ? (raw as DapSessionStatus)
    : "running";
}

function snapFromRaw(raw: unknown): DapSessionSnap | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string" || !s.id) return null;
  return {
    id: s.id,
    adapter: typeof s.adapter === "string" ? s.adapter : "unknown",
    program: typeof s.program === "string" ? s.program : undefined,
    status: normalizeStatus(s.status),
    stopReason: typeof s.stopReason === "string" ? s.stopReason : undefined,
    frameName: typeof s.frameName === "string" ? s.frameName : undefined,
    breakpointCount:
      (typeof s.breakpointCount === "number" ? s.breakpointCount : 0) +
      (typeof s.functionBreakpointCount === "number"
        ? s.functionBreakpointCount
        : 0),
  };
}

/** Actions dispatched into the reducer. */
export type DapPanelAction =
  | {
      /** Tool result from a debug tool_end event. */
      type: "tool_result";
      details: Record<string, unknown>;
    }
  | { type: "clear" };

export const EMPTY_DAP_STATE: DapPanelState = {
  sessions: new Map(),
  frames: [],
  variables: [],
};

/**
 * Reduce a DapPanelAction into a new state.
 * Returns the same reference when nothing changed.
 */
export function dapPanelReducer(
  state: DapPanelState,
  action: DapPanelAction,
): DapPanelState {
  if (action.type === "clear") return EMPTY_DAP_STATE;

  const { details } = action;
  // Use a separate mutable map so TypeScript tracks mutability; only allocated on first change.
  let nextSessions: Map<string, DapSessionSnap> | null = null;
  let frames = state.frames;
  let variables = state.variables;
  let changed = false;

  // --- sessions ---------------------------------------------------------
  const mergeSession = (raw: unknown) => {
    const snap = snapFromRaw(raw);
    if (!snap) return;
    const existing = (nextSessions ?? state.sessions).get(snap.id);
    if (
      existing &&
      existing.status === snap.status &&
      existing.adapter === snap.adapter &&
      existing.program === snap.program &&
      existing.stopReason === snap.stopReason &&
      existing.frameName === snap.frameName &&
      existing.breakpointCount === snap.breakpointCount
    ) {
      return; // no change
    }
    if (!nextSessions) nextSessions = new Map(state.sessions);
    nextSessions.set(snap.id, snap);
    changed = true;
  };

  if (details.snapshot !== undefined) mergeSession(details.snapshot);
  if (Array.isArray(details.sessions)) {
    for (const s of details.sessions) mergeSession(s);
  }

  // --- stack frames -----------------------------------------------------
  if (Array.isArray(details.stackFrames) && details.stackFrames.length > 0) {
    frames = details.stackFrames.map((f: unknown) => {
      const id =
        f && typeof f === "object" && "id" in f && typeof f.id === "number"
          ? f.id : 0;
      const name =
        f && typeof f === "object" && "name" in f && typeof f.name === "string"
          ? f.name : "(unknown)";
      const line =
        f && typeof f === "object" && "line" in f && typeof f.line === "number"
          ? f.line : undefined;
      let source: string | undefined;
      if (f && typeof f === "object" && "source" in f && f.source && typeof f.source === "object") {
        const src = f.source;
        if ("path" in src && typeof src.path === "string") source = src.path;
        else if ("name" in src && typeof src.name === "string") source = src.name;
      }
      return { id, name, source, line };
    });
    changed = true;
  }

  // --- variables --------------------------------------------------------
  if (Array.isArray(details.variables) && details.variables.length > 0) {
    variables = details.variables.map((v: unknown) => {
      const name =
        v && typeof v === "object" && "name" in v && typeof v.name === "string"
          ? v.name : "";
      const value =
        v && typeof v === "object" && "value" in v && typeof v.value === "string"
          ? v.value : "";
      const type =
        v && typeof v === "object" && "type" in v && typeof v.type === "string"
          ? v.type : undefined;
      return { name, value, type };
    });
    changed = true;
  }

  return changed ? { sessions: nextSessions ?? state.sessions, frames, variables } : state;
}
