/**
 * Tracks the number of chars injected as memory instructions for the last
 * system-prompt build of each session. Used by `get_memory_budget` RPC.
 *
 * WeakMap keyed on the session object so entries are GC'd with the session.
 */
const lastInjectedChars = new WeakMap<object, number>();

export function setLastInjectedChars(session: object, chars: number): void {
	lastInjectedChars.set(session, chars);
}

export function getLastInjectedChars(session: object): number {
	return lastInjectedChars.get(session) ?? 0;
}

/**
 * Truncate `text` to at most `maxChars` characters, never cutting mid-entry.
 * An "entry" boundary is a `\n\n` paragraph break. Falls back to a hard cut
 * if no paragraph break exists before `maxChars`. Returns unchanged when
 * `maxChars <= 0` (unlimited) or text fits.
 */
export function applyMemoryCharCap(text: string, maxChars: number): string {
	if (maxChars <= 0 || text.length <= maxChars) return text;
	const cut = text.lastIndexOf("\n\n", maxChars);
	return cut > 0 ? text.slice(0, cut) : text.slice(0, maxChars);
}
