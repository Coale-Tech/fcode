/**
 * Behavioural tests for the Scheduled page's pure run-time formatters and the
 * notification inbox's row age.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  formatClock,
  formatDayTime,
  formatWeekdays,
  runDurationSeconds,
} from "../src/lib/scheduled-format.ts";
import { notificationAge } from "../src/lib/notification-time.ts";

const now = new Date(2026, 9, 14, 10, 30); // Wed 14 Oct 2026, 10:30 local

test("same calendar day → today with a 24-hour clock", () => {
  assert.deepEqual(formatDayTime(new Date(2026, 9, 14, 8, 0), now, "en-US"), { kind: "today", time: "08:00" });
});

test("next and previous calendar day → tomorrow / yesterday", () => {
  assert.deepEqual(formatDayTime(new Date(2026, 9, 15, 2, 0), now, "en-US"), { kind: "tomorrow", time: "02:00" });
  assert.deepEqual(formatDayTime(new Date(2026, 9, 13, 23, 59), now, "en-US"), { kind: "yesterday", time: "23:59" });
});

test("later this week → short weekday and time", () => {
  assert.deepEqual(formatDayTime(new Date(2026, 9, 19, 7, 30), now, "en-US"), { kind: "date", text: "Mon 07:30" });
});

test("older dates → month, day and time", () => {
  assert.deepEqual(formatDayTime(new Date(2026, 9, 11, 8, 0), now, "en-US"), { kind: "date", text: "Oct 11, 08:00" });
});

test("clock never uses a 12-hour cycle", () => {
  assert.equal(formatClock(new Date(2026, 9, 14, 14, 5), "en-US"), "14:05");
});

test("consecutive weekday runs collapse to a span", () => {
  assert.equal(formatWeekdays([4, 0, 1, 2, 3], "en-US"), "Mon – Fri");
  assert.equal(formatWeekdays([0], "en-US"), "Mon");
  assert.equal(formatWeekdays([0, 2, 2], "en-US"), "Mon, Wed");
  assert.equal(formatWeekdays([0, 1, 2, 5], "en-US"), "Mon – Wed, Sat");
});

test("run duration is whole seconds, null while running", () => {
  assert.equal(runDurationSeconds("2026-10-14T08:00:00Z", "2026-10-14T08:00:12.400Z"), 12);
  assert.equal(runDurationSeconds("2026-10-14T08:00:00Z", null), null);
});

test("notification age: just now, minutes, hours today, then day + time", () => {
  assert.deepEqual(notificationAge(new Date(now.getTime() - 10_000), now, "en-US"), { kind: "now" });
  assert.deepEqual(notificationAge(new Date(now.getTime() - 120_000), now, "en-US"), { kind: "minutes", minutes: 2 });
  assert.deepEqual(notificationAge(new Date(2026, 9, 14, 8, 20), now, "en-US"), { kind: "hours", hours: 2 });
  assert.deepEqual(notificationAge(new Date(2026, 9, 13, 7, 30), now, "en-US"), { kind: "yesterday", time: "07:30" });
});
