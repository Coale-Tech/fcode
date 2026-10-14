import { useEffect, useState } from "react";
import { IPC } from "@pi-desktop/shared";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import { memoryHealth } from "../features/settings/MemoryTab";
import {
  IconBarChart2,
  IconChevronLeft,
  IconChevronRight,
  IconChat,
  IconClock,
  IconFileBird,
  IconKanban,
  IconPlug,
  IconPullRequest,
  IconRaven,
  IconSettings,
  IconTerminal,
} from "./icons";
import { NotificationCenter } from "./NotificationCenter";
import { TooltipButton, cx } from "./ui";
import { navItems } from "./nav-items";
import type { NavItemId, NavItem } from "./nav-items";

/**
 * Icon map for every nav-item id.  Uses the approved D2 glyphs:
 *   Build → BarChart2 (ic-build: ascending bars, D2-shell.html:36)
 *   Bench → Terminal  (ic-bench: prompt chevron, D2-shell.html:37)
 * Exported so Task 8/9 can reference the canonical icon set without duplication.
 */
export const NAV_ICONS = {
  chat:      IconChat,
  build:     IconBarChart2,
  bench:     IconTerminal,
  scheduled: IconClock,
  kanban:    IconKanban,
  raven:     IconRaven,
  filebird:  IconFileBird,
  plugins:   IconPlug,
  pulls:     IconPullRequest,
} satisfies Record<NavItemId, unknown>;

type NavRailProps = {
  /** Called whenever the expanded state changes; useAppShellRuntime uses this
   *  to keep shellChromeWidth accurate for the three-column budget. */
  onExpandChange?: (expanded: boolean) => void;
};

/**
 * D2 icon rail: left 50px strip (collapsed) or 220px (expanded).
 *
 * Structure per D2-shell.html:115-181:
 *   - .nav-rail-scroll   upper scrollable area: primary / utility / developer groups
 *                        separated by .nav-rail-divider elements
 *   - .nav-rail-foot     non-scrolling footer: NotificationCenter, Settings, divider, toggle
 *
 * All scroll items use TooltipButton + .nav-rail-icon wrapper for the 28×28 icon
 * box (D.css:394-401).  Labels are hidden (opacity/max-width transition) in
 * collapsed rail mode and revealed on .expanded (d-shell.css).
 */
export function NavRail({ onExpandChange }: NavRailProps = {}) {
  const { t } = useTranslation();
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const navBack = useAppStore((s) => s.navBack);
  const canNavBack = useAppStore((s) => s.canNavBack);
  const memStatus = useAppStore((s) => s.memoryStatus);
  const [expanded, setExpanded] = useState(false);

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
  const primary   = items.filter((i) => i.group === "primary");
  const utility   = items.filter((i) => i.group === "utility");
  const developer = items.filter((i) => i.group === "developer");

  /** Toggle expand state and propagate to the shell budget. */
  function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    onExpandChange?.(next);
  }

  /** Render a scroll-group nav item. */
  function renderItem(item: NavItem) {
    const Icon = NAV_ICONS[item.id];
    const handleClick =
      item.id === "plugins"
        ? () => (page === "plugins" ? (canNavBack() ? navBack() : setPage("chat")) : setPage("plugins"))
        : () => setPage(item.page);
    return (
      <TooltipButton
        key={item.id}
        type="button"
        className={cx("nav-rail-btn nav-rail-labeled", page === item.page && "active")}
        data-nav={item.dataNav}
        tooltip={t(item.labelKey)}
        ariaLabel={t(item.labelKey)}
        onClick={handleClick}
        aria-pressed={page === item.page}
      >
        <span className="nav-rail-icon"><Icon size={16} aria-hidden /></span>
        <span className="nav-rail-label">{t(item.labelKey)}</span>
      </TooltipButton>
    );
  }

  return (
    <nav className={cx("nav-rail", expanded && "expanded")} aria-label="Primary">
      {/* Upper scrollable section: all page destinations with dividers */}
      <div id="nav-rail-scroll" className="nav-rail-scroll no-drag">
        {primary.map(renderItem)}
        <div className="nav-rail-divider" role="separator" />
        {utility.map(renderItem)}
        <div className="nav-rail-divider" role="separator" />
        {developer.map(renderItem)}
      </div>

      {/* Footer: notifications + settings + expand toggle (D2-shell.html:167-181) */}
      <div className="nav-rail-foot no-drag">
        <NotificationCenter navRailLabel={t("notifications.title")} />
        <TooltipButton
          type="button"
          className={cx("nav-rail-btn nav-rail-labeled", page === "settings" && "active")}
          data-nav="settings"
          tooltip={t("nav.settings")}
          ariaLabel={t("nav.settings")}
          onClick={() => setPage("settings")}
          aria-pressed={page === "settings"}
        >
          <span className="nav-rail-icon"><IconSettings size={16} aria-hidden /></span>
          <span className="nav-rail-label">{t("nav.settings")}</span>
          <span
            className="memory-status-dot memory-status-dot-rail"
            data-health={mHealth}
            aria-label={t(`settings.memoryStatus${mHealth[0].toUpperCase()}${mHealth.slice(1)}`)}
          />
        </TooltipButton>
        <div className="nav-rail-divider" role="separator" />
        <TooltipButton
          type="button"
          className="nav-rail-toggle"
          aria-expanded={expanded}
          aria-controls="nav-rail-scroll"
          tooltip={expanded ? t("nav.collapseRail") : t("nav.expandRail")}
          ariaLabel={expanded ? t("nav.collapseRail") : t("nav.expandRail")}
          onClick={handleToggle}
        >
          {expanded
            ? <IconChevronLeft size={14} aria-hidden />
            : <IconChevronRight size={14} aria-hidden />}
        </TooltipButton>
      </div>
    </nav>
  );
}
