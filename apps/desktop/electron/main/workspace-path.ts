/**
 * The workspace the window is showing, from the cache Main keeps in sync with
 * every `workspace.get` / open-folder result. Synchronous on purpose: scope
 * filtering runs inside IPC handlers that must not await the host.
 */
export function currentWorkspacePath(): string | null {
  return (globalThis as { __piWorkspacePath?: string | null }).__piWorkspacePath ?? null;
}

/** One-line message for an error of unknown shape, for user-facing lists. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 300);
  return String(error).slice(0, 300);
}
