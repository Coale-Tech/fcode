import { useEffect } from "react";
import { IPC } from "@pi-desktop/shared";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import { memoryHealth } from "../features/settings/MemoryTab";
import {
  IconChat,
  IconClock,
  IconFileBird,
  IconKanban,
  IconMonitor,
  IconPlug,
  IconRaven,
  IconServer,
  IconSettings,
} from "./icons";
import { NotificationCenter } from "./NotificationCenter";
import { TooltipButton, cx } from "./ui";
import { navItems } from "./nav-items";
import type { NavItemId } from "./nav-items";

/**
 * Icon map for every nav-item id.  Exported (R2) so Task 8/9 can reference the
 * same canonical icon set without duplicating the mapping.
 */
export const NAV_ICONS = {
  chat:      IconChat,
  build:     IconMonitor,
  bench:     IconServer,
  scheduled: IconClock,
  kanban:    IconKanban,
  raven:     IconRaven,
  filebird:  IconFileBird,
  plugins:   IconPlug,
} satisfies Record<NavItemId, unknown>;

/**
 * D2 icon rail: left 50px nav strip (collapsed) or 220px (expanded).
 *
 * Primary destinations are rendered as labelled buttons (label hidden in `rail`
 * mode via CSS, visible in `island` mode).  Footer items use TooltipButton
 * (icon-only with tooltip always shown).  NotificationCenter and Settings are
 * hand-rendered because they carry memory-status dots / special interactions.
 */
export function NavRail() {
  const { t } = useTranslation();
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const navBack = useAppStore((s) => s.navBack);
  const canNavBack = useAppStore((s) => s.canNavBack);
  const memStatus = useAppStore((s) => s.memoryStatus);
  const mHealth = memoryHealth(memStatus);

  const kanbanEnabled = useAppStore((s) => s.kanbanEnabled);
  const setKanbanEnabled = useAppStore((s) => s.setKanbanEnabled);
  useEffect(() => {
    const fetchEnabled = () =>
      import("../lib/api").then(({ api }) =>
        api.kanbanSettingsGet().then((res) => setKanbanEnabled(res.settings.enabled)).catch(() => {})
      ).catch(() => {});
    void fetchEnabled();
    const bridge = window.piDesktop;
    if (!bridge?.on) return;
    return bridge.on(IPC.event.kanbanChanged, () => { void fetchEnabled(); });
  }, [setKanbanEnabled]);

  const ravenEnabled = useAppStore((s) => s.ravenEnabled);
  const setRavenEnabled = useAppStore((s) => s.setRavenEnabled);
  useEffect(() => {
    const fetchEnabled = () =>
      import("../lib/api").then(({ api }) =>
        api.ravenSettingsGet().then((res) => setRavenEnabled(res.settings.enabled)).catch(() => {})
      ).catch(() => {});
    void fetchEnabled();
    const bridge = window.piDesktop;
    if (!bridge?.on) return;
    return bridge.on(IPC.event.ravenChanged, () => { void fetchEnabled(); });
  }, [setRavenEnabled]);

  const items = navItems({ kanban: kanbanEnabled, raven: ravenEnabled });
  const primary = items.filter((i) => i.group === "primary");
  const footer  = items.filter((i) => i.group === "footer");

  return (
    <nav className="nav-rail sidebar-surface" aria-label="Primary">
      <div className="nav-rail-group no-drag">
        {primary.map((item) => {
          const Icon = NAV_ICONS[item.id];
          return (
            <button
              key={item.id}
              type="button"
              className={cx("nav-rail-btn nav-rail-labeled", page === item.page && "active")}
              data-nav={item.dataNav}
              aria-label={t(item.labelKey)}
              aria-pressed={page === item.page}
              title={t(item.labelKey)}
              onClick={() => setPage(item.page)}
            >
              <Icon size={16} aria-hidden />
              <span className="nav-rail-label">{t(item.labelKey)}</span>
            </button>
          );
        })}
      </div>

      <div className="nav-rail-group nav-rail-footer no-drag">
        {footer.map((item) => {
          const Icon = NAV_ICONS[item.id];
          const handleClick =
            item.id === "plugins"
              ? () => (page === "plugins" ? (canNavBack() ? navBack() : setPage("chat")) : setPage("plugins"))
              : () => setPage(item.page);
          return (
            <TooltipButton
              key={item.id}
              type="button"
              className={cx("nav-rail-btn", page === item.page && "active")}
              data-nav={item.dataNav}
              tooltip={t(item.labelKey)}
              ariaLabel={t(item.labelKey)}
              onClick={handleClick}
              aria-pressed={page === item.page}
            >
              <Icon size={16} aria-hidden />
            </TooltipButton>
          );
        })}
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
          <span
            className="memory-status-dot memory-status-dot-rail"
            data-health={mHealth}
            aria-label={t(`settings.memoryStatus${mHealth[0].toUpperCase()}${mHealth.slice(1)}`)}
          />
        </TooltipButton>
      </div>
    </nav>
  );
}
