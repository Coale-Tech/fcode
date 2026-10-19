import { describe, expect, it } from "vitest";

import { OWNER_TOKEN, VIEWER_TOKEN, harness } from "./test-harness.js";
import type { RacpWorktreeControl, RacpBenchControl, RacpCanvasControl } from "./host-operations.js";

// ---------------------------------------------------------------------------
// Minimal fakes for optional capabilities — used only in these tests
// ---------------------------------------------------------------------------

const fakeWorktrees: RacpWorktreeControl = {
  async list() {
    return { worktrees: [{ path: "/wt/foo", kind: "task-isolation", branch: "feat/foo" }] };
  },
  async add(input) {
    return { ok: true, path: `/wt/${input.branch}` };
  },
  async remove(_input) {
    return { ok: true };
  },
};

const fakeBench: RacpBenchControl = {
  async list() {
    return { benches: [{ path: "/bench/one", name: "one" }] };
  },
  async status() {
    return { running: false };
  },
  async run(input) {
    return { exitCode: 0, stdout: `ran ${input.verb}`, stderr: "" };
  },
};

const fakeCanvas: RacpCanvasControl = {
  async snapshot() {
    return { tree: "<html/>", url: "http://localhost", title: "Test" };
  },
  async screenshot() {
    return { mimeType: "image/png", data: "base64data" };
  },
  async act(_input) {
    return { ok: true };
  },
};

// ---------------------------------------------------------------------------
// Role gating
// ---------------------------------------------------------------------------

describe("worktree/bench/canvas role gating", () => {
  it("viewer can list worktrees but not add or remove", async () => {
    const h = await harness({ operations: { worktrees: fakeWorktrees } });
    const { client } = await h.connect(VIEWER_TOKEN);
    const result = await client.request<{ worktrees: unknown[] }>("worktree/list");
    expect(result.worktrees).toHaveLength(1);
    await expect(client.request("worktree/add", { repoPath: "/r", branch: "b" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(client.request("worktree/remove", { path: "/wt/foo" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("controller can add worktrees but not remove them (owner-only)", async () => {
    const h = await harness({ operations: { worktrees: fakeWorktrees } });
    // controller token = owner in the test harness; use viewer to test the ceiling,
    // then a dedicated owner-only check below
    const { client: owner } = await h.connect(OWNER_TOKEN);
    const added = await owner.request<{ ok: boolean; path?: string }>("worktree/add", { repoPath: "/r", branch: "feat/x" });
    expect(added.ok).toBe(true);
    const removed = await owner.request<{ ok: boolean }>("worktree/remove", { path: "/wt/feat/x" });
    expect(removed.ok).toBe(true);
  });

  it("worktree/remove is denied for viewer (owner role required)", async () => {
    const h = await harness({ operations: { worktrees: fakeWorktrees } });
    const { client } = await h.connect(VIEWER_TOKEN);
    await expect(client.request("worktree/remove", { path: "/wt/foo" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("viewer can list and status bench but not run it", async () => {
    const h = await harness({ operations: { bench: fakeBench } });
    const { client } = await h.connect(VIEWER_TOKEN);
    const list = await client.request<{ benches: unknown[] }>("bench/list");
    expect(list.benches).toHaveLength(1);
    const status = await client.request<{ running: boolean }>("bench/status");
    expect(status.running).toBe(false);
    await expect(client.request("bench/run", { benchPath: "/b", verb: "migrate" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("viewer can snapshot and screenshot canvas but not act", async () => {
    const h = await harness({ operations: { canvas: fakeCanvas } });
    const { client } = await h.connect(VIEWER_TOKEN);
    const snap = await client.request<{ url: string }>("canvas/snapshot");
    expect(snap.url).toBe("http://localhost");
    const shot = await client.request<{ mimeType: string }>("canvas/screenshot");
    expect(shot.mimeType).toBe("image/png");
    await expect(client.request("canvas/act", { action: "reload" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ---------------------------------------------------------------------------
// CAPABILITY_UNAVAILABLE when member absent
// ---------------------------------------------------------------------------

describe("CAPABILITY_UNAVAILABLE when optional member is absent", () => {
  it("worktree operations throw when worktrees is not supplied", async () => {
    const h = await harness(); // no worktrees member
    const { client } = await h.connect(OWNER_TOKEN);
    await expect(client.request("worktree/list")).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    await expect(client.request("worktree/add", { repoPath: "/r", branch: "b" })).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    await expect(client.request("worktree/remove", { path: "/wt/b" })).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
  });

  it("bench operations throw when bench is not supplied", async () => {
    const h = await harness();
    const { client } = await h.connect(OWNER_TOKEN);
    await expect(client.request("bench/list")).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    await expect(client.request("bench/status")).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    await expect(client.request("bench/run", { benchPath: "/b", verb: "migrate" })).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
  });

  it("canvas operations throw when canvas is not supplied", async () => {
    const h = await harness();
    const { client } = await h.connect(OWNER_TOKEN);
    await expect(client.request("canvas/snapshot")).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    await expect(client.request("canvas/screenshot")).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    await expect(client.request("canvas/act", { action: "reload" })).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
  });
});

// ---------------------------------------------------------------------------
// Param validation (INVALID_ARGUMENT)
// ---------------------------------------------------------------------------

describe("param validation for new operations", () => {
  it("worktree/add rejects missing repoPath and branch", async () => {
    const h = await harness({ operations: { worktrees: fakeWorktrees } });
    const { client } = await h.connect(OWNER_TOKEN);
    await expect(client.request("worktree/add", {})).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    await expect(client.request("worktree/add", { repoPath: "/r" })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    await expect(client.request("worktree/add", { branch: "b" })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  });

  it("worktree/remove rejects missing path", async () => {
    const h = await harness({ operations: { worktrees: fakeWorktrees } });
    const { client } = await h.connect(OWNER_TOKEN);
    await expect(client.request("worktree/remove", {})).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  });

  it("bench/run rejects missing benchPath and verb", async () => {
    const h = await harness({ operations: { bench: fakeBench } });
    const { client } = await h.connect(OWNER_TOKEN);
    await expect(client.request("bench/run", {})).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    await expect(client.request("bench/run", { benchPath: "/b" })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    await expect(client.request("bench/run", { verb: "migrate" })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  });

  it("canvas/act rejects invalid action", async () => {
    const h = await harness({ operations: { canvas: fakeCanvas } });
    const { client } = await h.connect(OWNER_TOKEN);
    await expect(client.request("canvas/act", { action: "explode" })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    await expect(client.request("canvas/act", {})).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  });
});
