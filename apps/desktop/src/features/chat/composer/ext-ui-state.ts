/**
 * Pure reducer for omp extension UI state (setStatus / setWidget / setTitle).
 *
 * All three operations use a keyed-map pattern:
 *  - undefined/empty text/lines → clear the entry
 *  - non-empty → replace by key
 *
 * The reducer is a plain function so it can be tested independently of React.
 */

/** Per-session status entries: key → text. */
export type ExtStatusState = Record<string, string>;

/** Per-session widget entries: key → lines[]. */
export type ExtWidgetState = Record<string, string[]>;

/**
 * Apply a setStatus event to the status map.
 * Undefined or empty text clears the key; non-empty replaces it.
 */
export function applyExtStatus(
  state: ExtStatusState,
  key: string,
  text: string | undefined,
): ExtStatusState {
  if (!text) {
    if (!(key in state)) return state;
    const next = { ...state };
    delete next[key];
    return next;
  }
  if (state[key] === text) return state;
  return { ...state, [key]: text };
}

/**
 * Apply a setWidget event to the widget map.
 * Undefined or empty lines array clears the key; non-empty replaces it.
 */
export function applyExtWidget(
  state: ExtWidgetState,
  key: string,
  lines: string[] | undefined,
): ExtWidgetState {
  if (!lines || !lines.length) {
    if (!(key in state)) return state;
    const next = { ...state };
    delete next[key];
    return next;
  }
  return { ...state, [key]: lines };
}
