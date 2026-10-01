/**
 * Pure reducer for the Collab / Share panel (feat/collab-panel).
 *
 * Models the `/share` snapshot flow:
 *   idle → loading → (url | error) → idle (on reset)
 *
 * `/collab` live session is TUI-only in the current omp build; this reducer
 * only tracks snapshot share state.
 */

export type OmpCollabPhase = "idle" | "loading" | "url" | "error";

export interface OmpCollabState {
  phase: OmpCollabPhase;
  /** Share URL, present when phase === "url". */
  url: string | null;
  /** Raw text from the /share command (may include gist URL or notices). */
  text: string | null;
  /** Error message, present when phase === "error". */
  error: string | null;
}

export type OmpCollabAction =
  | { type: "share_requested" }
  | { type: "share_success"; url: string | null; text: string | null }
  | { type: "share_error"; error: string }
  | { type: "reset" };

export const OMP_COLLAB_INITIAL: OmpCollabState = {
  phase: "idle",
  url: null,
  text: null,
  error: null,
};

/**
 * Reduce an OmpCollabAction into a new state.
 * Never mutates the input — always returns a new object on change.
 */
export function ompCollabReducer(
  state: OmpCollabState,
  action: OmpCollabAction,
): OmpCollabState {
  switch (action.type) {
    case "share_requested":
      if (state.phase === "loading") return state;
      return { phase: "loading", url: null, text: null, error: null };

    case "share_success":
      return {
        phase: action.url ? "url" : "error",
        url: action.url,
        text: action.text,
        error: action.url ? null : "No share URL in response",
      };

    case "share_error":
      return { phase: "error", url: null, text: null, error: action.error };

    case "reset":
      return OMP_COLLAB_INITIAL;

    default:
      return state;
  }
}

/**
 * Extract the first URL from a `/share` text reply.
 * Handles: "Share URL: https://..." and "Gist: https://..."
 * Returns null when no URL is found (e.g. network error output).
 */
export function extractShareUrl(text: string): string | null {
  const match = text.match(/Share URL:\s*(\S+)/);
  return match?.[1] ?? null;
}
