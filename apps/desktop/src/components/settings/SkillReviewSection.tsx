/**
 * Settings panel for the background skill review feature.
 * Loads and saves settings via the omp settings API (omp-settings.json).
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OmpSettingsValues } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Input, SettingsToggle } from "../ui";
import { SettingsCard, SettingsRow } from "../../features/settings/primitives";

export function SkillReviewSection() {
  const { t } = useTranslation();
  const [omp, setOmp] = useState<OmpSettingsValues>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .ompSettingsGet()
      .then((s) => { setOmp(s); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (patch: OmpSettingsValues) => {
    const merged = { ...omp, ...patch };
    setOmp(merged);
    void api
      .ompSettingsSet(patch)
      .then((saved) => setOmp(saved))
      .catch(() => setOmp(omp));
  };

  if (!loaded) return null;

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
    </SettingsCard>
  );
}
