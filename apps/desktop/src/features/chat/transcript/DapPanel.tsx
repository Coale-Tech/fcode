/**
 * Read-only DAP session inspector panel (feat/dap-panel).
 *
 * Mounts below the transcript (same slot as OmpSubagentsList) and accumulates
 * debug tool state from tool_end agent events. No new IPC routes required.
 */
import { memo, useEffect, useReducer } from "react";
import { useTranslation } from "react-i18next";
import { IPC } from "@pi-desktop/shared";
import {
  dapPanelReducer,
  EMPTY_DAP_STATE,
  type DapSessionStatus,
} from "../../../lib/dap-panel";

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

// ─── panel ────────────────────────────────────────────────────────────────────

export const DapPanel = memo(function DapPanel({
  sessionId,
}: {
  sessionId: string | undefined;
}) {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(dapPanelReducer, EMPTY_DAP_STATE);

  // Clear state when the chat session changes.
  useEffect(() => {
    dispatch({ type: "clear" });
  }, [sessionId]);

  // Subscribe to tool_end events for the debug tool.
  useEffect(() => {
    const bridge = window.piDesktop;
    if (!bridge?.on) return;
    return bridge.on(IPC.event.agentMessage, (raw: unknown) => {
      // Narrow the envelope fields with in/typeof guards (no inline cast access).
      if (!raw || typeof raw !== "object") return;
      if (!("sessionId" in raw) || raw.sessionId !== sessionId) return;
      if (!("event" in raw)) return;

      const event: unknown = raw.event;
      if (!event || typeof event !== "object") return;
      if (!("type" in event) || event.type !== "tool_end") return;
      if (!("toolName" in event) || event.toolName !== "debug") return;
      if (!("result" in event)) return;

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
      });
    });
  }, [sessionId]);

  const entries = [...state.sessions.values()];
  if (entries.length === 0) return null;

  const activeSessions = entries.filter((s) => s.status !== "terminated");
  const stoppedSessions = entries.filter((s) => s.status === "stopped");
  const hasFrames = state.frames.length > 0 && stoppedSessions.length > 0;
  const hasVars = state.variables.length > 0;

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
