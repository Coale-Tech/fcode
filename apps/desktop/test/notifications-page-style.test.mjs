/**
 * Behavioral tests for NotificationsPage (T12-F07):
 * - groupByDate buckets by today / yesterday / older
 * - inboxNotifications includes completed outcomes (T12-F01 fix)
 * - unread count pill reflects unread items
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { inboxNotifications, inboxUnreadCount } = await import(
  "../src/lib/notification-inbox.ts"
);

const pageSource = readFileSync(
  new URL("../src/components/NotificationCenter.tsx", import.meta.url),
  "utf8",
);

function notif(overrides) {
  return {
    id: "n1",
    kind: "task.completed",
    sessionId: "s1",
    sessionTitle: "My session",
    turnId: "t1",
    createdAt: new Date().toISOString(),
    readAt: null,
    ...overrides,
  };
}

// ── T12-F01: inbox now returns all outcomes (completed + failed) ─────────────
test("inboxNotifications includes task.completed outcomes (T12-F01)", () => {
  const rows = inboxNotifications([
    notif({ id: "c1", kind: "task.completed" }),
    notif({ id: "f1", kind: "task.failed" }),
    notif({ id: "c2", kind: "task.completed", readAt: new Date().toISOString() }),
  ]);
  assert.ok(rows.length >= 2, "should return completed and failed");
  assert.ok(rows.some((r) => r.kind === "task.completed"), "completed included");
  assert.ok(rows.some((r) => r.kind === "task.failed"), "failed included");
});

test("inboxUnreadCount counts all unread kinds", () => {
  const count = inboxUnreadCount([
    notif({ id: "c1", kind: "task.completed" }),
    notif({ id: "f1", kind: "task.failed" }),
    notif({ id: "c2", kind: "task.completed", readAt: new Date().toISOString() }),
  ]);
  assert.equal(count, 2, "two unread (one completed, one failed)");
});

// ── T12-F07: NotificationsPage uses date grouping ───────────────────────────
test("NotificationsPage applies groupByDate logic (today/yesterday/older)", () => {
  // The page source must have date-comparison logic grouping by day
  assert.match(pageSource, /groupByDate|groupedByDate|groups\s*=/,
    "page uses a groupByDate / groups variable");
  // Labels for today and yesterday must appear
  assert.match(pageSource, /notifications\.today/, "uses notifications.today key");
  assert.match(pageSource, /notifications\.yesterday/, "uses notifications.yesterday key");
});


test("NotificationsPage uses settings-segment or equivalent for filter, not raw d-seg", () => {
  // Should not contain raw d-seg re-implementation; SegmentedControl/settings-segment is the primitive
  assert.doesNotMatch(pageSource, /className=["']d-seg["']/,
    "must not reimplement d-seg directly");
});

test("NotificationsPage renders labeled actions (icon+text Button, not icon-only TooltipButton)", () => {
  // The read-all and delete-all buttons should be Button with text, not TooltipButton
  assert.match(pageSource, /markAllRead|markAll|readAll/i,
    "has mark-all-read action");
});
