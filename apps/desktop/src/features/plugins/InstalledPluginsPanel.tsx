import { Fragment, useState, type ReactNode } from "react";
import { resolveScope, withProject, type PluginSummary } from "@pi-desktop/shared";
import { Button, SettingsToggle, TooltipButton, cx } from "../../components/ui";
import {
  IconCheck,
  IconChevronRight,
  IconCircleAlert,
  IconCloudDown,
  IconGlobe,
  IconFolder,
  IconMore,
  IconPanel,
  IconPlug,
  IconReview,
  IconSearch,
  IconSettings,
  IconTrash,
} from "../../components/icons";
import { AnchoredMenu } from "../../components/settings/AnchoredMenu";
import { GROUP_LABEL_KEYS, TEMPLATE_IDS, type GroupId } from "./model";
import { PluginRowDetails } from "./presentation";
import type { PluginsPageModel } from "./usePluginsPage";
import { api } from "../../lib/api";

const GROUP_ICONS: Record<GroupId, ReactNode> = {
  attention: <IconCircleAlert size={12} />,
  updates: <IconCloudDown size={12} />,
  active: <IconCheck size={12} className="plg-group-icon-ok" />,
  disabled: <IconPlug size={12} />,
};

const GROUP_TONES: Partial<Record<GroupId, string>> = { attention: "danger", updates: "warn" };

/**
 * A host error reads as a headline and its explanation when it spans lines;
 * inline `code` spans and **emphasis** keep names and paths legible.
 */
function splitError(message: string): { headline?: string; detail: string } {
  const [first, ...rest] = message.split("\n");
  const detail = rest.join("\n").trim();
  return detail ? { headline: first.trim(), detail } : { detail: message };
}

function renderInline(text: string): ReactNode {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function sourceTag(plugin: PluginSummary, t: PluginsPageModel["t"]): string | null {
  if (plugin.bundled) return t("plugins.tagBundled");
  if (plugin.source === "dev") return t("plugins.tagLocal");
  if (plugin.source === "marketplace") return plugin.marketplace?.providerId ?? t("plugins.tagMarketplace");
  if (plugin.source === "installed") return t("plugins.tagPackage");
  return null;
}

export function InstalledPluginsPanel({
  t,
  plugins,
  setTab,
  loadDev,
  setTemplatePick,
  installedGroups,
  setInstalledQuery,
  rowMenu,
  setRowMenu,
  busyId,
  queueInstall,
  currentProjectPath,
  run,
  refreshPlugins,
  reloadingId,
  reloadPlugin,
  setSettingsPlugin,
  servicesByPlugin,
}: PluginsPageModel) {
  // The row whose details are open is the one being inspected; it carries the
  // selection tint so the expanded readout stays tied to its plugin.
  const [openId, setOpenId] = useState<string | null>(null);

  if (plugins.length === 0) {
    return (
      <div className="plg-body">
        <div className="plugins-empty">
          <span className="plugins-empty-icon" aria-hidden>
            <IconPlug size={18} />
          </span>
          <p className="plugins-empty-title">{t("plugins.empty")}</p>
          <div className="plugins-empty-actions">
            <Button variant="primary" onClick={() => setTab("market")}>
              {t("plugins.browseMarket")}
            </Button>
            <Button variant="secondary" onClick={() => void loadDev()}>
              {t("plugins.loadDev")}
            </Button>
            <Button variant="secondary" onClick={() => setTemplatePick(TEMPLATE_IDS[0])}>
              {t("plugins.newFromTemplate")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (installedGroups.length === 0) {
    return (
      <div className="plg-body">
        <div className="plugins-empty">
          <span className="plugins-empty-icon" aria-hidden>
            <IconSearch size={18} />
          </span>
          <p className="plugins-empty-title">{t("plugins.noMatches")}</p>
          <div className="plugins-empty-actions">
            <Button variant="secondary" onClick={() => setInstalledQuery("")}>
              {t("plugins.clearSearch")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const setEnabled = (plugin: PluginSummary, enabled: boolean) =>
    run(async () => {
      if (enabled) await api.enablePlugin(plugin.id);
      else await api.disablePlugin(plugin.id);
      await refreshPlugins();
    });

  return (
    <div id="plugins-panel-installed" role="tabpanel" className="plg-body">
      {installedGroups.map((group) => (
        <section key={group.id} className="plg-group" data-group={group.id}>
          <header className={cx("plg-group-head", GROUP_TONES[group.id])}>
            {GROUP_ICONS[group.id]}
            <h2 className="plg-group-label">{t(GROUP_LABEL_KEYS[group.id])}</h2>
            <span className="plg-group-count">{group.rows.length}</span>
          </header>
          <div role="list" aria-label={t(GROUP_LABEL_KEYS[group.id])}>
            {group.rows.map((plugin) => {
              const broken = group.id === "attention";
              const update = plugin.updateAvailable;
              const menuOpen = rowMenu === plugin.id;
              const open = openId === plugin.id;
              const tag = sourceTag(plugin, t);
              const error = plugin.errorMessage ? splitError(plugin.errorMessage) : null;
              const scope = resolveScope(plugin.scope);
              const statusLabel = broken
                ? (error?.headline ??
                  t(plugin.status === "load_error" ? "plugins.statusLoadError" : "plugins.statusError"))
                : null;
              return (
                <div
                  key={plugin.id}
                  role="listitem"
                  className={cx("plg-row", !plugin.enabled && "off", open && "is-open", menuOpen && "menu-open")}
                >
                  <span
                    className={cx(
                      "plg-glyph",
                      broken && "broken",
                      !broken && update && "update",
                      !broken && !update && open && "active-glyph",
                    )}
                    aria-hidden
                  >
                    {broken ? (
                      <IconCircleAlert size={14} />
                    ) : update ? (
                      <IconCloudDown size={14} />
                    ) : (
                      <IconPlug size={14} />
                    )}
                  </span>
                  <div className="plg-copy">
                    <div className="plg-name-row">
                      <span className="plg-name">{plugin.name}</span>
                      {tag && <span className={cx("plg-tag", !plugin.bundled && "npm")}>{tag}</span>}
                    </div>
                    <div className="plg-meta">
                      <span>{plugin.id}</span>
                      <span className="sep">·</span>
                      <span>v{plugin.version}</span>
                      {update && (
                        <>
                          <IconChevronRight size={10} className="sep" />
                          <span className="plg-version-new">v{update.version}</span>
                        </>
                      )}
                      {statusLabel && (
                        <>
                          <span className="sep">·</span>
                          <span className="plg-status-error">{statusLabel}</span>
                        </>
                      )}
                    </div>
                    {error && <p className="plg-error">{renderInline(error.detail)}</p>}
                    <PluginRowDetails
                      plugin={plugin}
                      services={servicesByPlugin.get(plugin.id)}
                      open={open}
                      onToggle={(next) => setOpenId(next ? plugin.id : null)}
                    />
                  </div>
                  <div className="plg-controls">
                    {update && (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={busyId === plugin.id}
                        onClick={() =>
                          queueInstall({
                            id: plugin.id,
                            name: plugin.name,
                            version: update.version,
                            permissions: plugin.permissions ?? [],
                            newPermissions: update.permissionDiff ?? [],
                          })
                        }
                      >
                        {busyId === plugin.id ? t("plugins.updating") : t("plugins.updateNow")}
                      </Button>
                    )}
                    <SettingsToggle
                      checked={plugin.enabled}
                      label={t("plugins.toggleEnabled", { name: plugin.name })}
                      busy={busyId === plugin.id}
                      onChange={() => void setEnabled(plugin, !plugin.enabled)}
                    />
                    {!plugin.enabled && !plugin.bundled && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="plg-uninstall"
                        onClick={() =>
                          void run(async () => {
                            await api.uninstallPlugin(plugin.id);
                            await refreshPlugins();
                          })
                        }
                      >
                        <IconTrash size={12} />
                        {t("plugins.uninstall")}
                      </Button>
                    )}
                    <AnchoredMenu
                      className="plugins-menu-wrap"
                      open={menuOpen}
                      onClose={() => setRowMenu(null)}
                      menuClassName="plugins-menu is-end"
                      label={t("plugins.rowActions", { name: plugin.name })}
                      role="menu"
                      align="end"
                      trigger={(ref) => (
                        <TooltipButton
                          ref={ref}
                          type="button"
                          className="icon-btn icon-btn-square"
                          tooltip={t("plugins.rowActions", { name: plugin.name })}
                          ariaLabel={t("plugins.rowActions", { name: plugin.name })}
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          onClick={() => setRowMenu((cur) => (cur === plugin.id ? null : plugin.id))}
                        >
                          <IconMore size={13} />
                        </TooltipButton>
                      )}
                    >
                      {plugin.ui?.panel ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setRowMenu(null);
                            void run(() => api.openPluginPanel(plugin.id));
                          }}
                        >
                          <IconPanel size={14} />
                          {t("plugins.openPanel")}
                        </button>
                      ) : null}
                      {plugin.enabled && plugin.settings?.length ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setRowMenu(null);
                            setSettingsPlugin(plugin);
                          }}
                        >
                          <IconSettings size={14} />
                          {t("plugins.openSettings")}
                        </button>
                      ) : null}
                      {/* Where it applies: everywhere, or limited to projects
                          (the open one is added to the list). */}
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={scope.mode === "global"}
                        onClick={() => {
                          setRowMenu(null);
                          void run(async () => {
                            await api.setPluginScope(plugin.id, { mode: "global", projects: scope.projects });
                            await refreshPlugins();
                          });
                        }}
                      >
                        <IconGlobe size={14} />
                        {t("extensions.scope.global")}
                      </button>
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={scope.mode === "projects"}
                        disabled={!currentProjectPath && scope.projects.length === 0}
                        onClick={() => {
                          setRowMenu(null);
                          void run(async () => {
                            await api.setPluginScope(
                              plugin.id,
                              currentProjectPath
                                ? withProject(plugin.scope, currentProjectPath)
                                : { mode: "projects", projects: scope.projects },
                            );
                            await refreshPlugins();
                          });
                        }}
                      >
                        <IconFolder size={14} />
                        {t("extensions.scope.projects")}
                      </button>
                      <div className="plugins-menu-sep" />
                      {plugin.source === "dev" ? (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={busyId === plugin.id || reloadingId === plugin.id}
                          onClick={() => {
                            setRowMenu(null);
                            void reloadPlugin(plugin.id);
                          }}
                        >
                          <IconReview size={14} />
                          {t("plugins.reload")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setRowMenu(null);
                          void run(async () => {
                            await api.setPluginAutoUpdate(plugin.id, !plugin.autoUpdate);
                            await refreshPlugins();
                          });
                        }}
                      >
                        <IconCloudDown size={14} />
                        {plugin.autoUpdate ? t("plugins.disableAutoUpdate") : t("plugins.enableAutoUpdate")}
                      </button>
                      {/* A bundled plugin belongs to the application: the host
                          refuses the removal, so the action is not offered
                          (ADR 0104, ADR 0241). */}
                      {plugin.bundled ? null : (
                        <>
                          <div className="plugins-menu-sep" />
                          <button
                            type="button"
                            role="menuitem"
                            className="danger"
                            onClick={() => {
                              setRowMenu(null);
                              void run(async () => {
                                await api.uninstallPlugin(plugin.id);
                                await refreshPlugins();
                              });
                            }}
                          >
                            <IconTrash size={14} />
                            {t("plugins.uninstall")}
                          </button>
                        </>
                      )}
                    </AnchoredMenu>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
