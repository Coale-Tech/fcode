import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BenchBootstrapResult,
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
      });
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
      setTimeout(() => void refresh(), 3000);
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
          {modelsLoading && (
            <SettingsRow title={t("settings.memoryMentalModelsLoading")}>{null}</SettingsRow>
          )}
          {modelsError && (
            <SettingsRow title={t("settings.memoryMentalModelsError")} detail={modelsError}>{null}</SettingsRow>
          )}
          {!modelsLoading && !modelsError && models !== null && models.length === 0 && (
            <SettingsRow title={t("settings.memoryMentalModelsEmpty")}>{null}</SettingsRow>
          )}
          {models?.map((m) => (
            <SettingsRow
              key={m.id}
              title={m.name}
              description={m.updatedAt ? t("settings.memoryMentalModelUpdated", { date: m.updatedAt.slice(0, 10) }) : undefined}
              detail={
                m.content ? (
                  <span className="memory-model-snippet">{m.content.slice(0, 120)}{m.content.length > 120 ? "…" : ""}</span>
                ) : undefined
              }
            >
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
            </SettingsRow>
          ))}
          {!modelsLoading && (
            <SettingsRow title={t("settings.memoryMentalModelsReload")}>
              <button
                type="button"
                disabled={modelsLoading}
                onClick={() => {
                  setModelsLoading(true);
                  setModelsError(null);
                  void api.hindsightListMentalModels()
                    .then((r) => setModels(r.models))
                    .catch((e: unknown) => setModelsError(e instanceof Error ? e.message : String(e)))
                    .finally(() => setModelsLoading(false));
                }}
              >
                {t("settings.memoryMentalModelsReload")}
              </button>
            </SettingsRow>
          )}
        </SettingsCard>
      )}

      {/* ── Bench bootstrap card ──────────────────────────────────────────── */}
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
          <SettingsRow
            title={bootstrapResult.ok ? t("settings.memoryBenchBootstrapOk") : t("settings.memoryBenchBootstrapFailed")}
            detail={
              bootstrapResult.ok
                ? `${bootstrapResult.benchPath} · ${bootstrapResult.apps.length} apps · ${bootstrapResult.sites.length} sites${bootstrapResult.message ? ` · ${bootstrapResult.message}` : ""}`
                : (bootstrapResult.message ?? "")
            }
          >{null}</SettingsRow>
        )}
        {bootstrapError && <div role="alert">{bootstrapError}</div>}
      </SettingsCard>
    </div>
  );
}
