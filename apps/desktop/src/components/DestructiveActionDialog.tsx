/**
 * DestructiveActionDialog — a single reusable confirm dialog for irreversible
 * bench commands and agent-path approvals (T8).
 *
 * Design rules (plan §Design D14):
 * - Names site, command and consequence in one sentence.
 * - NO auto-deny timer. PermissionCard has one; this dialog does not — a user
 *   reading a migrate blast radius carefully must not be timed out.
 * - Confirm is the primary action; Cancel is always available.
 * - Used by the Bench tab (migrate, install-app, …) and the agent approval path.
 */

export interface DestructiveActionDialogProps {
  /** The Frappe site being acted on, e.g. "v16.local". */
  site: string;
  /** The bench command being run, e.g. "migrate". */
  command: string;
  /** Human-readable consequence of the command, e.g. "alters the database schema". */
  consequence: string;
  /** Called when the user clicks Confirm. */
  onConfirm: () => void;
  /** Called when the user clicks Cancel. */
  onCancel: () => void;
}

export function DestructiveActionDialog({
  site,
  command,
  consequence,
  onConfirm,
  onCancel,
}: DestructiveActionDialogProps) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="destructive-dialog-title"
      aria-describedby="destructive-dialog-desc"
      className="destructive-dialog"
    >
      <h2 id="destructive-dialog-title" className="destructive-dialog-title">
        Confirm: {command}
      </h2>

      <p id="destructive-dialog-desc" className="destructive-dialog-desc">
        {/* One sentence naming site, command and consequence — plan D14. */}
        Run <strong>{command}</strong> on <strong>{site}</strong>. This{" "}
        {consequence} and cannot be undone.
      </p>

      <div className="destructive-dialog-actions">
        <button
          type="button"
          className="destructive-dialog-confirm"
          onClick={onConfirm}
          aria-label={`Confirm ${command} on ${site}`}
        >
          {command}
        </button>
        <button
          type="button"
          className="destructive-dialog-cancel"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
