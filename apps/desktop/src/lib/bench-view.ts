/**
 * Pure view logic for the Bench page: status gating, Start conflicts,
 * filtering and ordering of the discovered-bench list.
 *
 * BenchSupervisor runs ONE bench at a time and `benchStatus` is global, so a
 * bench's own state is only known for the bench the supervisor is on; every
 * other bench is "stopped". Keep that rule here, in one place.
 */

export type BenchVersion = 15 | 16 | 17 | null; // null = unparseable (DX13)

export type BenchSite = {
  name: string;
  isDefault: boolean;
};

export type BenchSummary = {
  id: string;
  path: string;
  version: BenchVersion;
  sites: BenchSite[];
};

export type BenchStatus = "stopped" | "starting" | "running" | "failed";

/** Last path segment; discovery roots may be Windows paths. */
export function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** Status shown for `benchPath`: the supervisor's status only if it is on that bench. */
export function benchStatusFor(
  benchPath: string,
  status: BenchStatus,
  activeBenchPath: string | null,
): BenchStatus {
  return benchPath === activeBenchPath ? status : "stopped";
}

/**
 * Path of the bench whose process blocks starting `benchPath`, or null.
 * BenchSupervisor.start rejects a different bench with CONFLICT while one is
 * running or starting; the same bench is an idempotent no-op, not a block.
 */
export function startBlockedBy(
  status: BenchStatus,
  activeBenchPath: string | null,
  benchPath: string | null,
): string | null {
  if (status !== "running" && status !== "starting") return null;
  if (activeBenchPath === null || activeBenchPath === benchPath) return null;
  return activeBenchPath;
}

/** "Stop coale_v16 first" cue for a Start control blocked by `blocker`. */
export function startBlockedCue(blocker: string): string {
  return `Stop ${baseName(blocker)} first`;
}

export type BenchChip = "all" | "running" | "failed" | `v${number}`;

export function matchesChip(
  bench: BenchSummary,
  status: BenchStatus,
  chip: BenchChip,
): boolean {
  if (chip === "all") return true;
  if (chip === "running") return status === "running" || status === "starting";
  if (chip === "failed") return status === "failed";
  return `v${bench.version}` === chip;
}

/** Case-insensitive match on bench name, path, site names and version. */
export function matchesQuery(bench: BenchSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    baseName(bench.path),
    bench.path,
    bench.version === null ? "" : `v${bench.version}`,
    ...bench.sites.map((s) => s.name),
  ];
  return hay.some((h) => h.toLowerCase().includes(q));
}

const ORDER: Record<BenchStatus, number> = { running: 0, starting: 0, failed: 1, stopped: 2 };

/** Running first, then failed, then the rest in discovery order (stable). */
export function sortBenches<T extends BenchSummary>(
  benches: readonly T[],
  statusOf: (bench: T) => BenchStatus,
): T[] {
  return benches
    .map((bench, i) => ({ bench, i, rank: ORDER[statusOf(bench)] }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((e) => e.bench);
}

/** Version chips for the versions that actually occur, newest first, with counts. */
export function versionChips(benches: readonly BenchSummary[]): Array<{ chip: BenchChip; count: number }> {
  const counts = new Map<number, number>();
  for (const b of benches) {
    if (b.version !== null) counts.set(b.version, (counts.get(b.version) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([v, count]) => ({ chip: `v${v}` as BenchChip, count }));
}

export type SwitcherGroups<T> = { running: T[]; attention: T[]; rest: T[] };

/** Switcher menu groups for a search query; each bench lands in exactly one group. */
export function groupForSwitcher<T extends BenchSummary>(
  benches: readonly T[],
  query: string,
  statusOf: (bench: T) => BenchStatus,
): SwitcherGroups<T> {
  const groups: SwitcherGroups<T> = { running: [], attention: [], rest: [] };
  for (const bench of benches) {
    if (!matchesQuery(bench, query)) continue;
    const s = statusOf(bench);
    if (s === "running" || s === "starting") groups.running.push(bench);
    else if (s === "failed") groups.attention.push(bench);
    else groups.rest.push(bench);
  }
  return groups;
}

/** Key of a one-shot command's result: per bench, per verb (never verb alone). */
export function oneshotKey(benchPath: string, verb: string): string {
  return `${benchPath}\0${verb}`;
}
