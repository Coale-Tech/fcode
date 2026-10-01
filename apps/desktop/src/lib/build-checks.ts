/**
 * Build tab health checks (plan D13): the four links Studio needs, in the
 * order the user has to fix them. `unknown` means "can't tell yet" (bench
 * stopped, app list still loading) and is never reported as a problem.
 */
export type CheckState = "ok" | "fail" | "unknown";

export interface BuildCheck {
  key: "bench" | "studio" | "developerMode" | "watchdog";
  /** Label shown next to the status-bar dot. */
  short: string;
  /** Banner sentence when this check fails. */
  problem: string;
  /** Shell command that fixes it; `<site>` is filled in when the site is known. */
  remedy: string;
  state: CheckState;
}

export interface BuildCheckInput {
  benchRunning: boolean;
  appsLoaded: boolean;
  studioInstalled: boolean;
  developerMode: boolean | null;
  watchdogOk: boolean | null;
  site: string | null;
}

const flag = (v: boolean): CheckState => (v ? "ok" : "fail");

export function buildChecks(i: BuildCheckInput): BuildCheck[] {
  const site = i.site ?? "<site>";
  const studioKnown = i.benchRunning && i.appsLoaded;
  const studioUp = studioKnown && i.studioInstalled;
  const probed = (v: boolean | null): CheckState =>
    studioUp && v !== null ? flag(v) : "unknown";
  return [
    {
      key: "bench",
      short: "Bench",
      problem: "Bench is not running.",
      remedy: "bench start",
      state: flag(i.benchRunning),
    },
    {
      key: "studio",
      short: "Studio",
      problem: "Studio app is not installed.",
      remedy: `bench get-app studio && bench --site ${site} install-app studio`,
      state: studioKnown ? flag(i.studioInstalled) : "unknown",
    },
    {
      key: "developerMode",
      short: "developer_mode",
      problem: "developer_mode is off. Imports are disabled.",
      remedy: `bench set-config -g developer_mode 1 && bench --site ${site} clear-cache`,
      state: probed(i.developerMode),
    },
    {
      key: "watchdog",
      short: "watchdog",
      problem: "The watchdog Python package is missing.",
      remedy: "env/bin/pip install watchdog",
      state: probed(i.watchdogOk),
    },
  ];
}

/** Builder only depends on the bench; Studio depends on all four checks. */
export function checksFor(canvas: "studio" | "builder", checks: BuildCheck[]): BuildCheck[] {
  return canvas === "studio" ? checks : checks.filter((c) => c.key === "bench");
}

export const failing = (checks: BuildCheck[]): BuildCheck[] =>
  checks.filter((c) => c.state === "fail");
