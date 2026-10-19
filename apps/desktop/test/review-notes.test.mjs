/**
 * Tests for the review-notes pure helpers (prompt composer + stale detection)
 * and the slice reducer logic (add/update/resolve/remove/send).
 *
 * Node --test; imports real TS via ts-import-hooks.
 */
import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const {
  composeReviewNotesPrompt,
  extendNoteRange,
  isNoteOutdated,
} = await import("../src/lib/review-notes-prompt.ts");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _idCounter = 0;
function note(overrides = {}) {
  return {
    id: `note-${++_idCounter}`,
    snapshotId: "snap-1",
    path: "src/foo.ts",
    line: 10,
    lineIsOld: false,
    endLine: null,
    anchorText: "const x = 1;",
    body: "Fix this",
    resolved: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// composeReviewNotesPrompt
// ---------------------------------------------------------------------------

test("empty prompt when all notes resolved", () => {
  const result = composeReviewNotesPrompt([note({ resolved: true })]);
  assert.equal(result, "");
});

test("empty prompt when notes array is empty", () => {
  assert.equal(composeReviewNotesPrompt([]), "");
});

test("single-line note renders path:line and anchor", () => {
  const result = composeReviewNotesPrompt([
    note({ path: "src/foo.ts", line: 42, anchorText: "const x = 1;", body: "Use let here" }),
  ]);
  assert.match(result, /### src\/foo\.ts/);
  assert.match(result, /- L42 `const x = 1;`/);
  assert.match(result, /  Use let here/);
});

test("range note renders L<start>-L<end>", () => {
  const result = composeReviewNotesPrompt([
    note({ line: 10, endLine: 15, anchorText: "foo()", body: "Extract method" }),
  ]);
  assert.match(result, /- L10-L15 `foo\(\)`/);
  assert.match(result, /  Extract method/);
});

test("whole-file note renders (whole file) with no anchor", () => {
  const result = composeReviewNotesPrompt([
    note({ line: null, lineIsOld: null, endLine: null, anchorText: null, body: "Review entire file" }),
  ]);
  assert.match(result, /- \(whole file\)/);
  assert.match(result, /  Review entire file/);
  assert.doesNotMatch(result, /`/);
});

test("resolved notes are excluded from prompt", () => {
  const notes = [
    note({ line: 1, body: "keep me", resolved: false }),
    note({ line: 2, body: "skip me", resolved: true }),
  ];
  const result = composeReviewNotesPrompt(notes);
  assert.match(result, /keep me/);
  assert.doesNotMatch(result, /skip me/);
});

test("files grouped and ordered by first appearance", () => {
  const notes = [
    note({ path: "src/b.ts", line: 5, body: "B note" }),
    note({ path: "src/a.ts", line: 3, body: "A note" }),
    note({ path: "src/b.ts", line: 7, body: "B note 2" }),
  ];
  const result = composeReviewNotesPrompt(notes);
  const idxB = result.indexOf("### src/b.ts");
  const idxA = result.indexOf("### src/a.ts");
  assert.ok(idxB < idxA, "src/b.ts should appear before src/a.ts (first-note order)");
});

test("within a file notes sorted by line ascending, whole-file first", () => {
  const notes = [
    note({ path: "src/x.ts", line: 20, body: "Line 20" }),
    note({ path: "src/x.ts", line: null, lineIsOld: null, endLine: null, anchorText: null, body: "Whole file" }),
    note({ path: "src/x.ts", line: 5, body: "Line 5" }),
  ];
  const result = composeReviewNotesPrompt(notes);
  const idxWhole = result.indexOf("Whole file");
  const idx5 = result.indexOf("Line 5");
  const idx20 = result.indexOf("Line 20");
  assert.ok(idxWhole < idx5, "whole-file note must come before line notes");
  assert.ok(idx5 < idx20, "line 5 must come before line 20");
});

test("prompt starts with the fixed preamble", () => {
  const result = composeReviewNotesPrompt([note()]);
  assert.ok(
    result.startsWith(
      "Review notes on the changes you just made. Address every note, then report what you changed.",
    ),
  );
});

test("two notes same path → single ### heading", () => {
  const notes = [
    note({ path: "src/x.ts", line: 1, body: "N1" }),
    note({ path: "src/x.ts", line: 2, body: "N2" }),
  ];
  const result = composeReviewNotesPrompt(notes);
  const count = (result.match(/### src\/x\.ts/g) ?? []).length;
  assert.equal(count, 1);
});

// ---------------------------------------------------------------------------
// isNoteOutdated
// ---------------------------------------------------------------------------

const SAMPLE_HUNKS = [
  {
    header: "@@ -1,3 +1,3 @@",
    lines: [
      { type: "context", text: "line 1" },
      { type: "del",     text: "old line 2" },
      { type: "add",     text: "new line 2" },
      { type: "context", text: "line 3" },
    ],
  },
];

test("note matching its anchor text is not outdated", () => {
  const n = note({ line: 2, lineIsOld: false, anchorText: "new line 2" });
  assert.equal(isNoteOutdated(n, SAMPLE_HUNKS), false);
});

test("note whose anchor text has changed is outdated", () => {
  const n = note({ line: 2, lineIsOld: false, anchorText: "stale text" });
  assert.equal(isNoteOutdated(n, SAMPLE_HUNKS), true);
});

test("note whose line number is absent from hunks is outdated", () => {
  const n = note({ line: 99, lineIsOld: false, anchorText: "anything" });
  assert.equal(isNoteOutdated(n, SAMPLE_HUNKS), true);
});

test("whole-file note is never outdated", () => {
  const n = note({ line: null, lineIsOld: null, anchorText: null });
  assert.equal(isNoteOutdated(n, SAMPLE_HUNKS), false);
});

test("del-side note matched by old-file line number", () => {
  const n = note({ line: 2, lineIsOld: true, anchorText: "old line 2" });
  assert.equal(isNoteOutdated(n, SAMPLE_HUNKS), false);
});

test("del-side note with new-side flag is outdated (side mismatch)", () => {
  // The del line is at old=2, but we ask for new-side line 2 which resolves to "new line 2"
  const n = note({ line: 2, lineIsOld: false, anchorText: "old line 2" });
  assert.equal(isNoteOutdated(n, SAMPLE_HUNKS), true);
});

test("extending a range upward re-anchors to the new start line (not outdated after save)", () => {
  const r = extendNoteRange({ line: 2, endLine: null, anchorText: "new line 2" }, 1, "new line 1");
  assert.deepEqual(r, { line: 1, endLine: 2, anchorText: "new line 1" });
});

test("extending a range downward keeps the start anchor and never shrinks", () => {
  const down = extendNoteRange({ line: 1, endLine: null, anchorText: "a" }, 4, "d");
  assert.deepEqual(down, { line: 1, endLine: 4, anchorText: "a" });
  const inside = extendNoteRange(down, 2, "b");
  assert.deepEqual(inside, down);
});

test("shift-clicking the start line of a single-line note leaves it single-line", () => {
  assert.deepEqual(extendNoteRange({ line: 3, endLine: null, anchorText: "c" }, 3, "c"), { line: 3, endLine: null, anchorText: "c" });
});

// ---------------------------------------------------------------------------
// Slice reducer logic (pure state mutations, no zustand)
// ---------------------------------------------------------------------------

// Exercise the reducer functions as pure transformations over a plain state object.
// We import the slice factory and wrap it with a minimal store stub.

const { createReviewNotesSlice } = await import("../src/stores/slices/review-notes-slice.ts");

function makeStore() {
  let state = { reviewNotes: {}, sendPrompt: async () => true };
  const get = () => state;
  const set = (updater) => {
    const delta = typeof updater === "function" ? updater(state) : updater;
    state = { ...state, ...delta };
  };
  const actions = createReviewNotesSlice({ get, set });
  // Merge actions so sendReviewNotes can call state.sendPrompt
  state = { ...state, ...actions };
  return { get, actions };
}

test("addReviewNote appends under the correct snapshotId", () => {
  const { get, actions } = makeStore();
  const id = actions.addReviewNote({
    snapshotId: "snap-A",
    path: "foo.ts",
    line: 5,
    lineIsOld: false,
    endLine: null,
    anchorText: "hi",
    body: "note body",
  });
  const notes = get().reviewNotes["snap-A"] ?? [];
  assert.equal(notes.length, 1);
  assert.equal(notes[0].id, id);
  assert.equal(notes[0].body, "note body");
  assert.equal(notes[0].resolved, false);
});

test("updateReviewNote changes only the body", () => {
  const { get, actions } = makeStore();
  const id = actions.addReviewNote({
    snapshotId: "snap-B", path: "foo.ts", line: 1, lineIsOld: false,
    endLine: null, anchorText: "x", body: "original",
  });
  actions.updateReviewNote(id, "updated");
  const n = get().reviewNotes["snap-B"][0];
  assert.equal(n.body, "updated");
  assert.equal(n.id, id);
});

test("resolveReviewNote toggles resolved flag", () => {
  const { get, actions } = makeStore();
  const id = actions.addReviewNote({
    snapshotId: "snap-C", path: "foo.ts", line: 3, lineIsOld: false,
    endLine: null, anchorText: "y", body: "resolve me",
  });
  actions.resolveReviewNote(id, true);
  assert.equal(get().reviewNotes["snap-C"][0].resolved, true);
  actions.resolveReviewNote(id, false);
  assert.equal(get().reviewNotes["snap-C"][0].resolved, false);
});

test("removeReviewNote deletes the note", () => {
  const { get, actions } = makeStore();
  const id = actions.addReviewNote({
    snapshotId: "snap-D", path: "foo.ts", line: 7, lineIsOld: false,
    endLine: null, anchorText: "z", body: "delete me",
  });
  actions.removeReviewNote(id);
  assert.equal(get().reviewNotes["snap-D"]?.length ?? 0, 0);
});

test("sendReviewNotes returns false when all notes resolved", async () => {
  const { get, actions } = makeStore();
  actions.addReviewNote({
    snapshotId: "snap-E", path: "foo.ts", line: 1, lineIsOld: false,
    endLine: null, anchorText: "a", body: "already resolved",
  });
  const id = get().reviewNotes["snap-E"][0].id;
  actions.resolveReviewNote(id, true);

  const result = await actions.sendReviewNotes(["snap-E"]);
  assert.equal(result, false);
});

test("sendReviewNotes marks sent notes resolved and returns true", async () => {
  const { get, actions } = makeStore();
  actions.addReviewNote({
    snapshotId: "snap-F", path: "foo.ts", line: 2, lineIsOld: false,
    endLine: null, anchorText: "b", body: "send me",
  });
  const result = await actions.sendReviewNotes(["snap-F"]);
  assert.equal(result, true);
  assert.equal(get().reviewNotes["snap-F"][0].resolved, true);
});

test("second sendReviewNotes after all resolved returns false", async () => {
  const { actions } = makeStore();
  actions.addReviewNote({
    snapshotId: "snap-G", path: "foo.ts", line: 3, lineIsOld: false,
    endLine: null, anchorText: "c", body: "send twice",
  });
  await actions.sendReviewNotes(["snap-G"]);
  const second = await actions.sendReviewNotes(["snap-G"]);
  assert.equal(second, false);
});

test("sendReviewNotes calls sendPrompt with correct content", async () => {
  let capturedContent = null;
  let state = {
    reviewNotes: {},
    sendPrompt: async (content) => { capturedContent = content; return true; },
  };
  const get = () => state;
  const set = (u) => { state = { ...state, ...(typeof u === "function" ? u(state) : u) }; };
  const actions = createReviewNotesSlice({ get, set });
  state = { ...state, ...actions };

  state.reviewNotes["snap-H"] = [{
    id: "n1", snapshotId: "snap-H", path: "src/bar.ts", line: 10,
    lineIsOld: false, endLine: null, anchorText: "const foo = 1",
    body: "Use const properly", resolved: false, createdAt: Date.now(),
  }];

  await state.sendReviewNotes(["snap-H"]);
  assert.ok(capturedContent, "sendPrompt was called");
  assert.match(capturedContent, /### src\/bar\.ts/);
  assert.match(capturedContent, /L10/);
  assert.match(capturedContent, /Use const properly/);
});
