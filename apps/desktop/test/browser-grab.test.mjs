/**
 * Tests for Design Mode: clampElementGrab, validateScreenshotClip,
 * screenshot clip validation through BrowserCdp, and BrowserHost.pickElement
 * (resolves null on cancel / context destroy, re-arm behaviour).
 *
 * No DOM lib available — picker script logic is exercised live; these tests
 * cover the main-process side only.
 */
import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { clampElementGrab, validateScreenshotClip, buildPickerScript } =
  await import("../electron/main/browser-grab.ts");
const { BrowserCdp } = await import("../electron/main/browser-cdp.ts");
const { BrowserHost } = await import("../electron/main/browser-host.ts");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_GRAB = {
  url: "https://example.com/page?q=1#section",
  title: "Example",
  selector: "#my-button",
  path: "body > main > button#my-button",
  tag: "BUTTON",
  accessibleName: "Submit",
  nearbyText: "Submit form",
  outerHTML: '<button id="my-button">Submit</button>',
  styles: { display: "inline-block", color: "rgb(0,0,0)" },
  rect: { x: 10, y: 20, width: 80, height: 36 },
  fixedOrSticky: false,
};

// ── clampElementGrab ──────────────────────────────────────────────────────────

test("clampElementGrab: returns null for non-objects", () => {
  assert.equal(clampElementGrab(null), null);
  assert.equal(clampElementGrab(undefined), null);
  assert.equal(clampElementGrab("string"), null);
  assert.equal(clampElementGrab(42), null);
  assert.equal(clampElementGrab([]), null);
  assert.equal(clampElementGrab(true), null);
});

test("clampElementGrab: returns null for non-http(s)/file URLs", () => {
  assert.equal(clampElementGrab({ ...VALID_GRAB, url: "javascript:void(0)" }), null);
  assert.equal(clampElementGrab({ ...VALID_GRAB, url: "data:text/html,<h1>hi</h1>" }), null);
  assert.equal(clampElementGrab({ ...VALID_GRAB, url: "" }), null);
  assert.equal(clampElementGrab({ ...VALID_GRAB, url: 42 }), null);
});

test("clampElementGrab: strips URL query, hash, and credentials", () => {
  const grab = clampElementGrab(VALID_GRAB);
  assert.ok(grab, "should return a grab");
  assert.equal(grab.url, "https://example.com/page");
  assert.ok(!grab.url.includes("?"), "no query string");
  assert.ok(!grab.url.includes("#"), "no hash");

  const creds = clampElementGrab({ ...VALID_GRAB, url: "https://user:pass@example.com/page" });
  assert.ok(creds);
  assert.ok(!creds.url.includes("user"), "no username");
  assert.ok(!creds.url.includes("pass"), "no password");
});

test("clampElementGrab: accepts file: URLs", () => {
  const grab = clampElementGrab({ ...VALID_GRAB, url: "file:///Users/foo/index.html?v=1" });
  assert.ok(grab);
  assert.equal(grab.url, "file:///Users/foo/index.html");
});

test("clampElementGrab: enforces string budgets (url 512, outerHTML 4000, etc.)", () => {
  const huge = "x".repeat(10_000);
  const grab = clampElementGrab({ ...VALID_GRAB, title: huge, selector: huge, outerHTML: huge, accessibleName: huge, nearbyText: huge });
  assert.ok(grab);
  assert.ok(grab.title.length <= 200);
  assert.ok(grab.selector.length <= 400);
  assert.ok(grab.outerHTML.length <= 4000);
  assert.ok(grab.accessibleName.length <= 200);
  assert.ok(grab.nearbyText.length <= 600);
});

test("clampElementGrab: redacts high-entropy tokens in selector / path", () => {
  const token = "a".repeat(32) + "ZZZZZZZZ"; // 40 alnum chars → looks like a token
  const grab = clampElementGrab({
    ...VALID_GRAB,
    selector: `#${token}`,
    path: `.${token} > button`,
  });
  assert.ok(grab);
  assert.ok(!grab.selector.includes(token), `selector should redact: ${grab.selector}`);
  assert.ok(!grab.path.includes(token), `path should redact: ${grab.path}`);
});

test("clampElementGrab: redacts JWT-looking values in selector", () => {
  const jwt = "eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ";
  const grab = clampElementGrab({ ...VALID_GRAB, selector: `#${jwt}` });
  assert.ok(grab);
  assert.ok(!grab.selector.includes(jwt), "JWT in selector should be redacted");
});

test("clampElementGrab: coerces tag to lowercase, returns null for empty tag", () => {
  const grab = clampElementGrab(VALID_GRAB);
  assert.ok(grab);
  assert.equal(grab.tag, "button");

  assert.equal(clampElementGrab({ ...VALID_GRAB, tag: "" }), null);
  assert.equal(clampElementGrab({ ...VALID_GRAB, tag: 0 }), null);
});

test("clampElementGrab: returns null when rect fields are non-finite", () => {
  assert.equal(clampElementGrab({ ...VALID_GRAB, rect: null }), null);
  assert.equal(clampElementGrab({ ...VALID_GRAB, rect: { x: NaN, y: 0, width: 100, height: 50 } }), null);
  assert.equal(clampElementGrab({ ...VALID_GRAB, rect: { x: 0, y: Infinity, width: 100, height: 50 } }), null);
  assert.equal(clampElementGrab({ ...VALID_GRAB, rect: [] }), null);
});

test("clampElementGrab: clamps styles to known keys only", () => {
  const grab = clampElementGrab({
    ...VALID_GRAB,
    styles: { display: "flex", "unknown-prop": "sneaky", color: "red" },
  });
  assert.ok(grab);
  assert.equal(grab.styles.display, "flex");
  assert.equal(grab.styles.color, "red");
  assert.ok(!("unknown-prop" in grab.styles), "unknown style keys dropped");
});

test("clampElementGrab: drops react when component name missing", () => {
  const grab = clampElementGrab({ ...VALID_GRAB, react: { component: "" } });
  assert.ok(grab);
  assert.equal(grab.react, undefined);

  const withReact = clampElementGrab({
    ...VALID_GRAB,
    react: { component: "MyButton", source: { file: "src/Button.tsx", line: 42 } },
  });
  assert.ok(withReact?.react);
  assert.equal(withReact.react.component, "MyButton");
  assert.deepEqual(withReact.react.source, { file: "src/Button.tsx", line: 42 });
});

test("clampElementGrab: hostile nested values do not throw", () => {
  // Wrong types in every field — must return null or a valid grab, never throw
  const hostile = { url: "https://x.com", tag: "div", rect: { x: 0, y: 0, width: 10, height: 10 },
    title: {}, selector: [], path: null, accessibleName: undefined,
    nearbyText: 123, outerHTML: false, styles: "not-object",
    fixedOrSticky: "yes", react: "not-object" };
  assert.doesNotThrow(() => clampElementGrab(hostile));
});

// ── validateScreenshotClip ────────────────────────────────────────────────────

test("validateScreenshotClip: rejects non-objects", () => {
  assert.equal(validateScreenshotClip(null), undefined);
  assert.equal(validateScreenshotClip("string"), undefined);
  assert.equal(validateScreenshotClip([]), undefined);
});

test("validateScreenshotClip: rejects zero/negative/non-finite dimensions", () => {
  const base = { x: 0, y: 0, width: 100, height: 100 };
  assert.equal(validateScreenshotClip({ ...base, width: 0 }), undefined);
  assert.equal(validateScreenshotClip({ ...base, height: -1 }), undefined);
  assert.equal(validateScreenshotClip({ ...base, width: NaN }), undefined);
  assert.equal(validateScreenshotClip({ ...base, x: Infinity }), undefined);
  assert.equal(validateScreenshotClip({ ...base, scale: 0 }), undefined);
});

test("validateScreenshotClip: rejects oversized dimensions", () => {
  assert.equal(validateScreenshotClip({ x: 0, y: 0, width: 9000, height: 100 }), undefined);
  assert.equal(validateScreenshotClip({ x: 0, y: 0, width: 100, height: 9000 }), undefined);
});

test("validateScreenshotClip: clamps negative x/y to 0, passes valid clip through", () => {
  const clip = validateScreenshotClip({ x: -5, y: -10, width: 200, height: 150, scale: 2 });
  assert.ok(clip);
  assert.equal(clip.x, 0);
  assert.equal(clip.y, 0);
  assert.equal(clip.width, 200);
  assert.equal(clip.height, 150);
  assert.equal(clip.scale, 2);
});

test("validateScreenshotClip: defaults scale to 1", () => {
  const clip = validateScreenshotClip({ x: 0, y: 0, width: 100, height: 100 });
  assert.ok(clip);
  assert.equal(clip.scale, 1);
});

// ── BrowserCdp.screenshot with clip ──────────────────────────────────────────

function makeMockWc(overrides = {}) {
  const commands = [];
  const wc = {
    id: 99,
    isDestroyed: () => false,
    getURL: () => "https://example.com",
    getTitle: () => "Test",
    debugger: {
      _attached: false,
      isAttached() { return this._attached; },
      attach() { this._attached = true; },
      detach() { this._attached = false; },
      on: () => {},
      off: () => {},
      async sendCommand(method, params = {}) {
        commands.push({ method, params });
        if (method === "Page.captureScreenshot") return { data: "abc123" };
        if (method === "Page.getLayoutMetrics") return { cssContentSize: { width: 1280, height: 800 } };
        return {};
      },
    },
    _commands: commands,
    ...overrides,
  };
  return wc;
}

test("BrowserCdp.screenshot: passes clip rect to Page.captureScreenshot", async () => {
  const cdp = new BrowserCdp();
  const wc = makeMockWc();
  const result = await cdp.screenshot(wc, { clip: { x: 10, y: 20, width: 80, height: 40 } });
  assert.equal(result.mimeType, "image/jpeg");
  const shot = wc._commands.find((c) => c.method === "Page.captureScreenshot");
  assert.ok(shot, "Page.captureScreenshot called");
  assert.equal(shot.params.clip.x, 10);
  assert.equal(shot.params.clip.y, 20);
  assert.equal(shot.params.clip.width, 80);
  assert.equal(shot.params.clip.height, 40);
  // Element clips must NOT use captureBeyondViewport
  assert.ok(!shot.params.captureBeyondViewport, "no captureBeyondViewport for element clips");
});

test("BrowserCdp.screenshot: throws on invalid clip (negative width)", async () => {
  const cdp = new BrowserCdp();
  const wc = makeMockWc();
  await assert.rejects(
    () => cdp.screenshot(wc, { clip: { x: 0, y: 0, width: -10, height: 40 } }),
    /invalid/i,
  );
});

test("BrowserCdp.screenshot: fullPage still uses captureBeyondViewport", async () => {
  const cdp = new BrowserCdp();
  const wc = makeMockWc();
  await cdp.screenshot(wc, { fullPage: true });
  const shot = wc._commands.find((c) => c.method === "Page.captureScreenshot");
  assert.ok(shot?.params.captureBeyondViewport, "fullPage uses captureBeyondViewport");
});

test("BrowserCdp.screenshot: clip takes precedence over fullPage", async () => {
  const cdp = new BrowserCdp();
  const wc = makeMockWc();
  await cdp.screenshot(wc, { clip: { x: 5, y: 5, width: 50, height: 50 }, fullPage: true });
  const shot = wc._commands.find((c) => c.method === "Page.captureScreenshot");
  assert.ok(shot);
  assert.equal(shot.params.clip.x, 5);
  assert.ok(!shot.params.captureBeyondViewport, "clip wins: no captureBeyondViewport");
  // No getLayoutMetrics call (fullPage path skipped)
  assert.ok(!wc._commands.find((c) => c.method === "Page.getLayoutMetrics"));
});

// ── BrowserHost.pickElement ───────────────────────────────────────────────────

// Drain microtasks without sleep.
const settled = () => new Promise((r) => setImmediate(r));

function makePickWc() {
  const pending = []; // { resolve, reject } for awaitPromise evaluations
  const wc = {
    id: 77,
    isDestroyed: () => false,
    getURL: () => "https://example.com",
    getTitle: () => "Test",
    debugger: {
      _attached: false,
      isAttached() { return this._attached; },
      attach() { this._attached = true; },
      detach() { this._attached = false; },
      on: () => {},
      off: () => {},
      async sendCommand(method, params = {}) {
        if (["Runtime.enable","Console.enable","Page.enable","DOM.enable","Accessibility.enable"].includes(method)) {
          return {};
        }
        if (method === "Page.captureScreenshot") return { data: "sc" };
        if (method === "Page.getLayoutMetrics") return { cssContentSize: { width: 1280, height: 800 } };
        if (method === "Runtime.evaluate" && params.awaitPromise) {
          const { promise, resolve, reject } = Promise.withResolvers();
          pending.push({ resolve, reject, params });
          return promise;
        }
        // Non-awaitPromise: cancel injection and others
        return { result: { value: null } };
      },
    },
    _pending: pending,
  };
  return wc;
}

function pickHarness() {
  const wc = makePickWc();
  const pane = {
    getState: () => ({ url: "https://example.com", title: "Test", isLoading: false }),
    getWebContents: () => wc,
    invalidateNavigation: () => {},
    setBounds: () => {},
    setVisible: () => {},
    navigateAndWait: async () => null,
    dispose: () => {},
    currentOwner: () => null,
    currentGeneration: () => 0,
    forceAcquireCanvas: () => {},
    releaseCanvas: () => {},
    acquireCanvas: () => true,
    action: () => {},
    openExternal: () => {},
  };
  const host = new BrowserHost({
    pane,
    isPluginLoaded: () => false,
    getFileRoot: async () => null,
    onState: () => {},
  });
  return { host, wc };
}

test("pickElement: resolves null when cancelPick is called", async () => {
  const { host, wc } = pickHarness();

  const pickP = host.pickElement();
  await settled(); // let the evaluate call queue

  assert.equal(wc._pending.length, 1, "one pending awaitPromise evaluate");

  host.cancelPick();
  // Simulate guest responding to cancel: resolve the blocking CDP call with null
  wc._pending[0].resolve({ result: { value: null } });

  assert.equal(await pickP, null);
});

test("pickElement: resolves null when execution context is destroyed (navigation)", async () => {
  const { host, wc } = pickHarness();

  const pickP = host.pickElement();
  await settled();

  assert.equal(wc._pending.length, 1);
  wc._pending[0].reject(new Error("Execution context was destroyed."));

  assert.equal(await pickP, null);
});

test("pickElement: re-arm cancels previous pick and delivers new result", async () => {
  const { host, wc } = pickHarness();

  const pick1 = host.pickElement();
  await settled();
  assert.equal(wc._pending.length, 1);

  // Re-arm while first pick is in flight
  const pick2 = host.pickElement();
  await settled();
  assert.equal(wc._pending.length, 2, "second picker queued");

  // Resolve first pick as null (guest sees new PICKER_SCRIPT cancelled it)
  wc._pending[0].resolve({ result: { value: null } });
  assert.equal(await pick1, null, "first pick returns null");

  // Second pick receives a valid grab
  const raw = {
    url: "https://example.com",
    title: "T",
    selector: "#btn",
    path: "body > button#btn",
    tag: "button",
    accessibleName: "Go",
    nearbyText: "Go",
    outerHTML: "<button id=\"btn\">Go</button>",
    styles: {},
    rect: { x: 10, y: 20, width: 60, height: 30 },
    fixedOrSticky: false,
  };
  wc._pending[1].resolve({ result: { value: raw } });
  const result = await pick2;
  assert.ok(result !== null, "second pick returns a grab");
  assert.equal(result.tag, "button");
  assert.equal(result.url, "https://example.com/");
});

test("pickElement: returns null for a grab that fails clamp (invalid rect)", async () => {
  const { host, wc } = pickHarness();

  const pickP = host.pickElement();
  await settled();

  wc._pending[0].resolve({ result: { value: { url: "https://x.com", tag: "div", rect: { x: NaN, y: 0, width: 10, height: 10 } } } });
  assert.equal(await pickP, null, "bad rect → null after clamp");
});

test("buildPickerScript: each nonce produces a unique script", () => {
  const s1 = buildPickerScript(1);
  const s2 = buildPickerScript(2);
  assert.ok(s1.includes("NONCE = 1"), "nonce 1 embedded");
  assert.ok(s2.includes("NONCE = 2"), "nonce 2 embedded");
  assert.notEqual(s1, s2, "scripts differ by nonce");
});

test("clampElementGrab: strips query/hash from link attributes and blanks value attributes in outerHTML", () => {
  const grab = clampElementGrab({
    ...VALID_GRAB,
    outerHTML: '<a href="/x?token=SECRETQ#frag" class="k">l</a><input type="password" value="hunter2">',
  });
  assert.ok(grab);
  assert.ok(!/SECRETQ|frag|hunter2/.test(grab.outerHTML), grab.outerHTML);
  assert.match(grab.outerHTML, /href="\/x"/);
  assert.match(grab.outerHTML, /class="k"/);
});
