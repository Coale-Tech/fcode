/**
 * Compact live subagent panel for omp sessions (feat/subagents-view).
 *
 * Shows a compact row per subagent (status badge + agent name + task).
 * Clicking a row opens a read-only popover of the subagent's messages via
 * `get_subagent_messages`, rendered as plain text turns.
 *
 * Visibility: only rendered when there is at least one subagent entry.
 * Event wiring: subscribes to agentMessage events (tool_start/tool_end with
 * toolName "task" and agentName set → omp subagent lifecycle).
 */
import {
  memo,
  useEffect,
  useReducer,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { IPC } from "@pi-desktop/shared";
import type { AgentEventEnvelope } from "@pi-desktop/shared";
import { api } from "../../../lib/api";
import {
  ompSubagentsReducer,
  type OmpSubagentEntry,
  type OmpSubagentStatus,
} from "../../../lib/omp-subagents";

// ─── types ────────────────────────────────────────────────────────────────────

type AgentMessage = {
  role: string;
  content: unknown;
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function messageText(msg: AgentMessage): string {
  const c = msg.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((part: unknown) => {
        if (!part || typeof part !== "object") return "";
        const p = part as Record<string, unknown>;
        return typeof p.text === "string" ? p.text : "";
      })
      .join("")
      .trim();
  }
  return "";
}

function statusLabel(status: OmpSubagentStatus, t: (k: string) => string): string {
  // Reuse existing subagentStatus i18n keys where they match.
  const key = `chat.subagentStatus.${status}`;
  const val = t(key);
  return val !== key ? val : status;
}

// ─── messages popover ─────────────────────────────────────────────────────────

function OmpSubagentMessagesPopover({
  entry,
  onClose,
  anchorRef,
}: {
  entry: OmpSubagentEntry;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<AgentMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .ompSubagentMessages({ subagentId: entry.id })
      .then((res) => setMessages(res.messages as AgentMessage[]))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
  }, [entry.id]);

  // Close on Escape.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const title = entry.agent
    ? `${entry.agent}${entry.task ? ` — ${entry.task.slice(0, 60)}` : ""}`
    : t("chat.ompSubagentMessages");

  return (
    <div
      className="omp-subagents-popover"
      role="dialog"
      aria-modal="true"
      aria-label={t("chat.ompSubagentMessages")}
    >
      <div className="omp-subagents-popover-header">
        <span className="omp-subagents-popover-title" title={title}>
          {title}
        </span>
        <button
          type="button"
          className="omp-subagents-popover-close"
          aria-label={t("chat.ompSubagentClose")}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="omp-subagents-popover-body">
        {error ? (
          <p className="omp-subagents-popover-error">{error}</p>
        ) : messages === null ? (
          <p className="omp-subagents-popover-loading">
            {t("chat.ompSubagentMessagesLoading")}
          </p>
        ) : messages.length === 0 ? (
          <p className="omp-subagents-popover-empty">
            {t("chat.ompSubagentMessagesEmpty")}
          </p>
        ) : (
          <div className="omp-subagents-messages">
            {messages.map((msg, i) => {
              const text = messageText(msg);
              if (!text) return null;
              return (
                <div
                  key={i}
                  className={`omp-subagents-message omp-subagents-message--${msg.role}`}
                >
                  <span className="omp-subagents-message-role">{msg.role}</span>
                  <span className="omp-subagents-message-text">{text}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── row ──────────────────────────────────────────────────────────────────────

const OmpSubagentRow = memo(function OmpSubagentRow({
  entry,
  isOpen,
  onToggle,
}: {
  entry: OmpSubagentEntry;
  isOpen: boolean;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLButtonElement | null>(null);
  const isRunning = entry.status === "running";

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    onToggle(entry.id);
  };

  return (
    <div className="omp-subagent-row-wrap">
      <button
        ref={rowRef}
        type="button"
        className={`omp-subagent-row omp-subagent-row--${entry.status}`}
        onClick={handleClick}
        aria-pressed={isOpen}
        aria-label={`${statusLabel(entry.status, t)} — ${entry.agent}${entry.task ? `: ${entry.task}` : ""}`}
      >
        <span
          className={`omp-subagent-status${isRunning ? " omp-subagent-status--running" : ""}`}
          aria-hidden
        />
        <span className="omp-subagent-name">{entry.agent || t("chat.subagentUnnamed")}</span>
        {entry.task ? (
          <span className="omp-subagent-task">{entry.task.slice(0, 80)}</span>
        ) : null}
        <span className="omp-subagent-badge">{statusLabel(entry.status, t)}</span>
      </button>
      {isOpen ? (
        <OmpSubagentMessagesPopover
          entry={entry}
          onClose={() => onToggle(entry.id)}
          anchorRef={rowRef}
        />
      ) : null}
    </div>
  );
});

// ─── list ─────────────────────────────────────────────────────────────────────

const EMPTY_MAP: ReadonlyMap<string, OmpSubagentEntry> = new Map();

export const OmpSubagentsList = memo(function OmpSubagentsList({
  sessionId,
}: {
  sessionId: string | undefined;
}) {
  const { t } = useTranslation();
  const [subagents, dispatch] = useReducer(ompSubagentsReducer, EMPTY_MAP);
  const [openId, setOpenId] = useState<string | null>(null);

  // Initial snapshot from get_subagents.
  useEffect(() => {
    if (!sessionId) return;
    api
      .ompSubagentList()
      .then((res) => dispatch({ type: "snapshot", subagents: res.subagents }))
      .catch(() => {
        // omp not running or unavailable — silently ignore.
      });
  }, [sessionId]);

  // Subscribe to agentMessage events for live lifecycle updates.
  useEffect(() => {
    const bridge = window.piDesktop;
    if (!bridge?.on) return;
    return bridge.on(IPC.event.agentMessage, (raw: unknown) => {
      const envelope = raw as AgentEventEnvelope;
      if (envelope.sessionId !== sessionId) return;
      const event = envelope.event;
      // Only omp subagent lifecycle: agentName is set on these envelopes.
      if (!envelope.agentName) return;
      if (event.type === "tool_start" && "toolName" in event && event.toolName === "task") {
        const args = "args" in event && event.args ? (event.args as Record<string, unknown>) : {};
        dispatch({
          type: "started",
          id: String("toolCallId" in event ? event.toolCallId : ""),
          agent: envelope.agentName,
          task: typeof args.task === "string" ? args.task : undefined,
          startedAt: envelope.ts,
        });
      } else if (event.type === "tool_end" && "toolCallId" in event) {
        const result =
          "result" in event && event.result != null
            ? (event.result as Record<string, unknown>)
            : {};
        const rawStatus = typeof result.status === "string" ? result.status : "completed";
        dispatch({
          type: "ended",
          id: String(event.toolCallId),
          status: rawStatus,
        });
      }
    });
  }, [sessionId]);

  // Close popover on click-outside.
  useEffect(() => {
    if (!openId) return;
    const handler = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".omp-subagent-row-wrap")) {
        setOpenId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openId]);

  const entries = [...subagents.values()];
  if (entries.length === 0) return null;

  const runningCount = entries.filter((e) => e.status === "running").length;
  const doneCount = entries.length - runningCount;

  const handleToggle = (id: string) => setOpenId((prev) => (prev === id ? null : id));

  return (
    <div className="omp-subagents-list" role="region" aria-label={t("chat.ompSubagents")}>
      <div className="omp-subagents-header">
        <span className="omp-subagents-title">{t("chat.ompSubagents")}</span>
        <span className="omp-subagents-counts">
          {runningCount > 0 ? (
            <span className="omp-subagents-count omp-subagents-count--running">
              {runningCount} running
            </span>
          ) : null}
          {doneCount > 0 ? (
            <span className="omp-subagents-count omp-subagents-count--done">
              {doneCount} done
            </span>
          ) : null}
        </span>
      </div>
      <div className="omp-subagents-rows">
        {entries.map((entry) => (
          <OmpSubagentRow
            key={entry.id}
            entry={entry}
            isOpen={openId === entry.id}
            onToggle={handleToggle}
          />
        ))}
      </div>
    </div>
  );
});
