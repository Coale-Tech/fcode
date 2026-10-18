import { useRef, useState, type ReactNode } from "react";
import { Button, TooltipButton, cx } from "../components/ui";
import {
  IconCheck,
  IconCircleAlert,
  IconCloudDown,
  IconDownload,
  IconMore,
  IconPackage,
  IconPlug,
  IconPlus,
} from "../components/icons";
import { AnchoredMenu } from "../components/settings/AnchoredMenu";
import { SearchField } from "../features/plugins/presentation";
import { InstalledPluginsPanel } from "../features/plugins/InstalledPluginsPanel";
import { MarketplacePanel } from "../features/plugins/MarketplacePanel";
import { PluginDetailSheet } from "../features/plugins/PluginDetailSheet";
import { PluginDialogs } from "../features/plugins/PluginDialogs";
import { usePluginsPage } from "../features/plugins/usePluginsPage";
import { GROUP_LABEL_KEYS, type GroupId } from "../features/plugins/model";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";

type PlgNav = "all" | GroupId | "market";

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
    marketLoading,
    market,
    installedGroups,
    installPackage,
    queueInstall,
    refreshPlugins,
  } = page;

  const [plgNav, setPlgNav] = useState<PlgNav>("all");
  const [spec, setSpec] = useState("");
  const showToast = useAppStore((s) => s.showToast);
  const [specBusy, setSpecBusy] = useState(false);
  const specRef = useRef<HTMLInputElement>(null);

  const groupCount = (id: GroupId) =>
    installedGroups.find((g) => g.id === id)?.rows.length ?? 0;

  const goInstalled = (nav: PlgNav) => {
    setPlgNav(nav);
    setTab("installed");
  };
  const goMarket = () => {
    setPlgNav("market");
    setTab("market");
  };
  const focusSpec = () => {
    goInstalled("all");
    requestAnimationFrame(() => specRef.current?.focus());
  };

  const installSpec = async () => {
    const value = spec.trim();
    if (!value || specBusy) return;
    setSpecBusy(true);
    try {
      const res = await api.ompExtensionInstall(value);
      if (res.ok) {
        setSpec("");
        await refreshPlugins();
        showToast(t("settings.ompExtInstallOk"), { variant: "success" });
      } else {
        showToast(res.output || t("settings.ompExtInstallFail"), { variant: "error" });
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("settings.ompExtInstallFail"), {
        variant: "error",
      });
    } finally {
      setSpecBusy(false);
    }
  };

  // The banner names the pending update when there is exactly one, so the
  // decision it asks for is concrete; with several, the count says enough.
  const pendingUpdates = plugins.filter((plugin) => plugin.updateAvailable);
  const soleUpdate = pendingUpdates.length === 1 ? pendingUpdates[0] : undefined;
  const reviewNextUpdate = () => {
    const next = pendingUpdates[0];
    if (!next?.updateAvailable) return;
    queueInstall({
      id: next.id,
      name: next.name,
      version: next.updateAvailable.version,
      permissions: next.permissions ?? [],
      newPermissions: next.updateAvailable.permissionDiff ?? [],
    });
  };

  const headTitle =
    tab === "market"
      ? t("plugins.navMcpMarket")
      : plgNav === "all" || plgNav === "market"
        ? t("plugins.navAll")
        : t(GROUP_LABEL_KEYS[plgNav]);

  const navItem = (
    nav: PlgNav,
    icon: ReactNode,
    label: string,
    count: number | null,
    tone?: "danger" | "warn" | "muted",
  ) => (
    <button
      type="button"
      className={cx(
        "plg-nav-item",
        tone,
        plgNav === nav && (nav === "market" ? tab === "market" : tab === "installed") && "active",
      )}
      onClick={() => (nav === "market" ? goMarket() : goInstalled(nav))}
    >
      {icon}
      {label}
      {count !== null && <span className="plg-nav-badge">{count}</span>}
    </button>
  );

  return (
    <div className="plg-page">
      {/* Overlays live outside the layout so they can cover everything */}
      <PluginDetailSheet {...page} />
      <PluginDialogs {...page} />

      <div className="plg-layout">
        <div className="d-panel plg-nav-panel">
          <div className="d-mini-head">
            <span className="d-mini-title">{t("plugins.title")}</span>
            <span className="d-mini-count">{plugins.length}</span>
            <div className="d-mini-act">
              <TooltipButton
                type="button"
                className="icon-btn icon-btn-square"
                ariaLabel={t("plugins.installFromNpm")}
                tooltip={t("plugins.installFromNpm")}
                onClick={focusSpec}
              >
                <IconPlus size={12} />
              </TooltipButton>
            </div>
          </div>
          <div className="plg-nav-body">
            {navItem("all", <IconPlug size={14} />, t("plugins.navAll"), plugins.length)}
            {groupCount("attention") > 0 &&
              navItem(
                "attention",
                <IconCircleAlert size={14} />,
                t("plugins.groupAttention"),
                groupCount("attention"),
                "danger",
              )}
            {stats.updates > 0 &&
              navItem("updates", <IconCloudDown size={14} />, t("plugins.navUpdates"), stats.updates, "warn")}
            <div className="plg-nav-divider" />
            {navItem("active", <IconCheck size={14} />, t("plugins.groupActive"), groupCount("active"))}
            {navItem(
              "disabled",
              <IconPlug size={14} />,
              t("plugins.groupDisabled"),
              groupCount("disabled"),
              "muted",
            )}
            <div className="plg-nav-divider" />
            {navItem("market", <IconDownload size={14} />, t("plugins.navMcpMarket"), null)}
            <button type="button" className="plg-nav-item" onClick={focusSpec}>
              <IconPackage size={14} />
              {t("plugins.navNpm")}
            </button>
          </div>
        </div>

        <div className="d-panel plg-main">
          <div className="d-page-head">
            <span className="d-page-title">{headTitle}</span>
            {tab === "installed" && (
              <span className="d-pill gray">{t("plugins.pluginCount", { count: stats.total })}</span>
            )}
            {tab === "market" && marketLoading && (
              <span className="plg-head-note">{t("plugins.marketLoading")}</span>
            )}
            <div className="d-page-head-actions">
              {tab === "market" && (
                <>
                  <SearchField
                    value={query}
                    onChange={setQuery}
                    placeholder={t("plugins.marketSearchPlaceholder")}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void refreshMarket(query, { refreshRemote: true })}
                  >
                    <IconCloudDown size={14} />
                    {t("plugins.refreshMarket")}
                  </Button>
                </>
              )}
              <div className="d-seg" role="tablist">
                <button
                  type="button"
                  id="plugins-tab-installed"
                  role="tab"
                  aria-selected={tab === "installed"}
                  aria-controls="plugins-panel-installed"
                  className={cx("d-seg-opt", tab === "installed" && "active")}
                  onClick={() => goInstalled(plgNav === "market" ? "all" : plgNav)}
                >
                  {t("plugins.tabInstalled")}
                  <span className="plg-seg-count">{stats.total}</span>
                </button>
                <button
                  type="button"
                  id="plugins-tab-market"
                  role="tab"
                  aria-selected={tab === "market"}
                  aria-controls="plugins-panel-market"
                  className={cx("d-seg-opt", tab === "market" && "active")}
                  onClick={goMarket}
                >
                  {t("plugins.tabMarket")}
                  {market.length > 0 && <span className="plg-seg-count">{market.length}</span>}
                </button>
              </div>
              <Button variant="primary" size="sm" onClick={() => void installPackage()}>
                <IconPlus size={12} />
                {t("plugins.install")}
              </Button>
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
                    <IconMore size={13} />
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

          {tab === "installed" && stats.updates > 0 && (
            <div className="plg-banner-row" role="status">
              <IconCloudDown size={14} className="plg-banner-icon" />
              <div className="plg-banner-copy">
                <strong>{t("plugins.updatesReady", { count: stats.updates })}</strong>
                {soleUpdate?.updateAvailable && (
                  <span className="plg-banner-detail">
                    {t("plugins.updateDetail", {
                      name: soleUpdate.name,
                      from: soleUpdate.version,
                      to: soleUpdate.updateAvailable.version,
                    })}
                    {(soleUpdate.updateAvailable.permissionDiff?.length ?? 0) > 0 &&
                      ` · ${t("plugins.newPermissions", {
                        count: soleUpdate.updateAvailable.permissionDiff?.length ?? 0,
                      })}`}
                  </span>
                )}
              </div>
              <Button variant="secondary" size="sm" className="plg-banner-btn" onClick={reviewNextUpdate}>
                {t("plugins.applyUpdates")}
              </Button>
            </div>
          )}

          {tab === "installed" && (
            <form
              className="plg-install-row"
              onSubmit={(event) => {
                event.preventDefault();
                void installSpec();
              }}
            >
              <IconPackage size={13} className="plg-install-icon" />
              <input
                ref={specRef}
                className="plg-install-input"
                type="text"
                value={spec}
                onChange={(event) => setSpec(event.target.value)}
                placeholder={t("plugins.npmSpecPlaceholder")}
                aria-label={t("plugins.installFromNpm")}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
              />
              <Button type="submit" variant="secondary" size="sm" disabled={!spec.trim() || specBusy}>
                {t("plugins.install")}
              </Button>
            </form>
          )}

          {tab === "installed" ? (
            <InstalledPluginsPanel
              {...page}
              installedGroups={
                plgNav === "all" || plgNav === "market"
                  ? installedGroups
                  : installedGroups.filter((g) => g.id === plgNav)
              }
            />
          ) : (
            <MarketplacePanel {...page} />
          )}
        </div>
      </div>
    </div>
  );
}
