import type { BenchStatus, BenchVersion } from "../../lib/bench-view";

// Status hues: Espresso reserves hue for status only (subtle badge + dot).
const STATUS_HUES: Record<BenchStatus, "green" | "amber" | "red" | "gray"> = {
  running: "green",
  starting: "amber",
  failed: "red",
  stopped: "gray",
};

const STATUS_LABELS: Record<BenchStatus, string> = {
  running: "Running",
  starting: "Starting…",
  failed: "Failed",
  stopped: "Stopped",
};

export function VersionBadge({ version }: { version: BenchVersion }) {
  if (version === null) {
    return (
      <span className="wb-badge wb-badge-amber" title="Frappe version undetected">
        ?
      </span>
    );
  }
  return <span className="wb-badge wb-badge-gray">v{version}</span>;
}

export function StatusBadge({ status }: { status: BenchStatus }) {
  const hue = STATUS_HUES[status];
  return (
    <span className={`wb-badge wb-badge-${hue}`}>
      <span className={`wb-dot wb-dot-${hue}`} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function StatusDot({ status }: { status: BenchStatus }) {
  return <span className={`wb-dot wb-dot-${STATUS_HUES[status]}`} aria-hidden="true" />;
}
