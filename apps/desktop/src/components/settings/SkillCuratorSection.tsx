/**
 * Compact panel showing agent-created skill usage (frappeskills branch + managed-skills).
 * Lets the user pin skills (exclude from curation) or restore archived ones.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OmpSkillCuratorEntry } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Badge, Button } from "../ui";
import { SettingsCard } from "../../features/settings/primitives";

const STATUS_TONE: Record<string, "neutral" | "warning" | "error" | "success"> = {
  active: "success",
  stale: "warning",
  archived: "error",
  pinned: "neutral",
};

export function SkillCuratorSection() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<OmpSkillCuratorEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // skill name currently in flight
  const [error, setError] = useState("");

  const load = () =>
    api
      .ompSkillCuratorStatus()
      .then((r) => setSkills(r.skills))
      .catch((e: unknown) => setError(String((e as Error).message ?? e)));

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setError("");
    try { await fn(); } catch (e) { setError(String((e as Error).message ?? e)); }
    finally { setBusy(null); await load(); }
  };

  return (
    <SettingsCard title={t("settings.skillCuratorTitle")}>
      <p className="settings-row-desc">{t("settings.skillCuratorDesc")}</p>
      {skills.length === 0 ? (
        <p className="settings-row-desc">{t("settings.skillCuratorNoSkills")}</p>
      ) : (
        <ul className="model-provider-list">
          {skills.map((s) => (
            <li key={s.name} className="model-provider-row">
              <div className="model-provider-name" style={{ flex: 1 }}>
                <span className="font-mono text-sm">{s.name}</span>
                {" "}
                <Badge tone={STATUS_TONE[s.status] ?? "neutral"}>
                  {t(`settings.skillCuratorStatus_${s.status}`)}
                </Badge>
                {s.uses > 0 && (
                  <span className="settings-row-desc" style={{ marginLeft: 8 }}>
                    {s.uses}× · {s.lastUsed ? new Date(s.lastUsed).toLocaleDateString() : "—"}
                  </span>
                )}
              </div>
              <div className="model-provider-actions">
                {s.status === "archived" && (
                  <Button
                    size="sm"
                    disabled={busy === s.name}
                    onClick={() => void act(s.name, () => api.ompSkillCuratorRestore(s.name))}
                  >
                    {t("settings.skillCuratorRestore")}
                  </Button>
                )}
                {s.status !== "archived" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy === s.name}
                    onClick={() =>
                      void act(s.name, () =>
                        api.ompSkillCuratorPin(s.name, s.status !== "pinned"),
                      )
                    }
                  >
                    {s.status === "pinned"
                      ? t("settings.skillCuratorUnpin")
                      : t("settings.skillCuratorPin")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="settings-row-desc">{error}</p>}
    </SettingsCard>
  );
}
