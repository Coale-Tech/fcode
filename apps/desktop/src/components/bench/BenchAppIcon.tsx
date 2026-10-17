/**
 * T14: per-app colored icon glyphs for the bench detail sidebar
 * (design .bfd-chip / .wb-app-detail-icon).
 *
 * Each well-known Frappe app gets a distinct hue; unknown apps get a gray dot.
 * `boxed` wraps it in a small 20px rounded square (design .is-boxed).
 */
const APP_HUES: Record<string, "blue" | "green" | "violet" | "amber"> = {
  frappe:           "blue",
  erpnext:          "green",
  hrms:             "violet",
  raven:            "amber",
  frappe_assistant: "violet",
  builder:          "blue",
  studio:           "blue",
  payments:         "green",
};

export function BenchAppIcon({ app, boxed = false }: { app: string; boxed?: boolean }) {
  const hue = APP_HUES[app.toLowerCase()] ?? null;
  const initial = app.charAt(0).toUpperCase();
  const cls = [
    "wb-app-detail-icon",
    hue ? `is-${hue}` : "",
    boxed ? "is-boxed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} aria-hidden="true">
      {initial}
    </span>
  );
}
