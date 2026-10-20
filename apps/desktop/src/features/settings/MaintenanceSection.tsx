/**
 * Maintenance features: Cleanse Workspace and Autoresearch Mode.
 *
 * compress   → not meaningful in desktop chat (requires file path args, batch CLI only)
 * cleanse    → wired: runs `omp cleanse` in workspace via CLI; /cleanse is TUI-only
 * judgment   → not meaningful (internal model-routing infrastructure, no user surface)
 * security-scan → setting only; security.enabled registry key → generic advanced page
 * autoresearch → wired: dispatches /autoresearch slash command to active session
 */
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../stores/app-store";
import { api } from "../../lib/api";
import { Button, Input, SettingsToggle } from "../../components/ui";
import { SettingsCard, SettingsRow } from "./primitives";

// ── Cleanse ──────────────────────────────────────────────────────────────────

function CleanseSubsection() {
  const { t } = useTranslation();
  const workspacePath = useAppStore((s) => s.workspace?.path ?? null);
  const [request, setRequest] = useState("");
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; output: string } | null>(null);

  const handleRun = useCallback(async () => {
    if (!workspacePath) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await api.ompCleanse(workspacePath, {
        request: request.trim() || undefined,
        all,
      });
      setResult(res);
    } catch (err) {
      setResult({ ok: false, output: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }, [workspacePath, request, all]);

  return (
    <SettingsCard title={t("settings.ompCleanseTitle")}>
      <SettingsRow
        title={t("settings.ompCleanseTitle")}
        description={t("settings.ompCleanseDesc")}
      >
        <SettingsToggle
          checked={all}
          label={t("settings.ompCleanseAll")}
          onChange={() => setAll((v) => !v)}
        />
      </SettingsRow>
      <SettingsRow title={t("settings.ompCleanseRequest")} description="">
        <Input
          value={request}
          placeholder={t("settings.ompCleanseRequestPlaceholder")}
          onChange={(e) => setRequest(e.target.value)}
          disabled={busy}
        />
      </SettingsRow>
      <SettingsRow title="" description="">
        <Button
          onClick={() => void handleRun()}
          disabled={busy || !workspacePath}
          variant="primary"
        >
          {busy ? t("settings.ompCleanseRunning") : t("settings.ompCleanseRun")}
        </Button>
      </SettingsRow>
      {result && (
        <SettingsRow title={t("settings.ompCleanseOutput")} description="">
          <pre
            style={{
              fontSize: "0.75rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              maxHeight: 240,
              overflowY: "auto",
              color: result.ok ? undefined : "var(--color-error, #e74c3c)",
            }}
          >
            {result.output || "(no output)"}
          </pre>
        </SettingsRow>
      )}
    </SettingsCard>
  );
}

// ── Autoresearch ──────────────────────────────────────────────────────────────

function AutoresearchSubsection() {
  const { t } = useTranslation();
  const [goal, setGoal] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const dispatch = useCallback(
    async (goalArg: string) => {
      setStatus(null);
      try {
        const res = await api.ompAutoresearch(goalArg || undefined);
        // agentInvoked: false = slash command ran; true = fell through to LLM (no active session)
        if (res?.agentInvoked === false) {
          setStatus(t("settings.ompAutoresearchSent"));
        } else {
          setStatus(t("settings.ompAutoresearchNoSession"));
        }
      } catch {
        setStatus(t("settings.ompAutoresearchNoSession"));
      }
    },
    [t],
  );

  return (
    <SettingsCard title={t("settings.ompAutoresearchTitle")}>
      <SettingsRow
        title={t("settings.ompAutoresearchTitle")}
        description={t("settings.ompAutoresearchDesc")}
      >
        <span />
      </SettingsRow>
      <SettingsRow title="" description="">
        <Input
          value={goal}
          placeholder={t("settings.ompAutoresearchGoalPlaceholder")}
          onChange={(e) => setGoal(e.target.value)}
        />
      </SettingsRow>
      <SettingsRow title="" description="">
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button variant="primary" onClick={() => void dispatch(goal)}>
            {t("settings.ompAutoresearchEnable")}
          </Button>
          <Button onClick={() => void dispatch("off")}>
            {t("settings.ompAutoresearchDisable")}
          </Button>
        </div>
      </SettingsRow>
      {status && (
        <SettingsRow title="" description="">
          <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>{status}</span>
        </SettingsRow>
      )}
    </SettingsCard>
  );
}

// ── Restart agent ─────────────────────────────────────────────────────────────

function RestartAgentSubsection() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const restart = useCallback(async () => {
    setBusy(true);
    try {
      await api.agentSidecarRestart();
      setStatus(t("settings.agentRestartDone"));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [t]);

  return (
    <SettingsCard title={t("settings.agentRestartTitle")}>
      <SettingsRow title={t("settings.agentRestartTitle")} description={t("settings.agentRestartDesc")}>
        <Button onClick={() => void restart()} disabled={busy}>
          {t("settings.agentRestartRun")}
        </Button>
      </SettingsRow>
      {status && (
        <SettingsRow title="" description="">
          <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>{status}</span>
        </SettingsRow>
      )}
    </SettingsCard>
  );
}

// ── Combined section ──────────────────────────────────────────────────────────

/** Maintenance actions: Cleanse Workspace, Autoresearch Mode and Restart agent. */
export function MaintenanceSection() {
  return (
    <>
      <CleanseSubsection />
      <AutoresearchSubsection />
      <RestartAgentSubsection />
    </>
  );
}
