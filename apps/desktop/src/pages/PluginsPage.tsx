import { useState } from "react";
import { Button, TooltipButton, cx } from "../components/ui";
import { IconCheck, IconCircleAlert, IconCloudDown, IconDownload, IconMore, IconPlug } from "../components/icons";
import { AnchoredMenu } from "../components/settings/AnchoredMenu";
import { SearchField } from "../features/plugins/presentation";
import { InstalledPluginsPanel } from "../features/plugins/InstalledPluginsPanel";
import { MarketplacePanel } from "../features/plugins/MarketplacePanel";
import { PluginDetailSheet } from "../features/plugins/PluginDetailSheet";
import { PluginDialogs } from "../features/plugins/PluginDialogs";
import { usePluginsPage } from "../features/plugins/usePluginsPage";

type PlgNav = "all" | "attention" | "updates" | "active" | "disabled" | "market";

export function PluginsPage() {
  const page = usePluginsPage();
  const {
    t,
    tab,
    setTab,
    refreshMarket,
    query,
    setQuery,
    headerMenu,
    setHeaderMenu,
    overflowActions,
    stats,
    plugins,
    installedQuery,
    filteredInstalled,
    setInstalledQuery,
    marketLoading,
    market,
    applyAutoUpdates,
    installedGroups,
  } = page;

  const [plgNav, setPlgNav] = useState<PlgNav>("all");

  const groupCount = (id: string) =>
    installedGroups.find((g) => g.id === id)?.rows.length ?? 0;

  const goInstalled = (nav: PlgNav) => {
    setPlgNav(nav);
    setTab("installed");
  };
  const goMarket = () => {
    setPlgNav("market");
    setTab("market");
  };

  return (
    <div className="plg-page">
      {/* Overlays live outside the layout so they can cover everything */}
      <PluginDetailSheet {...page} />
      <PluginDialogs {...page} />

      <div className="plg-layout">

        {/* ── Left nav panel (220px) ── */}
        <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="d-panel" style={{ flex: 1 }}>
            <div className="d-mini-head">
              <span className="d-mini-title">{t("plugins.title")}</span>
              <span className="d-mini-count">{plugins.length}</span>
              <div className="d-mini-act">
                <AnchoredMenu
                  className="plugins-menu-wrap"
                  open={headerMenu}
                  onClose={() => setHeaderMenu(false)}
                  menuClassName="plugins-menu is-end"
                  label={t("plugins.moreActions")}
                  role="menu"
                  align="end"
                  trigger={(ref) => (
                    <TooltipButton
                      ref={ref}
                      type="button"
                      className="icon-btn icon-btn-square"
                      ariaLabel={t("plugins.moreActions")}
                      tooltip={t("plugins.moreActions")}
                      aria-haspopup="menu"
                      aria-expanded={headerMenu}
                      onClick={() => setHeaderMenu((open) => !open)}
                    >
                      <IconMore size={14} />
                    </TooltipButton>
                  )}
                >
                  {overflowActions.map((action) => (
                    <button
                      key={action.key}
                      type="button"
                      role="menuitem"
                      data-action={action.key}
                      onClick={() => {
                        setHeaderMenu(false);
                        void action.run();
                      }}
                    >
                      {t(`plugins.${action.key}`)}
                    </button>
                  ))}
                </AnchoredMenu>
              </div>
            </div>
            <div className="plg-nav-body">
              <button
                type="button"
                className={cx("plg-nav-item", plgNav === "all" && tab === "installed" && "active")}
                onClick={() => goInstalled("all")}
              >
                <IconPlug size={14} />
                {t("plugins.tabInstalled")}
                <span className="plg-nav-badge">{plugins.length}</span>
              </button>
              {groupCount("attention") > 0 && (
                <button
                  type="button"
                  className={cx("plg-nav-item danger", plgNav === "attention" && tab === "installed" && "active")}
                  onClick={() => goInstalled("attention")}
                >
                  <IconCircleAlert size={14} />
                  {t("plugins.groupAttention")}
                  <span className="plg-nav-badge">{groupCount("attention")}</span>
                </button>
              )}
              {stats.updates > 0 && (
                <button
                  type="button"
                  className={cx("plg-nav-item warn", plgNav === "updates" && tab === "installed" && "active")}
                  onClick={() => goInstalled("updates")}
                >
                  <IconCloudDown size={14} />
                  {t("plugins.groupUpdates")}
                  <span className="plg-nav-badge">{stats.updates}</span>
                </button>
              )}
              <div className="plg-nav-divider" />
              <button
                type="button"
                className={cx("plg-nav-item", plgNav === "active" && tab === "installed" && "active")}
                onClick={() => goInstalled("active")}
              >
                <IconCheck size={14} />
                {t("plugins.groupActive")}
                {groupCount("active") > 0 && <span className="plg-nav-badge">{groupCount("active")}</span>}
              </button>
              <button
                type="button"
                className={cx("plg-nav-item", plgNav === "disabled" && tab === "installed" && "active")}
                onClick={() => goInstalled("disabled")}
              >
                <IconPlug size={14} />
                {t("plugins.groupDisabled")}
                {groupCount("disabled") > 0 && <span className="plg-nav-badge">{groupCount("disabled")}</span>}
              </button>
              <div className="plg-nav-divider" />
              <button
                type="button"
                className={cx("plg-nav-item", plgNav === "market" && "active")}
                onClick={goMarket}
              >
                <IconDownload size={14} />
                {t("plugins.tabMarket")}
                {market.length > 0 && <span className="plg-nav-badge">{market.length}</span>}
              </button>
            </div>
          </div>
        </div>

        {/* ── Right main panel (flex:1) ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="d-panel" style={{ flex: 1, overflow: "hidden" }}>
            {/* Page head */}
            <div className="d-page-head">
              <span className="d-page-title">
                {tab === "installed" ? t("plugins.tabInstalled") : t("plugins.tabMarket")}
              </span>
              {tab === "installed" && (
                <span className="d-pill gray">{stats.total}</span>
              )}
              {tab === "market" && marketLoading && (
                <span style={{ fontSize: "var(--d-text-xs)", color: "var(--ink-gray-4)" }}>
                  {t("plugins.marketLoading")}
                </span>
              )}
              <div className="d-page-head-actions">
                {tab === "installed" && plugins.length > 0 && (
                  <SearchField
                    value={installedQuery}
                    onChange={setInstalledQuery}
                    placeholder={t("plugins.searchInstalled")}
                  />
                )}
                {tab === "market" && (
                  <SearchField
                    value={query}
                    onChange={setQuery}
                    placeholder={t("plugins.marketSearchPlaceholder")}
                  />
                )}
                {tab === "market" ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void refreshMarket(query, { refreshRemote: true })}
                  >
                    <IconCloudDown size={14} />
                    {t("plugins.refreshMarket")}
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={goMarket}>
                    <IconDownload size={14} />
                    {t("plugins.browseMarket")}
                  </Button>
                )}
              </div>
            </div>

            {/* Update banner */}
            {tab === "installed" && stats.updates > 0 && (
              <div className="plugins-alert" role="status">
                <span className="plugins-alert-icon" aria-hidden>
                  <IconCloudDown size={15} />
                </span>
                <div className="plugins-alert-copy">
                  <span className="plugins-alert-title">
                    {t("plugins.updatesReady", { count: stats.updates })}
                  </span>
                </div>
                <Button variant="secondary" size="sm" onClick={() => void applyAutoUpdates()}>
                  {t("plugins.applyAutoUpdates")}
                </Button>
              </div>
            )}

            {/* Content panels */}
            {tab === "installed" ? (
              <InstalledPluginsPanel {...page} />
            ) : (
              <MarketplacePanel {...page} />
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
