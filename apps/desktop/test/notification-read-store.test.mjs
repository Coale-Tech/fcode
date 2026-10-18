/**
 * Behavioural tests for notification-read-store persistence.
 * Verifies that read state survives a process restart (reload from disk)
 * and that overlayReadStore applies the watermark and per-id acks correctly.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const {
  readNotificationReadStore,
  writeNotificationReadStore,
  storeWithReadId,
  storeWithReadBefore,
  overlayReadStore,
} = await import("../electron/main/ipc/notification-read-store.ts");

function tempDir() {
  return mkdtempSync(join(tmpdir(), "notif-read-"));
}

function notif(id, createdAt, readAt = null) {
  return { id, createdAt, readAt };
}

// ── read/write round-trip ────────────────────────────────────────────────────

test("readNotificationReadStore returns empty state when no file exists", () => {
  const dir = tempDir();
  try {
    const store = readNotificationReadStore(dir);
    assert.equal(store.readBefore, null);
    assert.deepEqual(store.readIds, []);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("written read state survives a reload (simulates restart)", () => {
  const dir = tempDir();
  try {
    const ts = Date.now();
    let store = { readBefore: ts, readIds: ["id-1", "id-2"] };
    writeNotificationReadStore(dir, store);

    const reloaded = readNotificationReadStore(dir);
    assert.equal(reloaded.readBefore, ts);
    assert.deepEqual(reloaded.readIds, ["id-1", "id-2"]);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

// ── storeWithReadBefore ──────────────────────────────────────────────────────

test("storeWithReadBefore raises the watermark, never lowers it", () => {
  const base = { readBefore: 1000, readIds: [] };
  assert.equal(storeWithReadBefore(base, 2000).readBefore, 2000);
  assert.equal(storeWithReadBefore(base, 500).readBefore, 1000); // lower → ignored
  assert.equal(storeWithReadBefore({ readBefore: null, readIds: [] }, 999).readBefore, 999);
});

// ── storeWithReadId ──────────────────────────────────────────────────────────

test("storeWithReadId appends without duplicating", () => {
  const s0 = { readBefore: null, readIds: ["a"] };
  const s1 = storeWithReadId(s0, "b");
  assert.deepEqual(s1.readIds, ["a", "b"]);
  const s2 = storeWithReadId(s1, "a"); // re-add existing
  assert.deepEqual(s2.readIds, ["b", "a"]); // deduped, moved to end
});

// ── overlayReadStore ─────────────────────────────────────────────────────────

test("overlayReadStore marks notif as read by id", () => {
  const store = { readBefore: null, readIds: ["n1"] };
  const n = notif("n1", new Date(Date.now() - 1000).toISOString());
  const [out] = overlayReadStore([n], store);
  assert.ok(out.readAt, "should be marked read by id");
});

test("overlayReadStore marks notif as read by time watermark", () => {
  const past = Date.now() - 5000;
  const store = { readBefore: past + 1000, readIds: [] };
  const n = notif("n2", new Date(past).toISOString());
  const [out] = overlayReadStore([n], store);
  assert.ok(out.readAt, "should be marked read by time");
});

test("overlayReadStore does not mark notif created after watermark", () => {
  const now = Date.now();
  const store = { readBefore: now - 5000, readIds: [] };
  const n = notif("n3", new Date(now).toISOString());
  const [out] = overlayReadStore([n], store);
  assert.equal(out.readAt, null, "notif after watermark should stay unread");
});

test("overlayReadStore preserves already-set readAt", () => {
  const store = { readBefore: Date.now() + 9999, readIds: ["n4"] };
  const existingReadAt = "2020-01-01T00:00:00.000Z";
  const n = { ...notif("n4", "2019-01-01T00:00:00.000Z"), readAt: existingReadAt };
  const [out] = overlayReadStore([n], store);
  assert.equal(out.readAt, existingReadAt, "existing readAt must not be changed");
});

test("overlayReadStore is a no-op when store is empty", () => {
  const store = { readBefore: null, readIds: [] };
  const ns = [notif("a", new Date().toISOString()), notif("b", new Date().toISOString())];
  const out = overlayReadStore(ns, store);
  assert.ok(out === ns, "same array reference returned when nothing to do");
});

// ── mark-all-read survives reload ────────────────────────────────────────────

test("markAllRead watermark persists and is applied on next list (simulates restart)", () => {
  const dir = tempDir();
  try {
    const before = Date.now() - 1;
    // Simulate mark-all-read: persist watermark
    const store = storeWithReadBefore({ readBefore: null, readIds: [] }, before);
    writeNotificationReadStore(dir, store);

    // Simulate app restart: reload from disk
    const reloaded = readNotificationReadStore(dir);

    // Simulate host returning notifications as still unread
    const ns = [
      notif("x", new Date(before - 100).toISOString()),
      notif("y", new Date(before - 200).toISOString()),
    ];
    const overlaid = overlayReadStore(ns, reloaded);
    assert.ok(overlaid.every((n) => n.readAt !== null), "all pre-watermark notifs must be read");
  } finally {
    rmSync(dir, { recursive: true });
  }
});
