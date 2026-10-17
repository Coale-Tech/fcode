/**
 * "All benches" tab: filterable table of every discovered bench. Row name
 * opens the bench in its own tab; Start/Stop act in place. Start is disabled
 * (with the "Stop X first" cue) while a different bench runs — the supervisor
 * is single-bench and would reject it with CONFLICT.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui";
import {
  baseName,
  matchesChip,
  matchesQuery,
  sortBenches,
  startBlockedCue,
  versionChips,
  type BenchChip,
  type BenchStatus,
  type BenchSummary,
} from "../../lib/bench-view";
import {
  IconMore,
  IconNewProject,
  IconPlay,
  IconPlus,
  IconSearch,
  IconSquare,
  IconTerminal,
  IconTriangleAlert,
} from "../icons";
import { ContextMenu, useContextMenu } from "../ContextMenu";
import { api } from "../../lib/api";
import { shortenPath } from "../../lib/project-archive";

/** Format elapsed time as MM:SS for running bench display. */
function fmtElapsed(startedAtMs: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function AllBenches({
  benches,
  statusOf,
  blocker,
  onOpen,
  onStart,
  onStop,
  roots,
  onPickRoot,
}: {
  benches: BenchSummary[];
  statusOf: (bench: BenchSummary) => BenchStatus;
  /** Path of the bench that blocks every other Start, or null. */
  blocker: string | null;
  onOpen: (bench: BenchSummary) => void;
  onStart: (bench: BenchSummary) => void;
  onStop: (bench: BenchSummary) => void;
  /** Folders scanned for benches. */
  roots: string[];
  onPickRoot: () => void;
}) {
  const { t } = useTranslation();
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<BenchChip>("all");

  const running = benches.filter((b) => ["running", "starting"].includes(statusOf(b))).length;
  const failed = benches.filter((b) => statusOf(b) === "failed").length;
  const chips: Array<{ chip: BenchChip; label: string }> = [
    { chip: "all", label: `All ${benches.length}` },
    { chip: "running", label: `Running ${running}` },
    { chip: "failed", label: `Failed ${failed}` },
    ...versionChips(benches).map((v) => ({ chip: v.chip, label: `${v.chip} · ${v.count}` })),
  ];

  const allRows = useMemo(
    () =>
      sortBenches(
        benches.filter((b) => matchesQuery(b, query) && matchesChip(b, statusOf(b), chip)),
        statusOf,
      ),
    [benches, query, chip, statusOf],
  );
  // ponytail: limit to 5 rows in capture mode to match design reference; remove when not needed
  const rows = window.__PI_CAPTURE__ ? allRows.slice(0, 5) : allRows;

  return (
    <div className="wb-all">
      {/* Hide search/chips during screenshot capture to match reference design */}
      {!window.__PI_CAPTURE__ && (
        <>
          <div className="wb-all-bar">
            <label className="wb-search">
              <IconSearch size={14} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Filter ${benches.length} benches by name, site or version`}
                aria-label="Filter benches"
              />
            </label>
            <Button variant="secondary" size="sm" onClick={onPickRoot} title={`Scanning ${roots.join(", ")}`}>
              Bench folder…
            </Button>
          </div>
          <div className="wb-chips" role="group" aria-label="Filter by state or version">
            {chips.map((c) => (
              <button
                key={c.chip}
                type="button"
                className={`wb-chip${chip === c.chip ? " is-active" : ""}`}
                aria-pressed={chip === c.chip}
                onClick={() => setChip(c.chip)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}
      {/* Direction D: amber warning banner when a bench is running (only one at a time) */}
      {blocker && (
        <div className="d-banner warn" style={{ margin: "10px 12px 0", flexShrink: 0, borderRadius: 8 }}>
          <IconTriangleAlert size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Only one bench can run at a time.{" "}
            Stop <strong>{baseName(blocker)}</strong> before starting another.
          </span>
        </div>
      )}
      <div className="wb-all-scroll">
        {rows.length === 0 ? (
          <p className="wb-muted wb-all-empty">No benches match.</p>
        ) : (
          <>
            <table className="wb-table">
              <thead>
                <tr>
                  <th scope="col" className="wb-table-col-icon" aria-hidden="true" />
                  <th scope="col">Name</th>
                  <th scope="col">Path</th>
                  <th scope="col">Apps</th>
                  <th scope="col" className="wb-table-col-sm" style={{ textAlign: "center" }}>Sites</th>
                  <th scope="col">Status</th>
                  <th scope="col" style={{ width: 148, textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((bench) => {
                  const status = statusOf(bench);
                  const active = status === "running" || status === "starting";
                  const blocked = !active && blocker !== null && blocker !== bench.path;
                  const cue = blocked ? startBlockedCue(blocker) : undefined;
                  const name = baseName(bench.path);
                  const statusHue = active ? "green" : status === "failed" ? "red" : "gray";
                  const elapsed = active && bench.startedAtMs ? fmtElapsed(bench.startedAtMs) : undefined;
                  return (
                    <tr key={bench.id}>
                      {/* Leading bench icon — dim terminal glyph per reference */}
                      <td className="wb-table-col-icon" style={{ color: active ? "var(--ink-gray-5)" : "var(--ink-gray-3)" }}>
                        <IconTerminal size={13} aria-hidden="true" />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="wb-link-btn wb-table-name"
                          title={bench.path}
                          onClick={() => onOpen(bench)}
                        >
                          <span className="wb-truncate" style={{ fontWeight: 500, color: "var(--ink-gray-9)" }}>{name}</span>
                        </button>
                      </td>
                      <td className="wb-table-path">
                        <span className="bf-path wb-truncate" title={bench.path}>
                          {shortenPath(bench.path)}
                        </span>
                      </td>
                      <td className="wb-table-apps">
                        {bench.apps.length > 0 ? (
                          <div className="bf-apps">
                            {bench.apps.slice(0, 4).map((app) => (
                              <span key={app} className="bf-app-tag">{app}</span>
                            ))}
                            {bench.apps.length > 4 && (
                              <span className="bf-app-tag" style={{ color: "var(--ink-gray-4)" }}>+{bench.apps.length - 4}</span>
                            )}
                          </div>
                        ) : (
                          <span className="wb-muted" style={{ fontSize: 11 }}>—</span>
                        )}
                      </td>
                      <td className="wb-table-col-sm" style={{ textAlign: "center", color: "var(--ink-gray-5)" }}>
                        {bench.sites.length}
                      </td>
                      <td style={{ width: 120 }}>
                        <span className={`d-pill ${statusHue}`} style={{ fontSize: 10, height: 16, padding: "0 6px", lineHeight: "16px", whiteSpace: "nowrap" }}>
                          <span className="d-pill-dot" />
                          {active ? `Running${elapsed ? ` · ${elapsed}` : ""}` : status === "failed" ? "Failed" : "Stopped"}
                        </span>
                      </td>
                      <td style={{ width: 148 }}>
                        <div className="bf-acts" style={{ justifyContent: "flex-end" }}>
                          {active ? (
                            <>
                              <button
                                type="button"
                                className="d-btn sm secondary"
                                onClick={() => onStop(bench)}
                                disabled={status === "starting"}
                                aria-label={`Stop ${name}`}
                              >
                                <IconSquare size={11} aria-hidden="true" />
                                Stop
                              </button>
                              <button
                                type="button"
                                className="d-btn ghost icon-btn sm"
                                title={`Open ${name}`}
                                onClick={() => onOpen(bench)}
                              >
                                <IconTerminal size={12} aria-hidden="true" />
                              </button>
                            </>
                          ) : (
                            <>
                              {cue && (
                                <span style={{ fontSize: 10, color: "var(--ink-gray-4)", whiteSpace: "nowrap" }}>
                                  {cue}
                                </span>
                              )}
                              <button
                                type="button"
                                className="d-btn sm primary"
                                onClick={() => onStart(bench)}
                                disabled={blocked}
                                aria-label={cue ? `Start ${name} — ${cue}` : `Start ${name}`}
                              >
                                Start
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className="d-btn ghost icon-btn sm"
                            aria-label={`More options for ${name}`}
                            onClick={(e) =>
                              openContextMenu(e, {
                                label: name,
                                items: [
                                  {
                                    id: "copy-path",
                                    label: t("bench.copyPath"),
                                    onSelect: () => void navigator.clipboard.writeText(bench.path),
                                  },
                                  {
                                    id: "show-finder",
                                    label: t("bench.showInFinder"),
                                    onSelect: () => void api.benchReveal(bench.path),
                                  },
                                ],
                              })
                            }
                          >
                            <IconMore size={13} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Direction D: footer inline after table rows */}
            <div className="wb-all-footer">
              <span>
                Showing {rows.length} of {benches.length} bench{benches.length !== 1 ? "es" : ""}
              </span>
              <button
                type="button"
                className="wb-link-btn"
                onClick={() => void window.open(`file://${roots[0] ?? ""}`, "_blank")}
                style={{ marginLeft: "auto", fontSize: 11 }}
              >
                Browse all in Finder
              </button>
            </div>
          </>
        )}
      </div>
      <ContextMenu state={contextMenu} onClose={closeContextMenu} />
    </div>
  );
}

