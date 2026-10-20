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

test("every line of a multi-line body stays inside its note", () => {
  const result = composeReviewNotesPrompt([
    note({ body: "first\n### not a file\n- not a note" }),
    note({ id: "n2", line: 9, body: "windows\r\nline" }),
  ]);
  assert.match(result, /\n {2}first\n {2}### not a file\n {2}- not a note/);
  assert.match(result, /\n {2}windows\n {2}line/);
  assert.equal((result.match(/^### /gm) ?? []).length, 1);
  assert.equal((result.match(/^- /gm) ?? []).length, 2);
});

test("anchors containing backticks use a longer fence", () => {
  const result = composeReviewNotesPrompt([note({ anchorText: "const s = `a${b}`;", body: "x" })]);
  assert.match(result, /- L\d+ `` const s = `a\$\{b\}`; ``|- L\d+ ``const s = `a\$\{b\}`;``/);
  const edge = composeReviewNotesPrompt([note({ anchorText: "`tick`", body: "x" })]);
  assert.match(edge, /`` `tick` ``/);
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

test("sendReviewNotes sets sentAt on sent notes and returns true", async () => {
  const { get, actions } = makeStore();
  actions.addReviewNote({
    snapshotId: "snap-F", path: "foo.ts", line: 2, lineIsOld: false,
    endLine: null, anchorText: "b", body: "send me",
  });
  const before = Date.now();
  const result = await actions.sendReviewNotes(["snap-F"]);
  assert.equal(result, true);
  const n = get().reviewNotes["snap-F"][0];
  assert.ok(typeof n.sentAt === "number" && n.sentAt >= before, "sentAt is a recent timestamp");
  assert.equal(n.resolved, false, "resolved stays false after send (sentAt tracks delivery)");
});

test("second sendReviewNotes after all sent returns false", async () => {
  const { actions } = makeStore();
  actions.addReviewNote({
    snapshotId: "snap-G", path: "foo.ts", line: 3, lineIsOld: false,
    endLine: null, anchorText: "c", body: "send twice",
  });
  await actions.sendReviewNotes(["snap-G"]);
  const second = await actions.sendReviewNotes(["snap-G"]);
  assert.equal(second, false);
});

test("sendReviewNotes returns false when all notes already sent", async () => {
  const { get, actions } = makeStore();
  actions.addReviewNote({
    snapshotId: "snap-SA", path: "foo.ts", line: 1, lineIsOld: false,
    endLine: null, anchorText: "a", body: "already sent",
  });
  await actions.sendReviewNotes(["snap-SA"]); // first send sets sentAt
  assert.ok(get().reviewNotes["snap-SA"][0].sentAt, "sentAt set after first send");
  const result = await actions.sendReviewNotes(["snap-SA"]);
  assert.equal(result, false, "second send returns false (note is counted as sent)");
});

test("edit with changed body clears sentAt and re-queues note", async () => {
  const { get, actions } = makeStore();
  actions.addReviewNote({
    snapshotId: "snap-RE", path: "foo.ts", line: 1, lineIsOld: false,
    endLine: null, anchorText: "a", body: "initial",
  });
  await actions.sendReviewNotes(["snap-RE"]);
  assert.ok(get().reviewNotes["snap-RE"][0].sentAt, "sentAt set after send");

  // Edit with a NEW body — should clear sentAt and allow re-send.
  const id = get().reviewNotes["snap-RE"][0].id;
  actions.updateReviewNote(id, "updated body");
  const updated = get().reviewNotes["snap-RE"][0];
  assert.equal(updated.sentAt, undefined, "sentAt cleared after body edit");
  assert.equal(updated.resolved, false, "resolved stays false");

  const second = await actions.sendReviewNotes(["snap-RE"]);
  assert.equal(second, true, "note is re-sent after edit");
  assert.ok(get().reviewNotes["snap-RE"][0].sentAt, "sentAt re-set after second send");
});

test("edit with UNCHANGED body does not clear sentAt", async () => {
  const { get, actions } = makeStore();
  actions.addReviewNote({
    snapshotId: "snap-UE", path: "foo.ts", line: 2, lineIsOld: false,
    endLine: null, anchorText: "b", body: "same",
  });
  await actions.sendReviewNotes(["snap-UE"]);
  const id = get().reviewNotes["snap-UE"][0].id;
  const sentAtBefore = get().reviewNotes["snap-UE"][0].sentAt;
  actions.updateReviewNote(id, "same"); // same body
  assert.equal(get().reviewNotes["snap-UE"][0].sentAt, sentAtBefore, "sentAt preserved when body unchanged");
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

test("sendReviewNotes does not resolve a note added or edited while the send was in flight", async () => {
  const mk = (id, body) => ({
    id, snapshotId: "snap-R", path: "a.ts", line: 1, lineIsOld: false, endLine: 1,
    anchorText: "x", body, resolved: false, createdAt: 1,
  });
  let state;
  const get = () => state;
  const set = (u) => { state = { ...state, ...(typeof u === "function" ? u(state) : u) }; };
  state = {
    reviewNotes: { "snap-R": [mk("sent", "ok"), mk("edited", "before")] },
    sendPrompt: async () => {
      // user keeps typing while the prompt is being accepted
      state.reviewNotes["snap-R"] = [
        mk("sent", "ok"), mk("edited", "after"), mk("late", "new note"),
      ];
      return true;
    },
  };
  state = { ...state, ...createReviewNotesSlice({ get, set }) };
  await state.sendReviewNotes(["snap-R"]);
  const byId = Object.fromEntries(state.reviewNotes["snap-R"].map((n) => [n.id, { sentAt: !!n.sentAt, resolved: n.resolved }]));
  assert.deepEqual(byId, {
    sent: { sentAt: true, resolved: false },  // composed note: gets sentAt
    edited: { sentAt: false, resolved: false }, // body changed in-flight: not marked
    late: { sentAt: false, resolved: false },   // added in-flight: not marked
  });
});

// ---------------------------------------------------------------------------
// A4: sendReviewNotes target='new' — new session routing
// ---------------------------------------------------------------------------

function makeNewSessionStore(overrides = {}) {
  let state = {
    reviewNotes: {},
    activeSessionId: "session-old",
    workspace: { path: "/project" },
    newSession: async () => { state.activeSessionId = "session-new"; },
    sendPrompt: async () => true,
    ...overrides,
  };
  const get = () => state;
  const set = (u) => { state = { ...state, ...(typeof u === "function" ? u(state) : u) }; };
  state = { ...state, ...createReviewNotesSlice({ get, set }) };
  return { get, state };
}

test("sendReviewNotes 'new' calls newSession and passes the new activeSessionId to sendPrompt", async () => {
  let capturedSessionId;
  const { get, state } = makeNewSessionStore({
    sendPrompt: async (_content, _draft, sid) => { capturedSessionId = sid; return true; },
  });
  state.addReviewNote({ snapshotId: "snap-N1", path: "a.ts", line: 1, lineIsOld: false, endLine: null, anchorText: "x", body: "note" });
  const result = await state.sendReviewNotes(["snap-N1"], "new");
  assert.equal(result, true);
  assert.equal(capturedSessionId, "session-new");
  assert.notEqual(capturedSessionId, "session-old");
  assert.ok(get().reviewNotes["snap-N1"][0].sentAt, "sentAt set after send to new session");
});

test("sendReviewNotes 'new' leaves notes unresolved when newSession throws", async () => {
  const { get, state } = makeNewSessionStore({
    newSession: async () => { throw new Error("offline"); },
  });
  state.addReviewNote({ snapshotId: "snap-N2", path: "b.ts", line: 2, lineIsOld: false, endLine: null, anchorText: "y", body: "note" });
  const result = await state.sendReviewNotes(["snap-N2"], "new");
  assert.equal(result, false);
  assert.equal(get().reviewNotes["snap-N2"][0].resolved, false);
});

test("sendReviewNotes 'new' leaves notes unresolved when sendPrompt returns false", async () => {
  const { get, state } = makeNewSessionStore({ sendPrompt: async () => false });
  state.addReviewNote({ snapshotId: "snap-N3", path: "c.ts", line: 3, lineIsOld: false, endLine: null, anchorText: "z", body: "note" });
  const result = await state.sendReviewNotes(["snap-N3"], "new");
  assert.equal(result, false);
  assert.equal(get().reviewNotes["snap-N3"][0].resolved, false);
});

test("sendReviewNotes 'current' does not call newSession", async () => {
  let newSessionCalled = false;
  const { state } = makeNewSessionStore({ newSession: async () => { newSessionCalled = true; } });
  state.addReviewNote({ snapshotId: "snap-N4", path: "d.ts", line: 1, lineIsOld: false, endLine: null, anchorText: "a", body: "note" });
  await state.sendReviewNotes(["snap-N4"], "current");
  assert.equal(newSessionCalled, false);
});

// ---------------------------------------------------------------------------
// A6: drag range — extendNoteRange covers the drag semantic
// ---------------------------------------------------------------------------

test("drag downward from line 5 to 8 produces line=5 endLine=8 same anchor", () => {
  const r = extendNoteRange({ line: 5, endLine: null, anchorText: "first" }, 8, "last");
  assert.equal(r.line, 5);
  assert.equal(r.endLine, 8);
  assert.equal(r.anchorText, "first");
});

test("drag upward from line 8 to line 5 re-anchors to the new start line", () => {
  const r = extendNoteRange({ line: 8, endLine: null, anchorText: "eighth" }, 5, "fifth");
  assert.equal(r.line, 5);
  assert.equal(r.endLine, 8);
  assert.equal(r.anchorText, "fifth");
});

test("drag to the same line as start leaves endLine null (single-line)", () => {
  const r = extendNoteRange({ line: 4, endLine: null, anchorText: "line4" }, 4, "line4");
  assert.equal(r.line, 4);
  assert.equal(r.endLine, null);
  assert.equal(r.anchorText, "line4");
});

test("drag never shrinks an existing range below the start line", () => {
  // Start range is 5-8; trying to drag to line 6 (inside) should not shrink to 5-6.
  const r = extendNoteRange({ line: 5, endLine: 8, anchorText: "fifth" }, 6, "sixth");
  assert.equal(r.line, 5);
  assert.equal(r.endLine, 8);
});
