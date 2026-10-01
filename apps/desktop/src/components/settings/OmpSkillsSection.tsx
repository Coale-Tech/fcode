/**
 * Installed omp Skillshare packages — reads ~/.omp/agent/skills.json + lock
 * from disk via the ompInstalledSkillsList IPC channel (no omp RPC needed).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OmpInstalledSkillEntry } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Badge, Button } from "../ui";

export function OmpSkillsSection() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<OmpInstalledSkillEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .ompInstalledSkillsList()
      .then((res) => setSkills(res.skills))
      .catch(() => setError(true));
  }, []);

  if (error) return null;
  if (!skills) {
    return (
      <section className="settings-card-block">
        <h2 className="settings-card-heading">{t("settings.ompSkillsGroup")}</h2>
        <p className="settings-row-desc">{t("common.loading")}</p>
      </section>
    );
  }
  if (skills.length === 0) {
    return (
      <section className="settings-card-block">
        <h2 className="settings-card-heading">{t("settings.ompSkillsGroup")}</h2>
        <p className="settings-row-desc">{t("settings.ompSkillsEmpty")}</p>
      </section>
    );
  }

  return (
    <section className="settings-card-block">
      <h2 className="settings-card-heading">{t("settings.ompSkillsGroup")}</h2>
      <ul className="model-provider-list">
        {skills.map((s) => (
          <li key={s.id} className="model-provider-row">
            <div className="model-provider-name">
              <span className="font-mono text-sm">{s.id}</span>
              {s.version && (
                <Badge tone={s.stored ? "neutral" : "warning"}>
                  {s.version}
                </Badge>
              )}
              {s.scope === "project" && (
                <Badge tone="neutral">{t("settings.ompSkillsScopeProject")}</Badge>
              )}
            </div>
            <div className="model-provider-actions">
              {s.version && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void api.ompSkillReveal(s.id, s.version!).catch(() => undefined)}
                >
                  {t("settings.ompSkillsReveal")}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
