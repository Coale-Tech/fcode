import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import {
  IconChat,
  IconClock,
  IconCode,
  IconMonitor,
  IconPlug,
  IconServer,
  IconSettings,
} from "./icons";
import { NotificationCenter } from "./NotificationCenter";
import { TooltipButton, cx } from "./ui";

/**
 * E frame: the global 60px icon rail at the window's left edge. Destinations
 * on top, daily footer actions (settings, plugins, scheduled, notifications)
 * at the bottom. The top band is a window drag region that also keeps the
 * macOS traffic lights clear; every button opts out with `no-drag`.
 */
export function NavRail() {
  const { t } = useTranslation();
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const navBack = useAppStore((s) => s.navBack);
  const canNavBack = useAppStore((s) => s.canNavBack);

  return (
    <nav className="nav-rail sidebar-surface" aria-label="Primary">
      <div className="nav-rail-group no-drag">
        <TooltipButton
          type="button"
          className={cx("nav-rail-btn", page === "chat" && "active")}
          data-nav="chat"
          tooltip="Chat"
          ariaLabel="Chat"
          onClick={() => setPage("chat")}
          aria-pressed={page === "chat"}
        >
          <IconChat size={16} aria-hidden />
        </TooltipButton>
        <TooltipButton
          type="button"
          className={cx("nav-rail-btn", page === "code" && "active")}
          data-nav="code"
          tooltip="Code"
          ariaLabel="Code"
          onClick={() => setPage("code")}
          aria-pressed={page === "code"}
        >
          <IconCode size={16} aria-hidden />
        </TooltipButton>
        <TooltipButton
          type="button"
          className={cx("nav-rail-btn", page === "build" && "active")}
          data-nav="build-canvas"
          tooltip="Build"
          ariaLabel="Build"
          onClick={() => setPage("build")}
          aria-pressed={page === "build"}
        >
          <IconMonitor size={16} aria-hidden />
        </TooltipButton>
        <TooltipButton
          type="button"
          className={cx("nav-rail-btn", page === "bench" && "active")}
          data-nav="bench"
          tooltip="Bench"
          ariaLabel="Bench"
          onClick={() => setPage("bench")}
          aria-pressed={page === "bench"}
        >
          <IconServer size={16} aria-hidden />
        </TooltipButton>
      </div>

      <div className="nav-rail-group nav-rail-footer no-drag">
        <TooltipButton
          type="button"
          className={cx("nav-rail-btn", page === "scheduled" && "active")}
          data-nav="scheduled"
          tooltip={t("scheduled.title")}
          ariaLabel={t("scheduled.title")}
          onClick={() => setPage("scheduled")}
          aria-pressed={page === "scheduled"}
        >
          <IconClock size={16} aria-hidden />
        </TooltipButton>
        <TooltipButton
          type="button"
          className={cx("nav-rail-btn", page === "plugins" && "active")}
          data-nav="plugins"
          tooltip={t("nav.plugins")}
          ariaLabel={t("nav.plugins")}
          onClick={() => page === "plugins"
            ? (canNavBack() ? navBack() : setPage("chat"))
            : setPage("plugins")}
          aria-pressed={page === "plugins"}
        >
          <IconPlug size={16} aria-hidden />
        </TooltipButton>
        <NotificationCenter />
        <TooltipButton
          type="button"
          className={cx("nav-rail-btn", page === "settings" && "active")}
          data-nav="settings"
          tooltip={t("nav.settings")}
          ariaLabel={t("nav.settings")}
          onClick={() => setPage("settings")}
          aria-pressed={page === "settings"}
        >
          <IconSettings size={16} aria-hidden />
        </TooltipButton>
      </div>
    </nav>
  );
}
