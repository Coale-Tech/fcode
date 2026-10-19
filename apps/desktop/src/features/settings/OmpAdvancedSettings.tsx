/**
 * Settings page rendered entirely from the omp settings manifest.
 * Shows every descriptor not already covered by a curated OmpSettingsValues key.
 * Tab → group → control layout; search and "modified only" collapse the tabs.
 *
 * Slice B (plan: 2026-10-12-omp-feature-parity.md).
 * Depends on `api.ompSettingsManifest` (IPC owned by slice A).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  OmpAdvancedSettings as AdvancedMap,
  OmpSettingDescriptor,
  OmpSettingsValues,
} from "@pi-desktop/shared";
import { CURATED_OMP_KEYS } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import {
  Button,
  Input,
  PasswordInput,
  SettingsToggle,
  Textarea,
  cx,
} from "../../components/ui";
import { SettingsMenuSelect } from "../../components/settings/SettingsMenuSelect";
import { SettingsCard, SettingsRow } from "./primitives";
import {
  IconDatabase,
  IconGlobe,
  IconPackage,
  IconPlay,
  IconServer,
  IconSparkles,
  IconStar,
  IconWrench,
  IconWorkflow,
} from "../../components/icons";
import type { ReactNode } from "react";

/** Decorative icons per manifest group name (matches reference design). */
const GROUP_ICONS: Record<string, ReactNode> = {
  "Core":                  <IconPackage size={13} />,
  "Startup & Lifecycle":   <IconServer size={13} />,
  "Storage":               <IconDatabase size={13} />,
  "Network":               <IconGlobe size={13} />,
  "Experimental":          <IconSparkles size={13} />,
  "Execution":             <IconWrench size={13} />,
  "Spawning":              <IconWorkflow size={13} />,
  "Context":               <IconDatabase size={13} />,
  "Beta":                  <IconStar size={13} />,
};

// ── Pure helpers (exported so unit tests can import directly) ─────────────────

/** True when `id` is covered by a curated key in OmpSettingsValues. */
export function isCuratedKey(id: string): boolean {
  return id in CURATED_OMP_KEYS;
}

/**
 * Filter a descriptor list by query, modifiedOnly flag, and curated exclusion.
 * Returns descriptors whose tab/group structure is intact (callers re-group).
 */
export function filterDescriptors(
  descriptors: OmpSettingDescriptor[],
  query: string,
  modifiedOnly: boolean,
  advanced: AdvancedMap,
): OmpSettingDescriptor[] {
  let result = descriptors.filter((d) => !isCuratedKey(d.id));
  if (modifiedOnly) {
    result = result.filter((d) => Object.prototype.hasOwnProperty.call(advanced, d.id));
  }
  const q = query.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (d) =>
        d.id.toLowerCase().includes(q) ||
        d.label.toLowerCase().includes(q) ||
        (d.description?.toLowerCase().includes(q) ?? false),
    );
  }
  return result;
}

/** Group descriptors into tab → group → items order-preserving maps. */
export function groupDescriptors(
  descriptors: OmpSettingDescriptor[],
): Map<string, Map<string, OmpSettingDescriptor[]>> {
  const tabs = new Map<string, Map<string, OmpSettingDescriptor[]>>();
  for (const d of descriptors) {
    if (!tabs.has(d.tab)) tabs.set(d.tab, new Map());
    const groups = tabs.get(d.tab)!;
    if (!groups.has(d.group)) groups.set(d.group, []);
    groups.get(d.group)!.push(d);
  }
  return tabs;
}

/** Remove a key from `advanced`, returning a new object. */
export function resetAdvancedKey(advanced: AdvancedMap, id: string): AdvancedMap {
  const copy = { ...advanced };
  delete copy[id];
  return copy;
}

/**
 * Coerce a string typed by the user into the proper JS value for a descriptor type.
 * Returns `undefined` when coercion fails (caller keeps the previous value).
 */
export function coerceValue(raw: string, type: OmpSettingDescriptor["type"]): unknown {
  switch (type) {
    case "boolean":
      return raw === "true" || raw === "1" || raw === "yes";
    case "number": {
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    case "array":
      return raw.split("\n").map((s) => s.trim()).filter(Boolean);
    case "record": {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return undefined;
      }
    }
    default:
      return raw;
  }
}

// ── Control component ─────────────────────────────────────────────────────────

function DescriptorControl({
  descriptor,
  value,
  onChange,
}: {
  descriptor: OmpSettingDescriptor;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const { type, values, options, min, max, secret, label } = descriptor;

  if (type === "boolean") {
    return (
      <SettingsToggle
        checked={value === true}
        label={label}
        onChange={() => onChange(value !== true)}
      />
    );
  }

  if (type === "enum") {
    const opts = options
      ? options.map((o) => ({ id: o.value, label: o.label }))
      : (values ?? []).map((v) => ({ id: v, label: v }));
    return (
      <SettingsMenuSelect
        label={label}
        value={typeof value === "string" ? value : (descriptor.default as string | undefined) ?? ""}
        onChange={onChange}
        options={opts}
      />
    );
  }

  if (type === "number") {
    return (
      <Input
        type="number"
        min={min}
        max={max}
        defaultValue={typeof value === "number" ? value : (descriptor.default as number | undefined) ?? ""}
        onBlur={(e) => {
          const coerced = coerceValue(e.target.value, "number");
          if (coerced !== undefined) onChange(coerced);
        }}
      />
    );
  }

  if (type === "array") {
    const display = Array.isArray(value)
      ? (value as string[]).join("\n")
      : Array.isArray(descriptor.default)
      ? (descriptor.default as string[]).join("\n")
      : "";
    return (
      <Textarea
        rows={3}
        defaultValue={display}
        onBlur={(e) => onChange(coerceValue(e.target.value, "array"))}
      />
    );
  }

  if (type === "record") {
    const display =
      value !== undefined && value !== null
        ? JSON.stringify(value, null, 2)
        : descriptor.default !== undefined
        ? JSON.stringify(descriptor.default, null, 2)
        : "";
    return (
      <Textarea
        rows={4}
        className="font-mono"
        defaultValue={display}
        onBlur={(e) => {
          const coerced = coerceValue(e.target.value, "record");
          if (coerced !== undefined) onChange(coerced);
        }}
      />
    );
  }

  // string + secret
  if (secret) {
    return (
      <PasswordInput
        showLabel="Show"
        hideLabel="Hide"
        defaultValue={typeof value === "string" ? value : ""}
        onBlur={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <Input
      type="text"
      defaultValue={typeof value === "string" ? value : ""}
      onBlur={(e) => onChange(e.target.value)}
    />
  );
}

// ── Row component ─────────────────────────────────────────────────────────────

function DescriptorRow({
  descriptor,
  advanced,
  onSave,
}: {
  descriptor: OmpSettingDescriptor;
  advanced: AdvancedMap;
  onSave: (next: AdvancedMap) => void;
}) {
  const { t } = useTranslation();
  const hasOwn = Object.prototype.hasOwnProperty.call(advanced, descriptor.id);
  const effectiveValue = hasOwn ? advanced[descriptor.id] : descriptor.default;

  const handleChange = (next: unknown) => {
    if (next === undefined) return;
    onSave({ ...advanced, [descriptor.id]: next });
  };

  return (
    <SettingsRow
      className="omp-advanced-row"
      title={descriptor.label}
      description={descriptor.description}
    >
      <div className="omp-advanced-control-wrap">
        <DescriptorControl
          descriptor={descriptor}
          value={effectiveValue}
          onChange={handleChange}
        />
        {hasOwn && (
          <Button size="sm" variant="secondary" onClick={() => onSave(resetAdvancedKey(advanced, descriptor.id))}>
            {t("settings.ompAdvancedReset")}
          </Button>
        )}
      </div>
    </SettingsRow>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function OmpAdvancedSettings() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error" | "unavailable">(
    "loading",
  );
  const [manifest, setManifest] = useState<OmpSettingDescriptor[]>([]);
  const [advanced, setAdvanced] = useState<AdvancedMap>({});
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [modifiedOnly, setModifiedOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadState("loading");
    Promise.all([api.ompSettingsManifest(), api.ompSettingsGet()])
      .then(([descriptors, settings]) => {
        setManifest(descriptors);
        setAdvanced((settings as OmpSettingsValues).advanced ?? {});
        setLoadState("ready");
      })
      .catch((err: unknown) => {
        // Manifest IPC not yet registered (slice A pending) → show unavailable.
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("No handler registered") || msg.includes("manifest")) {
          setLoadState("unavailable");
        } else {
          setLoadState("error");
        }
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Filtered and visible descriptors.
  const filtered = useMemo(
    () => filterDescriptors(manifest, query, modifiedOnly, advanced),
    [manifest, query, modifiedOnly, advanced],
  );

  const tabGroups = useMemo(() => groupDescriptors(filtered), [filtered]);

  // Tab list from the full (unfiltered) non-curated manifest, so tab bar doesn't jump while typing.
  const allTabs = useMemo(
    () => [...groupDescriptors(manifest.filter((d) => !isCuratedKey(d.id))).keys()],
    [manifest],
  );

  // When searching or modifiedOnly, suppress the tab bar and show everything.
  const flatMode = query.trim() !== "" || modifiedOnly;

  // Auto-select first tab on load.
  useEffect(() => {
    if (activeTab === null && allTabs.length > 0) {
      setActiveTab(allTabs[0]);
    }
  }, [allTabs, activeTab]);

  const save = useCallback(
    async (nextAdvanced: AdvancedMap) => {
      setAdvanced(nextAdvanced);
      setSaving(true);
      try {
        const confirmed = await api.ompSettingsSet({ advanced: nextAdvanced });
        setAdvanced((confirmed as OmpSettingsValues).advanced ?? nextAdvanced);
      } catch {
        // Keep optimistic value; the sidecar may have restarted mid-save.
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  if (loadState === "loading") {
    return <p className="settings-row-desc">{t("common.loading")}</p>;
  }

  if (loadState === "unavailable") {
    return (
      <div className="settings-row-desc">
        {t("settings.ompAdvancedManifestUnavailable")}
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="settings-row-desc">
        <span>{t("settings.ompSidecarNotRunning")}</span>{" "}
        <Button size="sm" variant="secondary" onClick={load}>
          {t("settings.ompSidecarRetry")}
        </Button>
      </div>
    );
  }

  // Which tab groups to show: tab-filtered in normal mode, everything in flat mode.
  const visibleGroups: Array<{ tab: string; group: string; items: OmpSettingDescriptor[] }> = [];
  for (const [tab, groups] of tabGroups) {
    if (!flatMode && activeTab !== null && tab !== activeTab) continue;
    for (const [group, items] of groups) {
      visibleGroups.push({ tab, group, items });
    }
  }

  return (
    <div className="settings-stack">
      {/* Toolbar */}
      <div className="omp-advanced-toolbar">
        <input
          className="settings-search omp-advanced-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("settings.ompAdvancedSearch")}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
        <label className="omp-advanced-filter-label">
          <input
            type="checkbox"
            checked={modifiedOnly}
            onChange={(e) => setModifiedOnly(e.target.checked)}
          />
          <span>{t("settings.ompAdvancedModifiedOnly")}</span>
        </label>
        {saving && (
          <span className="omp-advanced-saving settings-row-desc">
            {t("common.saving")}
          </span>
        )}
      </div>

      {/* Restart note — shown above the tab bar (matches reference layout) */}
      <p className="settings-row-desc omp-advanced-restart-note">
        ⚠ {t("settings.ompAdvancedRestartNote")}
      </p>

      {/* Tab bar — hidden when searching / filtering */}
      {!flatMode && allTabs.length > 1 && (
        <div className="omp-advanced-tabs" role="tablist">
          {allTabs.map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              className={cx(
                "omp-advanced-tab",
                activeTab === tab && "active",
              )}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      )}


      {/* Settings groups */}
      {visibleGroups.length === 0 ? (
        <div className="settings-row-desc">{t("settings.ompAdvancedNoResults")}</div>
      ) : (
        visibleGroups.map(({ tab, group, items }) => (
          <SettingsCard
            key={`${tab}::${group}`}
            title={flatMode ? `${tab} › ${group}` : group}
            icon={flatMode ? undefined : GROUP_ICONS[group]}
          >
            {items.map((d) => (
              <DescriptorRow
                key={d.id}
                descriptor={d}
                advanced={advanced}
                onSave={(next) => void save(next)}
              />
            ))}
          </SettingsCard>
        ))
      )}
    </div>
  );
}
