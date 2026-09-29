/**
 * DocTypeTree — Frappe-aware DocType browser (design C).
 *
 * Fetches the bench list, scans apps/<app>/<app>/<module>/doctype/ for
 * <name>.json files, groups them by app → module → DocType. A doctype json
 * modified in the git working tree gets an amber "migrate" badge.
 *
 * "Needs migrate" heuristic: DocType json modified in git working tree.
 * // ponytail: git-status check only; misses changes committed but not migrated,
 * //   or custom doctypes outside apps/. Upgrade: compare installed schema hash
 * //   to json content hash, or call `bench describe-build-changes`.
 *
 * Selecting a DocType opens up to 4 sub-tabs: Schema (.json), Controller (.py),
 * Form script (.js), and Tests (test_*.py) — only existing files shown.
 */
import { useCallback, useEffect, useState } from "react";
import { IPC, type Result } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { cx } from "../ui";

// ── Types ────────────────────────────────────────────────────────────────────

type BenchSummary = { id: string; path: string; sites: { name: string }[] };

type DoctypeEntry = {
  path: string;  // relative to benchPath, e.g. apps/erpnext/erpnext/accounts/doctype/sales_invoice/sales_invoice.json
  app: string;
  module: string;
  name: string;
  dirty: boolean;
};

type SelectedDoctype = {
  benchPath: string;
  entry: DoctypeEntry;
  tab: "schema" | "controller" | "formscript" | "tests";
};

// ── IPC helper ───────────────────────────────────────────────────────────────

async function ipc<T>(channel: string, args?: unknown): Promise<T> {
  const bridge = window.piDesktop;
  if (!bridge) throw new Error("piDesktop bridge unavailable");
  const result: Result<T> = await bridge.invoke<T>(channel, args);
  if (!result.ok) throw new Error(result.error.message ?? "IPC failed");
  return result.data;
}

// ── Group doctypes ────────────────────────────────────────────────────────────

type DocGroup = {
  app: string;
  modules: {
    module: string;
    doctypes: DoctypeEntry[];
  }[];
  dirtyCount: number;
};

function groupDoctypes(entries: DoctypeEntry[]): DocGroup[] {
  const appMap = new Map<string, Map<string, DoctypeEntry[]>>();
  for (const e of entries) {
    if (!appMap.has(e.app)) appMap.set(e.app, new Map());
    const modMap = appMap.get(e.app)!;
    if (!modMap.has(e.module)) modMap.set(e.module, []);
    modMap.get(e.module)!.push(e);
  }
  const groups: DocGroup[] = [];
  for (const [app, modMap] of appMap) {
    const modules = Array.from(modMap.entries()).map(([module, doctypes]) => ({
      module,
      doctypes: doctypes.sort((a, b) => a.name.localeCompare(b.name)),
    }));
    modules.sort((a, b) => a.module.localeCompare(b.module));
    groups.push({
      app,
      modules,
      dirtyCount: modules.flatMap((m) => m.doctypes).filter((d) => d.dirty).length,
    });
  }
  return groups.sort((a, b) => a.app.localeCompare(b.app));
}

// ── Migrate card ─────────────────────────────────────────────────────────────

function MigrateCard({
  dirtyCount,
  benchPath,
  site,
}: {
  dirtyCount: number;
  benchPath: string;
  site: string | undefined;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const runMigrate = useCallback(async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await ipc<{ exitCode: number; output: string }>(
        IPC.invoke.benchRun,
        { benchPath, site, verb: "migrate" },
      );
      setResult(res.exitCode === 0 ? "Migration complete." : `Failed (exit ${res.exitCode}).`);
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Migration failed.");
    } finally {
      setRunning(false);
    }
  }, [benchPath, site]);

  if (dirtyCount === 0) return null;

  return (
    <div className="doctype-migrate-card">
      <span className="doctype-migrate-msg">
        {dirtyCount} DocType{dirtyCount !== 1 ? "s" : ""} changed — migration may be needed.
      </span>
      <button
        type="button"
        className="doctype-migrate-btn"
        onClick={() => void runMigrate()}
        disabled={running}
      >
        {running ? "Running…" : "Run migrate"}
      </button>
      {result && <span className="doctype-migrate-result">{result}</span>}
    </div>
  );
}

// ── DocType row ───────────────────────────────────────────────────────────────

function DoctypeRow({
  entry,
  selected,
  onSelect,
}: {
  entry: DoctypeEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cx("doctype-row", selected && "is-selected")}
      onClick={onSelect}
    >
      <span className="doctype-row-name">{entry.name.replaceAll("_", " ")}</span>
      {entry.dirty && <span className="doctype-badge-migrate" title="Modified in git working tree — migrate may be needed">migrate</span>}
    </button>
  );
}

// ── Sub-tabs for selected DocType ────────────────────────────────────────────

const SUB_TABS: { id: SelectedDoctype["tab"]; label: string }[] = [
  { id: "schema", label: "Schema" },
  { id: "controller", label: "Controller" },
  { id: "formscript", label: "Form JS" },
  { id: "tests", label: "Tests" },
];

function dtFilePath(
  benchPath: string,
  entry: DoctypeEntry,
  tab: SelectedDoctype["tab"],
): string {
  const base = `${entry.path.replace(/\.json$/, "")}`;
  const dirBase = base.split("/").slice(0, -1).join("/");
  const name = entry.name;
  switch (tab) {
    case "schema":
      return `${entry.path}`;
    case "controller":
      return `${dirBase}/${name}.py`;
    case "formscript":
      return `${dirBase}/${name}.js`;
    case "tests":
      return `${dirBase}/test_${name}.py`;
  }
}

// ── Main component ─────────────────────────────────────────────────────────

export function DocTypeTree({
  onOpen,
}: {
  onOpen: (absolutePath: string) => void;
}) {
  const [benches, setBenches] = useState<BenchSummary[]>([]);
  const [benchIdx, setBenchIdx] = useState(0);
  const [entries, setEntries] = useState<DoctypeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<SelectedDoctype | null>(null);

  // Load bench list once
  useEffect(() => {
    ipc<{ benches: BenchSummary[] }>(IPC.invoke.benchList)
      .then((r) => setBenches(r.benches ?? []))
      .catch(() => {});
  }, []);

  const selectedBench = benches[benchIdx] ?? null;

  // Load doctypes when bench changes
  useEffect(() => {
    if (!selectedBench) return;
    setLoading(true);
    setError(null);
    setEntries([]);
    api
      .gitScanDoctypes(selectedBench.path)
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [selectedBench]);

  const groups = groupDoctypes(entries);
  const totalDirty = entries.filter((e) => e.dirty).length;
  const lowerFilter = filter.toLowerCase();
  const filteredGroups = lowerFilter
    ? groups.map((g) => ({
        ...g,
        modules: g.modules
          .map((m) => ({
            ...m,
            doctypes: m.doctypes.filter(
              (d) =>
                d.name.toLowerCase().includes(lowerFilter) ||
                m.module.toLowerCase().includes(lowerFilter) ||
                g.app.toLowerCase().includes(lowerFilter),
            ),
          }))
          .filter((m) => m.doctypes.length > 0),
      })).filter((g) => g.modules.length > 0)
    : groups;

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openDoctype = useCallback(
    (benchPath: string, entry: DoctypeEntry, tab: SelectedDoctype["tab"]) => {
      setSelected({ benchPath, entry, tab });
      const relPath = dtFilePath(benchPath, entry, tab);
      // Pass absolute path to parent so it can open in editor
      onOpen(`${benchPath}/${relPath}`);
    },
    [onOpen],
  );

  return (
    <div className="code-doctype-tree">
      {benches.length > 1 && (
        <select
          className="doctype-bench-select"
          value={benchIdx}
          onChange={(e) => setBenchIdx(Number(e.target.value))}
          aria-label="Select bench"
        >
          {benches.map((b, i) => (
            <option key={b.id} value={i}>
              {b.path.split("/").pop()}
            </option>
          ))}
        </select>
      )}

      {selectedBench && totalDirty > 0 && (
        <MigrateCard
          dirtyCount={totalDirty}
          benchPath={selectedBench.path}
          site={selectedBench.sites[0]?.name}
        />
      )}

      <div className="code-tree-filter">
        <input
          type="search"
          className="code-tree-filter-input"
          placeholder="Filter DocTypes…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter DocTypes"
        />
      </div>

      {loading && (
        <p className="doctype-loading" role="status">
          Scanning bench…
        </p>
      )}
      {error && (
        <p className="doctype-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && (
        <div className="doctype-scroll" role="tree" aria-label="DocTypes">
          {filteredGroups.length === 0 ? (
            <p className="code-tree-empty">
              {filter ? "No matches." : "No DocTypes found."}
            </p>
          ) : (
            filteredGroups.map((g) => {
              const appOpen = !collapsed.has(`app:${g.app}`);
              return (
                <div key={g.app} className="doctype-app-group">
                  <button
                    type="button"
                    className="doctype-app-header"
                    onClick={() => toggleCollapse(`app:${g.app}`)}
                    aria-expanded={appOpen}
                  >
                    <span className={cx("code-tree-chevron", appOpen && "open")} aria-hidden>›</span>
                    <span className="doctype-app-name">{g.app}</span>
                    {g.dirtyCount > 0 && (
                      <span className="doctype-badge-migrate">{g.dirtyCount}</span>
                    )}
                  </button>
                  {appOpen &&
                    g.modules.map((m) => {
                      const modOpen = !collapsed.has(`mod:${g.app}:${m.module}`);
                      return (
                        <div key={m.module} className="doctype-module-group">
                          <button
                            type="button"
                            className="doctype-module-header"
                            onClick={() => toggleCollapse(`mod:${g.app}:${m.module}`)}
                            aria-expanded={modOpen}
                          >
                            <span className={cx("code-tree-chevron", modOpen && "open")} aria-hidden>›</span>
                            {m.module.replaceAll("_", " ")}
                          </button>
                          {modOpen &&
                            m.doctypes.map((dt) => (
                              <DoctypeRow
                                key={dt.path}
                                entry={dt}
                                selected={selected?.entry.path === dt.path}
                                onSelect={() =>
                                  openDoctype(
                                    selectedBench.path,
                                    dt,
                                    "schema",
                                  )
                                }
                              />
                            ))}
                        </div>
                      );
                    })}
                </div>
              );
            })
          )}
        </div>
      )}

      {selected && (
        <div className="doctype-subtabs">
          {SUB_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={cx(
                "doctype-subtab",
                selected.tab === t.id && "is-active",
              )}
              onClick={() =>
                openDoctype(selected.benchPath, selected.entry, t.id)
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
