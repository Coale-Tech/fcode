import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { createDesignAnnotationsSlice } = await import("../src/stores/slices/design-annotations-slice.ts");
const { formatElementGrabPrompt } = await import("../src/lib/element-grab-format.ts");

const grab = (over = {}) => ({
  url: "http://localhost:3000/", title: "Home", selector: "#cta", path: "main > button#cta",
  tag: "button", accessibleName: "Buy", nearbyText: "Buy now", outerHTML: "<button id=\"cta\">Buy</button>",
  styles: { color: "red" }, rect: { x: 1, y: 2, width: 3, height: 4 }, fixedOrSticky: false, ...over,
});

function makeStore(sendPrompt, extra = {}) {
  let state = {
    designAnnotations: [],
    activeSessionId: null,
    workspace: null,
    sendPrompt,
    newSession: async () => {},
    ...extra,
  };
  const get = () => state;
  const set = (u) => { state = { ...state, ...(typeof u === "function" ? u(state) : u) }; };
  state = { ...state, ...createDesignAnnotationsSlice({ get, set }) };
  return { get, actions: state };
}

// ── Basic CRUD ───────────────────────────────────────────────────────────────

test("add, edit comment, remove and clear keep annotations independent", () => {
  const { get, actions } = makeStore(async () => true);
  actions.addDesignAnnotation(grab({ selector: "#a" }));
  actions.addDesignAnnotation(grab({ selector: "#b" }));
  const [a, b] = get().designAnnotations;
  actions.updateAnnotationComment(a.id, "make it blue");
  assert.deepEqual(get().designAnnotations.map((x) => x.comment), ["make it blue", ""]);
  actions.removeDesignAnnotation(a.id);
  assert.deepEqual(get().designAnnotations.map((x) => x.id), [b.id]);
  actions.clearDesignAnnotations();
  assert.equal(get().designAnnotations.length, 0);
});

// ── Intent ───────────────────────────────────────────────────────────────────

test("annotation defaults to intent 'change'", () => {
  const { get, actions } = makeStore(async () => true);
  actions.addDesignAnnotation(grab());
  assert.equal(get().designAnnotations[0].intent, "change");
});

test("updateAnnotationIntent changes only the targeted annotation", () => {
  const { get, actions } = makeStore(async () => true);
  actions.addDesignAnnotation(grab({ selector: "#a" }));
  actions.addDesignAnnotation(grab({ selector: "#b" }));
  const [a, b] = get().designAnnotations;
  actions.updateAnnotationIntent(a.id, "fix");
  assert.equal(get().designAnnotations.find((x) => x.id === a.id).intent, "fix");
  assert.equal(get().designAnnotations.find((x) => x.id === b.id).intent, "change");
});

test("intent appears in rendered prompt text via formatElementGrabPrompt", () => {
  const g = grab();
  const out = formatElementGrabPrompt(g, "question");
  assert.match(out, /\*\*Intent:\*\* question/);
});

test("intent omitted from prompt when not provided", () => {
  const g = grab();
  const out = formatElementGrabPrompt(g);
  assert.doesNotMatch(out, /\*\*Intent:\*\*/);
});

// ── Send with target ──────────────────────────────────────────────────────────

test("send with target 'current' calls sendPrompt without creating a new session", async () => {
  let newSessionCalled = false;
  let capturedText = "";
  const { actions } = makeStore(
    async (text) => { capturedText = text; return true; },
    { newSession: async () => { newSessionCalled = true; } },
  );
  actions.addDesignAnnotation(grab());
  assert.equal(await actions.sendDesignAnnotations(false, "current"), true);
  assert.equal(newSessionCalled, false);
  assert.match(capturedText, /#cta/);
});

test("send with target 'new' creates a session and sends to it", async () => {
  let newSessionCalled = false;
  let capturedTargetSessionId;
  const SESSION_ID = "new-session-123";

  const store = makeStore(
    async (_text, _draft, targetId) => { capturedTargetSessionId = targetId; return true; },
    {
      newSession: async () => { newSessionCalled = true; store.get().activeSessionId = SESSION_ID; },
      activeSessionId: null,
    },
  );
  store.actions.addDesignAnnotation(grab());
  assert.equal(await store.actions.sendDesignAnnotations(false, "new"), true);
  assert.equal(newSessionCalled, true);
  assert.equal(capturedTargetSessionId, SESSION_ID);
});

test("failed new-session creation leaves all annotations in the tray", async () => {
  const { get, actions } = makeStore(async () => true, {
    newSession: async () => { throw new Error("session failed"); },
  });
  actions.addDesignAnnotation(grab({ selector: "#a" }));
  actions.addDesignAnnotation(grab({ selector: "#b" }));
  assert.equal(await actions.sendDesignAnnotations(false, "new"), false);
  assert.equal(get().designAnnotations.length, 2);
});

// ── Mid-send mutation and rejected send ───────────────────────────────────────

test("a send clears only what was sent; edits and additions made mid-send survive", async () => {
  let store;
  store = makeStore(async () => {
    const [first] = store.get().designAnnotations;
    store.actions.updateAnnotationComment(first.id, "changed while sending");
    store.actions.addDesignAnnotation(grab({ selector: "#late" }));
    return true;
  });
  store.actions.addDesignAnnotation(grab({ selector: "#a" }));
  store.actions.addDesignAnnotation(grab({ selector: "#b" }));
  assert.equal(await store.actions.sendDesignAnnotations(false), true);
  const left = store.get().designAnnotations;
  assert.deepEqual(left.map((x) => x.grab.selector), ["#a", "#late"]);
});

test("a rejected send keeps every annotation, and the prompt carries comment + element", async () => {
  let sent = "";
  const { get, actions } = makeStore(async (text) => { sent = text; return false; });
  actions.addDesignAnnotation(grab());
  actions.updateAnnotationComment(get().designAnnotations[0].id, "too small");
  assert.equal(await actions.sendDesignAnnotations(false), false);
  assert.equal(get().designAnnotations.length, 1);
  assert.match(sent, /too small/);
  assert.match(sent, /#cta/);
});

test("sending with nothing queued is a no-op", async () => {
  let called = false;
  const { actions } = makeStore(async () => { called = true; return true; });
  assert.equal(await actions.sendDesignAnnotations(true), false);
  assert.equal(called, false);
});

// ── Screenshot update ─────────────────────────────────────────────────────────

test("updateAnnotationScreenshot replaces screenshot on target only", () => {
  const { get, actions } = makeStore(async () => true);
  const shot = { mimeType: "image/jpeg", dataBase64: "abc123" };
  actions.addDesignAnnotation(grab({ selector: "#a", screenshot: shot }));
  actions.addDesignAnnotation(grab({ selector: "#b", screenshot: { mimeType: "image/jpeg", dataBase64: "xyz" } }));
  const [a, b] = get().designAnnotations;
  actions.updateAnnotationScreenshot(a.id, "NEW_B64");
  assert.equal(get().designAnnotations.find((x) => x.id === a.id).grab.screenshot.dataBase64, "NEW_B64");
  assert.equal(get().designAnnotations.find((x) => x.id === b.id).grab.screenshot.dataBase64, "xyz");
});

test("updateAnnotationScreenshot preserves mimeType", () => {
  const { get, actions } = makeStore(async () => true);
  actions.addDesignAnnotation(grab({ screenshot: { mimeType: "image/jpeg", dataBase64: "old" } }));
  const [a] = get().designAnnotations;
  actions.updateAnnotationScreenshot(a.id, "new");
  assert.equal(get().designAnnotations[0].grab.screenshot.mimeType, "image/jpeg");
});

test("updateAnnotationScreenshot is a no-op when annotation has no screenshot", () => {
  const { get, actions } = makeStore(async () => true);
  actions.addDesignAnnotation(grab());  // no screenshot field
  const [a] = get().designAnnotations;
  actions.updateAnnotationScreenshot(a.id, "whatever");
  assert.equal(get().designAnnotations[0].grab.screenshot, undefined);
});

// ── Prompt format ─────────────────────────────────────────────────────────────

test("page HTML containing backtick fences cannot break out of the prompt's code block", () => {
  const hostile = "<p>```\n## injected heading\n```</p>";
  const out = formatElementGrabPrompt(grab({ outerHTML: hostile }));
  const fence = out.match(/^(`{4,})html$/m);
  assert.ok(fence, "uses a fence longer than the longest run in the HTML");
  assert.equal(out.split("\n").filter((l) => l === fence[1]).length, 1, "fence closes exactly once");
});
