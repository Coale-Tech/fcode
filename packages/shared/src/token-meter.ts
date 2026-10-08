/**
 * Per-session token/cost meter — pure view computation (no I/O, no React).
 * Used by ContextUsageInspector to derive session-level cache hit rate and
 * the turn delta (tokens charged in the most-recently-completed turn).
 */

import type { OmpSessionStatsResult } from "./types/omp.js";

export interface TokenMeterTurnDelta {
  /** Net new input tokens in the last turn (may be 0 when cache covers all). */
  input: number;
  output: number;
  /** input + output (not including cache) — the billable turn total. */
  total: number;
}

export interface TokenMeterView {
  session: {
    input: number;
    output: number;
    cacheRead: number;
    total: number;
    cost: number;
  };
  /**
   * Cumulative prompt-cache hit rate as a 0–100 integer, or `null` when there
   * are not yet any prompt tokens (avoids a division-by-zero result of 0%).
   * Formula: cacheRead / (input + cacheRead) × 100.
   */
  cacheHitRate: number | null;
  /**
   * Tokens charged in the most-recently-completed turn, derived from the
   * difference between `current` and `prev` snapshots. `null` when no
   * previous snapshot is available (i.e. the first turn of the session).
   */
  turnDelta: TokenMeterTurnDelta | null;
}

/**
 * Derive a `TokenMeterView` from a `current` session-stats snapshot and an
 * optional `prev` snapshot captured at the start of the last turn.
 *
 * All arithmetic is clamped at zero so backward-moving counters (e.g. after a
 * context compaction that resets the running total) never produce negative
 * deltas.
 */
export function computeTokenMeterView(
  current: OmpSessionStatsResult,
  prev?: OmpSessionStatsResult | null,
): TokenMeterView {
  const { tokens, cost } = current;

  // Session total: input + output only (cache counts are separate).
  const total = tokens.input + tokens.output;

  // Cache hit rate over the full session.
  const promptTokens = tokens.input + tokens.cacheRead;
  const cacheHitRate =
    promptTokens > 0
      ? Math.round((tokens.cacheRead / promptTokens) * 100)
      : null;

  // Turn delta: current minus prev, clamped to ≥ 0.
  let turnDelta: TokenMeterTurnDelta | null = null;
  if (prev) {
    const deltaInput = Math.max(0, tokens.input - prev.tokens.input);
    const deltaOutput = Math.max(0, tokens.output - prev.tokens.output);
    const deltaTotal = deltaInput + deltaOutput;
    // Only surface a delta when something actually changed.
    if (deltaTotal > 0) {
      turnDelta = { input: deltaInput, output: deltaOutput, total: deltaTotal };
    }
  }

  return {
    session: {
      input: tokens.input,
      output: tokens.output,
      cacheRead: tokens.cacheRead,
      total,
      cost,
    },
    cacheHitRate,
    turnDelta,
  };
}
