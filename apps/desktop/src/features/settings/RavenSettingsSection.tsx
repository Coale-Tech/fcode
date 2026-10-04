import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RavenSettings } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { SettingsCard, SettingsRow } from "./primitives";
import { Input, SettingsToggle } from "../../components/ui";

export function RavenSettingsSection() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<RavenSettings | null>(null);

  useEffect(() => {
    void api.ravenSettingsGet().then((r) => setSettings(r.settings)).catch(() => {});
  }, []);

  // Optimistic, then reconciled: main rejects non-http(s) URLs and disables Raven without one.
  const save = async (patch: Partial<RavenSettings>) => {
    if (!settings) return;
    setSettings({ ...settings, ...patch });
    const result = await api.ravenSettingsSet(patch).catch(() => null);
    if (result) setSettings(result.settings);
  };

  if (!settings) return null;

  return (
    <div className="settings-stack">
      <SettingsCard>
        <SettingsRow title={t("raven.settings.enabled")}>
          <SettingsToggle
            checked={settings.enabled}
            label={t("raven.settings.enabled")}
            disabled={!settings.url}
            onChange={() => void save({ enabled: !settings.enabled })}
          />
        </SettingsRow>
        <SettingsRow title={t("raven.settings.url")} description={t("raven.settings.urlHint")}>
          <Input
            key={settings.url}
            type="url"
            placeholder="https://erp.example.com"
            defaultValue={settings.url}
            onBlur={(e) => {
              if (e.target.value.trim() !== settings.url) void save({ url: e.target.value });
            }}
          />
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}
