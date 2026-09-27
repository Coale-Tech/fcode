/**
 * PreconditionList — Studio precondition checklist for the Build tab (T10).
 *
 * Each link in the Studio-precondition chain is shown with a ✓/✗ marker and,
 * when failing, the exact remedy command as selectable text. Evaluated before
 * the canvas renders so the user knows what to fix before trying Studio.
 *
 * Known preconditions (plan §Design D13, step 8):
 *   1. bench is running
 *   2. studio app is installed on the site
 *   3. developer_mode is on
 *   4. watchdog Python package is installed
 *
 * Callers supply an array of `Precondition` items; the list renders them all.
 */

export interface Precondition {
  /** Human-readable label, e.g. "Studio app installed". */
  label: string;
  /** Whether this precondition is currently satisfied. */
  ok: boolean;
  /**
   * Shell command the user should run to satisfy the precondition.
   * Rendered as selectable text so copy-paste is trivial.
   */
  remedy?: string;
}

export function PreconditionList({
  items,
}: {
  items: Precondition[];
}) {
  const allPass = items.every((p) => p.ok);
  if (allPass) return null;

  return (
    <div
      className="precondition-list"
      role="list"
      aria-label="Studio preconditions"
    >
      {items.map((item) => (
        <div
          key={item.label}
          role="listitem"
          className={`precondition-item ${item.ok ? "precondition-pass" : "precondition-fail"}`}
        >
          <span className="precondition-icon" aria-hidden="true">
            {item.ok ? "✓" : "✗"}
          </span>
          <span className="precondition-label">{item.label}</span>
          {!item.ok && item.remedy && (
            <code
              className="precondition-remedy"
              style={{ userSelect: "all" }}
              title="Copy this command to fix the issue"
            >
              {item.remedy}
            </code>
          )}
        </div>
      ))}
    </div>
  );
}
