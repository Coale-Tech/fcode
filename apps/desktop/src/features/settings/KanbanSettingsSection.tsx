import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { KanbanSettings } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { SettingsCard, SettingsRow } from "./primitives";
import { Input, SettingsToggle } from "../../components/ui";

export function KanbanSettingsSection() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<KanbanSettings | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    void api.kanbanSettingsGet().then((r) => setSettings(r.settings)).catch(() => {});
    void api.kanbanList().then((r) => setPaused(r.paused)).catch(() => {});
  }, []);

  const save = async (patch: Partial<KanbanSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await api.kanbanSettingsSet(patch).catch(() => {});
  };

  const togglePause = async () => {
    const next = !paused;
    setPaused(next);
    await api.kanbanSetPaused(next).catch(() => {});
  };

  if (!settings) return null;

  return (
    <div className="settings-stack">
      <SettingsCard>
        <SettingsRow title={t("kanban.settings.enabled")}>
          <SettingsToggle
            checked={settings.enabled}
            label={t("kanban.settings.enabled")}
            onChange={() => void save({ enabled: !settings.enabled })}
          />
        </SettingsRow>
        <SettingsRow title={t("kanban.settings.maxRuntimeSeconds")}>
          <Input
            type="number" min={60} max={86400}
            defaultValue={settings.maxRuntimeSeconds}
            onBlur={(e) => void save({ maxRuntimeSeconds: Number(e.target.value) })}
          />
        </SettingsRow>
        <SettingsRow title={t("kanban.settings.maxAgentCardsPerSession")}>
          <Input
            type="number" min={1} max={100}
            defaultValue={settings.maxAgentCardsPerSession}
            onBlur={(e) => void save({ maxAgentCardsPerSession: Number(e.target.value) })}
          />
        </SettingsRow>
        <SettingsRow title={t("kanban.settings.maxDailySpawns")}>
          <Input
            type="number" min={1} max={1000}
            defaultValue={settings.maxDailySpawns}
            onBlur={(e) => void save({ maxDailySpawns: Number(e.target.value) })}
          />
        </SettingsRow>
        <SettingsRow title={t("kanban.dispatcher.pause")}>
          <SettingsToggle
            checked={paused}
            label={t("kanban.dispatcher.pause")}
            onChange={() => void togglePause()}
          />
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}
