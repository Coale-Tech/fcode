import { describe, expect, it } from "vitest";
import { computeTokenMeterView } from "./token-meter.js";
import type { OmpSessionStatsResult } from "./types/omp.js";

function stats(
  input: number,
  output: number,
  cacheRead = 0,
  cacheWrite = 0,
  cost = 0,
): OmpSessionStatsResult {
  return {
    userMessages: 1,
    tokens: { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite },
    cost,
  };
}

describe("computeTokenMeterView", () => {
  describe("session fields", () => {
    it("copies tokens and cost from current stats", () => {
      const view = computeTokenMeterView(stats(1000, 500, 200, 100, 0.05));
      expect(view.session).toEqual({
        input: 1000,
        output: 500,
        cacheRead: 200,
        total: 1500,
        cost: 0.05,
      });
    });

    it("total is input + output only (cache counts excluded)", () => {
      const view = computeTokenMeterView(stats(800, 200, 9000, 50));
      expect(view.session.total).toBe(1000);
    });
  });

  describe("cacheHitRate", () => {
    it("returns null when there are no prompt tokens yet", () => {
      const view = computeTokenMeterView(stats(0, 0, 0));
      expect(view.cacheHitRate).toBeNull();
    });

    it("returns 0 when cacheRead is 0 but there are input tokens", () => {
      const view = computeTokenMeterView(stats(1000, 0, 0));
      expect(view.cacheHitRate).toBe(0);
    });

    it("returns 100 when all prompt tokens are cached", () => {
      const view = computeTokenMeterView(stats(0, 200, 1000));
      expect(view.cacheHitRate).toBe(100);
    });

    it("returns rounded percentage for partial cache hits", () => {
      // 300 cacheRead / (700 input + 300 cacheRead) = 30%
      const view = computeTokenMeterView(stats(700, 200, 300));
      expect(view.cacheHitRate).toBe(30);
    });

    it("rounds to nearest integer", () => {
      // 1 / 3 ≈ 33.33% → 33
      const view = computeTokenMeterView(stats(2, 0, 1));
      expect(view.cacheHitRate).toBe(33);
    });
  });

  describe("turnDelta (no prev)", () => {
    it("is null when no prev snapshot is given", () => {
      const view = computeTokenMeterView(stats(1000, 500));
      expect(view.turnDelta).toBeNull();
    });

    it("is null when prev is explicitly null", () => {
      const view = computeTokenMeterView(stats(1000, 500), null);
      expect(view.turnDelta).toBeNull();
    });
  });

  describe("turnDelta (with prev)", () => {
    it("computes delta from prev snapshot", () => {
      const prev = stats(1000, 500);
      const current = stats(2200, 800);
      const view = computeTokenMeterView(current, prev);
      expect(view.turnDelta).toEqual({ input: 1200, output: 300, total: 1500 });
    });

    it("is null when nothing changed between snapshots", () => {
      const s = stats(1000, 500);
      const view = computeTokenMeterView(s, s);
      expect(view.turnDelta).toBeNull();
    });

    it("clamps negative deltas to zero (e.g. after compaction)", () => {
      const prev = stats(5000, 2000);
      const current = stats(500, 300); // counters reset
      const view = computeTokenMeterView(current, prev);
      expect(view.turnDelta).toBeNull(); // total delta is 0 → null
    });

    it("output-only delta is captured", () => {
      const prev = stats(1000, 500);
      const current = stats(1000, 800); // only output grew
      const view = computeTokenMeterView(current, prev);
      expect(view.turnDelta).toEqual({ input: 0, output: 300, total: 300 });
    });

    it("feeds recorded omp usage frames through the mapper correctly", () => {
      // Simulate two successive omp get_session_stats responses as recorded
      // from a live session: turn-1 snapshot captured before the turn starts,
      // turn-2 snapshot captured after it completes.
      const beforeTurn: OmpSessionStatsResult = {
        userMessages: 2,
        tokens: { input: 12_000, output: 3_200, cacheRead: 45_000, cacheWrite: 1_000, total: 61_200 },
        cost: 0.12,
      };
      const afterTurn: OmpSessionStatsResult = {
        userMessages: 3,
        tokens: { input: 13_500, output: 4_100, cacheRead: 46_200, cacheWrite: 1_100, total: 64_900 },
        cost: 0.15,
      };
      const view = computeTokenMeterView(afterTurn, beforeTurn);
      expect(view.turnDelta).toEqual({ input: 1500, output: 900, total: 2400 });
      // cacheHitRate: 46200 / (13500 + 46200) = 46200/59700 ≈ 77%
      expect(view.cacheHitRate).toBe(77);
      expect(view.session.cost).toBe(0.15);
    });
  });
});
