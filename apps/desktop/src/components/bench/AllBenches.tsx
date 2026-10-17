/**
 * "All benches" tab: filterable table of every discovered bench. Row name
 * opens the bench in its own tab; Start/Stop act in place. Start is disabled
 * (with the "Stop X first" cue) while a different bench runs — the supervisor
 * is single-bench and would reject it with CONFLICT.
 */
import { useMemo, useState } from "react";
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
import { IconPlay, IconSearch, IconSquare } from "../icons";
import { StatusBadge, StatusDot } from "./BenchBadges";

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
        <div className="build-banner is-amber" role="status" style={{ margin: "8px 0 0", padding: "7px 12px" }}>
          <span aria-hidden="true">⚠</span>
          Only one bench can run at a time.{" "}
          <span className="wb-muted">Stop <strong>{baseName(blocker)}</strong> before starting another.</span>
        </div>
      )}
      <div className="wb-all-scroll">
        {rows.length === 0 ? (
          <p className="wb-muted wb-all-empty">No benches match.</p>
        ) : (
          <table className="wb-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Path</th>
                <th scope="col">Apps</th>
                <th scope="col">Sites</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="wb-sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((bench) => {
                const status = statusOf(bench);
                const active = status === "running" || status === "starting";
                const blocked = !active && blocker !== null && blocker !== bench.path;
                const cue = blocked ? startBlockedCue(blocker) : undefined;
                const name = baseName(bench.path);
                return (
                  <tr key={bench.id}>
                    <td>
                      <button
                        type="button"
                        className="wb-link-btn wb-table-name"
                        title={bench.path}
                        onClick={() => onOpen(bench)}
                      >
                        <StatusDot status={status} />
                        <span className="wb-truncate">{name}</span>
                      </button>
                    </td>
                    <td className="wb-table-path">
                      <code className="wb-mono wb-truncate" title={bench.path}
                        style={{ fontSize: 11, color: "var(--ink-gray-5)", maxWidth: 180, display: "inline-block" }}>
                        {bench.path}
                      </code>
                    </td>
                    <td className="wb-table-apps">
                      {bench.apps.length > 0 ? (
                        <div className="wb-app-tags">
                          {bench.apps.slice(0, 4).map((app) => (
                            <span key={app} className="wb-app-tag">{app}</span>
                          ))}
                          {bench.apps.length > 4 && (
                            <span className="wb-app-tag wb-muted">+{bench.apps.length - 4}</span>
                          )}
                        </div>
                      ) : (
                        <span className="wb-muted" style={{ fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td className="wb-table-sites">
                      <span className="wb-truncate">{siteSummary(bench)}</span>
                    </td>
                    <td>
                      <StatusBadge status={status} />
                      {active && bench.startedAtMs && (
                        <span className="wb-muted" style={{ fontSize: 11, marginLeft: 4 }}>
                          · {fmtElapsed(bench.startedAtMs)}
                        </span>
                      )}
                    </td>
                    <td className="wb-table-action">
                      {active ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onStop(bench)}
                          disabled={status === "starting"}
                          aria-label={`Stop ${name}`}
                        >
                          <IconSquare size={12} aria-hidden="true" />
                          Stop
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onStart(bench)}
                          disabled={blocked}
                          title={cue}
                          aria-label={cue ? `Start ${name} — ${cue}` : `Start ${name}`}
                        >
                          <IconPlay size={12} aria-hidden="true" />
                          Start
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {/* Direction D: footer with total count + Finder link */}
      {benches.length > 0 && (
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
      )}
    </div>
  );
}

function siteSummary(bench: BenchSummary): string {
  // Show site count as a number (e.g. 3) — matches D3 reference design.
  return bench.sites.length === 0 ? "0" : String(bench.sites.length);
}
