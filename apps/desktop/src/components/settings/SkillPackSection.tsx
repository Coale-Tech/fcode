/**
 * Self-improving Frappe skills: lists what the agent changed in the local
 * Coale-Tech/frappeskills clone and lets the user send it upstream as a PR
 * (or throw it away). Nothing is pushed unless the user clicks "Open PR".
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OmpSkillPackStatus } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Badge, Button } from "../ui";
import { SettingsCard } from "../../features/settings/primitives";

export function SkillPackSection() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<OmpSkillPackStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = () =>
    api
      .ompSkillPackStatus()
      .then(setStatus)
      .catch((e: unknown) => setMessage(String((e as Error).message ?? e)));

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
      await load();
    }
  };

  const changed = status ? status.commits.length > 0 || status.dirty : false;

  return (
    <SettingsCard title={t("settings.skillPackTitle")}>
      <p className="settings-row-desc">{t("settings.skillPackDesc")}</p>
      {!status ? (
        <p className="settings-row-desc">{t("common.loading")}</p>
      ) : !status.cloned ? (
        <p className="settings-row-desc">{t("settings.skillPackNotCloned")}</p>
      ) : !changed ? (
        <p className="settings-row-desc">{t("settings.skillPackClean")}</p>
      ) : (
        <>
          <ul className="model-provider-list">
            {status.commits.map((c) => (
              <li key={c.sha} className="model-provider-row">
                <div className="model-provider-name">
                  <span className="font-mono text-sm">{c.sha}</span> {c.subject}
                </div>
              </li>
            ))}
            {status.dirty && (
              <li className="model-provider-row">
                <Badge tone="warning">{t("settings.skillPackUncommitted")}</Badge>
              </li>
            )}
          </ul>
          <p className="settings-row-desc font-mono">{status.files.join(", ")}</p>
          <div className="model-provider-actions">
            <Button size="sm" disabled={busy} onClick={() => void act(() => api.ompSkillPackOpenPr())}>
              {t("settings.skillPackOpenPr")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => { if (window.confirm(t("settings.skillPackDiscardConfirm"))) void act(() => api.ompSkillPackDiscard()); }}
            >
              {t("settings.skillPackDiscard")}
            </Button>
          </div>
        </>
      )}
      {message && <p className="settings-row-desc">{message}</p>}
    </SettingsCard>
  );
}
