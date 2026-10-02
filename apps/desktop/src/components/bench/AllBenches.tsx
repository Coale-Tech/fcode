/**
 * "All benches" tab: filterable table of every discovered bench. Row name
 * opens the bench in its own tab; Start/Stop act in place. Start is disabled
 * (with the "Stop X first" cue) while a different bench runs — the supervisor
 * is single-bench and would reject it with CONFLICT.
 */
import { useMemo, useState } from "react";
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
import { StatusBadge, StatusDot, VersionBadge } from "./BenchBadges";

export function AllBenches({
  benches,
  statusOf,
  blocker,
  onOpen,
  onStart,
  onStop,
}: {
  benches: BenchSummary[];
  statusOf: (bench: BenchSummary) => BenchStatus;
  /** Path of the bench that blocks every other Start, or null. */
  blocker: string | null;
  onOpen: (bench: BenchSummary) => void;
  onStart: (bench: BenchSummary) => void;
  onStop: (bench: BenchSummary) => void;
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

  const rows = useMemo(
    () =>
      sortBenches(
        benches.filter((b) => matchesQuery(b, query) && matchesChip(b, statusOf(b), chip)),
        statusOf,
      ),
    [benches, query, chip, statusOf],
  );

  return (
    <div className="wb-all">
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
      {blocker && (
        <p className="wb-note wb-all-note">
          {baseName(blocker)} is running — one bench at a time. {startBlockedCue(blocker)} to start another.
        </p>
      )}
      <div className="wb-all-scroll">
        {rows.length === 0 ? (
          <p className="wb-muted wb-all-empty">No benches match.</p>
        ) : (
          <table className="wb-table">
            <thead>
              <tr>
                <th scope="col">Bench</th>
                <th scope="col">Version</th>
                <th scope="col">Sites</th>
                <th scope="col">State</th>
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
                    <td>
                      <VersionBadge version={bench.version} />
                    </td>
                    <td className="wb-table-sites">
                      <span className="wb-truncate">{siteSummary(bench)}</span>
                    </td>
                    <td>
                      <StatusBadge status={status} />
                    </td>
                    <td className="wb-table-action">
                      {active ? (
                        <button
                          type="button"
                          className="wb-btn wb-btn-subtle wb-btn-sm"
                          onClick={() => onStop(bench)}
                          disabled={status === "starting"}
                          aria-label={`Stop ${name}`}
                        >
                          <IconSquare size={12} aria-hidden="true" />
                          Stop
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="wb-btn wb-btn-subtle wb-btn-sm"
                          onClick={() => onStart(bench)}
                          disabled={blocked}
                          title={cue}
                          aria-label={cue ? `Start ${name} — ${cue}` : `Start ${name}`}
                        >
                          <IconPlay size={12} aria-hidden="true" />
                          Start
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function siteSummary(bench: BenchSummary): string {
  if (bench.sites.length === 0) return "No sites";
  if (bench.sites.length === 1) return bench.sites[0].name;
  const def = bench.sites.find((s) => s.isDefault)?.name ?? bench.sites[0].name;
  return `${def} +${bench.sites.length - 1}`;
}
