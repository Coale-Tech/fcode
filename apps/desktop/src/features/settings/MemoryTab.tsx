import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BenchBootstrapResult,
  HindsightLocalState,
  HindsightMentalModelSummary,
  MemoryConfig,
  MemoryConfigView,
  OmpMemoryStatusResult,
} from "@pi-desktop/shared";
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

  // ── Mental models state (Hindsight only) ──────────────────────────────────
  const [models, setModels] = useState<HindsightMentalModelSummary[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  // ── Bench bootstrap state ─────────────────────────────────────────────────
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapResult, setBootstrapResult] = useState<BenchBootstrapResult | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  // ── Bank mission state (Hindsight only) ───────────────────────────────────
  const [missionSaving, setMissionSaving] = useState(false);
  const [missionResult, setMissionResult] = useState<string | null>(null);

  useEffect(() => {
    void api.memoryGetConfig().then((c) => {
      setConfig(c);
      setDraft({
        backend: c.backend,
        hindsightUrl: c.hindsightUrl,
        hindsightBank: c.hindsightBank,
        hindsightBankMission: c.hindsightBankMission,
        hindsightRetainMission: c.hindsightRetainMission,
        hindsightLocal: c.hindsightLocal,
      });
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

  // Load mental models when viewing the Hindsight config.
  useEffect(() => {
    if (config?.backend !== "hindsight") {
      setModels(null);
      setModelsError(null);
      return;
    }
    setModelsLoading(true);
    setModelsError(null);
    void api.hindsightListMentalModels()
      .then((r) => setModels(r.models))
      .catch((e: unknown) => setModelsError(e instanceof Error ? e.message : String(e)))
      .finally(() => setModelsLoading(false));
  }, [config]);

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

  const applyMission = async () => {
    setMissionSaving(true);
    setMissionResult(null);
    try {
      await api.hindsightSetBankMission(
        draft.hindsightBankMission ?? "",
        draft.hindsightRetainMission ?? "",
      );
      setMissionResult("ok");
    } catch (e) {
      setMissionResult(e instanceof Error ? e.message : String(e));
    } finally {
      setMissionSaving(false);
    }
  };

  const refreshModel = async (modelId: string) => {
    setRefreshingId(modelId);
    try {
      await api.hindsightRefreshMentalModel(modelId);
      // Reload list after a short delay so the server has a moment to start.
      setTimeout(() => {
        setModelsLoading(true);
        void api.hindsightListMentalModels()
          .then((r) => setModels(r.models))
          .catch((e: unknown) => setModelsError(e instanceof Error ? e.message : String(e)))
          .finally(() => setModelsLoading(false));
      }, 2000);
    } catch (e) {
      setModelsError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshingId(null);
    }
  };

  const runBootstrap = async () => {
    setBootstrapping(true);
    setBootstrapResult(null);
    setBootstrapError(null);
    try {
      setBootstrapResult(await api.benchBootstrapMemory());
    } catch (e) {
      setBootstrapError(e instanceof Error ? e.message : String(e));
    } finally {
      setBootstrapping(false);
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
      {/* ── Health card ──────────────────────────────────────────────────── */}
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

      {/* ── Config card ──────────────────────────────────────────────────── */}
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
            <SettingsRow
              title={t("settings.memoryHindsightBankMission")}
              description={t("settings.memoryHindsightBankMissionNote")}
            >
              <Input
                value={draft.hindsightBankMission ?? ""}
                onChange={(e) => setDraft({ ...draft, hindsightBankMission: e.target.value })}
              />
            </SettingsRow>
            <SettingsRow
              title={t("settings.memoryHindsightRetainMission")}
              description={t("settings.memoryHindsightRetainMissionNote")}
            >
              <Input
                value={draft.hindsightRetainMission ?? ""}
                onChange={(e) => setDraft({ ...draft, hindsightRetainMission: e.target.value })}
              />
            </SettingsRow>
            <SettingsRow
              title={t("settings.memoryHindsightApplyMission")}
              description={t("settings.memoryHindsightApplyMissionNote")}
            >
              <button
                type="button"
                disabled={missionSaving}
                onClick={() => void applyMission()}
                data-testid="apply-mission-btn"
              >
                {missionSaving
                  ? t("settings.memoryHindsightApplyMissionSaving")
                  : t("settings.memoryHindsightApplyMission")}
              </button>
            </SettingsRow>
            {missionResult && (
              <div role="status" data-testid="mission-result">
                {missionResult === "ok" ? t("settings.memoryHindsightMissionSaved") : missionResult}
              </div>
            )}

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

      {/* ── Mental models card (Hindsight only) ──────────────────────────── */}
      {config?.backend === "hindsight" && (
        <SettingsCard title={t("settings.memoryMentalModelsTitle")}>
          {modelsLoading && <p>{t("settings.memoryMentalModelsLoading")}</p>}
          {modelsError && <p role="alert">{modelsError}</p>}
          {!modelsLoading && !modelsError && models !== null && models.length === 0 && (
            <p>{t("settings.memoryMentalModelsEmpty")}</p>
          )}
          {models && models.length > 0 && (
            <ul>
              {models.map((m) => (
                <li key={m.id} data-testid="mental-model-row">
                  <span>{m.name}</span>
                  {m.updatedAt && <span>{t("settings.memoryMentalModelUpdated", { date: m.updatedAt })}</span>}
                  <button
                    type="button"
                    disabled={refreshingId === m.id}
                    onClick={() => void refreshModel(m.id)}
                    data-testid={`refresh-model-${m.id}`}
                  >
                    {refreshingId === m.id
                      ? t("settings.memoryMentalModelRefreshing")
                      : t("settings.memoryMentalModelRefresh")}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <SettingsRow title={t("settings.memoryMentalModelsReload")}>
            <button type="button" onClick={() => {
              setModelsLoading(true);
              void api.hindsightListMentalModels()
                .then((r) => setModels(r.models))
                .catch((e: unknown) => setModelsError(e instanceof Error ? e.message : String(e)))
                .finally(() => setModelsLoading(false));
            }}>
              {t("settings.memoryMentalModelsReload")}
            </button>
          </SettingsRow>
        </SettingsCard>
      )}

      {/* ── Bench bootstrap card ─────────────────────────────────────────── */}
      <SettingsCard title={t("settings.memoryBenchBootstrapTitle")}>
        <SettingsRow
          title={t("settings.memoryBenchBootstrap")}
          description={t("settings.memoryBenchBootstrapNote")}
        >
          <button
            type="button"
            disabled={bootstrapping}
            onClick={() => void runBootstrap()}
            data-testid="bench-bootstrap-btn"
          >
            {bootstrapping ? t("settings.memoryBenchBootstrapping") : t("settings.memoryBenchBootstrap")}
          </button>
        </SettingsRow>
        {bootstrapResult && (
          <div role="status" data-testid="bootstrap-result">
            {t("settings.memoryBenchBootstrapOk")}
          </div>
        )}
        {bootstrapError && <div role="alert">{bootstrapError}</div>}
      </SettingsCard>
    </div>
  );
}
