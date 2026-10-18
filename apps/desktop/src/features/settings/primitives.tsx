import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  AppSettings,
  CommandShellCatalog,
  CommandShellId,
} from "@pi-desktop/shared";
import {
  MAX_LARGE_PASTE_THRESHOLD,
  MIN_LARGE_PASTE_THRESHOLD,
  normalizeLargePasteThreshold,
} from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { resolveContextUsageDisplay } from "../../lib/context-usage";
import { HelpIcon, Input, SegmentedControl } from "../../components/ui";
import { SettingsMenuSelect } from "../../components/settings/SettingsMenuSelect";

/**
 * One settings decision, as Raven lays it out: title and optional inline
 * description on the left, the control on the right.
 * `detail` is a live value (the pinned default model), not explanation.
 */
export function SettingsRow({
  title,
  description,
  detail,
  className,
  children,
}: {
  title: string;
  description?: string;
  /** Live row metadata that stays visible (not an explanation). */
  detail?: ReactNode;
  /** lane t13: extra class (e.g. sf-dirty-row) */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className ? `settings-row ${className}` : "settings-row"}>
      <div className="settings-row-copy">
        <div className="settings-row-title">
          {title}
          {detail ? <span className="settings-row-detail-inline">{detail}</span> : null}
        </div>
        {description ? <div className="settings-row-desc">{description}</div> : null}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

/**
 * A titled group of rows. `description` follows the same rule as a row's: it
 * explains the card, so it lives behind the heading's help icon.
 */
export function SettingsCard({
  title,
  description,
  icon,
  children,
}: {
  title?: string;
  description?: string;
  /** Leading heading glyph (D sf-head: icon + title). */
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-card-block">
      {title ? (
        /*
          The help mark is the heading's sibling, not its child: a nested
          button joins the heading's accessible name, and a screen reader's
          list of headings should not read out every explanation.
        */
        <div className="settings-card-heading-help">
          {icon ? <span className="settings-card-heading-icon" aria-hidden>{icon}</span> : null}
          <h3 className="settings-card-heading">{title}</h3>
          {description ? <HelpIcon label={description} /> : null}
        </div>
      ) : null}
      <div className="settings-panel">{children}</div>
    </section>
  );
}

export function CommandShellRow({
  settings,
  saveSettings,
}: {
  settings: AppSettings;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<CommandShellCatalog | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [selectedOverride, setSelectedOverride] =
    useState<CommandShellId | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api
      .listCommandShells()
      .then((next) => {
        if (cancelled) return;
        setCatalog(next);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedId =
    selectedOverride ??
    catalog?.configuredId ??
    catalog?.effective?.id ??
    settings.defaultCommandShell ??
    "";
  const configuredChoice = catalog?.choices.find(
    (choice) => choice.id === catalog.configuredId,
  );
  const effectiveChoice = catalog?.effective;

  let effectiveStatus: string | null = null;
  if (catalog && !effectiveChoice && catalog.choices.length > 0) {
    effectiveStatus = t("settings.commandShellNoEffective");
  } else if (catalog && effectiveChoice) {
    if (!catalog.configuredId) {
      effectiveStatus = t("settings.commandShellDefault", {
        shell: effectiveChoice.label,
      });
    } else if (
      catalog.fallback ||
      catalog.configuredId !== effectiveChoice.id ||
      configuredChoice?.available === false
    ) {
      effectiveStatus = t("settings.commandShellFallback", {
        shell: effectiveChoice.label,
      });
    }
  }

  const onChange = async (value: string) => {
    if (!catalog || saving) return;
    const choice = catalog.choices.find((candidate) => candidate.id === value);
    if (!choice || !choice.available) return;
    setSaving(true);
    setSaveError(false);
    setSelectedOverride(choice.id);
    try {
      await saveSettings({ defaultCommandShell: choice.id });
      setCatalog((current) =>
        current
          ? {
              ...current,
              configuredId: choice.id,
              effective: choice,
              fallback: false,
            }
          : current,
      );
    } catch {
      setSelectedOverride(null);
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsRow
      title={t("settings.commandShell")}
      description={effectiveStatus ?? undefined}
    >
      <div
        className="settings-command-shell-control"
        aria-busy={saving || (!catalog && !loadError)}
      >
        {!catalog ? (
          <span className="settings-command-shell-state" role="status">
            {loadError
              ? t("settings.commandShellLoadError")
              : t("settings.commandShellLoading")}
          </span>
        ) : catalog.choices.length === 0 ? (
          <span className="settings-command-shell-state" role="status">
            {t("settings.commandShellNoChoices")}
          </span>
        ) : (
          <SettingsMenuSelect
            className="settings-command-shell-select"
            label={t("settings.commandShell")}
            value={selectedId}
            busy={saving}
            onChange={(value) => void onChange(value)}
            options={catalog.choices.map((choice) => ({
              id: choice.id,
              label: `${choice.label}${
                choice.available
                  ? ""
                  : ` - ${t("settings.commandShellUnavailable")}`
              }`,
              disabled: !choice.available,
            }))}
          />
        )}
        {saveError ? (
          <span className="settings-command-shell-state error" role="status">
            {t("settings.commandShellSaveError")}
          </span>
        ) : null}
      </div>
    </SettingsRow>
  );
}
export function LinkOpenTargetRow({
  settings,
  saveSettings,
}: {
  settings: AppSettings;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const current = settings.linkOpenTarget ?? "workpanel";
  return (
    <SettingsRow title={t("settings.linkOpenTarget")}>
      <SegmentedControl
        value={current}
        onChange={(value) => void saveSettings({ linkOpenTarget: value })}
        options={[
          { value: "workpanel", label: t("settings.linkOpenTargetWorkpanel") },
          { value: "external", label: t("settings.linkOpenTargetExternal") },
        ]}
        label={t("settings.linkOpenTarget")}
        role="group"
      />
    </SettingsRow>
  );
}

/**
 * Which figure the composer context ring leads with (D398). Color thresholds
 * stay on remaining capacity in both modes, so "used" never repaints the
 * warning state.
 */
export function ContextUsageDisplayRow({
  settings,
  saveSettings,
}: {
  settings: AppSettings;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const current = resolveContextUsageDisplay(settings.contextUsageDisplay);
  return (
    <SettingsRow title={t("settings.contextUsageDisplay")}>
      <SegmentedControl
        value={current}
        onChange={(value) => void saveSettings({ contextUsageDisplay: value })}
        options={[
          { value: "remaining", label: t("settings.contextUsageDisplayRemaining") },
          { value: "used", label: t("settings.contextUsageDisplayUsed") },
        ]}
        label={t("settings.contextUsageDisplay")}
      />
    </SettingsRow>
  );
}

export function LargePasteThresholdRow({
  settings,
  saveSettings,
}: {
  settings: AppSettings;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const currentThreshold = normalizeLargePasteThreshold(settings.largePasteThreshold);
  const options = [50, 100, 200, 500, 1000].map((n) => ({
    id: String(n),
    label: `${n} lines`,
  }));
  // Snap current value to nearest preset; fallback to 200.
  const snapped = options.find((o) => Number(o.id) === currentThreshold)?.id
    ?? String(options.reduce((best, o) => {
        return Math.abs(Number(o.id) - currentThreshold) < Math.abs(Number(best.id) - currentThreshold)
          ? o : best;
      }, options[0]).id);
  return (
    <SettingsRow
      title={t("settings.largePasteThreshold")}
      description={t("settings.largePasteThresholdDesc")}
    >
      <SettingsMenuSelect
        label={t("settings.largePasteThreshold")}
        value={snapped}
        onChange={(v) => void saveSettings({ largePasteThreshold: Number(v) })}
        options={options}
      />
    </SettingsRow>
  );
}
