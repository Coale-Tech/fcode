/**
 * Skills settings: user-created skills (create/edit/remove + market) and
 * installed omp Skillshare packages (read-only list from skills.json).
 *
 * G2: SkillMarketPanel mounted here; toggle via "Browse Market".
 * G4: SkillEditorSheet wired for New + Edit via userSkill IPC.
 * G23: Remove button for user-created skills (skillRemove IPC exists).
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { UserSkillRecord } from "@pi-desktop/shared";
import type { OmpInstalledSkillEntry } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Badge, Button } from "../ui";
import { SettingsCard } from "../../features/settings/primitives";
import { useAppStore } from "../../stores/app-store";
import {
  SkillEditorSheet,
  draftFromSkill,
  emptySkillDraft,
  type SkillDraft,
} from "./SkillEditorSheet";
import { SkillMarketPanel } from "./SkillMarketPanel";

export function OmpSkillsSection() {
  const { t } = useTranslation();
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);

  // Skillshare packages (omp install)
  const [packages, setPackages] = useState<OmpInstalledSkillEntry[] | null>(null);
  const [packagesError, setPackagesError] = useState(false);

  // User-created skills
  const [skills, setSkills] = useState<UserSkillRecord[] | null>(null);

  // View: main list, market browser, or editor overlay
  const [view, setView] = useState<"main" | "market">("main");
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<SkillDraft>(emptySkillDraft());
  const [editing, setEditing] = useState<UserSkillRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const loadPackages = useCallback(() => {
    setPackagesError(false);
    api
      .ompInstalledSkillsList()
      .then((r) => setPackages(r.skills))
      .catch(() => setPackagesError(true));
  }, []);

  const loadSkills = useCallback(() => {
    api
      .listUserSkills({ level: "global" })
      .then((r) => setSkills(r.skills))
      .catch(() => setSkills([]));
  }, []);

  useEffect(() => {
    loadPackages();
    loadSkills();
  }, [loadPackages, loadSkills]);

  const openNew = () => {
    setDraft(emptySkillDraft());
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = async (skill: UserSkillRecord) => {
    try {
      const res = await api.readUserSkill(skill.id, {
        level: skill.level ?? "global",
        projectPath: skill.projectPath,
      });
      if (!res?.skill) return;
      setDraft(draftFromSkill(res.skill, res.body ?? ""));
      setEditing(res.skill);
      setEditorOpen(true);
    } catch { /* ignore */ }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const input = {
        name: draft.name,
        description: draft.description,
        body: draft.body,
        enabled: draft.enabled,
        scope: draft.scope,
        level: (editing?.level ?? "global") as "global" | "project",
        projectPath: editing?.projectPath,
      };
      if (editing) {
        await api.updateUserSkill(editing.id, input);
      } else {
        await api.createUserSkill(input);
      }
      setEditorOpen(false);
      loadSkills();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const handleRemove = async (skill: UserSkillRecord) => {
    try {
      await api.removeUserSkill(skill.id, {
        level: skill.level ?? "global",
        projectPath: skill.projectPath,
      });
      loadSkills();
    } catch { /* ignore */ }
  };

  // Market panel view replaces the full section
  if (view === "market") {
    return (
      <SkillMarketPanel
        installedIds={(skills ?? []).map((s) => s.id)}
        onBack={() => setView("main")}
        onInstalled={() => {
          loadSkills();
          setView("main");
        }}
      />
    );
  }

  return (
    <>
      {editorOpen && (
        <SkillEditorSheet
          draft={draft}
          setDraft={setDraft}
          editing={editing}
          saving={saving}
          level={editing?.level ?? "global"}
          projectName={activeProjectPath ?? undefined}
          onClose={() => setEditorOpen(false)}
          onSave={() => void handleSave()}
          onReveal={
            editing
              ? () =>
                  void api
                    .revealUserSkill(editing.id, {
                      level: editing.level ?? "global",
                      projectPath: editing.projectPath,
                    })
                    .catch(() => undefined)
              : undefined
          }
        />
      )}

      {/* ── User skills ─────────────────────────────────────────────────── */}
      <SettingsCard title={t("settings.ompSkillsGroup", "Skills")}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "8px" }}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setView("market")}
          >
            {t("settings.ompSkillsBrowseMarket", "Browse Market")}
          </Button>
          <Button size="sm" onClick={openNew}>
            {t("settings.ompSkillsNew", "New Skill")}
          </Button>
        </div>
        {skills !== null && skills.length === 0 && (
          <p className="settings-row-desc">
            {t("settings.ompSkillsEmpty", "No skills yet. Create one or browse the market.")}
          </p>
        )}
        {skills !== null && skills.length > 0 && (
          <ul className="model-provider-list">
            {skills.map((s) => (
              <li key={`${s.level ?? "global"}-${s.id}`} className="model-provider-row">
                <div className="model-provider-name">
                  <span className="font-mono text-sm">{s.name || s.id}</span>
                  {s.level === "project" && (
                    <Badge tone="neutral">
                      {t("settings.ompSkillsScopeProject", "project")}
                    </Badge>
                  )}
                  {s.enabled === false && (
                    <Badge tone="warning">
                      {t("settings.ompSkillsDisabled", "disabled")}
                    </Badge>
                  )}
                </div>
                <div className="model-provider-actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void openEdit(s)}
                  >
                    {t("common.edit", "Edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleRemove(s)}
                  >
                    {t("common.remove", "Remove")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      {/* ── Skillshare packages (omp install) ───────────────────────────── */}
      {!packagesError && packages !== null && packages.length > 0 && (
        <SettingsCard title={t("settings.ompSkillPackagesGroup", "Installed Skill Packs")}>
          <ul className="model-provider-list">
            {packages.map((s) => (
              <li key={s.id} className="model-provider-row">
                <div className="model-provider-name">
                  <span className="font-mono text-sm">{s.id}</span>
                  {s.version && (
                    <Badge tone={s.stored ? "neutral" : "warning"}>
                      {s.version}
                    </Badge>
                  )}
                  {s.scope === "project" && (
                    <Badge tone="neutral">
                      {t("settings.ompSkillsScopeProject", "project")}
                    </Badge>
                  )}
                </div>
                <div className="model-provider-actions">
                  {s.version && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void api.ompSkillReveal(s.id, s.version!).catch(() => undefined)
                      }
                    >
                      {t("settings.ompSkillsReveal", "Reveal")}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </SettingsCard>
      )}
      {packagesError && (
        <p className="settings-row-desc">
          {t("settings.ompSkillsError", "Could not load skill packs.")}
        </p>
      )}
    </>
  );
}
