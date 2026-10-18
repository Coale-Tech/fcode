import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import {
  IconArchive,
  IconArchiveRestore,
  IconBranch,
  IconMore,
  IconNewSession,
  IconPencil,
  IconPin,
  IconSidebar,
  IconX,
} from "./icons";
import { TooltipButton, cx } from "./ui";
import { api } from "../lib/api";
import { AnchoredMenu } from "./settings/AnchoredMenu";
import { SessionRenameDialog } from "./SessionRenameDialog";
import { useArmedDelete } from "../hooks/use-armed-delete";
import { sessionPinned, sessionArchived } from "../lib/sidebar-session-groups";
import { resolveNavLayout } from "../lib/nav-layout";

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
  onOpenSearch: _onOpenSearch,
}: {
  sidebarCollapsed: boolean;
  workPanelOpen: boolean;
  onToggleSidebar: () => void;
  onNewTask: () => void;
  /** Reserved for future: AppShell wires this; not yet surfaced in the topbar. */
  onOpenSearch: () => void;
}) {
  const { t } = useTranslation();
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const sessions = useAppStore((s) => s.sessions);
  const runningSessions = useAppStore((s) => s.runningSessions);
  const workspace = useAppStore((s) => s.workspace);
  const sessionMeta = useAppStore((s) => s.sessionMeta);
  const toggleSessionPinned = useAppStore((s) => s.toggleSessionPinned);
  const archiveSessionAction = useAppStore((s) => s.archiveSession);
  const restoreSessionAction = useAppStore((s) => s.restoreSession);
  const forkSessionAction = useAppStore((s) => s.forkSession);
  const deleteSessionAction = useAppStore((s) => s.deleteSession);
  const renameSessionAction = useAppStore((s) => s.renameSession);
  const showToast = useAppStore((s) => s.showToast);
  const settings = useAppStore((s) => s.settings);
  const navLayout = resolveNavLayout(settings?.navLayout);

  // omp setTitle override: cleared on session change.
  const [ompTitle, setOmpTitle] = useState<string | null>(null);
  useEffect(() => { setOmpTitle(null); }, [activeSessionId]);
  useEffect(() => {
    if (!activeSessionId) return;
    return api.onSidecarExtUi((event) => {
      if (event.kind !== "title" || event.sessionId !== activeSessionId) return;
      setOmpTitle(event.title || null);
    });
  }, [activeSessionId]);

  const [moreOpen, setMoreOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const { armed: armedDelete, setArmed: setArmedDelete } = useArmedDelete();

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const isSessionRunning = Boolean(activeSessionId && runningSessions[activeSessionId]);

  const sessionTitle = isDefaultSessionTitle(activeSession?.title)
    ? t("chat.untitledTask")
    : (activeSession?.title || t("chat.untitledTask"));
  const displayTitle = ompTitle ?? sessionTitle;

  const projectLabel = (() => {
    const name = workspace?.name;
    const path = workspace?.path;
    if (name) return name;
    if (!path) return null;
    const parts = path.split(/[/\\]/).filter(Boolean);
    return parts[parts.length - 1] || path;
  })();

  const isPinned = activeSession
    ? sessionPinned(activeSession, sessionMeta[activeSession.id])
    : false;
  const isArchived = activeSession
    ? sessionArchived(activeSession, sessionMeta[activeSession.id])
    : false;
  const isNative = activeSession?.source === "pi-native";

  // Both menu close and armed reset must happen atomically; called 5+ times.
  const closeMenu = () => { setMoreOpen(false); setArmedDelete(null); };

  return (
    <div
      className={cx(
        "conversation-topbar",
        sidebarCollapsed && "ct-collapsed",
        workPanelOpen && "ct-work-panel-open",
      )}
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
          title={projectLabel ? `${projectLabel} · ${displayTitle}` : displayTitle}
        >
          <span className="ct-title">{displayTitle}</span>
          {isSessionRunning && (
            <span className="d-pill amber ct-running-pill">
              <span className="d-pill-dot" aria-hidden />
              {t("chat.sessionRunning")}
            </span>
          )}
        </div>
      </div>

      <div className="ct-right">
        <div className="ct-actions">
          {/* New session: visible in tabs/rail layouts — island sidebar already has it */}
          {navLayout !== "island" && (
            <button type="button" className="ct-btn-secondary" onClick={onNewTask}>
              <IconNewSession size={13} aria-hidden />
              {t("nav.newSession")}
            </button>
          )}

          {/* Session overflow menu (⋯) */}
          <AnchoredMenu
            open={moreOpen}
            onClose={closeMenu}
            trigger={(ref) => (
              <TooltipButton
                ref={ref}
                type="button"
                className="ct-icon-btn"
                tooltip={t("nav.sessionActions", { defaultValue: "Session actions" })}
                ariaLabel={t("nav.sessionActions", { defaultValue: "Session actions" })}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                disabled={!activeSession}
                onClick={() => setMoreOpen((v) => !v)}
              >
                <IconMore size={15} />
              </TooltipButton>
            )}
            menuClassName="ct-more-menu"
            label={t("nav.sessionActions", { defaultValue: "Session actions" })}
            role="menu"
            align="end"
          >
            {!isNative ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => { closeMenu(); setRenaming(true); }}
              >
                <IconPencil size={14} aria-hidden />
                {t("nav.renameTask", { defaultValue: "Rename task" })}
              </button>
            ) : null}

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                if (activeSession) toggleSessionPinned(activeSession.id);
                closeMenu();
              }}
            >
              <IconPin size={14} aria-hidden />
              {isPinned
                ? t("nav.unpinTask", { defaultValue: "Unpin" })
                : t("nav.pinTask", { defaultValue: "Pin" })}
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                if (!activeSession) return;
                if (isArchived) {
                  restoreSessionAction(activeSession.id);
                } else {
                  archiveSessionAction(activeSession.id);
                  onNewTask();
                }
                closeMenu();
              }}
            >
              {isArchived
                ? <IconArchiveRestore size={14} aria-hidden />
                : <IconArchive size={14} aria-hidden />}
              {isArchived
                ? t("nav.restoreTask", { defaultValue: "Restore" })
                : t("nav.archiveTask", { defaultValue: "Archive" })}
            </button>

            {!isNative ? (
              <button
                type="button"
                role="menuitem"
                disabled={isSessionRunning}
                onClick={() => {
                  if (!activeSession) return;
                  const { id } = activeSession;
                  closeMenu();
                  void forkSessionAction(id).catch((err: unknown) =>
                    showToast(err instanceof Error ? err.message : String(err), { variant: "error" }),
                  );
                }}
              >
                <IconBranch size={14} aria-hidden />
                {t("nav.createBranch")}
              </button>
            ) : null}

            {!isNative ? (
              <button
                type="button"
                role="menuitem"
                className={cx("danger", armedDelete === activeSession?.id && "is-armed")}
                data-armed={armedDelete === activeSession?.id ? "true" : undefined}
                onClick={() => {
                  if (!activeSession) return;
                  if (armedDelete !== activeSession.id) {
                    setArmedDelete(activeSession.id);
                    return;
                  }
                  const { id } = activeSession;
                  closeMenu();
                  void deleteSessionAction(id).then(onNewTask).catch((err: unknown) =>
                    showToast(err instanceof Error ? err.message : String(err), { variant: "error" }),
                  );
                }}
              >
                <IconX size={14} aria-hidden />
                {armedDelete === activeSession?.id
                  ? t("nav.deleteTaskConfirm", { defaultValue: "Delete?" })
                  : t("nav.deleteTask", { defaultValue: "Delete" })}
              </button>
            ) : null}
          </AnchoredMenu>
        </div>
      </div>

      {renaming && activeSession ? (
        <SessionRenameDialog
          session={activeSession}
          onClose={() => setRenaming(false)}
          onSave={(title) => renameSessionAction(activeSession.id, title)}
          onError={(err) => showToast(err instanceof Error ? err.message : String(err), { variant: "error" })}
        />
      ) : null}
    </div>
  );
}
