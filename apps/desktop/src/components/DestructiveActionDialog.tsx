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
 *
 * Portal: rendered to document.body so an ancestor overflow:hidden / transform
 * in the chat scroller or PermissionCard host cannot clip the overlay.
 */

import { useEffect, useRef } from "react";
import { Button } from "./ui";
import { portalToBody } from "../lib/portal-visibility";

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

/**
 * Returns the next focus index in a circular focus list.
 * Pure and DOM-free — unit-testable without a browser.
 *
 * @param current  - index of the currently focused item
 * @param count    - total number of focusable items
 * @param shiftKey - true when moving backward (Shift+Tab)
 */
export function nextFocusIndex(
  current: number,
  count: number,
  shiftKey: boolean,
): number {
  if (count === 0) return 0;
  return shiftKey ? (current - 1 + count) % count : (current + 1) % count;
}

export function DestructiveActionDialog({
  site,
  command,
  consequence,
  onConfirm,
  onCancel,
}: DestructiveActionDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // Focus Cancel (safe default) so keyboard users don't accidentally confirm.
    requestAnimationFrame(() => cancelRef.current?.focus());
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled])",
      );
      if (!focusable?.length) return;
      const arr = Array.from(focusable);
      const idx = arr.indexOf(document.activeElement as HTMLElement);
      if (idx === -1) return;
      // Only intercept at boundaries; natural browser tab order handles the rest.
      const atBoundary = event.shiftKey ? idx === 0 : idx === arr.length - 1;
      if (!atBoundary) return;
      event.preventDefault();
      arr[nextFocusIndex(idx, arr.length, event.shiftKey)].focus();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onCancel]);

  const dialog = (
    <div
      className="overlay"
      role="presentation"
      onClick={(event) => {
        // Backdrop click cancels; does NOT confirm (plan D14).
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dd-title"
        aria-describedby="dd-desc"
        className="dialog destructive-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="dd-title" className="dd-title">
          Confirm: {command}
        </h2>

        <p id="dd-desc" className="dd-body">
          {/* One sentence naming site, command and consequence — plan D14. */}
          Run <strong>{command}</strong> on <strong>{site}</strong>. This{" "}
          {consequence} and cannot be undone.
        </p>

        <div className="dd-actions">
          <Button
            ref={cancelRef}
            type="button"
            variant="secondary"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={onConfirm}
            aria-label={`Run ${command} on ${site}`}
          >
            Run {command}
          </Button>
        </div>
      </div>
    </div>
  );

  return portalToBody(dialog);
}
