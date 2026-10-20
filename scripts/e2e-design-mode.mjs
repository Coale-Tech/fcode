#!/usr/bin/env node
// Design Mode, end to end: the real desktop, preload, Host, agent sidecar and
// browser plugin view; only the model and the fixture page are local servers.
// Flow: open Browser tab -> arm picker -> hover highlight -> Esc cancels ->
// pick three elements (button, password input, link) -> tray rows -> comment
// -> send -> assert the model request (comment, page URL, element screenshots,
// no secrets) and that the tray cleared.
import assert from "node:assert/strict";
import { execSync, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host, resolveHostBinary } from "./e2e/host.mjs";
import { resolveElectronBinary } from "./e2e/boot.mjs";
import { waitFor } from "./e2e/wait.mjs";

const root = mkdtempSync(join(tmpdir(), "pi-design-mode-e2e-"));
const dataDir = join(root, "data");
const project = join(root, "project");
mkdirSync(project);
execSync("git init -q", { cwd: project });

// Fixture page. The fake React fiber mirrors the shape the picker reads
// (type.name + _debugSource), as React <=18 dev builds expose it.
const fixture = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<!doctype html><title>Fixture</title><body style="margin:0">
<button id="cta" style="width:160px;height:40px;margin:20px">Buy now</button><br>
<input id="pw" type="password" value="hunter2-SECRET">
<a id="lnk" href="/x?token=SECRETQ#frag">link</a>
<script>document.getElementById("cta").__reactFiber$fx = {
  type: function BuyButton() {}, return: null,
  _debugSource: { fileName: "/src/Buy.tsx", lineNumber: 7 } };</script></body>`);
});
await new Promise((done) => fixture.listen(0, "127.0.0.1", done));
const fixturePort = fixture.address().port;

const requests = [];
const model = createServer(async (req, res) => {
  if (req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: [{ id: "fixture", object: "model" }] }));
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  requests.push(JSON.parse(Buffer.concat(chunks).toString()));
  res.writeHead(200, { "content-type": "text/event-stream" });
  const frame = (delta, finish = null) =>
    res.write(
      "data: " +
        JSON.stringify({
          id: "x", object: "chat.completion.chunk", created: 1, model: "fixture",
          choices: [{ index: 0, delta, finish_reason: finish }],
        }) +
        "\n\n",
    );
  frame({ role: "assistant", content: "OK" });
  frame({}, "stop");
  res.write("data: [DONE]\n\n");
  res.end();
});
await new Promise((done) => model.listen(0, "127.0.0.1", done));

const host = new Host(resolveHostBinary(), dataDir);
await host.start();
await host.call("workspace.set", { path: project });
const { provider } = await host.call("providers.create", {
  name: "fixture", vendorKey: "custom", type: "openai_compatible",
  protocol: "openai_compatible", baseUrl: `http://127.0.0.1:${model.address().port}/v1`,
  authKind: "none", defaultModelId: "fixture", apiStyle: "chat_completions",
});
await host.call("settings.set", {
  language: "en", defaultProviderId: provider.id, defaultModelId: "fixture",
  defaultMode: "agent", defaultPermissionMode: "auto",
});
await host.stop();

const { appDir, electronBinary } = resolveElectronBinary();
const port = Number(process.env.PI_DESIGN_MODE_CDP_PORT || 9391);
const env = {
  ...process.env,
  PI_DESKTOP_DATA_DIR: dataDir,
  PI_DESKTOP_START_MAXIMIZED: "0",
  ELECTRON_RENDERER_URL: "",
};
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  electronBinary,
  [`--remote-debugging-port=${port}`, `--user-data-dir=${join(root, "profile")}`, "."],
  { cwd: appDir, env, stdio: "ignore" },
);

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const listTargets = async () => (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const sockets = [];
async function attach(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  sockets.push(ws);
  await once(ws, "open");
  let sequence = 0;
  const pending = new Map();
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails)
      throw new Error(result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  return { send, evaluate };
}
const click = (page, x, y) =>
  page
    .send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y })
    .then(() => sleep(250))
    .then(() => page.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }))
    .then(() => page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }));

try {
  let mainTarget;
  await waitFor(async () => {
    try {
      mainTarget = (await listTargets()).find(
        (t) => t.type === "page" && t.url.includes("index.html") && !t.url.includes("plugin-launcher"),
      );
      return !!mainTarget;
    } catch {
      return false;
    }
  }, 30_000, "desktop CDP target");
  const main = await attach(mainTarget);
  const button = (pattern) => `[...document.querySelectorAll("button")].find((b) => ${pattern}.test(b.textContent.trim()))`;

  await waitFor(() => main.evaluate(`!!${button("/Skip setup/")}`), 20_000, "setup screen");
  await main.evaluate(`${button("/Skip setup/")}.click()`);
  await sleep(1500);
  await main.evaluate(
    `window.piDesktop.invoke(window.piDesktop.channels.invoke.projectSet, ${JSON.stringify(project)})`,
  );
  await main.send("Page.reload");
  await sleep(4000);
  await waitFor(() => main.evaluate(`!!document.querySelector(".composer-input")`), 30_000, "composer");
  await main.evaluate(`${button("/^New session$/")}?.click()`);
  await sleep(2500);
  await main.evaluate(`document.querySelector('button[aria-label^="Toggle side panel"]')?.click()`);
  await sleep(600);
  await main.evaluate(`document.querySelector(".work-panel-new-tab").click()`);
  await sleep(600);
  await main.evaluate(
    `[...document.querySelectorAll(".work-panel-launcher-row")].find((b) => b.textContent.trim() === "Browser").click()`,
  );

  let viewTarget;
  await waitFor(async () => {
    viewTarget = (await listTargets()).find((t) => t.url.includes("pi.browser/views/browser.html"));
    return !!viewTarget;
  }, 20_000, "browser plugin view");
  const view = await attach(viewTarget);
  await waitFor(() => view.evaluate(`!!document.getElementById("url")`), 15_000, "address bar");
  await view.evaluate(`(() => {
    const input = document.getElementById("url");
    input.value = "http://127.0.0.1:${fixturePort}/";
    document.getElementById("form").requestSubmit();
  })()`);
  let guestTarget;
  await waitFor(async () => {
    guestTarget = (await listTargets()).find((t) => t.url.startsWith(`http://127.0.0.1:${fixturePort}`));
    return !!guestTarget;
  }, 20_000, "fixture guest page");
  const guest = await attach(guestTarget);
  await waitFor(() => view.evaluate(`!document.getElementById("pick").disabled`), 10_000, "pick enabled");

  const center = (selector) =>
    guest.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.left, top: r.top, width: r.width, height: r.height }; })()`);
  const pressed = () => view.evaluate(`document.getElementById("pick").getAttribute("aria-pressed")`);
  const rows = () => main.evaluate(`[...document.querySelectorAll(".design-annotation-row")].map((r) => r.innerText)`);

  // Armed picker highlights the hovered element; Esc cancels without a pick.
  await view.evaluate(`document.getElementById("pick").click()`);
  await sleep(700);
  assert.equal(await pressed(), "true", "picker should be armed");
  const cta = await center("#cta");
  await guest.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cta.x, y: cta.y });
  await sleep(300);
  const highlight = await guest.evaluate(`(() => {
    const el = [...document.documentElement.children].flatMap((n) => [...n.querySelectorAll("div")])
      .find((d) => d.style.border.includes("solid") && d.style.position === "fixed" && d.style.display === "block");
    if (!el) return null;
    const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height };
  })()`);
  assert.ok(highlight, "hover should draw the highlight box");
  assert.ok(
    Math.abs(highlight.left - cta.left) < 1 && Math.abs(highlight.top - cta.top) < 1 &&
      Math.abs(highlight.width - cta.width) < 1 && Math.abs(highlight.height - cta.height) < 1,
    `highlight ${JSON.stringify(highlight)} should match the hovered element ${JSON.stringify(cta)}`,
  );
  await view.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await view.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  await sleep(500);
  assert.equal(await pressed(), "false", "Esc should disarm the picker");
  assert.equal((await rows()).length, 0, "Esc must not create an annotation");

  for (const selector of ["#cta", "#pw", "#lnk"]) {
    await view.evaluate(`document.getElementById("pick").click()`);
    await sleep(700);
    const at = await center(selector);
    await click(guest, at.x, at.y);
    await sleep(1500);
  }
  const picked = await rows();
  assert.equal(picked.length, 3, `expected 3 tray rows, got ${picked.length}`);

  await main.evaluate(`document.querySelector(".design-annotation-comment").focus()`);
  await main.send("Input.insertText", { text: "make this blue" });
  const before = requests.length;
  await main.evaluate(`document.querySelector(".design-annotation-send").click()`);
  const delivered = () => requests.slice(before).find((r) => JSON.stringify(r.messages).includes("make this blue"));
  await waitFor(() => !!delivered(), 120_000, "model request with the annotation");
  const body = JSON.stringify(delivered().messages);

  assert.ok(body.includes(`http://127.0.0.1:${fixturePort}/`), "prompt carries the page URL");
  assert.ok(body.includes("BuyButton") && body.includes("/src/Buy.tsx:7"), "prompt carries the React component and source");
  assert.ok(!/hunter2|SECRETQ|frag/.test(body), "no password value, query token or hash may reach the model");
  assert.ok(body.includes('href=\\"/x\\"'), "link href keeps its path without query/hash");
  assert.equal((body.match(/element-\d\.jpg/g) ?? []).length >= 3, true, "one screenshot reference per element");
  await waitFor(async () => (await rows()).length === 0, 10_000, "tray cleared after send");

  // Send-target menu: "New session" must paste the screenshots into the NEW
  // session's scratch dir, not the session that was active when picking.
  const scratchId = (text) => text.match(/scratch\/([0-9a-f-]{36})\//)?.[1];
  const firstSession = scratchId(body);
  assert.ok(firstSession, "first send references a session scratch dir");
  await view.evaluate(`document.getElementById("pick").click()`);
  await sleep(700);
  const again = await center("#cta");
  await click(guest, again.x, again.y);
  await sleep(1500);
  await main.evaluate(`document.querySelector(".design-annotation-comment").focus()`);
  await main.send("Input.insertText", { text: "second pass" });
  await main.evaluate(`document.querySelector(".design-annotation-send-chevron").click()`);
  await sleep(300);
  const beforeNew = requests.length;
  await main.evaluate(`document.querySelectorAll(".design-send-menu-item")[1].click()`);
  const deliveredNew = () => requests.slice(beforeNew).find((r) => JSON.stringify(r.messages).includes("second pass"));
  await waitFor(() => !!deliveredNew(), 120_000, "model request from the new session");
  const secondSession = scratchId(JSON.stringify(deliveredNew().messages));
  assert.ok(secondSession && secondSession !== firstSession, "new-session send uses the new session's scratch dir");
  assert.ok(!JSON.stringify(deliveredNew().messages).includes("make this blue"), "new session carries no earlier turn");
  console.log("design-mode e2e: ok");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const ws of sockets) ws.close();
  child.kill();
  fixture.close();
  model.close();
  await sleep(500);
  process.exit(process.exitCode ?? 0);
}
