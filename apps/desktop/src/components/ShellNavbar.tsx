/**
 * ShellNavbar — 48px direction-D window chrome bar.
 *
 * Always rendered outside the settings-mode inert subtree so Cmd-K and
 * window controls remain accessible regardless of the active page.
 *
 * Layout variants (data-nav-layout):
 *   tabs   → NavTabs pill strip at left (Task 8 fills content)
 *   rail   → "Fcode / PageName" breadcrumb
 *   island → same breadcrumb
 *
 * Design source: kit-d/D.css:117-244, D1-shell.html:81-136,
 *                D2-shell.html:69-109, D3-shell.html:304-343
 * Traffic-light reserve: 78px (tabs, D-SPEC.md:6 / D1-shell.html:83),
 *                        56px (rail+island, D-SPEC.md:6 / D2-shell.html:71)
 * Awesomebar: position:absolute, left:50%, 300px wide (D.css:194-202)
 */
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import { resolveNavLayout } from "../lib/nav-layout";
import { IconSearch, IconSettings } from "./icons";
import { NavTabs } from "./NavTabs";
import { NotificationCenter } from "./NotificationCenter";
import { TooltipButton } from "./ui";
import type { AppState } from "../stores/app-state";

const PAGE_LABEL_KEY: Record<AppState["page"], string> = {
  chat:         "nav.chat",
  build:        "nav.build",
  bench:        "nav.bench",
  raven:        "raven.title",
  filebird:     "fileBird.title",
  kanban:       "kanban.title",
  scheduled:    "scheduled.title",
  plugins:      "plugins.title",
  pulls:        "pulls.title",
  settings:     "nav.settings",
};

export function ShellNavbar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { t } = useTranslation();
  const layout   = resolveNavLayout(useAppStore((s) => s.settings?.navLayout));
  const page     = useAppStore((s) => s.page);
  const setPage  = useAppStore((s) => s.setPage);
  const isMac    = (window.piDesktop?.platform ?? "darwin") === "darwin";

  return (
    <header className="shell-navbar drag" data-nav-layout={layout}>
      {/* Left: tabs strip (D1) or breadcrumb (D2/D3) */}
      <div className="shell-navbar-start no-drag">
        {layout === "tabs" ? (
          <NavTabs />
        ) : (
          <nav className="shell-navbar-breadcrumb" aria-label="Location">
            <span className="shell-navbar-crumb-root">{t("app.shellName")}</span>
            <span className="shell-navbar-crumb-sep" aria-hidden="true">/</span>
            <span className="shell-navbar-crumb-page">{t(PAGE_LABEL_KEY[page])}</span>
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

      {/* Right end: Notification + Settings icons in tabs layout (D1-shell.html:119-134).
          In rail/island layouts these live in the NavRail footer. */}
      {layout === "tabs" ? (
        <div className="shell-navbar-end no-drag">
          <NotificationCenter />
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
        </div>
      ) : (
        <div className="shell-navbar-end" aria-hidden="true" />
      )}
    </header>
  );
}
