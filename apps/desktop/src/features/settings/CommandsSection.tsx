/**
 * Settings section for omp user slash-command authoring.
 * Lists commands from ~/.omp/agent/commands/ and optionally .omp/commands/ in the project.
 * Supports create, edit, and delete. The live list comes from ompCommandsList (RPC)
 * while CRUD writes go through ompCommandsCreate/Edit/Delete (filesystem).
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OmpSlashCommand } from "@pi-desktop/shared";
import { useAppStore } from "../../stores/app-store";
import { api } from "../../lib/api";
import { Badge, Button, Input } from "../../components/ui";
import { SettingsCard } from "./primitives";
import { DestructiveActionDialog } from "../../components/DestructiveActionDialog";

type CommandFormState = { name: string; content: string; scope: "user" | "project" };
const DEFAULT_FORM: CommandFormState = { name: "", content: "# My command\n\nDescribe what this command does.\n", scope: "user" };

type FormMode = { mode: "create" } | { mode: "edit"; cmd: OmpSlashCommand };

/** Returns whether a command is user-authored (i.e. in ~/.omp/agent/commands or .omp/commands). */
function isUserCommand(cmd: OmpSlashCommand): boolean {
  return cmd.level === "user" || cmd.level === "project";
}

export function CommandsSection() {
  const { t } = useTranslation();
  const projectPath = useAppStore((s) => s.workspace?.path ?? null);
  const [commands, setCommands] = useState<OmpSlashCommand[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>({ mode: "create" });
  const [form, setForm] = useState<CommandFormState>(DEFAULT_FORM);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OmpSlashCommand | null>(null);

  const load = useCallback(() => {
    api.ompCommandsList()
      .then((r) => setCommands(r.commands))
      .catch(() => setCommands([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setForm(DEFAULT_FORM);
    setFormMode({ mode: "create" });
    setMsg(null);
    setFormOpen(true);
  };

  const openEdit = async (cmd: OmpSlashCommand) => {
    const scope = cmd.level === "project" ? "project" : "user";
    const { content } = await api.ompCommandRead(cmd.name, scope, scope === "project" ? projectPath ?? undefined : undefined)
      .catch(() => ({ content: cmd.description ?? "" }));
    setForm({ name: cmd.name, content, scope });
    setFormMode({ mode: "edit", cmd });
    setMsg(null);
    setFormOpen(true);
  };

  const handleSubmit = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      let res;
      if (formMode.mode === "create") {
        res = await api.ompCommandsCreate(form.name, form.content, form.scope, form.scope === "project" ? projectPath ?? undefined : undefined);
      } else {
        const cmd = formMode.cmd;
        const scope = cmd.level === "project" ? "project" : "user";
        res = await api.ompCommandsEdit(cmd.name, form.content, scope, scope === "project" ? projectPath ?? undefined : undefined);
      }
      if (res.ok) {
        setFormOpen(false);
        load();
      } else {
        setMsg({ ok: false, text: res.error ?? t("settings.ompCommandSaveError") });
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("settings.ompCommandSaveError") });
    } finally {
      setBusy(false);
    }
  }, [form, formMode, projectPath, load, t]);

  const handleDeleteConfirmed = useCallback(async (cmd: OmpSlashCommand) => {
    setPendingDelete(null);
    try {
      const scope = cmd.level === "project" ? "project" : "user";
      await api.ompCommandsDelete(cmd.name, scope, scope === "project" ? projectPath ?? undefined : undefined);
      load();
    } catch { /* ignore */ }
  }, [projectPath, load]);

  // Separate user-authored from native/built-in commands
  const userCommands = commands?.filter(isUserCommand) ?? [];
  const nativeCount = (commands?.length ?? 0) - userCommands.length;

  return (
    <>
      {pendingDelete && (
        <DestructiveActionDialog
          site={`/${pendingDelete.name}`}
          command={t("settings.ompCommandDelete")}
          consequence={t("settings.ompCommandDeleteConsequence")}
          onConfirm={() => void handleDeleteConfirmed(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      <SettingsCard title={t("settings.ompCommandsGroup")}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <p className="settings-row-desc">
            {nativeCount > 0 && t("settings.ompCommandsNativeNote", { count: nativeCount })}
          </p>
          <Button size="sm" variant="secondary" onClick={openCreate}>
            {t("settings.ompCommandCreate")}
          </Button>
        </div>

        {commands === null ? (
          <p className="settings-row-desc">{t("common.loading")}</p>
        ) : userCommands.length === 0 && !formOpen ? (
          <p className="settings-row-desc">{t("settings.ompCommandsEmpty")}</p>
        ) : null}

        {userCommands.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {userCommands.map((cmd) => (
              <div key={cmd.name} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{ flex: 1 }}>
                  <span className="settings-row-title">/{cmd.name}</span>
                  {cmd.description && <span className="settings-row-desc" style={{ marginLeft: "8px" }}>{cmd.description}</span>}
                  <Badge tone={cmd.level === "user" ? "neutral" : "warning"} style={{ marginLeft: "6px" }}>
                    {cmd.level}
                  </Badge>
                </div>
                <Button size="sm" variant="ghost" onClick={() => openEdit(cmd)}>
                  {t("settings.ompCommandEdit")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPendingDelete(cmd)}>
                  {t("settings.ompCommandDelete")}
                </Button>
              </div>
            ))}
          </div>
        )}

        {formOpen && (
          <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px", padding: "12px", background: "var(--surface-2)", borderRadius: "6px" }}>
            <p className="settings-card-heading">
              {formMode.mode === "create" ? t("settings.ompCommandCreate") : t("settings.ompCommandEditTitle")}
            </p>

            {formMode.mode === "create" && (
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label className="settings-row-title">{t("settings.ompCommandName")}</label>
                  <Input
                    value={form.name}
                    placeholder={t("settings.ompCommandNamePlaceholder")}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                {projectPath && (
                  <div>
                    <label className="settings-row-title">{t("settings.ompHookScope")}</label>
                    <select
                      value={form.scope}
                      onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as "user" | "project" }))}
                      style={{ padding: "4px", borderRadius: "4px" }}
                    >
                      <option value="user">{t("settings.ompScopeUser")}</option>
                      <option value="project">{t("settings.ompScopeProject")}</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            <label className="settings-row-title">{t("settings.ompCommandContent")}</label>
            <textarea
              rows={12}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "12px", padding: "8px", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--surface-1)", color: "var(--text)", resize: "vertical" }}
              spellCheck={false}
            />

            {msg && (
              <p style={{ color: msg.ok ? "var(--text-success)" : "var(--text-danger)", fontSize: "12px" }}>
                {msg.text}
              </p>
            )}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <Button size="sm" variant="secondary" onClick={() => { setFormOpen(false); setMsg(null); }}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" variant="primary" disabled={busy} onClick={() => void handleSubmit()}>
                {busy ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        )}
      </SettingsCard>
    </>
  );
}
