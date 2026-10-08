/**
 * Unit tests for buildJourneyTimeline — pure sort/merge of three event sources.
 */
import { describe, expect, it } from "vitest";
import { buildJourneyTimeline, type JourneyEvent } from "./skill-journey.js";

describe("buildJourneyTimeline", () => {
  const curator = (ts: string, action: string, skill: string): JourneyEvent => ({
    type: "curator",
    ts,
    actor: "curator",
    action,
    skill,
  });

  const commit = (ts: string, skill: string, hash = "abc"): JourneyEvent => ({
    type: "git-commit",
    ts,
    hash,
    skill,
    message: `Fcode: review — ${skill}`,
  });

  const approved = (ts: string, skill: string): JourneyEvent => ({
    type: "proposal-approved",
    ts,
    skill,
    id: `${ts}-${skill}`,
  });

  const rejected = (ts: string, skill: string): JourneyEvent => ({
    type: "proposal-rejected",
    ts,
    skill,
    id: `${ts}-${skill}`,
  });

  it("returns empty array for no events", () => {
    expect(buildJourneyTimeline([])).toEqual([]);
  });

  it("sorts newest first", () => {
    const events = [
      curator("2026-01-01T10:00:00.000Z", "archive", "old-skill"),
      commit("2026-06-15T12:00:00.000Z", "new-skill"),
      approved("2026-03-10T08:00:00.000Z", "mid-skill"),
    ];
    const result = buildJourneyTimeline(events);
    expect(result.map((e) => e.ts)).toEqual([
      "2026-06-15T12:00:00.000Z",
      "2026-03-10T08:00:00.000Z",
      "2026-01-01T10:00:00.000Z",
    ]);
  });

  it("handles same-timestamp events stably (both present)", () => {
    const ts = "2026-05-01T00:00:00.000Z";
    const a = curator(ts, "pin", "skill-a");
    const b = commit(ts, "skill-b");
    const result = buildJourneyTimeline([a, b]);
    // Both events should appear; order for equal ts is unspecified but both present.
    expect(result).toHaveLength(2);
  });

  it("does not mutate the input array", () => {
    const events: JourneyEvent[] = [
      commit("2026-02-01T00:00:00.000Z", "b"),
      commit("2026-01-01T00:00:00.000Z", "a"),
    ];
    const copy = [...events];
    buildJourneyTimeline(events);
    expect(events[0]).toBe(copy[0]);
    expect(events[1]).toBe(copy[1]);
  });

  it("mixes all three event types", () => {
    const events: JourneyEvent[] = [
      rejected("2026-01-03T00:00:00.000Z", "rejected-skill"),
      curator("2026-01-01T00:00:00.000Z", "restore", "old-skill"),
      commit("2026-01-02T00:00:00.000Z", "commit-skill"),
      approved("2026-01-04T00:00:00.000Z", "approved-skill"),
    ];
    const result = buildJourneyTimeline(events);
    expect(result.map((e) => e.type)).toEqual([
      "proposal-approved",
      "proposal-rejected",
      "git-commit",
      "curator",
    ]);
  });
});
