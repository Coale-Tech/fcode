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

/** One breakpoint tracked in the panel (may be optimistic / pending). */
export interface DapBreakpoint {
  file: string;
  line: number;
  condition?: string;
  /** Confirmed verified by the debugger adapter. False while pending. */
  verified: boolean;
  /** Awaiting a tool_result to confirm or reject this breakpoint. */
  pending: boolean;
  /** Debugger adapter returned verified=false for this breakpoint. */
  failed: boolean;
}

export interface DapPanelState {
  sessions: ReadonlyMap<string, DapSessionSnap>;
  frames: readonly DapFrameSnap[];
  variables: readonly DapVarSnap[];
  /** Breakpoints keyed by "${file}:${line}". */
  breakpoints: ReadonlyMap<string, DapBreakpoint>;
  /**
   * In-flight debug tool calls keyed by toolCallId.
   * Used to reconcile breakpoints when tool_result arrives.
   */
  pendingCalls: ReadonlyMap<string, { action: string; file?: string; line?: number }>;
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

/** Breakpoint map key. */
export function bpKey(file: string, line: number): string {
  return `${file}:${line}`;
}

/** Actions dispatched into the reducer. */
export type DapPanelAction =
  | {
      /** Tool result from a debug tool_end event. */
      type: "tool_result";
      details: Record<string, unknown>;
      /** toolCallId from the tool_end event; used to reconcile breakpoints. */
      toolCallId?: string;
      /** Whether the tool_end was an error result. */
      isError?: boolean;
    }
  | {
      /** tool_start for the debug tool; stores args for later reconciliation. */
      type: "debug_tool_start";
      toolCallId: string;
      action: string;
      file?: string;
      line?: number;
    }
  | {
      /** Optimistically add a breakpoint before the tool call is dispatched. */
      type: "bp_add_optimistic";
      file: string;
      line: number;
      condition?: string;
    }
  | {
      /** Optimistically remove a breakpoint immediately. */
      type: "bp_remove_optimistic";
      file: string;
      line: number;
    }
  | { type: "clear" };

export const EMPTY_DAP_STATE: DapPanelState = {
  sessions: new Map(),
  frames: [],
  variables: [],
  breakpoints: new Map(),
  pendingCalls: new Map(),
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

  // ─── optimistic breakpoint add ─────────────────────────────────────────────
  if (action.type === "bp_add_optimistic") {
    const key = bpKey(action.file, action.line);
    const next = new Map(state.breakpoints);
    next.set(key, {
      file: action.file,
      line: action.line,
      condition: action.condition,
      verified: false,
      pending: true,
      failed: false,
    });
    return { ...state, breakpoints: next };
  }

  // ─── optimistic breakpoint remove ─────────────────────────────────────────
  if (action.type === "bp_remove_optimistic") {
    const key = bpKey(action.file, action.line);
    if (!state.breakpoints.has(key)) return state;
    const next = new Map(state.breakpoints);
    next.delete(key);
    return { ...state, breakpoints: next };
  }

  // ─── track in-flight debug tool call ──────────────────────────────────────
  if (action.type === "debug_tool_start") {
    const next = new Map(state.pendingCalls);
    next.set(action.toolCallId, {
      action: action.action,
      file: action.file,
      line: action.line,
    });
    return { ...state, pendingCalls: next };
  }

  // ─── tool_result ──────────────────────────────────────────────────────────
  const { details, toolCallId, isError } = action;
  let nextSessions: Map<string, DapSessionSnap> | null = null;
  let frames = state.frames;
  let variables = state.variables;
  let breakpoints = state.breakpoints;
  let pendingCalls = state.pendingCalls;
  let changed = false;

  // --- sessions ---------------------------------------------------------------
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

  // --- stack frames -----------------------------------------------------------
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

  // --- variables --------------------------------------------------------------
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

  // --- breakpoint reconciliation from set_breakpoint / remove_breakpoint ------
  const action_name = typeof details.action === "string" ? details.action : "";
  if (
    (action_name === "set_breakpoint" || action_name === "remove_breakpoint") &&
    toolCallId
  ) {
    const pending = state.pendingCalls.get(toolCallId);
    if (pending) {
      const nextPending = new Map(state.pendingCalls);
      nextPending.delete(toolCallId);
      pendingCalls = nextPending;

      const file = pending.file;
      if (file) {
        const nextBps = new Map(state.breakpoints);
        if (isError) {
          // Revert: if it was an optimistic add (set_breakpoint), remove the pending bp.
          if (pending.action === "set_breakpoint" && pending.line !== undefined) {
            nextBps.delete(bpKey(file, pending.line));
          }
          // For remove_breakpoint errors: bp already removed optimistically; nothing to restore here.
        } else {
          // Replace all breakpoints for this file with the authoritative list from the tool.
          // First, remove all existing bps for this file.
          for (const [k, bp] of nextBps) {
            if (bp.file === file) nextBps.delete(k);
          }
          // Then insert the verified list from the tool result.
          if (Array.isArray(details.breakpoints)) {
            for (const raw of details.breakpoints) {
              if (!raw || typeof raw !== "object") continue;
              const r = raw as Record<string, unknown>;
              const line = typeof r.line === "number" ? r.line : undefined;
              if (line === undefined) continue;
              const verified = r.verified === true;
              const cond = typeof r.condition === "string" ? r.condition : undefined;
              const failed = !verified;
              nextBps.set(bpKey(file, line), {
                file,
                line,
                condition: cond,
                verified,
                pending: false,
                failed,
              });
            }
          }
        }
        breakpoints = nextBps;
        changed = true;
      }
    }
  }

  return changed
    ? { sessions: nextSessions ?? state.sessions, frames, variables, breakpoints, pendingCalls }
    : state;
}
