/**
 * Settings → Tools → Language servers: omp's built-in servers merged with the user's
 * ~/.omp/agent/lsp.json, each with whether its command is found. Adding a server (or giving a
 * built-in's name a new command) writes lsp.json, the file omp reads.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OmpLspListResult, OmpLspServer } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Badge, Button, Input, SettingsToggle } from "../../components/ui";
import { SettingsCard, SettingsRow } from "./primitives";

const COLLAPSED_COUNT = 12;
const EMPTY_FORM = { name: "", command: "", args: "", fileTypes: "" };
const words = (s: string, sep: RegExp) => s.split(sep).map((x) => x.trim()).filter(Boolean);

export function LspServersCard() {
  const { t } = useTranslation();
  const [list, setList] = useState<OmpLspListResult | null>(null);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<typeof EMPTY_FORM | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.ompLspList().then(setList).catch((e: unknown) => setError(String(e)));
  }, []);
  useEffect(load, [load]);

  /** Run a write, then reload; show its error instead of reloading. */
  const run = (write: Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => {
    setError(null);
    write
      .then((r) => {
        if (!r.ok) return setError(t("settings.ompLspSaveError", { error: r.error ?? "" }));
        onOk?.();
        load();
      })
      .catch((e: unknown) => setError(t("settings.ompLspSaveError", { error: String(e) })));
  };

  if (!list) {
    return (
      <SettingsCard title={t("settings.ompLspServers")}>
        <p className="settings-row-desc">{error ?? t("common.loading")}</p>
      </SettingsCard>
    );
  }

  const q = filter.trim().toLowerCase();
  const matches = list.servers.filter(
    (s) => !q || s.name.toLowerCase().includes(q) || s.command.toLowerCase().includes(q) || s.fileTypes.some((f) => f.includes(q)),
  );
  const shown = expanded || q ? matches : matches.slice(0, COLLAPSED_COUNT);

  const status = (s: OmpLspServer) =>
    s.disabled ? (
      <Badge>{t("settings.ompLspDisabled")}</Badge>
    ) : s.resolved ? (
      <Badge tone="success">{s.bundled ? t("settings.ompLspBundled") : t("settings.ompLspFound")}</Badge>
    ) : (
      <Badge tone="warning">{t("settings.ompLspMissing")}</Badge>
    );

  const submit = () => {
    if (!form) return;
    run(
      api.ompLspSave({
        name: form.name,
        command: form.command,
        args: words(form.args, /\s+/),
        ...(form.fileTypes.trim() ? { fileTypes: words(form.fileTypes, /[\s,]+/) } : {}),
      }),
      () => setForm(null),
    );
  };

  return (
    <SettingsCard title={t("settings.ompLspServers")} description={t("settings.ompLspServersDesc")}>
      {list.error && <p className="settings-row-desc text-warning">{t("settings.ompLspLoadError", { error: list.error })}</p>}
      {error && (
        <p className="settings-row-desc text-warning" role="alert">
          {error}
        </p>
      )}
      <SettingsRow title={t("settings.ompLspFilter")}>
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("settings.ompLspFilter")} />
        <Button size="sm" onClick={() => setForm(form ? null : { ...EMPTY_FORM })}>
          {t("settings.ompLspAdd")}
        </Button>
      </SettingsRow>
      {form && (
        <>
          <SettingsRow title={t("settings.ompLspName")} description={t("settings.ompLspNameDesc")}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </SettingsRow>
          <SettingsRow title={t("settings.ompLspCommand")} description={t("settings.ompLspCommandDesc")}>
            <Input value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} />
          </SettingsRow>
          <SettingsRow title={t("settings.ompLspArgs")} description={t("settings.ompLspArgsDesc")}>
            <Input value={form.args} onChange={(e) => setForm({ ...form, args: e.target.value })} />
          </SettingsRow>
          <SettingsRow title={t("settings.ompLspFileTypes")} description={t("settings.ompLspFileTypesDesc")}>
            <Input value={form.fileTypes} onChange={(e) => setForm({ ...form, fileTypes: e.target.value })} />
            <Button size="sm" variant="primary" onClick={submit} disabled={!form.name.trim() || !form.command.trim()}>
              {t("common.save")}
            </Button>
          </SettingsRow>
        </>
      )}
      {shown.map((s) => (
        <SettingsRow
          key={s.name}
          title={s.name}
          detail={status(s)}
          description={`${s.resolved ?? s.command} · ${s.fileTypes.join(" ")}`}
        >
          <SettingsToggle
            checked={!s.disabled}
            label={s.name}
            onChange={() => run(api.ompLspSave({ name: s.name, disabled: !s.disabled }))}
          />
          {s.custom && (
            <Button size="sm" variant="ghost" onClick={() => run(api.ompLspRemove(s.name))}>
              {s.builtin ? t("settings.ompLspReset") : t("common.remove")}
            </Button>
          )}
        </SettingsRow>
      ))}
      {matches.length === 0 && <p className="settings-row-desc">{t("settings.ompLspNoMatch")}</p>}
      {!q && matches.length > COLLAPSED_COUNT && (
        <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
          {expanded ? t("settings.ompLspShowLess") : t("settings.ompLspShowAll", { count: matches.length })}
        </Button>
      )}
    </SettingsCard>
  );
}
