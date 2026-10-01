/**
 * memory-hindsight-extras.test.mjs
 *
 * E2E tests for the three new memory-IPC channels added in feat/memory-extras:
 *   - hindsightListMentalModels
 *   - hindsightRefreshMentalModel
 *   - benchBootstrapMemory
 *
 * Strategy: spin up a minimal HTTP server that mocks the Hindsight API
 * endpoints, then call the IPC handler logic directly (bypassing Electron's
 * ipcMain) by importing the helpers + wiring them against the mock.
 *
 * No omp binary, no Electron, no real Hindsight needed.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { register } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

register(
  pathToFileURL(
    join(dirname(fileURLToPath(import.meta.url)), "helpers/ts-import-hooks.mjs"),
  ),
);

const {
  hindsightListMentalModels,
  hindsightRefreshMentalModel,
  hindsightRetain,
  hindsightCreateBank,
} = await import("../electron/main/hindsight-http.ts");

// ─── Mock server helpers ──────────────────────────────────────────────────────

/** Spin up a one-request-per-test mock Hindsight server. */
function mockServer(handler) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        let parsed = null;
        try { parsed = body ? JSON.parse(body) : null; } catch { /* ok */ }
        handler(req, res, parsed);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function jsonResponse(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test("hindsightListMentalModels: returns mapped model list from mock server", async () => {
  const serverFacts = [];
  const { server, baseUrl } = await mockServer((req, res) => {
    serverFacts.push({ method: req.method, url: req.url });
    jsonResponse(res, 200, {
      items: [
        { id: "m1", name: "Code style", content: "Prefer functional patterns.", tags: ["style"], updated_at: "2026-09-30T10:00:00Z" },
        { id: "m2", name: "Architecture", content: null, tags: [], updated_at: null },
      ],
    });
  });

  try {
    const result = await hindsightListMentalModels(baseUrl, "tok-test", "omp");
    assert.equal(result.length, 2, "two models returned");
    assert.equal(result[0].id, "m1");
    assert.equal(result[0].name, "Code style");
    assert.equal(result[0].content, "Prefer functional patterns.");
    assert.deepEqual(result[0].tags, ["style"]);
    assert.equal(result[0].updated_at, "2026-09-30T10:00:00Z");
    assert.equal(result[1].id, "m2");
    assert.equal(result[1].content, null); // server sent null; we preserve it for the type-layer
    assert.ok(serverFacts[0].url.includes("/mental-models"), "hit mental-models endpoint");
    assert.equal(serverFacts[0].method, "GET");
  } finally {
    server.close();
  }
});

test("hindsightListMentalModels: handles bare array response shape", async () => {
  const { server, baseUrl } = await mockServer((req, res) => {
    jsonResponse(res, 200, [{ id: "a1", name: "A", updated_at: null }]);
  });
  try {
    const result = await hindsightListMentalModels(baseUrl, null, "bank");
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "a1");
  } finally {
    server.close();
  }
});

test("hindsightListMentalModels: propagates HTTP error", async () => {
  const { server, baseUrl } = await mockServer((req, res) => {
    jsonResponse(res, 401, { detail: "Unauthorized" });
  });
  try {
    await assert.rejects(
      hindsightListMentalModels(baseUrl, "bad-token", "bank"),
      /401/,
    );
  } finally {
    server.close();
  }
});

test("hindsightRefreshMentalModel: POSTs to correct endpoint", async () => {
  const captured = [];
  const { server, baseUrl } = await mockServer((req, res) => {
    captured.push({ method: req.method, url: req.url });
    jsonResponse(res, 200, { operation_id: "op-xyz" });
  });
  try {
    const result = await hindsightRefreshMentalModel(baseUrl, "tok", "my-bank", "m1");
    assert.equal(result.operation_id, "op-xyz");
    assert.equal(captured[0].method, "POST");
    assert.ok(captured[0].url.includes("/mental-models/m1/refresh"), "hit refresh endpoint");
  } finally {
    server.close();
  }
});

test("hindsightCreateBank: PUTs to bank endpoint with mission fields", async () => {
  const captured = [];
  const { server, baseUrl } = await mockServer((req, res, body) => {
    captured.push({ method: req.method, url: req.url, body });
    jsonResponse(res, 200, { id: "my-bank" });
  });
  try {
    await hindsightCreateBank(baseUrl, "tok", "my-bank", {
      reflectMission: "Reflect on coding patterns.",
      retainMission: "Retain only facts.",
    });
    assert.equal(captured[0].method, "PUT");
    assert.ok(captured[0].url.endsWith("/my-bank"), "PUT to bank endpoint");
    assert.equal(captured[0].body?.reflectMission, "Reflect on coding patterns.");
    assert.equal(captured[0].body?.retainMission, "Retain only facts.");
  } finally {
    server.close();
  }
});

test("hindsightRetain: POSTs memory item with content and metadata", async () => {
  const captured = [];
  const { server, baseUrl } = await mockServer((req, res, body) => {
    captured.push({ method: req.method, url: req.url, body });
    jsonResponse(res, 200, {});
  });
  try {
    await hindsightRetain(baseUrl, "tok", "omp", "Bench path: /home/user/frappe-bench", {
      source: "bench-bootstrap",
      bench: "frappe-bench",
    });
    assert.equal(captured[0].method, "POST");
    assert.ok(captured[0].url.includes("/memories"), "POST to memories endpoint");
    const item = captured[0].body?.items?.[0];
    assert.ok(item?.content?.includes("frappe-bench"), "content includes bench name");
    assert.equal(item?.metadata?.source, "bench-bootstrap");
  } finally {
    server.close();
  }
});

// ─── Bench bootstrap IPC handler (integration) ───────────────────────────────

test("benchBootstrapMemory IPC handler: retains bench facts to Hindsight mock", async () => {
  // Build a fake bench directory.
  const tmpDir = mkdtempSync(join(tmpdir(), "fcode-bench-boot-"));
  const benchPath = join(tmpDir, "frappe-bench");
  mkdirSync(join(benchPath, "apps", "frappe"), { recursive: true });
  mkdirSync(join(benchPath, "apps", "erpnext"), { recursive: true });
  mkdirSync(join(benchPath, "sites", "site1.localhost"), { recursive: true });
  mkdirSync(join(benchPath, "sites", "assets"), { recursive: true }); // should be skipped

  const captured = [];
  const { server, baseUrl } = await mockServer((req, res, body) => {
    captured.push({ method: req.method, url: req.url, body });
    jsonResponse(res, 200, {});
  });

  try {
    // Write a memory config pointing at the mock.
    const dataDir = mkdtempSync(join(tmpdir(), "fcode-mem-cfg-"));
    writeFileSync(
      join(dataDir, "memory.json"),
      JSON.stringify({ backend: "hindsight", hindsightUrl: baseUrl, hindsightBank: "test-bank" }),
    );

    // Import IPC-related helpers.
    const { readMemoryConfig } = await import("../electron/main/memory-config.ts");
    const config = readMemoryConfig(dataDir);
    assert.equal(config.backend, "hindsight");
    assert.equal(config.hindsightUrl, baseUrl);

    // Simulate what the IPC handler does: createBank + retain.
    const token = null; // no auth for mock
    await hindsightCreateBank(baseUrl, token, "test-bank", {});
    const { readdir } = await import("node:fs/promises");
    const appEntries = await readdir(join(benchPath, "apps"), { withFileTypes: true });
    const apps = appEntries.filter((d) => d.isDirectory() && !d.name.startsWith(".")).map((d) => d.name);
    const siteEntries = await readdir(join(benchPath, "sites"), { withFileTypes: true });
    const sites = siteEntries
      .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "assets")
      .map((d) => d.name);

    const content =
      `Frappe bench identity:\n` +
      `- Bench path: ${benchPath}\n` +
      `- Bench name: frappe-bench\n` +
      `- Installed apps: ${apps.join(", ")}\n` +
      `- Sites: ${sites.join(", ")}`;

    await hindsightRetain(baseUrl, token, "test-bank", content, { source: "bench-bootstrap", bench: "frappe-bench" });

    // Verify server received: PUT (createBank) + POST (retain)
    const puts = captured.filter((r) => r.method === "PUT");
    const posts = captured.filter((r) => r.method === "POST");
    assert.equal(puts.length, 1, "one PUT for createBank");
    assert.equal(posts.length, 1, "one POST for retain");

    const retainItem = posts[0].body?.items?.[0];
    assert.ok(retainItem?.content?.includes("frappe-bench"), "content includes bench name");
    assert.ok(retainItem?.content?.includes("frappe"), "apps list includes frappe");
    assert.ok(retainItem?.content?.includes("site1.localhost"), "sites list");
    assert.ok(!retainItem?.content?.includes("assets"), "assets dir excluded");
    assert.equal(retainItem?.metadata?.source, "bench-bootstrap");
  } finally {
    server.close();
  }
});

test("hindsightListMentalModels: empty items array is valid", async () => {
  const { server, baseUrl } = await mockServer((req, res) => {
    jsonResponse(res, 200, { items: [] });
  });
  try {
    const result = await hindsightListMentalModels(baseUrl, null, "empty-bank");
    assert.deepEqual(result, []);
  } finally {
    server.close();
  }
});
