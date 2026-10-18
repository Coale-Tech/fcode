/**
 * Settings section for omp hook management.
 * Lists pre/post tool-execution hooks from ~/.omp/agent/hooks/ (and project .omp/hooks/).
 * Supports create, edit, delete, and enable/disable (via disabledExtensions).
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OmpHookEntry } from "@pi-desktop/shared";
import { useAppStore } from "../../stores/app-store";
import { api } from "../../lib/api";
import { Badge, Button, Input, SettingsToggle } from "../../components/ui";
import { SettingsCard } from "./primitives";
import { DestructiveActionDialog } from "../../components/DestructiveActionDialog";

type HookFormState = {
  tool: string;
  hookType: "pre" | "post";
  ext: string;
  content: string;
  scope: "user" | "project";
};

const DEFAULT_FORM: HookFormState = {
  tool: "",
  hookType: "pre",
  ext: ".sh",
  content: "#!/usr/bin/env bash\n# omp hook: runs before/after a tool call\n",
  scope: "user",
};

type FormMode = { mode: "create" } | { mode: "edit"; hook: OmpHookEntry };

export function HooksSection() {
  const { t } = useTranslation();
  const projectPath = useAppStore((s) => s.workspace?.path ?? null);
  const [hooks, setHooks] = useState<OmpHookEntry[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>({ mode: "create" });
  const [form, setForm] = useState<HookFormState>(DEFAULT_FORM);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OmpHookEntry | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(() => {
    api.ompHooksList(projectPath ?? undefined)
      .then((r) => setHooks(r.hooks))
      .catch(() => setHooks([]));
  }, [projectPath]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setForm({ ...DEFAULT_FORM, scope: projectPath ? "user" : "user" });
    setFormMode({ mode: "create" });
    setMsg(null);
    setFormOpen(true);
  };

  const openEdit = (hook: OmpHookEntry) => {
    setForm({ tool: hook.tool, hookType: hook.type, ext: "." + hook.name.split(".").pop()!, content: hook.content, scope: hook.level });
    setFormMode({ mode: "edit", hook });
    setMsg(null);
    setFormOpen(true);
  };

  const handleSubmit = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      let res;
      if (formMode.mode === "create") {
        res = await api.ompHooksCreate(form.tool, form.hookType, form.ext, form.content, form.scope, form.scope === "project" ? projectPath ?? undefined : undefined);
      } else {
        res = await api.ompHooksEdit(formMode.hook.path, form.content, form.scope, form.scope === "project" ? projectPath ?? undefined : undefined);
      }
      if (res.ok) {
        setFormOpen(false);
        load();
      } else {
        setMsg({ ok: false, text: res.error ?? t("settings.ompHookSaveError") });
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("settings.ompHookSaveError") });
    } finally {
      setBusy(false);
    }
  }, [form, formMode, projectPath, load, t]);

  const handleDeleteConfirmed = useCallback(async (hook: OmpHookEntry) => {
    setPendingDelete(null);
    const extensionId = `hook:${hook.type}:${hook.tool}:${hook.name}`;
    try {
      await api.ompHooksDelete(hook.path, hook.level, extensionId, hook.level === "project" ? projectPath ?? undefined : undefined);
      load();
    } catch { /* ignore */ }
  }, [projectPath, load]);

  const handleToggle = useCallback(async (hook: OmpHookEntry) => {
    const extensionId = `hook:${hook.type}:${hook.tool}:${hook.name}`;
    setTogglingId(extensionId);
    try {
      await api.ompExtensionSetEnabled(extensionId, !hook.enabled);
      load();
    } catch { /* ignore */ }
    finally { setTogglingId(null); }
  }, [load]);

  return (
    <>
      {pendingDelete && (
        <DestructiveActionDialog
          site={`${pendingDelete.type}/${pendingDelete.name}`}
          command={t("settings.ompHookDelete")}
          consequence={t("settings.ompHookDeleteConsequence")}
          onConfirm={() => void handleDeleteConfirmed(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      <SettingsCard title={t("settings.ompHooksGroup")}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
          <Button size="sm" variant="secondary" onClick={openCreate}>
            {t("settings.ompHookCreate")}
          </Button>
        </div>

        {hooks === null ? (
          <p className="settings-row-desc">{t("common.loading")}</p>
        ) : hooks.length === 0 && !formOpen ? (
          <p className="settings-row-desc">{t("settings.ompHooksEmpty")}</p>
        ) : null}

        {hooks && hooks.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {hooks.map((hook) => {
              const extId = `hook:${hook.type}:${hook.tool}:${hook.name}`;
              return (
                <div key={hook.path} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                  <SettingsToggle
                    checked={hook.enabled}
                    label={hook.name}
                    disabled={togglingId === extId}
                    onChange={() => void handleToggle(hook)}
                  />
                  <div style={{ flex: 1 }}>
                    <span className="settings-row-title">{hook.tool}</span>
                    <Badge tone={hook.type === "pre" ? "neutral" : "success"} style={{ marginLeft: "6px" }}>
                      {hook.type}
                    </Badge>
                    <Badge tone={hook.level === "user" ? "neutral" : "warning"} style={{ marginLeft: "4px" }}>
                      {hook.level}
                    </Badge>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(hook)}>
                    {t("settings.ompHookEdit")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPendingDelete(hook)}>
                    {t("settings.ompHookDelete")}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {formOpen && (
          <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px", padding: "12px", background: "var(--surface-2)", borderRadius: "6px" }}>
            <p className="settings-card-heading">
              {formMode.mode === "create" ? t("settings.ompHookCreate") : t("settings.ompHookEditTitle")}
            </p>

            {formMode.mode === "create" && (
              <>
                <label className="settings-row-title">{t("settings.ompHookTool")}</label>
                <Input
                  value={form.tool}
                  placeholder={t("settings.ompHookToolPlaceholder")}
                  onChange={(e) => setForm((f) => ({ ...f, tool: e.target.value }))}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <div style={{ flex: 1 }}>
                    <label className="settings-row-title">{t("settings.ompHookType")}</label>
                    <select
                      value={form.hookType}
                      onChange={(e) => setForm((f) => ({ ...f, hookType: e.target.value as "pre" | "post" }))}
                      style={{ width: "100%", padding: "4px" }}
                    >
                      <option value="pre">pre</option>
                      <option value="post">post</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="settings-row-title">{t("settings.ompHookExt")}</label>
                    <select
                      value={form.ext}
                      onChange={(e) => setForm((f) => ({ ...f, ext: e.target.value }))}
                      style={{ width: "100%", padding: "4px" }}
                    >
                      <option value=".sh">.sh</option>
                      <option value=".bash">.bash</option>
                      <option value=".zsh">.zsh</option>
                      <option value=".fish">.fish</option>
                    </select>
                  </div>
                  {projectPath && (
                    <div style={{ flex: 1 }}>
                      <label className="settings-row-title">{t("settings.ompHookScope")}</label>
                      <select
                        value={form.scope}
                        onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as "user" | "project" }))}
                        style={{ width: "100%", padding: "4px" }}
                      >
                        <option value="user">{t("settings.ompScopeUser")}</option>
                        <option value="project">{t("settings.ompScopeProject")}</option>
                      </select>
                    </div>
                  )}
                </div>
              </>
            )}

            <label className="settings-row-title">{t("settings.ompHookContent")}</label>
            <textarea
              rows={10}
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
