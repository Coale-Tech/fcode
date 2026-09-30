import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MemoryConfig, MemoryConfigView, OmpMemoryStatusResult } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Input } from "../../components/ui";
import { SettingsMenuSelect } from "../../components/settings/SettingsMenuSelect";
import { SettingsCard, SettingsRow } from "./primitives";

export type MemoryHealth = "ok" | "degraded" | "error" | "off" | "unknown";

/** Map an omp status to a health state. Off/unknown are distinct from failure. */
export function memoryHealth(s: OmpMemoryStatusResult | null): MemoryHealth {
  if (!s) return "unknown";
  if (s.backend === "off") return "off";
  if (s.error) return "error";
  return s.active ? "ok" : "degraded";
}

/** Poll omp for memory status; a rejected call means the agent is not running. */
export function useMemoryStatus(intervalMs: number) {
  const [status, setStatus] = useState<OmpMemoryStatusResult | null>(null);
  const refresh = useCallback(async () => {
    try {
      setStatus(await api.ompMemoryStatus());
    } catch {
      setStatus(null);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);
  return { status, refresh };
}

export function MemoryTab() {
  const { t } = useTranslation();
  const { status, refresh } = useMemoryStatus(15_000);
  const [config, setConfig] = useState<MemoryConfigView | null>(null);
  const [draft, setDraft] = useState<MemoryConfig>({ backend: "mnemopi" });
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.memoryGetConfig().then((c) => {
      setConfig(c);
      setDraft({ backend: c.backend, hindsightUrl: c.hindsightUrl, hindsightBank: c.hindsightBank });
    });
  }, []);

  const health = memoryHealth(status);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      setConfig(await api.memorySetConfig({ ...draft, token: token || undefined }));
      setToken("");
      setTimeout(() => void refresh(), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-stack">
      <SettingsCard title={t("settings.memoryTitle")}>
        <SettingsRow
          title={t(`settings.memoryStatus${health[0].toUpperCase()}${health.slice(1)}`)}
          detail={
            status ? (
              <span data-testid="memory-status-detail">
                {status.error ?? status.message ?? ""}{" "}
                {t("settings.memoryLatency", { ms: status.latencyMs })}
                {status.workingCount !== undefined &&
                  ` · ${t("settings.memoryCounts", {
                    working: status.workingCount,
                    episodic: status.episodicCount ?? 0,
                    triples: status.tripleCount ?? 0,
                  })}`}
              </span>
            ) : null
          }
        >
          <span data-testid="memory-health" data-health={health} />
        </SettingsRow>
      </SettingsCard>
      <SettingsCard>
        <SettingsRow title={t("settings.memoryBackend")}>
          <SettingsMenuSelect
            label={t("settings.memoryBackend")}
            value={draft.backend}
            options={[
              { id: "mnemopi", label: t("settings.memoryBackendMnemopi") },
              { id: "hindsight", label: t("settings.memoryBackendHindsight") },
              { id: "off", label: t("settings.memoryBackendOff") },
            ]}
            onChange={(id) => setDraft({ ...draft, backend: id as MemoryConfig["backend"] })}
          />
        </SettingsRow>
        {draft.backend === "hindsight" && (
          <>
            <SettingsRow title={t("settings.memoryHindsightUrl")}>
              <Input
                value={draft.hindsightUrl ?? ""}
                placeholder="http://localhost:8888"
                onChange={(e) => setDraft({ ...draft, hindsightUrl: e.target.value })}
              />
            </SettingsRow>
            <SettingsRow title={t("settings.memoryHindsightBank")}>
              <Input
                value={draft.hindsightBank ?? ""}
                onChange={(e) => setDraft({ ...draft, hindsightBank: e.target.value })}
              />
            </SettingsRow>
            <SettingsRow
              title={t("settings.memoryHindsightToken")}
              description={config?.hasToken ? t("settings.memoryTokenSaved") : undefined}
            >
              <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
            </SettingsRow>
          </>
        )}
        <SettingsRow title={t("settings.memorySave")} description={t("settings.memorySaveNote")}>
          <button type="button" disabled={saving} onClick={() => void save()}>
            {t("settings.memorySave")}
          </button>
        </SettingsRow>
        {error && <div role="alert">{error}</div>}
      </SettingsCard>
    </div>
  );
}
