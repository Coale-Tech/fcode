import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HindsightLocalState, MemoryConfig, MemoryConfigView, OmpMemoryStatusResult } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
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

export function MemoryTab() {
  const { t } = useTranslation();
  const status = useAppStore((s) => s.memoryStatus);
  const refresh = useAppStore((s) => s.refreshMemoryStatus);
  const [config, setConfig] = useState<MemoryConfigView | null>(null);
  const [draft, setDraft] = useState<MemoryConfig>({ backend: "mnemopi" });
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localState, setLocalState] = useState<HindsightLocalState>({ launchers: [], state: "stopped" });
  const [localBusy, setLocalBusy] = useState(false);

  useEffect(() => {
    void api.memoryGetConfig().then((c) => {
      setConfig(c);
      setDraft({ backend: c.backend, hindsightUrl: c.hindsightUrl, hindsightBank: c.hindsightBank, hindsightLocal: c.hindsightLocal });
    });
    // Detect launchers so the section renders even before any start/stop
    void api.hindsightLocalDetect().then((r) => setLocalState(r.state));
    // Subscribe to supervisor push events from main process
    return api.onHindsightLocalStatus((state) => {
      setLocalState(state);
      // When local server becomes running, auto-fill the URL draft
      if (state.state === "running" && state.port) {
        setDraft((prev: MemoryConfig) => ({ ...prev, hindsightUrl: `http://localhost:${state.port}`, hindsightLocal: true }));
      }
    });
  }, []);

  const health = memoryHealth(status);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      setConfig(await api.memorySetConfig({ ...draft, token: token || undefined }));
      setToken("");
      setTimeout(() => void refresh(), 3_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const startLocal = async () => {
    setLocalBusy(true);
    try {
      setLocalState(await api.hindsightLocalStart());
    } finally {
      setLocalBusy(false);
    }
  };

  const stopLocal = async () => {
    setLocalBusy(true);
    try {
      setLocalState(await api.hindsightLocalStop());
    } finally {
      setLocalBusy(false);
    }
  };

  const localStatusLabel = (): string => {
    switch (localState.state) {
      case "stopped": return t("settings.memoryLocalStopped");
      case "starting": return t("settings.memoryLocalStarting");
      case "running": return t("settings.memoryLocalRunning", { port: localState.port ?? 8888 });
      case "failed": return t("settings.memoryLocalFailed", { message: localState.message ?? "" });
      case "unavailable": return t("settings.memoryLocalUnavailable", { message: localState.message ?? "" });
      default: return "";
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

            {/* Local server section — always shown when backend=hindsight */}
            <SettingsRow
              title={t("settings.memoryLocalHeading")}
              description={
                localState.launchers.length === 0
                  ? t("settings.memoryLocalNotFound")
                  : localStatusLabel()
              }
            >
              {localState.launchers.length > 0 && (
                <>
                  {(localState.state === "stopped" || localState.state === "failed" || localState.state === "unavailable") && (
                    <button
                      type="button"
                      disabled={localBusy}
                      data-testid="hindsight-local-start"
                      onClick={() => void startLocal()}
                    >
                      {t("settings.memoryLocalStart")}
                    </button>
                  )}
                  {(localState.state === "starting" || localState.state === "running") && (
                    <button
                      type="button"
                      disabled={localBusy || localState.state === "starting"}
                      data-testid="hindsight-local-stop"
                      onClick={() => void stopLocal()}
                    >
                      {t("settings.memoryLocalStop")}
                    </button>
                  )}
                </>
              )}
            </SettingsRow>
            {localState.state === "unavailable" && (
              <SettingsRow description={t("settings.memoryLocalLlmNote")} title="">{null}</SettingsRow>
            )}
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
