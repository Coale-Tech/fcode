import { type CSSProperties, lazy, type ReactNode, Suspense } from "react";
import { ChatSurface } from "../../components/ChatSurface";
import { ConversationTopbar } from "../../components/ConversationTopbar";
import { ExtensionStatusLine } from "../../components/ExtensionStatusLine";
import {
  IconNewSession,
  IconPanel,
  IconPanelOpen,
} from "../../components/icons";
import { NavRail } from "../../components/NavRail";
import { ProjectCreateDialog } from "../../components/ProjectCreateDialog";
import { SearchDialog } from "../../components/SearchDialog";
import { Sidebar } from "../../components/Sidebar";
import { StartupRecovery } from "../../components/StartupRecovery";
import { TerminalPanel } from "../../components/TerminalPanel";
import { ToastHost } from "../../components/Toast";
import { UpdateBanner } from "../../components/UpdateBanner";
import { Button, cx, TooltipButton } from "../../components/ui";
import { WindowControls } from "../../components/WindowControls";
import { ShellNavbar } from "../../components/ShellNavbar";
import { WorkPanel } from "../../components/workpanel/WorkPanel";
import { WorkspaceBar } from "../../components/WorkspaceBar";
import { useCopyTex } from "../../hooks/use-copy-tex";
import { api } from "../../lib/api";
import { PortalVisibilityProvider } from "../../lib/portal-visibility";
import { CollapsedTitlebarActions, RoutePending } from "./chrome";
import { useAppShellRuntime } from "./useAppShellRuntime";
import { useMemoryHealthPoller } from "../../hooks/use-memory-health-poller";
import { islandSidebarProps } from "../../lib/nav-layout";
import { useAppStore } from "../../stores/app-store";

const SettingsPage = lazy(() =>
  import("../../pages/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);
const PullRequestsPage = lazy(() =>
  import("../../pages/PullRequestsPage").then((module) => ({
    default: module.PullRequestsPage,
  })),
);
const ScheduledPage = lazy(() =>
  import("../../pages/ScheduledPage").then((module) => ({
    default: module.ScheduledPage,
  })),
);
const PluginsPage = lazy(() =>
  import("../../pages/PluginsPage").then((module) => ({
    default: module.PluginsPage,
  })),
);
const BenchPage = lazy(() =>
  import("../../pages/BenchPage").then((module) => ({
    default: module.BenchPage,
  })),
);
const BuildPage = lazy(() =>
  import("../../pages/BuildPage").then((module) => ({
    default: module.BuildPage,
  })),
);
const KanbanPage = lazy(() =>
  import("../../pages/KanbanPage").then((module) => ({
    default: module.KanbanPage,
  })),
);
const RavenPage = lazy(() =>
  import("../../pages/RavenPage").then((module) => ({
    default: module.RavenPage,
  })),
);
const FileBirdPage = lazy(() =>
  import("../../pages/FileBirdPage").then((module) => ({
    default: module.FileBirdPage,
  })),
);
const NotificationsPage = lazy(() =>
  import("../../components/NotificationCenter").then((module) => ({
    default: module.NotificationsPage,
  })),
);

export function AppShell() {
  const {
    t,
    ready,
    page,
    workPanelOpen,
    searchOpen,
    setSearchOpen,
    sidebarCollapsed,
    sidebarEntering,
    sidebarExiting,
    sidebarWidth,
    sidebarWidthMax,
    handleSidebarWidthChange,
    handleSidebarWidthCommit,
    handleSidebarResizeCollapse,
    toggleSidebar,
    autoCollapseSidebar,
    appShellRef,
    shellWidth,
    runMenuCommand,
    handleSidebarAnimationEnd,
    presentedWorkPanelOpen,
    workPanelExiting,
    workPanelExitGeneration,
    finishWorkPanelExit,
    togglePresentedWorkPanel,
    workPanelMaximized,
    toggleWorkPanelMaximize,
    backendDown,
    archMismatch,
    setArchMismatch,
    showSplash,
    splash,
    startupPhase,
    startupWaitedMs,
    retryStartup,
    startupRetrying,
    sidebarToggleShortcut,
    workPanelToggleTooltip,
    onRailExpandChange,
    navLayout,
  } = useAppShellRuntime();
  useCopyTex();
  useMemoryHealthPoller();
  // D1 onboarding: "Welcome to Fcode" header replaces ConversationTopbar while checklist is active.
  const showChecklist = useAppStore((s) => Boolean(s.onboarding?.showChecklist));
  const handleSkipSetup = () => {
    void api.dismissOnboarding().catch(() => undefined).finally(() => {
      const cur = useAppStore.getState().onboarding;
      if (cur) useAppStore.setState({ onboarding: { ...cur, showChecklist: false } });
    });
  };

  // A boot that never reaches the shell gets a surface it can act on instead of
  // a window that only knows how to wait (issue #831). Rendered as a direct child
  // of the shell so it can layer above the splash and below the window controls.
  const startupRecovery =
    startupPhase === "starting" ? null : (
      <StartupRecovery
        phase={startupPhase}
        waitedMs={startupWaitedMs}
        onRetry={retryStartup}
        retrying={startupRetrying}
        down={backendDown}
      />
    );

  // Bench and Build own their context sidebar and islands (E frame), so the
  // sessions dock stays out and the pane is a transparent host.
  const workbench = page === "bench" || page === "build";
  // Pull Requests, Scheduled, Notifications, Plugins and Kanban compose their
  // own cards directly on the canvas (D.css .d-canvas > .d-panel), so the pane
  // is a transparent host there too and needs no titlebar band — ShellNavbar
  // already owns window dragging.
  const canvasPage =
    page === "pulls" ||
    page === "scheduled" ||
    page === "notifications" ||
    page === "plugins" ||
    page === "kanban";
  // D1 tabs: sessions sidebar on chat page (onboarding wizard also renders on chat page);
  // hidden on list/tool pages. D2 rail: sidebar only on chat. D3 island: sidebar always.
  const sidebarAllowedForLayout =
    navLayout === "island" || page === "chat";
  const mountSidebar = !workbench && (!sidebarCollapsed || sidebarExiting) ? sidebarAllowedForLayout : navLayout === "island";

  let shell: ReactNode = null;
  if (ready) {
    shell = (
      <>
        {/* ShellNavbar: outside the inert/hidden subtree; stays usable in settings mode
            (Review Focus 4). Drag region + Cmd-K awesomebar for all pages. */}
        <ShellNavbar
          onOpenSearch={() => setSearchOpen(true)}
          workPanelToggle={
            <TooltipButton
              type="button"
              className="app-work-panel-toggle no-drag"
              tooltip={workPanelToggleTooltip}
              ariaLabel={workPanelToggleTooltip}
              aria-pressed={workPanelOpen || presentedWorkPanelOpen}
              disabled={
                !presentedWorkPanelOpen &&
                !workPanelExiting &&
                (page === "settings" || page === "plugins" || page === "scheduled" || page === "raven" || page === "filebird" || page === "notifications")
              }
              onClick={togglePresentedWorkPanel}
            >
              <span className="app-work-panel-toggle-icon" aria-hidden>
                <IconPanel size={15} />
                <IconPanelOpen size={15} />
              </span>
            </TooltipButton>
          }
        />
        <PortalVisibilityProvider visible={page !== "settings" || navLayout === "island"}>
          <div
            className="app-chat-shell"
            hidden={page === "settings" && navLayout !== "island"}
            inert={page === "settings" && navLayout !== "island" ? true : undefined}
            aria-hidden={page === "settings" && navLayout !== "island" ? true : undefined}
          >
            {navLayout !== "tabs" && <NavRail onExpandChange={onRailExpandChange} />}
            {/* D3 island: permanent sidebar (shown even on workbench, always open) */}
            {mountSidebar ? (
              <Sidebar
                className={cx(sidebarEntering && "is-entering", sidebarExiting && "is-exiting")}
                onAnimationEnd={handleSidebarAnimationEnd}
                onToggleSidebar={toggleSidebar}
                sidebarToggleShortcut={sidebarToggleShortcut}
                sidebarWidth={sidebarWidth}
                widthMax={sidebarWidthMax}
                onWidthChange={handleSidebarWidthChange}
                onWidthCommit={handleSidebarWidthCommit}
                onResizeCollapse={handleSidebarResizeCollapse}
              />
            ) : null}

            {workPanelMaximized && (
              /* MainChat is absent; the panel header owns dragging while this
                 pass-through row keeps the shell controls available. */
              <div
                className={cx(
                  "window-chrome-row",
                  !sidebarCollapsed && (navLayout === "island" || !workbench) && "sidebar-expanded",
                )}
              >
                {sidebarCollapsed && (
                  <CollapsedTitlebarActions
                    onToggleSidebar={toggleSidebar}
                    onNewTask={() => void runMenuCommand("newTask")}
                    sidebarToggleShortcut={sidebarToggleShortcut}
                  />
                )}
                {!sidebarCollapsed && (
                  <TooltipButton
                    type="button"
                    className="title-nav-btn"
                    tooltip={t("nav.newTask")}
                    ariaLabel={t("nav.newTask")}
                    data-nav="new-task"
                    onClick={() => void runMenuCommand("newTask")}
                  >
                    <IconNewSession size={15} />
                  </TooltipButton>
                )}
                <div className="window-chrome-drag" aria-hidden />
              </div>
            )}

            {!workPanelMaximized && (
              <section className={cx("main-pane", (workbench || canvasPage) && "is-workbench")}>
                {page === "chat" && !showChecklist ? (
                  <ConversationTopbar
                    sidebarCollapsed={sidebarCollapsed}
                    workPanelOpen={presentedWorkPanelOpen}
                    onToggleSidebar={toggleSidebar}
                    onNewTask={() => void runMenuCommand("newTask")}
                    onOpenSearch={() => setSearchOpen(true)}
                  />
                ) : page === "chat" && showChecklist ? (
                  <div className="d-page-head onboarding-topbar">
                    <span className="d-page-title">{t("onboarding.welcomeTitle")}</span>
                    <div className="d-page-head-actions">
                      <Button variant="ghost" size="sm" onClick={handleSkipSetup}>
                        {t("onboarding.dismiss")}
                      </Button>
                    </div>
                  </div>
                ) : canvasPage ? null : (
                  <div
                    className={cx(
                      "main-titlebar",
                      presentedWorkPanelOpen && "work-panel-open",
                    )}
                  >
                  </div>
                )}
                {(page !== "settings" || navLayout === "island") ? <UpdateBanner /> : null}

                {backendDown && (
                  <div
                    className={`backend-banner no-drag ${backendDown.fatal ? "fatal" : "warn"}`}
                    role="status"
                  >
                    <span className="backend-dot" aria-hidden />
                    <span>
                      {backendDown.fatal
                        ? backendDown.message === "GLIBC_UNSUPPORTED"
                          ? t("status.unsupportedGlibc")
                          : backendDown.message === "DB_SCHEMA_TOO_NEW"
                            ? t("status.dbSchemaTooNew", {
                                found: backendDown.schema?.found ?? "?",
                                supported: backendDown.schema?.supported ?? "?",
                              })
                            : t("status.fatal")
                        : t("status.restarting")}
                    </span>
                    {backendDown.fatal && (
                      <button
                        type="button"
                        className="backend-action"
                        onClick={() => void api.openLogs()}
                      >
                        {t("status.openLogs")}
                      </button>
                    )}
                  </div>
                )}

                {archMismatch && (
                  <div className="backend-banner no-drag warn" role="status">
                    <span className="backend-dot" aria-hidden />
                    <span>
                      {t("status.archMismatch", {
                        buildArch: t(
                          `status.archNames.${archMismatch.platform}.${archMismatch.processArch}`,
                          { defaultValue: archMismatch.processArch },
                        ),
                        machineArch: t(
                          `status.archNames.${archMismatch.platform}.${archMismatch.machineArch}`,
                          { defaultValue: archMismatch.machineArch },
                        ),
                      })}
                    </span>
                    <button
                      type="button"
                      className="backend-action"
                      onClick={() => setArchMismatch(null)}
                    >
                      {t("status.dismissArchMismatch")}
                    </button>
                  </div>
                )}

                <Suspense fallback={<RoutePending />}>
                  {navLayout === "island" && page === "settings" ? (
                    <div className="route-surface route-page">
                      <SettingsPage />
                    </div>
                  ) : null}
                  {page === "pulls" ? (
                    <div className="route-surface route-page">
                      <PullRequestsPage />
                    </div>
                  ) : page === "raven" ? (
                    <div className="route-surface route-page">
                      <RavenPage blocked={searchOpen} />
                    </div>
                  ) : page === "filebird" ? (
                    <div className="route-surface route-page">
                      <FileBirdPage blocked={searchOpen} />
                    </div>
                  ) : page === "scheduled" ? (
                    <div className="route-surface route-page">
                      <ScheduledPage />
                    </div>
                  ) : page === "plugins" ? (
                    <div className="route-surface route-page">
                      <PluginsPage />
                    </div>
                  ) : page === "bench" ? (
                    <div className="route-surface route-page">
                      <BenchPage />
                    </div>
                  ) : page === "build" ? (
                    <div className="route-surface route-page">
                      <BuildPage />
                    </div>
                  ) : page === "kanban" ? (
                    <div className="route-surface route-page">
                      <KanbanPage />
                    </div>
                  ) : page === "notifications" ? (
                    <div className="route-surface route-page">
                      <NotificationsPage />
                    </div>
                  ) : (
                    <ChatSurface visible={page === "chat"} />
                  )}
                </Suspense>
                <TerminalPanel visible={page === "chat"} />
              </section>
            )}

            {(presentedWorkPanelOpen || workPanelExiting) && (
              <WorkPanel
                panelBlocked={searchOpen}
                exiting={workPanelExiting}
                onExitAnimationEnd={() =>
                  finishWorkPanelExit(workPanelExitGeneration.current)
                }
                containerWidth={shellWidth}
                {...islandSidebarProps(navLayout, sidebarCollapsed, sidebarWidth)}
                sidebarExiting={sidebarExiting}
                onAutoCollapseSidebar={autoCollapseSidebar}
                maximized={workPanelMaximized}
                onToggleMaximize={toggleWorkPanelMaximize}
              />
            )}
          </div>
        </PortalVisibilityProvider>
        {page === "settings" && navLayout !== "island" ? (
          <div className="settings-mode-body">
            {navLayout === "rail" ? <NavRail onExpandChange={onRailExpandChange} /> : null}
            <Suspense fallback={<RoutePending />}>
              <SettingsPage />
            </Suspense>
          </div>
        ) : null}
        {/* D.css .d-statusbar: full-width app foot below rail, sidebar and canvas. */}
        <WorkspaceBar />
        <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
        <ToastHost />
        <ExtensionStatusLine />
        {page === "settings" && navLayout !== "island" ? <UpdateBanner /> : null}
      </>
    );
  }

  return (
    <div
      ref={appShellRef}
      className={cx(
        "app-shell",
        !ready && "app-shell-boot",
        page === "settings" && ready && navLayout !== "island" && "settings-mode",
        sidebarCollapsed && "sidebar-collapsed",
        workPanelMaximized && "work-panel-maximized",
        showSplash && "is-booting",
      )}
      style={{ "--ds-sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <div className="app-scenic-backdrop" aria-hidden />
      {shell}
      {/* Outside pane stacking; skip splash so the band cannot cover boot chrome. */}
      {/* `showSplash` stays true for as long as the shell is not ready, so a
          bare `!showSplash` test would leave the recovery surface without any
          window controls — the only ones a frameless Windows/Linux window has.
          The controls therefore follow the boot surface that is actually up. */}
      {(ready && !showSplash) || startupPhase !== "starting" ? (
        <WindowControls />
      ) : null}
      <ProjectCreateDialog />
      {splash}
      {startupRecovery}
    </div>
  );
}
