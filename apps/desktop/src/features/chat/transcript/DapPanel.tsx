/**
 * DAP session inspector panel (feat/dap-breakpoints).
 *
 * Accumulates debug tool state from agentMessage events (tool_start + tool_end).
 * Breakpoint add/remove and run-control buttons dispatch structured prompts
 * to the active omp session via agentPrompt (prompt-path channel — the only
 * available channel; there is no direct debug-tool RPC in rpc-types.ts).
 *
 * Evidence: omp/packages/coding-agent/src/modes/rpc/rpc-types.ts lists every
 * RpcCommand; none is "run_tool" or "invoke_tool". The only mutation path is
 * a `prompt` turn that causes the agent to call the debug tool.
 */
import { memo, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IPC } from "@pi-desktop/shared";
import {
  bpKey,
  dapPanelReducer,
  EMPTY_DAP_STATE,
  type DapBreakpoint,
  type DapSessionStatus,
} from "../../../lib/dap-panel";
import { api } from "../../../lib/api";

// ─── constants ────────────────────────────────────────────────────────────────

const MAX_FRAMES = 10;
const MAX_VARS = 20;

// ─── helpers ──────────────────────────────────────────────────────────────────

function statusLabel(status: DapSessionStatus, t: (k: string) => string): string {
  switch (status) {
    case "stopped":     return t("chat.dapStopped");
    case "running":     return t("chat.dapRunning");
    case "launching":   return t("chat.dapLaunching");
    case "configuring": return t("chat.dapConfiguring");
    case "terminated":  return t("chat.dapTerminated");
  }
}

function basename(p: string | undefined): string | undefined {
  if (!p) return undefined;
  return p.split(/[\\/]/).at(-1);
}

/**
 * Build the prompt sent to the agent for a debug action.
 * Clearly labelled as prompt-path: the agent LLM interprets this and calls
 * the debug tool. Structured format maximises tool-call reliability.
 */
function buildDebugPrompt(
  action: string,
  opts: { file?: string; line?: number; condition?: string } = {},
): string {
  const parts = [`[debug:${action}]`];
  if (opts.file) parts.push(`file="${opts.file}"`);
  if (opts.line !== undefined) parts.push(`line=${opts.line}`);
  if (opts.condition) parts.push(`condition="${opts.condition}"`);
  return parts.join(" ");
}

// ─── panel ────────────────────────────────────────────────────────────────────

export const DapPanel = memo(function DapPanel({
  sessionId,
}: {
  sessionId: string | undefined;
}) {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(dapPanelReducer, EMPTY_DAP_STATE);
  const [bpFile, setBpFile] = useState("");
  const [bpLine, setBpLine] = useState("");
  const [bpCond, setBpCond] = useState("");
  const [sending, setSending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear state when the chat session changes.
  useEffect(() => {
    dispatch({ type: "clear" });
  }, [sessionId]);

  // Subscribe to tool_start and tool_end events for the debug tool.
  useEffect(() => {
    const bridge = window.piDesktop;
    if (!bridge?.on) return;
    return bridge.on(IPC.event.agentMessage, (raw: unknown) => {
      // Narrow the envelope fields with in/typeof guards (no inline cast member access).
      if (!raw || typeof raw !== "object") return;
      if (!("sessionId" in raw) || raw.sessionId !== sessionId) return;
      if (!("event" in raw)) return;

      const event: unknown = raw.event;
      if (!event || typeof event !== "object") return;
      if (!("type" in event)) return;

      // tool_start: capture args for breakpoint reconciliation.
      if (event.type === "tool_start") {
        if (!("toolName" in event) || event.toolName !== "debug") return;
        if (!("toolCallId" in event) || typeof event.toolCallId !== "string") return;
        const args: unknown = "args" in event ? event.args : undefined;
        if (!args || typeof args !== "object") return;
        const a = args as Record<string, unknown>;
        const action = typeof a.action === "string" ? a.action : "";
        const file = typeof a.file === "string" ? a.file : undefined;
        const line = typeof a.line === "number" ? a.line : undefined;
        dispatch({ type: "debug_tool_start", toolCallId: event.toolCallId, action, file, line });
        return;
      }

      if (event.type !== "tool_end") return;
      if (!("toolName" in event) || event.toolName !== "debug") return;
      if (!("result" in event)) return;

      const toolCallId = "toolCallId" in event && typeof event.toolCallId === "string"
        ? event.toolCallId
        : undefined;
      const isError = "isError" in event && event.isError === true;

      const result: unknown = event.result;
      if (!result || typeof result !== "object") return;
      if (!("details" in result)) return;

      const details: unknown = result.details;
      if (!details || typeof details !== "object") return;

      // Safe: validated as non-null object above; reducer accesses all fields
      // with explicit in/typeof checks.
      dispatch({
        type: "tool_result",
        details: details as Record<string, unknown>,
        toolCallId,
        isError,
      });
    });
  }, [sessionId]);

  // ─── send a debug action via prompt-path ───────────────────────────────────

  const sendDebugAction = useCallback(
    async (
      action: string,
      opts: { file?: string; line?: number; condition?: string } = {},
    ) => {
      if (!sessionId || sending) return;
      setSending(true);
      try {
        // prompt-path: agent LLM turn → debug tool call
        await api.prompt({ sessionId, content: buildDebugPrompt(action, opts) });
      } finally {
        setSending(false);
      }
    },
    [sessionId, sending],
  );

  // ─── add breakpoint form submission ────────────────────────────────────────

  const handleAddBp = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const line = parseInt(bpLine, 10);
      if (!bpFile.trim() || !Number.isFinite(line) || line < 1) return;
      const file = bpFile.trim();
      const condition = bpCond.trim() || undefined;
      // Optimistic add first.
      dispatch({ type: "bp_add_optimistic", file, line, condition });
      void sendDebugAction("set_breakpoint", { file, line, condition });
      setBpLine("");
      setBpCond("");
    },
    [bpFile, bpLine, bpCond, sendDebugAction],
  );

  // ─── remove a breakpoint ───────────────────────────────────────────────────

  const handleRemoveBp = useCallback(
    (bp: DapBreakpoint) => {
      dispatch({ type: "bp_remove_optimistic", file: bp.file, line: bp.line });
      void sendDebugAction("remove_breakpoint", { file: bp.file, line: bp.line });
    },
    [sendDebugAction],
  );

  const entries = [...state.sessions.values()];
  if (entries.length === 0) return null;

  const activeSessions = entries.filter((s) => s.status !== "terminated");
  const stoppedSessions = entries.filter((s) => s.status === "stopped");
  const isStopped = stoppedSessions.length > 0;
  const hasFrames = state.frames.length > 0 && isStopped;
  const hasVars = state.variables.length > 0;
  const bpList = [...state.breakpoints.values()];

  return (
    <div className="dap-panel" role="region" aria-label={t("chat.dapSessions")}>
      {/* header */}
      <div className="dap-panel-header">
        <span className="dap-panel-title">{t("chat.dapSessions")}</span>
        {activeSessions.length > 0 ? (
          <span className="dap-count">{activeSessions.length}</span>
        ) : null}
      </div>

      {/* session rows */}
      <div className="dap-sessions">
        {entries.map((s) => (
          <div
            key={s.id}
            className={`dap-session dap-session--${s.status}`}
            title={s.program}
          >
            <span className={`dap-dot dap-dot--${s.status}`} aria-hidden />
            <span className="dap-adapter">{s.adapter}</span>
            {s.program ? (
              <span className="dap-program">{basename(s.program)}</span>
            ) : null}
            <span className="dap-status-label">
              {statusLabel(s.status, t)}
              {s.stopReason ? ` (${s.stopReason})` : ""}
            </span>
            {s.breakpointCount > 0 ? (
              <span className="dap-bp-count">⏺ {s.breakpointCount}</span>
            ) : null}
          </div>
        ))}
      </div>

      {/* run controls — prompt-path; only active when session is live */}
      {activeSessions.length > 0 ? (
        <div className="dap-run-controls" aria-label={t("chat.dapControls")}>
          <button
            className="dap-btn"
            title={t("chat.dapContinue")}
            disabled={!isStopped || sending}
            onClick={() => void sendDebugAction("continue")}
            type="button"
          >▶</button>
          <button
            className="dap-btn"
            title={t("chat.dapStepOver")}
            disabled={!isStopped || sending}
            onClick={() => void sendDebugAction("step_over")}
            type="button"
          >↷</button>
          <button
            className="dap-btn"
            title={t("chat.dapStepIn")}
            disabled={!isStopped || sending}
            onClick={() => void sendDebugAction("step_in")}
            type="button"
          >↓</button>
          <button
            className="dap-btn"
            title={t("chat.dapStepOut")}
            disabled={!isStopped || sending}
            onClick={() => void sendDebugAction("step_out")}
            type="button"
          >↑</button>
          <button
            className="dap-btn"
            title={t("chat.dapPause")}
            disabled={isStopped || sending}
            onClick={() => void sendDebugAction("pause")}
            type="button"
          >⏸</button>
          <button
            className="dap-btn dap-btn--danger"
            title={t("chat.dapTerminateAction")}
            disabled={sending}
            onClick={() => void sendDebugAction("terminate")}
            type="button"
          >■</button>
        </div>
      ) : null}

      {/* breakpoints ─────────────────────────────────────────────────────── */}
      <div className="dap-breakpoints">
        <div className="dap-section-label">{t("chat.dapBreakpoints")}</div>

        {/* existing breakpoints */}
        {bpList.length > 0 ? (
          <div className="dap-bp-list">
            {bpList.map((bp) => (
              <div
                key={bpKey(bp.file, bp.line)}
                className={
                  "dap-bp-row" +
                  (bp.failed ? " dap-bp-row--failed" : "") +
                  (bp.pending ? " dap-bp-row--pending" : "")
                }
              >
                <span className="dap-bp-loc">
                  {basename(bp.file)}:{bp.line}
                </span>
                {bp.condition ? (
                  <span className="dap-bp-cond">{bp.condition}</span>
                ) : null}
                {bp.pending ? (
                  <span className="dap-bp-badge">{t("chat.dapBpPending")}</span>
                ) : bp.failed ? (
                  <span className="dap-bp-badge dap-bp-badge--failed">{t("chat.dapBpFailed")}</span>
                ) : null}
                <button
                  className="dap-bp-remove"
                  title={t("chat.dapRemoveBp")}
                  disabled={sending}
                  onClick={() => handleRemoveBp(bp)}
                  type="button"
                >×</button>
              </div>
            ))}
          </div>
        ) : null}

        {/* add breakpoint form */}
        <form
          ref={formRef}
          className="dap-bp-add-form"
          onSubmit={handleAddBp}
        >
          <input
            className="dap-bp-input"
            value={bpFile}
            onChange={(e) => setBpFile(e.target.value)}
            placeholder={t("chat.dapBpFilePlaceholder")}
            aria-label={t("chat.dapAriaFilePath")}
            autoComplete="off"
            spellCheck={false}
          />
          <input
            className="dap-bp-input dap-bp-input--line"
            value={bpLine}
            onChange={(e) => setBpLine(e.target.value)}
            placeholder={t("chat.dapBpLinePlaceholder")}
            aria-label={t("chat.dapAriaLineNumber")}
            autoComplete="off"
            inputMode="numeric"
          />
          <input
            className="dap-bp-input"
            value={bpCond}
            onChange={(e) => setBpCond(e.target.value)}
            placeholder={t("chat.dapBpCondPlaceholder")}
            aria-label={t("chat.dapAriaCondition")}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            className="dap-btn dap-btn--add"
            type="submit"
            disabled={!bpFile.trim() || !bpLine.trim() || sending}
            title={t("chat.dapAddBp")}
          >+</button>
        </form>
      </div>

      {/* stack frames — only shown when debugger is stopped */}
      {hasFrames ? (
        <div className="dap-frames">
          <div className="dap-section-label">{t("chat.dapFrames")}</div>
          <div className="dap-frames-list">
            {state.frames.slice(0, MAX_FRAMES).map((fr) => (
              <div key={fr.id} className="dap-frame">
                <span className="dap-frame-name">{fr.name}</span>
                {fr.source ? (
                  <span className="dap-frame-loc">
                    {basename(fr.source)}
                    {fr.line !== undefined ? `:${fr.line}` : ""}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* variables — from the last variables query */}
      {hasVars ? (
        <div className="dap-vars">
          <div className="dap-section-label">{t("chat.dapVariables")}</div>
          <div className="dap-vars-list">
            {state.variables.slice(0, MAX_VARS).map((v, i) => (
              // index key acceptable: list is replaced wholesale on each query
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className="dap-var">
                <span className="dap-var-name">{v.name}</span>
                {v.type ? (
                  <span className="dap-var-type">{v.type}</span>
                ) : null}
                <span className="dap-var-value">{v.value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
});
