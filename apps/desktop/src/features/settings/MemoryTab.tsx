import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BenchBootstrapResult,
  HindsightLocalState,
  HindsightMentalModelSummary,
  MemoryConfig,
  MemoryConfigView,
  OmpMemoryStatusResult,
  OmpSettingsValues,
} from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { Input, SettingsToggle } from "../../components/ui";
import { SettingsMenuSelect } from "../../components/settings/SettingsMenuSelect";
import { SettingsCard, SettingsRow } from "./primitives";
import { OmpSettingsSections } from "./omp-settings-sections";

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
  const [configLoading, setConfigLoading] = useState(true);
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
  // ── omp settings state (Advanced sections) ────────────────────────────────
  const [omp, setOmp] = useState<OmpSettingsValues>({});
  // ── User profile state (I.2) ──────────────────────────────────────────────
  const [profile, setProfile] = useState("");
  const [profileDraft, setProfileDraft] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const USER_PROFILE_MAX = 1024;



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
    }).finally(() => setConfigLoading(false));
    void api.ompSettingsGet().then(setOmp).catch(() => undefined);
    void api.ompUserProfileGet().then((r) => { setProfile(r.text); setProfileDraft(r.text); }).catch(() => undefined);
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

  const saveOmp = useCallback(
    async (patch: OmpSettingsValues) => {
      const merged = { ...omp, ...patch };
      setOmp(merged);
      try {
        const saved = await api.ompSettingsSet(patch);
        setOmp(saved);
      } catch { /* keep optimistic update */ }
    },
    [omp],
  );

  const saveProfile = async () => {
    setProfileSaving(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      const result = await api.ompUserProfileSet(profileDraft);
      if (result.ok) {
        setProfile(profileDraft);
        setProfileSaved(true);
        setTimeout(() => setProfileSaved(false), 3_000);
      } else {
        setProfileError(result.error ?? "Save failed");
      }
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : String(e));
    } finally {
      setProfileSaving(false);
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
        {configLoading ? (
          <p className="settings-row-desc">{t("common.loading")}</p>
        ) : (
          <>
          <SettingsRow title={t("settings.memoryBackend")}>
          <SettingsMenuSelect
            label={t("settings.memoryBackend")}
            value={draft.backend}
            options={[
              { id: "mnemopi", label: t("settings.memoryBackendMnemopi") },
              { id: "hindsight", label: t("settings.memoryBackendHindsight") },
              { id: "sharpshooter", label: t("settings.memoryBackendSharpshooter") },
              { id: "local", label: t("settings.memoryBackendLocal") },
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
          </>
        )}
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

      {/* ── User profile card (I.2) ──────────────────────────────────────── */}
      <SettingsCard title={t("settings.memoryUserProfileTitle")}>
        <SettingsRow
          title={t("settings.memoryUserProfileLabel")}
          description={t("settings.memoryUserProfileDesc")}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%" }}>
            <div style={{ position: "relative" }}>
              <textarea
                data-testid="user-profile-textarea"
                value={profileDraft}
                maxLength={USER_PROFILE_MAX}
                rows={6}
                style={{ width: "100%", resize: "vertical", boxSizing: "border-box" }}
                onChange={(e) => {
                  setProfileDraft(e.target.value.slice(0, USER_PROFILE_MAX));
                  setProfileSaved(false);
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
              <span
                data-testid="user-profile-counter"
                style={{ fontSize: "0.8em", opacity: 0.6 }}
              >
                {t("settings.memoryUserProfileCounter", { count: profileDraft.length, max: USER_PROFILE_MAX })}
              </span>
              <button
                type="button"
                data-testid="user-profile-save"
                disabled={profileSaving || profileDraft === profile}
                onClick={() => void saveProfile()}
              >
                {profileSaving
                  ? t("settings.memoryUserProfileSaving")
                  : t("settings.memoryUserProfileSave")}
              </button>
            </div>
            {profileSaved && (
              <div role="status" data-testid="user-profile-saved">
                {t("settings.memoryUserProfileSaved")}
              </div>
            )}
            {profileError && (
              <div role="alert" data-testid="user-profile-error">
                {profileError}
              </div>
            )}
          </div>
        </SettingsRow>
      </SettingsCard>

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

      {/* ── Mnemopi Advanced ─────────────────────────────────────────────── */}
      {config?.backend === "mnemopi" && (
        <section className="settings-card-block">
          <details>
            <summary className="settings-card-heading" style={{ cursor: "pointer", userSelect: "none" }}>
              {t("settings.memoryAdvancedSection")}
            </summary>
            <div className="settings-panel">
              <SettingsRow title={t("settings.memoryMnemopiScoping")} description={t("settings.memoryMnemopiScopingDesc")}>
                <SettingsMenuSelect
                  label={t("settings.memoryMnemopiScoping")}
                  value={omp["mnemopi.scoping"] ?? "per-project"}
                  onChange={(v) => void saveOmp({ "mnemopi.scoping": v as OmpSettingsValues["mnemopi.scoping"] })}
                  options={[
                    { id: "global", label: t("settings.memoryMnemopiScopingGlobal") },
                    { id: "per-project", label: t("settings.memoryMnemopiScopingPerProject") },
                    { id: "per-project-tagged", label: t("settings.memoryMnemopiScopingPerProjectTagged") },
                  ]}
                />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryMnemopiAutoRecall")} description={t("settings.memoryMnemopiAutoRecallDesc")}>
                <SettingsToggle checked={omp["mnemopi.autoRecall"] !== false} label={t("settings.memoryMnemopiAutoRecall")} onChange={() => void saveOmp({ "mnemopi.autoRecall": !(omp["mnemopi.autoRecall"] !== false) })} />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryMnemopiAutoRetain")} description={t("settings.memoryMnemopiAutoRetainDesc")}>
                <SettingsToggle checked={omp["mnemopi.autoRetain"] !== false} label={t("settings.memoryMnemopiAutoRetain")} onChange={() => void saveOmp({ "mnemopi.autoRetain": !(omp["mnemopi.autoRetain"] !== false) })} />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryMnemopiPolyphonicRecall")} description={t("settings.memoryMnemopiPolyphonicRecallDesc")}>
                <SettingsToggle checked={omp["mnemopi.polyphonicRecall"] === true} label={t("settings.memoryMnemopiPolyphonicRecall")} onChange={() => void saveOmp({ "mnemopi.polyphonicRecall": !(omp["mnemopi.polyphonicRecall"] === true) })} />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryMnemopiEnhancedRecall")} description={t("settings.memoryMnemopiEnhancedRecallDesc")}>
                <SettingsToggle checked={omp["mnemopi.enhancedRecall"] === true} label={t("settings.memoryMnemopiEnhancedRecall")} onChange={() => void saveOmp({ "mnemopi.enhancedRecall": !(omp["mnemopi.enhancedRecall"] === true) })} />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryMnemopiProactiveLinking")} description={t("settings.memoryMnemopiProactiveLinkingDesc")}>
                <SettingsToggle checked={omp["mnemopi.proactiveLinking"] === true} label={t("settings.memoryMnemopiProactiveLinking")} onChange={() => void saveOmp({ "mnemopi.proactiveLinking": !(omp["mnemopi.proactiveLinking"] === true) })} />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryMnemopiNoEmbeddings")} description={t("settings.memoryMnemopiNoEmbeddingsDesc")}>
                <SettingsToggle checked={omp["mnemopi.noEmbeddings"] === true} label={t("settings.memoryMnemopiNoEmbeddings")} onChange={() => void saveOmp({ "mnemopi.noEmbeddings": !(omp["mnemopi.noEmbeddings"] === true) })} />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryMnemopiEmbeddingVariant")} description={t("settings.memoryMnemopiEmbeddingVariantDesc")}>
                <SettingsMenuSelect
                  label={t("settings.memoryMnemopiEmbeddingVariant")}
                  value={omp["mnemopi.embeddingVariant"] ?? "en"}
                  onChange={(v) => void saveOmp({ "mnemopi.embeddingVariant": v as "en" | "multilingual" })}
                  options={[
                    { id: "en", label: t("settings.memoryMnemopiEmbeddingVariantEn") },
                    { id: "multilingual", label: t("settings.memoryMnemopiEmbeddingVariantMultilingual") },
                  ]}
                />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryMnemopiEmbeddingModel")} description={t("settings.memoryMnemopiEmbeddingModelDesc")}>
                <Input
                  value={omp["mnemopi.embeddingModel"] ?? ""}
                  placeholder=""
                  onChange={(e) => setOmp((prev) => ({ ...prev, "mnemopi.embeddingModel": e.target.value }))}
                  onBlur={(e) => void saveOmp({ "mnemopi.embeddingModel": e.target.value || undefined })}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryMnemopiEmbeddingApiUrl")} description={t("settings.memoryMnemopiEmbeddingApiUrlDesc")}>
                <Input
                  value={omp["mnemopi.embeddingApiUrl"] ?? ""}
                  placeholder=""
                  onChange={(e) => setOmp((prev) => ({ ...prev, "mnemopi.embeddingApiUrl": e.target.value }))}
                  onBlur={(e) => void saveOmp({ "mnemopi.embeddingApiUrl": e.target.value || undefined })}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryMnemopiLlmBaseUrl")} description={t("settings.memoryMnemopiLlmBaseUrlDesc")}>
                <Input
                  value={omp["mnemopi.llmBaseUrl"] ?? ""}
                  placeholder=""
                  onChange={(e) => setOmp((prev) => ({ ...prev, "mnemopi.llmBaseUrl": e.target.value }))}
                  onBlur={(e) => void saveOmp({ "mnemopi.llmBaseUrl": e.target.value || undefined })}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryMnemopiLlmModel")} description={t("settings.memoryMnemopiLlmModelDesc")}>
                <Input
                  value={omp["mnemopi.llmModel"] ?? ""}
                  placeholder=""
                  onChange={(e) => setOmp((prev) => ({ ...prev, "mnemopi.llmModel": e.target.value }))}
                  onBlur={(e) => void saveOmp({ "mnemopi.llmModel": e.target.value || undefined })}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryMnemopiDbPath")} description={t("settings.memoryMnemopiDbPathDesc")}>
                <Input
                  value={omp["mnemopi.dbPath"] ?? ""}
                  placeholder=""
                  onChange={(e) => setOmp((prev) => ({ ...prev, "mnemopi.dbPath": e.target.value }))}
                  onBlur={(e) => void saveOmp({ "mnemopi.dbPath": e.target.value || undefined })}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryMnemopiBank")} description={t("settings.memoryMnemopiBankDesc")}>
                <Input
                  value={omp["mnemopi.bank"] ?? ""}
                  placeholder=""
                  onChange={(e) => setOmp((prev) => ({ ...prev, "mnemopi.bank": e.target.value }))}
                  onBlur={(e) => void saveOmp({ "mnemopi.bank": e.target.value || undefined })}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryMnemopiRetainEveryNTurns")} description={t("settings.memoryMnemopiRetainEveryNTurnsDesc")}>
                <Input
                  type="number"
                  value={String(omp["mnemopi.retainEveryNTurns"] ?? 4)}
                  onChange={(e) => setOmp((prev) => ({ ...prev, "mnemopi.retainEveryNTurns": Number(e.target.value) }))}
                  onBlur={(e) => void saveOmp({ "mnemopi.retainEveryNTurns": Number(e.target.value) })}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryMnemopiRecallLimit")} description={t("settings.memoryMnemopiRecallLimitDesc")}>
                <Input
                  type="number"
                  value={String(omp["mnemopi.recallLimit"] ?? 8)}
                  onChange={(e) => setOmp((prev) => ({ ...prev, "mnemopi.recallLimit": Number(e.target.value) }))}
                  onBlur={(e) => void saveOmp({ "mnemopi.recallLimit": Number(e.target.value) })}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryMnemopiRecallContextTurns")} description={t("settings.memoryMnemopiRecallContextTurnsDesc")}>
                <Input
                  type="number"
                  value={String(omp["mnemopi.recallContextTurns"] ?? 3)}
                  onChange={(e) => setOmp((prev) => ({ ...prev, "mnemopi.recallContextTurns": Number(e.target.value) }))}
                  onBlur={(e) => void saveOmp({ "mnemopi.recallContextTurns": Number(e.target.value) })}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryMnemopiRecallMaxQueryChars")} description={t("settings.memoryMnemopiRecallMaxQueryCharsDesc")}>
                <Input
                  type="number"
                  value={String(omp["mnemopi.recallMaxQueryChars"] ?? 4000)}
                  onChange={(e) => setOmp((prev) => ({ ...prev, "mnemopi.recallMaxQueryChars": Number(e.target.value) }))}
                  onBlur={(e) => void saveOmp({ "mnemopi.recallMaxQueryChars": Number(e.target.value) })}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryMnemopiInjectionTokenLimit")} description={t("settings.memoryMnemopiInjectionTokenLimitDesc")}>
                <Input
                  type="number"
                  value={String(omp["mnemopi.injectionTokenLimit"] ?? 5000)}
                  onChange={(e) => setOmp((prev) => ({ ...prev, "mnemopi.injectionTokenLimit": Number(e.target.value) }))}
                  onBlur={(e) => void saveOmp({ "mnemopi.injectionTokenLimit": Number(e.target.value) })}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryMnemopiDebug")} description={t("settings.memoryMnemopiDebugDesc")}>
                <SettingsToggle checked={omp["mnemopi.debug"] === true} label={t("settings.memoryMnemopiDebug")} onChange={() => void saveOmp({ "mnemopi.debug": !(omp["mnemopi.debug"] === true) })} />
              </SettingsRow>
            </div>
          </details>
        </section>
      )}

      {/* ── Hindsight Advanced ───────────────────────────────────────────── */}
      {config?.backend === "hindsight" && (
        <section className="settings-card-block">
          <details>
            <summary className="settings-card-heading" style={{ cursor: "pointer", userSelect: "none" }}>
              {t("settings.memoryAdvancedSection")}
            </summary>
            <div className="settings-panel">
              <SettingsRow title={t("settings.memoryHindsightScoping")} description={t("settings.memoryHindsightScopingDesc")}>
                <SettingsMenuSelect
                  label={t("settings.memoryHindsightScoping")}
                  value={omp["hindsight.scoping"] ?? "per-project-tagged"}
                  onChange={(v) => void saveOmp({ "hindsight.scoping": v as OmpSettingsValues["hindsight.scoping"] })}
                  options={[
                    { id: "global", label: t("settings.memoryHindsightScopingGlobal") },
                    { id: "per-project", label: t("settings.memoryHindsightScopingPerProject") },
                    { id: "per-project-tagged", label: t("settings.memoryHindsightScopingPerProjectTagged") },
                  ]}
                />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryHindsightBankIdPrefix")} description={t("settings.memoryHindsightBankIdPrefixDesc")}>
                <Input
                  value={omp["hindsight.bankIdPrefix"] ?? ""}
                  placeholder=""
                  onChange={(e) => setOmp((prev) => ({ ...prev, "hindsight.bankIdPrefix": e.target.value }))}
                  onBlur={(e) => void saveOmp({ "hindsight.bankIdPrefix": e.target.value || undefined })}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryHindsightRetainEveryNTurns")} description={t("settings.memoryHindsightRetainEveryNTurnsDesc")}>
                <Input type="number" value={String(omp["hindsight.retainEveryNTurns"] ?? 3)} onChange={(e) => setOmp((prev) => ({ ...prev, "hindsight.retainEveryNTurns": Number(e.target.value) }))} onBlur={(e) => void saveOmp({ "hindsight.retainEveryNTurns": Number(e.target.value) })} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryHindsightRetainOverlapTurns")} description={t("settings.memoryHindsightRetainOverlapTurnsDesc")}>
                <Input type="number" value={String(omp["hindsight.retainOverlapTurns"] ?? 2)} onChange={(e) => setOmp((prev) => ({ ...prev, "hindsight.retainOverlapTurns": Number(e.target.value) }))} onBlur={(e) => void saveOmp({ "hindsight.retainOverlapTurns": Number(e.target.value) })} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryHindsightRecallBudget")} description={t("settings.memoryHindsightRecallBudgetDesc")}>
                <SettingsMenuSelect
                  label={t("settings.memoryHindsightRecallBudget")}
                  value={omp["hindsight.recallBudget"] ?? "mid"}
                  onChange={(v) => void saveOmp({ "hindsight.recallBudget": v as "low" | "mid" | "high" })}
                  options={[
                    { id: "low", label: t("settings.memoryHindsightRecallBudgetLow") },
                    { id: "mid", label: t("settings.memoryHindsightRecallBudgetMid") },
                    { id: "high", label: t("settings.memoryHindsightRecallBudgetHigh") },
                  ]}
                />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryHindsightRecallMaxTokens")} description={t("settings.memoryHindsightRecallMaxTokensDesc")}>
                <Input type="number" value={String(omp["hindsight.recallMaxTokens"] ?? 1024)} onChange={(e) => setOmp((prev) => ({ ...prev, "hindsight.recallMaxTokens": Number(e.target.value) }))} onBlur={(e) => void saveOmp({ "hindsight.recallMaxTokens": Number(e.target.value) })} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryHindsightRecallContextTurns")} description={t("settings.memoryHindsightRecallContextTurnsDesc")}>
                <Input type="number" value={String(omp["hindsight.recallContextTurns"] ?? 1)} onChange={(e) => setOmp((prev) => ({ ...prev, "hindsight.recallContextTurns": Number(e.target.value) }))} onBlur={(e) => void saveOmp({ "hindsight.recallContextTurns": Number(e.target.value) })} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryHindsightRecallMaxQueryChars")} description={t("settings.memoryHindsightRecallMaxQueryCharsDesc")}>
                <Input type="number" value={String(omp["hindsight.recallMaxQueryChars"] ?? 800)} onChange={(e) => setOmp((prev) => ({ ...prev, "hindsight.recallMaxQueryChars": Number(e.target.value) }))} onBlur={(e) => void saveOmp({ "hindsight.recallMaxQueryChars": Number(e.target.value) })} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryHindsightMentalModelMaxRenderChars")} description={t("settings.memoryHindsightMentalModelMaxRenderCharsDesc")}>
                <Input type="number" value={String(omp["hindsight.mentalModelMaxRenderChars"] ?? 16000)} onChange={(e) => setOmp((prev) => ({ ...prev, "hindsight.mentalModelMaxRenderChars": Number(e.target.value) }))} onBlur={(e) => void saveOmp({ "hindsight.mentalModelMaxRenderChars": Number(e.target.value) })} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryHindsightDebug")} description={t("settings.memoryHindsightDebugDesc")}>
                <SettingsToggle checked={omp["hindsight.debug"] === true} label={t("settings.memoryHindsightDebug")} onChange={() => void saveOmp({ "hindsight.debug": !(omp["hindsight.debug"] === true) })} />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryHindsightRequestTimeoutMs")} description={t("settings.memoryHindsightRequestTimeoutMsDesc")}>
                <Input type="number" value={String(omp["hindsight.requestTimeoutMs"] ?? 30000)} onChange={(e) => setOmp((prev) => ({ ...prev, "hindsight.requestTimeoutMs": Number(e.target.value) }))} onBlur={(e) => void saveOmp({ "hindsight.requestTimeoutMs": Number(e.target.value) })} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryHindsightReflectTimeoutMs")} description={t("settings.memoryHindsightReflectTimeoutMsDesc")}>
                <Input type="number" value={String(omp["hindsight.reflectTimeoutMs"] ?? 120000)} onChange={(e) => setOmp((prev) => ({ ...prev, "hindsight.reflectTimeoutMs": Number(e.target.value) }))} onBlur={(e) => void saveOmp({ "hindsight.reflectTimeoutMs": Number(e.target.value) })} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryHindsightRecallTimeoutMs")} description={t("settings.memoryHindsightRecallTimeoutMsDesc")}>
                <Input type="number" value={String(omp["hindsight.recallTimeoutMs"] ?? 30000)} onChange={(e) => setOmp((prev) => ({ ...prev, "hindsight.recallTimeoutMs": Number(e.target.value) }))} onBlur={(e) => void saveOmp({ "hindsight.recallTimeoutMs": Number(e.target.value) })} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryHindsightRetainTimeoutMs")} description={t("settings.memoryHindsightRetainTimeoutMsDesc")}>
                <Input type="number" value={String(omp["hindsight.retainTimeoutMs"] ?? 60000)} onChange={(e) => setOmp((prev) => ({ ...prev, "hindsight.retainTimeoutMs": Number(e.target.value) }))} onBlur={(e) => void saveOmp({ "hindsight.retainTimeoutMs": Number(e.target.value) })} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </SettingsRow>
            </div>
          </details>
        </section>
      )}

      {/* ── Sharpshooter Advanced ────────────────────────────────────────── */}
      {config?.backend === "sharpshooter" && (
        <section className="settings-card-block">
          <details>
            <summary className="settings-card-heading" style={{ cursor: "pointer", userSelect: "none" }}>
              {t("settings.memoryAdvancedSection")}
            </summary>
            <div className="settings-panel">
              <SettingsRow title={t("settings.memorySharpshooterModel")} description={t("settings.memorySharpshooterModelDesc")}>
                <Input
                  value={omp["sharpshooter.model"] ?? ""}
                  placeholder=""
                  onChange={(e) => setOmp((prev) => ({ ...prev, "sharpshooter.model": e.target.value }))}
                  onBlur={(e) => void saveOmp({ "sharpshooter.model": e.target.value || undefined })}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                />
              </SettingsRow>
              <SettingsRow title={t("settings.memorySharpshooterIntervalMinutes")} description={t("settings.memorySharpshooterIntervalMinutesDesc")}>
                <Input type="number" value={String(omp["sharpshooter.intervalMinutes"] ?? 5)} onChange={(e) => setOmp((prev) => ({ ...prev, "sharpshooter.intervalMinutes": Number(e.target.value) }))} onBlur={(e) => void saveOmp({ "sharpshooter.intervalMinutes": Number(e.target.value) })} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </SettingsRow>
              <SettingsRow title={t("settings.memorySharpshooterInjectionTokenLimit")} description={t("settings.memorySharpshooterInjectionTokenLimitDesc")}>
                <Input type="number" value={String(omp["sharpshooter.injectionTokenLimit"] ?? 15000)} onChange={(e) => setOmp((prev) => ({ ...prev, "sharpshooter.injectionTokenLimit": Number(e.target.value) }))} onBlur={(e) => void saveOmp({ "sharpshooter.injectionTokenLimit": Number(e.target.value) })} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </SettingsRow>
            </div>
          </details>
        </section>
      )}

      {/* ── Local pipeline Advanced ──────────────────────────────────────── */}
      {config?.backend === "local" && (
        <section className="settings-card-block">
          <details>
            <summary className="settings-card-heading" style={{ cursor: "pointer", userSelect: "none" }}>
              {t("settings.memoryAdvancedSection")}
            </summary>
            <div className="settings-panel">
              <SettingsRow title={t("settings.memoryLocalPipelineMaxRolloutsPerStartup")} description={t("settings.memoryLocalPipelineMaxRolloutsPerStartupDesc")}>
                <Input type="number" value={String(omp["memories.maxRolloutsPerStartup"] ?? 64)} onChange={(e) => setOmp((prev) => ({ ...prev, "memories.maxRolloutsPerStartup": Number(e.target.value) }))} onBlur={(e) => void saveOmp({ "memories.maxRolloutsPerStartup": Number(e.target.value) })} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryLocalPipelineMaxRolloutAgeDays")} description={t("settings.memoryLocalPipelineMaxRolloutAgeDaysDesc")}>
                <Input type="number" value={String(omp["memories.maxRolloutAgeDays"] ?? 30)} onChange={(e) => setOmp((prev) => ({ ...prev, "memories.maxRolloutAgeDays": Number(e.target.value) }))} onBlur={(e) => void saveOmp({ "memories.maxRolloutAgeDays": Number(e.target.value) })} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryLocalPipelineMinRolloutIdleHours")} description={t("settings.memoryLocalPipelineMinRolloutIdleHoursDesc")}>
                <Input type="number" value={String(omp["memories.minRolloutIdleHours"] ?? 12)} onChange={(e) => setOmp((prev) => ({ ...prev, "memories.minRolloutIdleHours": Number(e.target.value) }))} onBlur={(e) => void saveOmp({ "memories.minRolloutIdleHours": Number(e.target.value) })} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </SettingsRow>
              <SettingsRow title={t("settings.memoryLocalPipelineSummaryInjectionTokenLimit")} description={t("settings.memoryLocalPipelineSummaryInjectionTokenLimitDesc")}>
                <Input type="number" value={String(omp["memories.summaryInjectionTokenLimit"] ?? 5000)} onChange={(e) => setOmp((prev) => ({ ...prev, "memories.summaryInjectionTokenLimit": Number(e.target.value) }))} onBlur={(e) => void saveOmp({ "memories.summaryInjectionTokenLimit": Number(e.target.value) })} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </SettingsRow>
            </div>
          </details>
        </section>
      )}
      <OmpSettingsSections part="memory" />
    </div>
  );
}
