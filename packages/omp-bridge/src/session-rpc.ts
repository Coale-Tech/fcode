/**
 * Session RPC forwarding — maps Fcode bridge method names to omp RPC command
 * types for the five commands not yet wired in bridge.ts.
 *
 * Each method is a simple ompCallAndForward(id, { type: ompType, ...params })
 * with no local processing. Verified by bridge tests and the session-rpc smoke.
 *
 * Decision D2 (fork): omp has no `fork` RPC command; `branch` (at an entryId)
 * is the equivalent. `native.session.fork` stays rejected with a visible reason.
 */

/** Bridge method name → omp RPC command type, for the session surface. */
export const SESSION_RPC_FORWARD = {
  "omp.session.getTree":         "get_tree",
  "omp.session.getMessages":     "get_messages",
  "omp.session.getMessagesPage": "get_messages_page",
  "omp.session.newSession":      "new_session",
  "omp.session.switchSession":   "switch_session",
} as const satisfies Record<string, string>;

export type SessionRpcMethod = keyof typeof SESSION_RPC_FORWARD;
