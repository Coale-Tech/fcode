import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import {
  IconSidebar,
  IconEye,
  IconMore,
} from "./icons";
import { TooltipButton } from "./ui";
import { api } from "../lib/api";

function projectName(path?: string | null, name?: string | null) {
  if (name) return name;
  if (!path) return null;
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

function isDefaultSessionTitle(title?: string | null) {
  const trimmed = (title || "").trim().toLowerCase();
  if (!trimmed) return true;
  return ["new task", "new chat", "新建任务", "新对话"].includes(trimmed);
}

export function ConversationTopbar({
  sidebarCollapsed,
  workPanelOpen,
  onToggleSidebar,
  onNewTask,
  onOpenSearch,
}: {
  sidebarCollapsed: boolean;
  workPanelOpen: boolean;
  onToggleSidebar: () => void;
  onNewTask: () => void;
  onOpenSearch: () => void;
}) {
  const { t } = useTranslation();
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const sessions = useAppStore((s) => s.sessions);
  const runningSessions = useAppStore((s) => s.runningSessions);
  const workspace = useAppStore((s) => s.workspace);

  // omp setTitle override: cleared on session change.
  const [ompTitle, setOmpTitle] = useState<string | null>(null);
  useEffect(() => {
    setOmpTitle(null);
  }, [activeSessionId]);
  useEffect(() => {
    if (!activeSessionId) return;
    return api.onSidecarExtUi((event) => {
      if (event.kind !== "title" || event.sessionId !== activeSessionId) return;
      setOmpTitle(event.title || null);
    });
  }, [activeSessionId]);

  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const isSessionRunning = Boolean(activeSessionId && runningSessions[activeSessionId]);

  const fullTaskTitle = ompTitle
    ?? (isDefaultSessionTitle(activeSession?.title)
      ? t("chat.untitledTask")
      : activeSession?.title || t("chat.untitledTask"));
  const project = projectName(workspace?.path, workspace?.name);

  return (
    <div
      className={`conversation-topbar${sidebarCollapsed ? " ct-collapsed" : ""}${
        workPanelOpen ? " ct-work-panel-open" : ""
      }`}
      role="toolbar"
      aria-label={t("nav.conversation")}
    >
      <div className="ct-left">
        {/*
          Always mounted: the slot animates from 0 to 28px with the dock, so
          unmounting it would reintroduce the first-frame title jump. While the
          sidebar is open the slot is zero-width and hidden from AT.
        */}
        <div className="ct-lead" aria-hidden={!sidebarCollapsed}>
          <TooltipButton
            type="button"
            className="ct-icon-btn"
            tooltip={t("nav.toggleSidebar")}
            ariaLabel={t("nav.toggleSidebar")}
            tabIndex={sidebarCollapsed ? undefined : -1}
            onClick={onToggleSidebar}
          >
            <IconSidebar size={15} />
          </TooltipButton>
        </div>
        <div
          className="ct-title-wrap"
          title={project ? `${project} · ${fullTaskTitle}` : fullTaskTitle}
        >
          <span className="ct-title">{fullTaskTitle}</span>
          {/* D design: amber Running badge when session is active */}
          {isSessionRunning && (
            <span className="d-pill amber ct-running-pill">
              <span className="d-pill-dot" aria-hidden />
              {t("chat.sessionRunning", { defaultValue: "Running" })}
            </span>
          )}
        </div>
      </div>

      <div className="ct-right">
        <div className="ct-actions">
          {/* D design: Context button (opens file/context picker) */}
          {activeSessionId && (
            <button
              type="button"
              className="ct-btn-secondary"
              title={t("chat.context", { defaultValue: "Context" })}
              onClick={onOpenSearch}
            >
              <IconEye size={13} aria-hidden />
              {t("chat.context", { defaultValue: "Context" })}
            </button>
          )}
          {/* D design: kebab overflow menu */}
          <TooltipButton
            type="button"
            className="ct-icon-btn"
            tooltip={t("nav.more", { defaultValue: "More" })}
            ariaLabel={t("nav.more", { defaultValue: "More" })}
            onClick={onNewTask}
          >
            <IconMore size={15} />
          </TooltipButton>
        </div>
      </div>
    </div>
  );
}
