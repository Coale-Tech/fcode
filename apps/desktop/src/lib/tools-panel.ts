/**
 * Pure reducer for the four tool inspector panels:
 *   - browser  (Playwright): screenshots, URL/title, step history
 *   - eval     (Python/JS): per-language cell history, read-only
 *   - computer (computer-use): screenshots + action overlay
 *   - ida      (IDA Pro): structured result list
 *
 * All state is built entirely from tool_start + tool_end agentMessage events.
 * No new IPC routes: the existing agentMessage channel carries everything.
 *
 * Collab participant view is OMITTED: omp/packages/coding-agent/src/collab/host.ts
 * exposes `get participants()` only internally; bridge.ts never forwards participant
 * data as an IPC event. Evidence: grep for "participant" in bridge.ts returns only
 * the collab YAML config lines (255-265), zero event forwarding.
 */

// ─── browser ──────────────────────────────────────────────────────────────────

export interface BrowserStep {
  /** Sequential step index within the session. */
  index: number;
  action: string;
  url?: string;
  title?: string;
  /** Timestamp (Date.now()) when the tool_end landed. */
  ts: number;
  isError: boolean;
}

export interface BrowserScreenshot {
  /** File path; loaded via useReferencedImageDataUrl (IPC). */
  dest: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface BrowserPanelState {
  url?: string;
  title?: string;
  screenshots: readonly BrowserScreenshot[];
  steps: readonly BrowserStep[];
}

// ─── eval ─────────────────────────────────────────────────────────────────────

export type EvalCellStatus = "pending" | "running" | "complete" | "error";

export interface EvalCell {
  /** Monotone index across all cells ever received this session. */
  index: number;
  language?: string;
  title?: string;
  code: string;
  output: string;
  status: EvalCellStatus;
  durationMs?: number;
  exitCode?: number;
  isError: boolean;
}

export interface EvalPanelState {
  /** Most-recent cells first. Capped at MAX_EVAL_CELLS entries. */
  cells: readonly EvalCell[];
}

// ─── computer ─────────────────────────────────────────────────────────────────

export interface ComputerAction {
  index: number;
  /** The `action` field from the tool args (run/call/capabilities/close). */
  kind: string;
  /** Summarised chain if present (e.g. "click, type"). */
  chain?: string;
  ts: number;
  isError: boolean;
}

export interface ComputerScreenshot {
  /** File path; loaded via useReferencedImageDataUrl (IPC). */
  path: string;
  width?: number;
  height?: number;
}

export interface ComputerPanelState {
  /** Latest screenshot only (capped). */
  screenshots: readonly ComputerScreenshot[];
  actions: readonly ComputerAction[];
}

// ─── IDA ──────────────────────────────────────────────────────────────────────

export interface IdaResult {
  index: number;
  action: string;
  db?: string;
  output?: string;
  ts: number;
  isError: boolean;
}

export interface IdaPanelState {
  results: readonly IdaResult[];
}

// ─── combined ─────────────────────────────────────────────────────────────────

export interface ToolsPanelState {
  browser: BrowserPanelState;
  eval: EvalPanelState;
  computer: ComputerPanelState;
  ida: IdaPanelState;
}

export const EMPTY_TOOLS_STATE: ToolsPanelState = {
  browser: { screenshots: [], steps: [] },
  eval: { cells: [] },
  computer: { screenshots: [], actions: [] },
  ida: { results: [] },
};

// ─── caps ─────────────────────────────────────────────────────────────────────

/** Maximum screenshots retained per tool type to bound memory. */
export const MAX_SCREENSHOTS = 20;
/** Maximum eval cells retained (per session). */
export const MAX_EVAL_CELLS = 50;
/** Maximum IDA results retained. */
export const MAX_IDA_RESULTS = 50;
/** Maximum browser steps retained. */
export const MAX_BROWSER_STEPS = 100;
/** Maximum computer actions retained. */
export const MAX_COMPUTER_ACTIONS = 100;
/** Truncate large text output above this byte count. */
export const MAX_OUTPUT_BYTES = 32_000;

function cap<T>(arr: readonly T[], max: number): readonly T[] {
  return arr.length > max ? arr.slice(arr.length - max) : arr;
}

function truncateOutput(text: string): string {
  if (Buffer.byteLength(text, "utf-8") <= MAX_OUTPUT_BYTES) return text;
  const head = text.slice(0, MAX_OUTPUT_BYTES);
  return `${head}\n[…output truncated]`;
}

// ─── actions ──────────────────────────────────────────────────────────────────

export type ToolsPanelAction =
  | { type: "clear" }
  | {
      type: "browser_tool_start";
      stepIndex: number;
      action: string;
    }
  | {
      type: "browser_tool_end";
      stepIndex: number;
      action: string;
      url?: string;
      title?: string;
      screenshots: BrowserScreenshot[];
      isError: boolean;
    }
  | {
      type: "eval_tool_end";
      cells: EvalCell[];
      isError: boolean;
    }
  | {
      type: "computer_tool_start";
      actionIndex: number;
      kind: string;
      chain?: string;
    }
  | {
      type: "computer_tool_end";
      actionIndex: number;
      kind: string;
      chain?: string;
      screenshots: ComputerScreenshot[];
      isError: boolean;
    }
  | {
      type: "ida_tool_end";
      index: number;
      action: string;
      db?: string;
      output?: string;
      isError: boolean;
    };

// ─── reducer ──────────────────────────────────────────────────────────────────

export function toolsPanelReducer(
  state: ToolsPanelState,
  action: ToolsPanelAction,
): ToolsPanelState {
  switch (action.type) {
    case "clear":
      return EMPTY_TOOLS_STATE;

    case "browser_tool_start": {
      // Optimistic step: will be updated on tool_end.
      const next: BrowserStep = {
        index: action.stepIndex,
        action: action.action,
        ts: Date.now(),
        isError: false,
      };
      const steps = cap([...state.browser.steps, next], MAX_BROWSER_STEPS);
      return { ...state, browser: { ...state.browser, steps } };
    }

    case "browser_tool_end": {
      const now = Date.now();
      // Upsert: update existing optimistic step if index matches, else append.
      const existing = state.browser.steps.findIndex((s) => s.index === action.stepIndex);
      const updated: BrowserStep = {
        index: action.stepIndex,
        action: action.action,
        url: action.url,
        title: action.title,
        ts: now,
        isError: action.isError,
      };
      let steps: readonly BrowserStep[];
      if (existing >= 0) {
        const arr = [...state.browser.steps];
        arr[existing] = updated;
        steps = arr;
      } else {
        steps = cap([...state.browser.steps, updated], MAX_BROWSER_STEPS);
      }
      const screenshots = cap(
        [...state.browser.screenshots, ...action.screenshots],
        MAX_SCREENSHOTS,
      );
      return {
        ...state,
        browser: {
          url: action.url ?? state.browser.url,
          title: action.title ?? state.browser.title,
          screenshots,
          steps,
        },
      };
    }

    case "eval_tool_end": {
      const cells = cap([...state.eval.cells, ...action.cells], MAX_EVAL_CELLS);
      return { ...state, eval: { cells } };
    }

    case "computer_tool_start": {
      const act: ComputerAction = {
        index: action.actionIndex,
        kind: action.kind,
        chain: action.chain,
        ts: Date.now(),
        isError: false,
      };
      const actions = cap([...state.computer.actions, act], MAX_COMPUTER_ACTIONS);
      return { ...state, computer: { ...state.computer, actions } };
    }

    case "computer_tool_end": {
      const now = Date.now();
      const existing = state.computer.actions.findIndex(
        (a) => a.index === action.actionIndex,
      );
      const updated: ComputerAction = {
        index: action.actionIndex,
        kind: action.kind,
        chain: action.chain,
        ts: now,
        isError: action.isError,
      };
      let actions: readonly ComputerAction[];
      if (existing >= 0) {
        const arr = [...state.computer.actions];
        arr[existing] = updated;
        actions = arr;
      } else {
        actions = cap([...state.computer.actions, updated], MAX_COMPUTER_ACTIONS);
      }
      const screenshots = cap(
        [...state.computer.screenshots, ...action.screenshots],
        MAX_SCREENSHOTS,
      );
      return { ...state, computer: { actions, screenshots } };
    }

    case "ida_tool_end": {
      const result: IdaResult = {
        index: action.index,
        action: action.action,
        db: action.db,
        output: action.output ? truncateOutput(action.output) : undefined,
        ts: Date.now(),
        isError: action.isError,
      };
      const results = cap([...state.ida.results, result], MAX_IDA_RESULTS);
      return { ...state, ida: { results } };
    }

    default:
      return state;
  }
}

// ─── helpers: parse raw agentMessage event objects ────────────────────────────

function str(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" && v ? v : undefined;
}

function asRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Dispatch browser tool_start. Returns undefined if event is not relevant. */
export function parseBrowserToolStart(
  event: Record<string, unknown>,
  stepCounter: { current: number },
): ToolsPanelAction | undefined {
  if (event.toolName !== "browser") return undefined;
  const args = asRec(event.args);
  const action = (args && str(args, "action")) || "open";
  const idx = stepCounter.current++;
  return { type: "browser_tool_start", stepIndex: idx, action };
}

/** Dispatch browser tool_end. Returns undefined if event is not relevant. */
export function parseBrowserToolEnd(
  event: Record<string, unknown>,
  stepCounter: { current: number },
): ToolsPanelAction | undefined {
  if (event.toolName !== "browser") return undefined;
  const result = asRec(event.result);
  const details = result ? asRec(result.details) : null;
  const isError = event.isError === true;
  const args = asRec(event.args);
  const action = (args && str(args, "action")) || (details && str(details, "action")) || "open";
  const url = details ? str(details, "url") : undefined;
  const title = details ? str(details, "title") : undefined;
  const rawShots: unknown[] = details && Array.isArray(details.screenshots)
    ? details.screenshots
    : [];
  const screenshots: BrowserScreenshot[] = rawShots.flatMap((s) => {
    const r = asRec(s);
    const dest = r && str(r, "dest");
    if (!dest) return [];
    return [
      {
        dest,
        mimeType: r ? str(r, "mimeType") : undefined,
        width: typeof r?.width === "number" ? r.width : undefined,
        height: typeof r?.height === "number" ? r.height : undefined,
      },
    ];
  });
  // step index: we used an optimistic start, so decrement to match.
  const idx = stepCounter.current - 1;
  return {
    type: "browser_tool_end",
    stepIndex: Math.max(idx, 0),
    action,
    url,
    title,
    screenshots,
    isError,
  };
}

/** Dispatch eval tool_end. Returns undefined if event is not relevant. */
export function parseEvalToolEnd(
  event: Record<string, unknown>,
  cellCounter: { current: number },
): ToolsPanelAction | undefined {
  if (event.toolName !== "eval") return undefined;
  const result = asRec(event.result);
  const details = result ? asRec(result.details) : null;
  const isError = event.isError === true;
  const rawCells: unknown[] = details && Array.isArray(details.cells)
    ? details.cells
    : [];
  const cells: EvalCell[] = rawCells.flatMap((raw) => {
    const c = asRec(raw);
    if (!c) return [];
    const code = str(c, "code");
    if (!code) return [];
    const status = (str(c, "status") as EvalCellStatus | undefined) ?? "complete";
    const output = str(c, "output") ?? "";
    return [
      {
        index: cellCounter.current++,
        language: str(c, "language"),
        title: str(c, "title"),
        code,
        output: truncateOutput(output),
        status,
        durationMs:
          typeof c.durationMs === "number" ? c.durationMs : undefined,
        exitCode: typeof c.exitCode === "number" ? c.exitCode : undefined,
        isError: status === "error" || isError,
      },
    ];
  });
  if (cells.length === 0) return undefined;
  return { type: "eval_tool_end", cells, isError };
}

/** Dispatch computer tool_start. Returns undefined if event is not relevant. */
export function parseComputerToolStart(
  event: Record<string, unknown>,
  actionCounter: { current: number },
): ToolsPanelAction | undefined {
  if (event.toolName !== "computer") return undefined;
  const args = asRec(event.args);
  const kind = (args && str(args, "action")) || "run";
  const chain = summariseChain(args);
  const idx = actionCounter.current++;
  return { type: "computer_tool_start", actionIndex: idx, kind, chain };
}

/** Dispatch computer tool_end. Returns undefined if event is not relevant. */
export function parseComputerToolEnd(
  event: Record<string, unknown>,
  actionCounter: { current: number },
): ToolsPanelAction | undefined {
  if (event.toolName !== "computer") return undefined;
  const result = asRec(event.result);
  const details = result ? asRec(result.details) : null;
  const isError = event.isError === true;
  const args = asRec(event.args);
  const kind = (args && str(args, "action")) || "run";
  const chain = summariseChain(args);
  const rawShots: unknown[] = details && Array.isArray(details.screenshots)
    ? details.screenshots
    : [];
  const screenshots: ComputerScreenshot[] = rawShots.flatMap((s) => {
    const r = asRec(s);
    const path = r && str(r, "path");
    if (!path) return [];
    return [
      {
        path,
        width: typeof r?.width === "number" ? r.width : undefined,
        height: typeof r?.height === "number" ? r.height : undefined,
      },
    ];
  });
  const idx = actionCounter.current - 1;
  return {
    type: "computer_tool_end",
    actionIndex: Math.max(idx, 0),
    kind,
    chain,
    screenshots,
    isError,
  };
}

/** Dispatch ida tool_end. Returns undefined if event is not relevant. */
export function parseIdaToolEnd(
  event: Record<string, unknown>,
  idxCounter: { current: number },
): ToolsPanelAction | undefined {
  if (event.toolName !== "ida") return undefined;
  const result = asRec(event.result);
  const details = result ? asRec(result.details) : null;
  const isError = event.isError === true;
  const action = (details && str(details, "action")) || "exec";
  const db = details ? str(details, "db") : undefined;
  // Text output lives in result.content[0].text
  const content = result && Array.isArray(result.content) ? result.content : [];
  const output = content
    .map((c) => {
      const r = asRec(c);
      return r && typeof r.text === "string" ? r.text : "";
    })
    .filter(Boolean)
    .join("\n");
  return {
    type: "ida_tool_end",
    index: idxCounter.current++,
    action,
    db,
    output: output || undefined,
    isError,
  };
}

function summariseChain(args: Record<string, unknown> | null): string | undefined {
  if (!args || !Array.isArray(args.chain)) return undefined;
  const methods: string[] = args.chain.flatMap((step: unknown) => {
    const s = asRec(step);
    return s && typeof s.method === "string" ? [s.method] : [];
  });
  return methods.length > 0 ? methods.join(", ") : undefined;
}
