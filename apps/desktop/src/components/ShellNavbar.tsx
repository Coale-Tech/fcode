/**
 * ShellNavbar — 48px direction-D window chrome bar.
 *
 * Always rendered outside the settings-mode inert subtree so Cmd-K and
 * window controls remain accessible regardless of the active page.
 *
 * Layout variants (data-nav-layout):
 *   tabs   → brand logo + NavTabs + awesomebar + right cluster (D1-shell.html:81-136)
 *   rail   → "Fcode / PageName" breadcrumb (D2/D3)
 *   island → same breadcrumb
 *
 * D1 right cluster: bench chip + notification bell + settings + avatar
 * (D1-shell.html:121-136, D.css:238-290).
 *
 * Design source: kit-d/D.css:117-244, D1-shell.html:81-136,
 *                D2-shell.html:69-109, D3-shell.html:304-343
 * Traffic-light reserve: 78px (tabs, D-SPEC.md:6 / D1-shell.html:83),
 *                        56px (rail+island, D-SPEC.md:6 / D2-shell.html:71)
 * Awesomebar: position:absolute, left:50%, 300px wide (D.css:194-202)
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import { resolveNavLayout } from "../lib/nav-layout";
import { IconBell, IconChevronDown, IconKeyboard, IconSearch, IconSettings, IconTerminal } from "./icons";
import { NavTabs } from "./NavTabs";
import { NotificationCenter } from "./NotificationCenter";
import { TooltipButton, cx } from "./ui";
import { useBenchContext } from "../hooks/use-bench-context";
import { SETTINGS_NAV } from "../lib/settings-search";
import { portalToBody } from "../lib/portal-visibility";
import type { AppState } from "../stores/app-state";
const PAGE_LABEL_KEY: Record<AppState["page"], string> = {
  chat:          "nav.chat",
  build:         "nav.build",
  bench:         "nav.bench",
  raven:         "raven.title",
  filebird:      "fileBird.title",
  kanban:        "kanban.title",
  scheduled:     "scheduled.title",
  plugins:       "plugins.title",
  pulls:         "pulls.title",
  settings:      "nav.settings",
  notifications: "notifications.title",
};

export function ShellNavbar({
  onOpenSearch,
  workPanelToggle,
}: {
  onOpenSearch: () => void;
  workPanelToggle?: ReactNode;
}) {
  const { t } = useTranslation();
  const layout  = resolveNavLayout(useAppStore((s) => s.settings?.navLayout));
  const page    = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const setSettingsTab = useAppStore((s) => s.setSettingsTab);
  const settingsTab = useAppStore((s) => s.settingsTab);
  const userInitials = useAppStore((s) => s.userInitials);
  const chatUserName = useAppStore((s) => s.chatUserName);
  const pageCrumb = useAppStore((s) => s.pageCrumb);
  const onboarding = useAppStore((s) => s.onboarding);
  const isMac  = (window.piDesktop?.platform ?? "darwin") === "darwin";
  const bench  = useBenchContext();
  // T13-L03: nested breadcrumb label for settings tabs
  const settingsTabLabel = page === "settings" && layout !== "island"
    ? t(SETTINGS_NAV.find((e) => e.id === settingsTab)?.labelKey ?? "nav.settings")
    : null;
  // D design: show user initials in avatar (max 2 chars from first + last name word)
  const avatarInitials = chatUserName
    ? chatUserName.trim().split(/\s+/).map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 2)
    : null;

  /* Avatar dropdown */
  const avatarRef = useRef<HTMLButtonElement>(null);
  const avatarMenuRef = useRef<HTMLDivElement>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [avatarMenuPos, setAvatarMenuPos] = useState<{ top: number; left: number } | null>(null);

  const closeAvatarMenu = useCallback((restoreFocus = true) => {
    setAvatarMenuOpen(false);
    if (restoreFocus) requestAnimationFrame(() => avatarRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!avatarMenuOpen) { setAvatarMenuPos(null); return; }
    const place = () => {
      const rect = avatarRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAvatarMenuPos({ top: rect.bottom + 4, left: rect.right - 180 });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [avatarMenuOpen]);

  useEffect(() => {
    if (!avatarMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (avatarRef.current?.contains(t) || avatarMenuRef.current?.contains(t)) return;
      closeAvatarMenu(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAvatarMenu();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [avatarMenuOpen, closeAvatarMenu]);


  return (
    <header className="shell-navbar drag" data-nav-layout={layout}>
      {/* Left: brand + tabs strip (D1) or breadcrumb (D2/D3) */}
      <div className="shell-navbar-start no-drag">
        {layout === "tabs" ? (
          <>
            {/* Brand logo — D1-shell.html:89-95 */}
            <div className="shell-navbar-brand" aria-hidden>
              <span className="shell-navbar-brand-icon">
                <IconTerminal size={12} />
              </span>
              <span className="shell-navbar-brand-name">{t("app.shellName")}</span>
            </div>
            <NavTabs />
          </>
        ) : (
          <nav className="shell-navbar-breadcrumb" aria-label={t("nav.location")}>
            <span className="shell-navbar-crumb-root">{t("app.shellName")}</span>
            <span className="shell-navbar-crumb-sep" aria-hidden="true">/</span>
            <span className="shell-navbar-crumb-page">{page === "chat" && Boolean(onboarding?.showChecklist) ? t("onboarding.welcomeBreadcrumb") : t(PAGE_LABEL_KEY[page])}</span>
            {settingsTabLabel && (
              <>
                <span className="shell-navbar-crumb-sep" aria-hidden="true">/</span>
                <span className="shell-navbar-crumb-page">{settingsTabLabel}</span>
              </>
            )}
            {pageCrumb && (
              <>
                <span className="shell-navbar-crumb-sep" aria-hidden="true">/</span>
                <span className="shell-navbar-crumb-page">{pageCrumb}</span>
              </>
            )}
          </nav>
        )}
      </div>

      {/* Centred awesomebar — position:absolute (D.css:194-235) */}
      <button
        type="button"
        className="shell-awesomebar no-drag"
        data-nav="awesomebar"
        aria-label={t("nav.search")}
        onClick={onOpenSearch}
      >
        <IconSearch size={13} className="shell-awesomebar-icon" aria-hidden />
        <span className="shell-awesomebar-label">{t("nav.awesomebar")}</span>
        <div className="shell-awesomebar-kbd" aria-hidden="true">
          {isMac ? (
            <><kbd>⌘</kbd><kbd>K</kbd></>
          ) : (
            <><kbd>Ctrl</kbd><kbd>K</kbd></>
          )}
        </div>
      </button>

      {/* Right end cluster — bench chip + bell + settings + avatar.
       * Design: ALL layouts (D1/D2/D3) show the same right cluster.
       * D-SPEC: "same right cluster" for D2 and D3 (D-SPEC.md §Shell Variants).
       * D1-shell.html:121-136, D.css:272-290 */}
      <div className="shell-navbar-end no-drag">
        {/* Bench chip — D1-shell.html:121-124, D.css:272-290 */}
        {bench.kind !== "empty" && (
          <button
            type="button"
            className="shell-navbar-bench-chip no-drag"
            data-nav="bench"
            title={bench.benchName ?? undefined}
            onClick={() => setPage("bench")}
          >
            <span
              className="shell-navbar-bench-dot"
              data-bench-status={bench.kind}
              aria-hidden
            />
            <span className="shell-navbar-bench-name">
              {bench.benchName ?? t("nav.bench")}
            </span>
            <IconChevronDown size={11} aria-hidden />
          </button>
        )}

        {workPanelToggle}

        {/* Notification bell (tabs layout: 28px/16px icon per d-shell.css;
            rail/island: same cluster, bell also in rail footer for rail nav) */}
        <NotificationCenter />

        {/* Settings button */}
        <TooltipButton
          type="button"
          className="shell-navbar-icon-btn"
          data-nav="settings"
          tooltip={t("nav.settings")}
          ariaLabel={t("nav.settings")}
          onClick={() => setPage("settings")}
        >
          <IconSettings size={16} aria-hidden />
        </TooltipButton>

        {/* Avatar — D1-shell.html:133, D.css:307-320 */}
        <button
          ref={avatarRef}
          type="button"
          className={cx(`shell-navbar-avatar${(userInitials ?? avatarInitials) ? " has-initials" : ""}`, avatarMenuOpen && "active")}
          aria-label={t("nav.userMenu", { defaultValue: "User menu" })}
          aria-expanded={avatarMenuOpen}
          aria-haspopup="menu"
          title={chatUserName ?? t("nav.userMenu", { defaultValue: "User menu" })}
          onClick={() => setAvatarMenuOpen((o) => !o)}
        >
          {(userInitials ?? avatarInitials) ? (
            <span className="shell-navbar-avatar-initials" aria-hidden>{userInitials ?? avatarInitials}</span>
          ) : (
            <IconTerminal size={12} aria-hidden />
          )}
        </button>
        {avatarMenuOpen && avatarMenuPos && typeof document !== "undefined"
          ? portalToBody(
            <div
              ref={avatarMenuRef}
              role="menu"
              className="nav-tabs-overflow-menu"
              style={{ top: avatarMenuPos.top, left: avatarMenuPos.left }}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); closeAvatarMenu(); }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  const items = Array.from(avatarMenuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []);
                  const idx = items.indexOf(document.activeElement as HTMLElement);
                  items[(idx + 1) % items.length]?.focus();
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  const items = Array.from(avatarMenuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []);
                  const idx = items.indexOf(document.activeElement as HTMLElement);
                  items[(idx - 1 + items.length) % items.length]?.focus();
                }
              }}
            >
              <button type="button" role="menuitem" className="nav-tabs-overflow-item"
                onClick={() => { setPage("settings"); closeAvatarMenu(false); }}>
                <IconSettings size={13} aria-hidden />{t("nav.settings")}
              </button>
              <button type="button" role="menuitem" className="nav-tabs-overflow-item"
                onClick={() => { setPage("notifications"); closeAvatarMenu(false); }}>
                <IconBell size={13} aria-hidden />{t("notifications.title")}
              </button>
              <button type="button" role="menuitem" className="nav-tabs-overflow-item"
                onClick={() => { setSettingsTab("shortcuts"); setPage("settings"); closeAvatarMenu(false); }}>
                <IconKeyboard size={13} aria-hidden />{t("settings.nav.shortcuts")}
              </button>
            </div>
          )
          : null}
      </div>
    </header>
  );
}
