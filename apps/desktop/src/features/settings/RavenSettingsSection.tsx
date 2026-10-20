import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { IPC, type RavenSettings } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { SettingsCard, SettingsRow } from "./primitives";
import { Input, SettingsToggle } from "../../components/ui";

// Mirrors main's isAllowedHttpUrl closely enough to gate the UI; main stays the authority.
const isHttpUrl = (v: string) => /^https?:\/\/[^\s/]+/i.test(v.trim());

export function RavenSettingsSection() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<RavenSettings | null>(null);
  // What is typed in the field, which can be ahead of what main has saved.
  const [draftUrl, setDraftUrl] = useState("");

  const fetchSettings = useCallback(() => {
    void api
      .ravenSettingsGet()
      .then((r) => {
        setSettings(r.settings);
        setDraftUrl(r.settings.url);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchSettings();
    return window.piDesktop?.on?.(IPC.event.ravenChanged, fetchSettings);
  }, [fetchSettings]);

  // Optimistic, then reconciled: main rejects non-http(s) URLs and disables Raven without one.
  const save = async (patch: Partial<RavenSettings>) => {
    if (!settings) return;
    setSettings({ ...settings, ...patch });
    const result = await api.ravenSettingsSet(patch).catch(() => null);
    if (result) {
      setSettings(result.settings);
      setDraftUrl(result.settings.url);
    }
  };

  if (!settings) return null;

  const urlValid = isHttpUrl(draftUrl);

  return (
    <div className="settings-stack">
      <SettingsCard>
        <SettingsRow title={t("raven.settings.enabled")}>
          <SettingsToggle
            checked={settings.enabled}
            label={t("raven.settings.enabled")}
            disabled={!urlValid}
            // Send the typed URL with the toggle: the field saves on blur, which has not
            // finished by the time this click lands (and the toggle was disabled until it had).
            onChange={() => void save({ url: draftUrl.trim(), enabled: !settings.enabled })}
          />
        </SettingsRow>
        <SettingsRow title={t("raven.settings.url")} description={t("raven.settings.urlHint")}>
          <Input
            type="url"
            placeholder="https://erp.example.com"
            value={draftUrl}
            aria-invalid={draftUrl.trim() !== "" && !urlValid ? true : undefined}
            onChange={(e) => setDraftUrl(e.target.value)}
            onBlur={() => {
              const next = draftUrl.trim();
              if (next === settings.url) return;
              if (next === "" || isHttpUrl(next)) void save({ url: next });
            }}
          />
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}
