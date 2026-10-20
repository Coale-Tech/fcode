import assert from "node:assert/strict";
import test from "node:test";

const { loadReviewNotes, saveReviewNotes } = await import("../src/lib/review-notes-storage.ts");

function withStorage(initial = {}) {
  const previous = globalThis.localStorage;
  const values = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, String(v)),
  };
  return { restore: () => (globalThis.localStorage = previous) };
}

const note = (over = {}) => ({
  id: "n1", snapshotId: "s1", path: "a.ts", line: 3, lineIsOld: false, endLine: 3,
  anchorText: "x", body: "fix", resolved: false, createdAt: 1, ...over,
});

test("notes survive a reload, including resolved state", () => {
  const s = withStorage();
  try {
    saveReviewNotes({ s1: [note(), note({ id: "n2", resolved: true })] });
    const loaded = loadReviewNotes();
    assert.deepEqual(loaded.s1.map((n) => [n.id, n.resolved]), [["n1", false], ["n2", true]]);
  } finally { s.restore(); }
});

test("corrupt or unwritable storage degrades to no notes instead of throwing", () => {
  const s = withStorage({ "pi.desktop.reviewNotes": "{not json" });
  try {
    assert.deepEqual(loadReviewNotes(), {});
    globalThis.localStorage.setItem = () => { throw new Error("quota"); };
    saveReviewNotes({ s1: [note()] });
  } finally { s.restore(); }
});

test("malformed entries are dropped and the stored set is capped at the newest notes", () => {
  const s = withStorage({ "pi.desktop.reviewNotes": JSON.stringify({ s1: [note(), { id: 5 }] }) });
  try {
    assert.equal(loadReviewNotes().s1.length, 1);
    const many = Array.from({ length: 520 }, (_, i) => note({ id: `n${i}`, createdAt: i }));
    saveReviewNotes({ s1: many });
    const kept = loadReviewNotes().s1;
    assert.equal(kept.length, 500);
    assert.equal(kept.some((n) => n.id === "n0"), false);
    assert.equal(kept.some((n) => n.id === "n519"), true);
  } finally { s.restore(); }
});

test("sentAt survives a storage round-trip", () => {
  const s = withStorage();
  try {
    const ts = 1234567890;
    saveReviewNotes({ s1: [note({ sentAt: ts })] });
    const loaded = loadReviewNotes();
    assert.equal(loaded.s1[0].sentAt, ts);
  } finally { s.restore(); }
});

test("non-finite sentAt is rejected when loading", () => {
  const bad = JSON.stringify({ s1: [{ ...note(), sentAt: Infinity }] });
  const s = withStorage({ "pi.desktop.reviewNotes": bad });
  try {
    // Infinity is stored as null in JSON.stringify, so the note has sentAt:null.
    // isNote checks typeof n.sentAt === "number" && isFinite — null fails typeof number.
    // The note itself should be dropped (invalid sentAt type in JSON).
    assert.equal(loadReviewNotes().s1?.length ?? 0, 0);
  } finally { s.restore(); }
});

test("non-number sentAt (e.g. string) causes note to be dropped on load", () => {
  const bad = JSON.stringify({ s1: [{ ...note(), sentAt: "yesterday" }] });
  const s = withStorage({ "pi.desktop.reviewNotes": bad });
  try {
    assert.equal(loadReviewNotes().s1?.length ?? 0, 0);
  } finally { s.restore(); }
});
