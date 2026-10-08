/**
 * Skill journey: pure function merging curator ledger events, review git
 * commits, and proposal approve/reject records into a single newest-first
 * timeline.
 *
 * Pure: no I/O. Callers (desktop main, tests) supply the pre-parsed arrays.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** An action logged by the curator (archive, mark_stale, restore, pin, unpin). */
export interface JourneyCuratorEvent {
  type: "curator";
  ts: string;
  actor: string;
  action: string;
  skill: string;
}

/** A commit on fcode/self-improve in the frappeskills repo. */
export interface JourneyCommitEvent {
  type: "git-commit";
  ts: string;
  hash: string;
  skill: string;
  message: string;
}

/** A pending proposal that was approved or rejected. */
export interface JourneyProposalEvent {
  type: "proposal-approved" | "proposal-rejected";
  ts: string;
  skill: string;
  id: string;
}

export type JourneyEvent = JourneyCuratorEvent | JourneyCommitEvent | JourneyProposalEvent;

// ── buildJourneyTimeline (pure, exported for unit tests) ──────────────────────

/**
 * Merge all event sources into a single timeline, newest first.
 * Input arrays are already parsed; this function only sorts.
 *
 * @param events Any mix of JourneyEvent items from all sources.
 */
export function buildJourneyTimeline(events: JourneyEvent[]): JourneyEvent[] {
  return [...events].sort((a, b) => {
    // Descending by ISO timestamp string (lexicographic comparison works for
    // ISO-8601 strings with the same timezone offset, which we always use).
    if (b.ts < a.ts) return -1;
    if (b.ts > a.ts) return 1;
    return 0;
  });
}
