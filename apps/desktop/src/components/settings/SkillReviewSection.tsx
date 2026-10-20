/**
 * Settings panel for the background skill review feature.
 * Loads and saves settings via the omp settings API (omp-settings.json).
 * Also shows pending proposals (approval gate) with Approve / Reject actions.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OmpSettingsValues, OmpSkillProposal } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Badge, Button, Input, Select, SettingsToggle } from "../ui";
import { SettingsCard, SettingsRow } from "../../features/settings/primitives";

export function SkillReviewSection() {
  const { t } = useTranslation();
  const [omp, setOmp] = useState<OmpSettingsValues>({});
  const [loaded, setLoaded] = useState(false);
  const [proposals, setProposals] = useState<OmpSkillProposal[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [propError, setPropError] = useState("");

  useEffect(() => {
    api
      .ompSettingsGet()
      .then((s) => { setOmp(s); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadProposals = useCallback(() => {
    api.ompSkillProposalList()
      .then((r) => setProposals(r.proposals))
      .catch(() => { /* proposals panel stays empty on error */ });
  }, []);

  useEffect(() => { loadProposals(); }, [loadProposals]);

  const save = (patch: OmpSettingsValues) => {
    const merged = { ...omp, ...patch };
    setOmp(merged);
    void api
      .ompSettingsSet(patch)
      .then((saved) => setOmp(saved))
      .catch(() => setOmp(omp));
  };

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setPropError("");
    try { await fn(); } catch (e) { setPropError(String((e as Error).message ?? e)); }
    finally { setBusy(null); loadProposals(); }
  };

  if (!loaded) return null;

  const requireApproval = omp["skills.review.requireApproval"] !== false;
  const passes = omp["skills.review.passes"] ?? "single";
  const harnessEnabled = omp["skills.harness.enabled"] === true;

  return (
    <SettingsCard title={t("settings.skillReviewTitle")}>
      <p className="settings-row-desc">{t("settings.skillReviewDesc")}</p>
      <SettingsRow
        title={t("settings.skillReviewEnabled")}
        description={t("settings.skillReviewEnabledDesc")}
      >
        <SettingsToggle
          checked={omp["skills.review.enabled"] === true}
          label={t("settings.skillReviewEnabled")}
          onChange={() =>
            save({ "skills.review.enabled": !(omp["skills.review.enabled"] === true) })
          }
        />
      </SettingsRow>
      <SettingsRow
        title={t("settings.skillReviewRequireApproval")}
        description={t("settings.skillReviewRequireApprovalDesc")}
      >
        <SettingsToggle
          checked={requireApproval}
          label={t("settings.skillReviewRequireApproval")}
          onChange={() => save({ "skills.review.requireApproval": !requireApproval })}
        />
      </SettingsRow>
      <SettingsRow
        title={t("settings.skillReviewInterval")}
        description={t("settings.skillReviewIntervalDesc")}
      >
        <Input
          type="number"
          min={1}
          max={100}
          value={String(omp["skills.review.intervalTurns"] ?? 10)}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (Number.isFinite(n) && n >= 1 && n <= 100) {
              save({ "skills.review.intervalTurns": n });
            }
          }}
        />
      </SettingsRow>
      <SettingsRow
        title={t("settings.skillReviewModel")}
        description={t("settings.skillReviewModelDesc")}
      >
        <Input
          type="text"
          value={omp["skills.review.model"] ?? ""}
          placeholder={t("settings.skillReviewModelPlaceholder")}
          onChange={(e) =>
            save({ "skills.review.model": e.target.value || undefined })
          }
        />
      </SettingsRow>
      <SettingsRow
        title={t("settings.skillReviewMaxInputTokens")}
        description={t("settings.skillReviewMaxInputTokensDesc")}
      >
        <Input
          type="number"
          min={1000}
          max={32000}
          value={String(omp["skills.review.maxInputTokens"] ?? 8000)}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (Number.isFinite(n) && n >= 1000 && n <= 32000) {
              save({ "skills.review.maxInputTokens": n });
            }
          }}
        />
      </SettingsRow>
      <SettingsRow
        title={t("settings.skillReviewPasses")}
        description={t("settings.skillReviewPassesDesc")}
      >
        <Select
          value={passes}
          onChange={(e) =>
            save({ "skills.review.passes": e.target.value as "single" | "split" })
          }
        >
          <option value="single">{t("settings.skillReviewPassesSingle")}</option>
          <option value="split">{t("settings.skillReviewPassesSplit")}</option>
        </Select>
      </SettingsRow>
      <SettingsRow
        title={t("settings.skillHarnessTitle")}
        description={t("settings.skillHarnessDesc")}
      >
        <SettingsToggle
          checked={harnessEnabled}
          label={t("settings.skillHarnessEnabled")}
          onChange={() => save({ "skills.harness.enabled": !harnessEnabled })}
        />
      </SettingsRow>
      {harnessEnabled && (
        <>
          <SettingsRow
            title={t("settings.skillHarnessK")}
            description={t("settings.skillHarnessKDesc")}
          >
            <Input
              type="number"
              min={1}
              max={4}
              value={String(omp["skills.harness.k"] ?? 1)}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n) && n >= 1 && n <= 4) {
                  save({ "skills.harness.k": n });
                }
              }}
            />
          </SettingsRow>
          <SettingsRow
            title={t("settings.skillHarnessMode")}
            description={t("settings.skillHarnessModeDesc")}
          >
            <Select
              value={omp["skills.harness.mode"] ?? "parallel"}
              onChange={(e) =>
                save({ "skills.harness.mode": e.target.value as "parallel" | "sequential" })
              }
            >
              <option value="parallel">{t("settings.skillHarnessModeParallel")}</option>
              <option value="sequential">{t("settings.skillHarnessModeSequential")}</option>
            </Select>
          </SettingsRow>
          <SettingsRow
            title={t("settings.skillHarnessModel")}
            description={t("settings.skillHarnessModelDesc")}
          >
            <Input
              type="text"
              value={omp["skills.harness.model"] ?? ""}
              placeholder={t("settings.skillHarnessModelPlaceholder")}
              onChange={(e) =>
                save({ "skills.harness.model": e.target.value || undefined })
              }
            />
          </SettingsRow>
        </>
      )}
      {proposals.length > 0 && (
        <>
          <p className="settings-row-desc" style={{ marginTop: 12, fontWeight: 600 }}>
            {t("settings.skillReviewPendingTitle")}
          </p>
          <ul className="model-provider-list">
            {proposals.map((p) => (
              <li key={p.id} style={{ flexDirection: "column", alignItems: "flex-start" }} className="model-provider-row">
                <div style={{ display: "flex", width: "100%", alignItems: "center", gap: "8px" }}>
                  <div className="model-provider-name" style={{ flex: 1 }}>
                    <span className="font-mono text-sm">{p.name}</span>
                    {" "}
                    <Badge tone="neutral">{t("settings.skillReviewPendingBadge")}</Badge>
                    <span className="settings-row-desc" style={{ marginLeft: 8 }}>
                      {new Date(p.stagedAt).toLocaleDateString()}
                    </span>
                    {p.description && (
                      <p className="settings-row-desc" style={{ marginTop: 2, marginBottom: 0 }}>
                        {p.description}
                      </p>
                    )}
                  </div>
                  <div className="model-provider-actions">
                    <Button
                      size="sm"
                      disabled={busy === p.id}
                      onClick={() => void act(p.id, () => api.ompSkillProposalApprove(p.id))}
                    >
                      {t("settings.skillReviewApprove")}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === p.id}
                      onClick={() => void act(p.id, () => api.ompSkillProposalReject(p.id))}
                    >
                      {t("settings.skillReviewReject")}
                    </Button>
                  </div>
                </div>
                {p.body && (
                  <details style={{ width: "100%", marginTop: "6px" }}>
                    <summary
                      className="settings-row-desc"
                      style={{ cursor: "pointer", userSelect: "none" }}
                    >
                      {t("settings.skillReviewBodyPreview", "Preview body")}
                    </summary>
                    <pre
                      style={{
                        marginTop: "4px",
                        padding: "8px",
                        background: "var(--color-surface-raised, rgba(0,0,0,.05))",
                        borderRadius: "4px",
                        fontSize: "0.78em",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        maxHeight: "320px",
                        overflow: "auto",
                      }}
                    >
                      {p.body}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
          {propError && <p className="settings-row-desc">{propError}</p>}
        </>
      )}
    </SettingsCard>
  );
}
