/**
 * Settings section for omp extension management.
 * Lists installed npm/marketplace plugins with enable/disable and uninstall;
 * provides an install-from-spec field.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OmpExtensionEntry } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Badge, Button, Input, SettingsToggle } from "../ui";
import { SettingsCard } from "../../features/settings/primitives";
import { DestructiveActionDialog } from "../DestructiveActionDialog";

export function OmpExtensionsSection() {
  const { t } = useTranslation();
  const [extensions, setExtensions] = useState<OmpExtensionEntry[] | null>(null);
  const [installSpec, setInstallSpec] = useState("");
  const [installBusy, setInstallBusy] = useState(false);
  const [installMsg, setInstallMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [uninstallingId, setUninstallingId] = useState<string | null>(null);
  const [pendingUninstall, setPendingUninstall] = useState<OmpExtensionEntry | null>(null);

  const load = useCallback(() => {
    api.ompExtensionsList().then((res) => setExtensions(res.extensions)).catch(() => setExtensions([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = useCallback(async (ext: OmpExtensionEntry) => {
    setTogglingId(ext.id);
    try {
      await api.ompExtensionSetEnabled(ext.id, !ext.enabled);
      load();
    } catch { /* sidecar restart is deferred; ignore */ }
    finally { setTogglingId(null); }
  }, [load]);

  const handleUninstallConfirmed = useCallback(async (ext: OmpExtensionEntry) => {
    setPendingUninstall(null);
    setUninstallingId(ext.id);
    try {
      await api.ompExtensionUninstall(ext.id);
      load();
    } catch { /* ignore */ }
    finally { setUninstallingId(null); }
  }, [load]);

  const handleInstall = useCallback(async () => {
    const spec = installSpec.trim();
    if (!spec) return;
    setInstallBusy(true);
    setInstallMsg(null);
    try {
      const res = await api.ompExtensionInstall(spec);
      setInstallMsg({ ok: res.ok, text: res.ok ? t("settings.ompExtInstallOk") : (res.output || t("settings.ompExtInstallFail")) });
      if (res.ok) {
        setInstallSpec("");
        load();
      }
    } catch (err) {
      setInstallMsg({ ok: false, text: err instanceof Error ? err.message : t("settings.ompExtInstallFail") });
    } finally {
      setInstallBusy(false);
    }
  }, [installSpec, load, t]);

  return (
    <>
      {pendingUninstall && (
        <DestructiveActionDialog
          site={pendingUninstall.name}
          command={t("settings.ompExtUninstall")}
          consequence={t("settings.ompExtUninstallConsequence")}
          onConfirm={() => void handleUninstallConfirmed(pendingUninstall)}
          onCancel={() => setPendingUninstall(null)}
        />
      )}
      <SettingsCard title={t("settings.ompExtGroup")}>
        {/* Install row */}
        <div className="settings-row">
          <div className="settings-row-content" style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: "var(--spacing-2)", alignItems: "center" }}>
              <Input
                value={installSpec}
                onChange={(e) => setInstallSpec(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !installBusy) void handleInstall(); }}
                placeholder={t("settings.ompExtInstallPlaceholder")}
                disabled={installBusy}
                style={{ flex: 1 }}
                aria-label={t("settings.ompExtInstallLabel")}
              />
              <Button
                size="sm"
                variant="primary"
                onClick={() => void handleInstall()}
                disabled={installBusy || !installSpec.trim()}
              >
                {installBusy ? t("common.loading") : t("settings.ompExtInstall")}
              </Button>
            </div>
            {installMsg && (
              <p className="settings-row-desc" style={{ marginTop: "var(--spacing-1)", color: installMsg.ok ? undefined : "var(--color-error)" }}>
                {installMsg.text}
              </p>
            )}
          </div>
        </div>

        {/* Plugin list */}
        {extensions === null ? (
          <p className="settings-row-desc">{t("common.loading")}</p>
        ) : extensions.length === 0 ? (
          <p className="settings-row-desc">{t("settings.ompExtEmpty")}</p>
        ) : (
          <ul className="model-provider-list">
            {extensions.map((ext) => (
              <li key={ext.id} className="model-provider-row">
                <div className="model-provider-name">
                  <span className="font-mono text-sm">{ext.name}</span>
                  {ext.version && <Badge tone="neutral">{ext.version}</Badge>}
                  <Badge tone="neutral">
                    {ext.source === "npm" ? t("settings.ompExtSourceNpm") : t("settings.ompExtSourceMarketplace")}
                  </Badge>
                </div>
                <div className="model-provider-actions">
                  <SettingsToggle
                    checked={ext.enabled}
                    disabled={togglingId === ext.id}
                    onChange={() => void handleToggle(ext)}
                    label={ext.name}
                  />
                  {ext.source === "npm" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={uninstallingId === ext.id}
                      onClick={() => setPendingUninstall(ext)}
                    >
                      {t("settings.ompExtUninstall")}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
    </>
  );
}
