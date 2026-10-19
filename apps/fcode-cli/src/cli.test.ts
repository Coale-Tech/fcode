/**
 * End-to-end CLI test: real RacpServer on a loopback WebSocket, fake
 * worktrees/bench controls, real CLI command functions.
 *
 * Validates: worktree list/add/rm, bench list, session list,
 * role gating (viewer token → exit 1 on worktree/remove),
 * exit 2 when endpoint file is absent.
 */
import { execFileSync } from "node:child_process";
import { realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { RacpError, AgentHost } from "@pi-desktop/agent-host";
import type { ApprovalPort, RuntimePort, SessionPort, SessionSummary, TurnStartRequest } from "@pi-desktop/agent-host";
import {
  DeviceTokenAuthenticator,
  MemoryCredentialStore,
  RacpServer,
  bindRacpWebSocket,
  hashToken,
  newDeviceToken,
} from "@pi-desktop/racp";
import type { WsBinding } from "@pi-desktop/racp";

import { worktreeCommand } from "./commands/worktree.js";
import { benchCommand } from "./commands/bench.js";
import { sessionCommand } from "./commands/session.js";
import { runCli } from "./main.js";

// ── Minimal fake agent host ──────────────────────────────────────────────────

function buildAgentHost(): AgentHost {
  const runtime: RuntimePort = {
    async prompt(_r: TurnStartRequest) { return { turnId: "t1" }; },
    async stop() { return { requested: true }; },
    async abort() {},
    async respondInput() {},
  };
  const sessions: SessionPort = {
    async get() { return null; },
    async history() { return { items: [], hasMore: false }; },
  };
  const approvals: ApprovalPort = {
    async resolveTool() {},
    async resolveContract() {},
    async listPendingTools() { return []; },
  };
  return new AgentHost({ runtime, sessions, approvals, limits: { replayWindowEvents: 10 } });
}

// ── Fake host-operations ─────────────────────────────────────────────────────

const worktrees: Array<{ path: string; branch: string; kind: "task-isolation" }> = [];
const addCalls: Array<{ repoPath: string; branch: string }> = [];

const operations = {
  sessions: {
    async list(): Promise<SessionSummary[]> { return []; },
    async create(): Promise<SessionSummary> { throw new RacpError("INTERNAL", "stub"); },
    async configure(): Promise<SessionSummary> { throw new RacpError("INTERNAL", "stub"); },
    async fork(): Promise<SessionSummary> { throw new RacpError("INTERNAL", "stub"); },
    async rename() {},
    async delete() {},
    async compact() { return { accepted: true }; },
  },
  projects: {
    async list() { return []; },
    async register(path: string) { return { id: "p1", label: path.split("/").at(-1) ?? path, archived: false, path }; },
    async browse(path?: string) { return { path: path ?? "/", entries: [] }; },
  },
  workspace: {
    async list() { return { entries: [] }; },
    async read() { return { kind: "text" as const, content: "", size: 0 }; },
    async diff() { return { repo: true, clean: true, files: [] }; },
  },
  worktrees: {
    async list() { return { worktrees, ok: true as const }; },
    async add(input: { repoPath: string; branch: string }) {
      addCalls.push({ repoPath: input.repoPath, branch: input.branch });
      const path = `/tmp/wt/${input.branch}`;
      worktrees.push({ path, branch: input.branch, kind: "task-isolation" });
      return { ok: true as const, path };
    },
    async remove(input: { path: string }) {
      const idx = worktrees.findIndex((w) => w.path === input.path);
      if (idx < 0) return { ok: false as const, error: "not found" };
      worktrees.splice(idx, 1);
      return { ok: true as const };
    },
  },
  bench: {
    async list() { return { benches: [{ path: "/bench/main", name: "main" }] }; },
    async status() { return { running: false, status: "stopped" }; },
    async run(input: { verb: string }) { return { exitCode: 0, stdout: `ran ${input.verb}`, stderr: "" }; },
  },
};

// ── Server lifecycle ─────────────────────────────────────────────────────────

const OWNER_TOKEN = newDeviceToken();
const VIEWER_TOKEN = newDeviceToken();
let binding: WsBinding;

beforeAll(async () => {
  const store = new MemoryCredentialStore();
  await store.saveDevice({ deviceId: "owner", label: "owner", roles: ["owner"], tokenHash: hashToken(OWNER_TOKEN), createdAt: new Date().toISOString() });
  await store.saveDevice({ deviceId: "viewer", label: "viewer", roles: ["viewer"], tokenHash: hashToken(VIEWER_TOKEN), createdAt: new Date().toISOString() });
  const auth = new DeviceTokenAuthenticator(store);
  const server = new RacpServer({
    agentHost: buildAgentHost(),
    operations,
    authenticator: auth,
    hostId: "test-host",
    serverVersion: "0.0.0",
    log: () => undefined,
    initializeTimeoutMs: 2_000,
  });
  binding = await bindRacpWebSocket({ server, authenticator: auth, host: "127.0.0.1", port: 0, log: () => undefined });
});

afterAll(() => binding.close());
afterEach(() => vi.restoreAllMocks());

function setEndpoint(token: string): void {
  const { port } = binding.address;
  const file = join(tmpdir(), `fcode-ep-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify({ url: `ws://127.0.0.1:${port}`, token, pid: process.pid, version: "0" }), { mode: 0o600 });
  process.env.FCODE_ENDPOINT_FILE = file;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("worktree list", () => {
  it("returns the worktrees array as JSON", async () => {
    setEndpoint(OWNER_TOKEN);
    const out: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => { out.push(String(s)); return true; });
    await worktreeCommand("list", ["--json"]);
    expect(JSON.parse(out.join(""))).toEqual([]);
  });
});

describe("worktree create", () => {
  it("creates a worktree for the repo containing cwd when --repo is omitted", async () => {
    setEndpoint(OWNER_TOKEN);
    const out: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => { out.push(String(s)); return true; });
    await runCli(["worktree", "create", "feat/cli-test", "--json"]);
    const result = JSON.parse(out.join(""));
    expect(result.ok).toBe(true);
    expect(result.path).toContain("feat/cli-test");
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
    expect(realpathSync(addCalls.at(-1)?.repoPath ?? "")).toBe(realpathSync(top));
  });

  it("--repo wins and is not mistaken for the branch", async () => {
    setEndpoint(OWNER_TOKEN);
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runCli(["worktree", "create", "--repo", "/tmp/some-repo", "feat/other"]);
    expect(addCalls.at(-1)).toMatchObject({ repoPath: "/tmp/some-repo", branch: "feat/other" });
  });
});

describe("worktree rm", () => {
  it("removes a worktree with owner token", async () => {
    setEndpoint(OWNER_TOKEN);
    worktrees.push({ path: "/tmp/wt/owner-rm", branch: "owner-rm", kind: "task-isolation" });
    const out: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => { out.push(String(s)); return true; });
    await runCli(["worktree", "rm", "--json", "/tmp/wt/owner-rm"]);
    expect(JSON.parse(out.join("")).ok).toBe(true);
    expect(worktrees.some((w) => w.path === "/tmp/wt/owner-rm")).toBe(false);
  });

  it("exits 1 (FORBIDDEN) when viewer token used", async () => {
    worktrees.push({ path: "/tmp/wt/viewer-test", branch: "viewer-test", kind: "task-isolation" });
    setEndpoint(VIEWER_TOKEN);
    const exits: number[] = [];
    const err: string[] = [];
    vi.spyOn(process, "exit").mockImplementation((code) => { exits.push(code as number); throw new Error("exit"); });
    vi.spyOn(process.stderr, "write").mockImplementation((s) => { err.push(String(s)); return true; });
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await expect(runCli(["worktree", "rm", "--json", "/tmp/wt/viewer-test"])).rejects.toThrow("exit");
    expect(exits[0]).toBe(1);
    expect(err.join("")).toContain("principal lacks the role");
    expect(worktrees.some((w) => w.path === "/tmp/wt/viewer-test")).toBe(true);
  });
});

describe("bench list --json", () => {
  it("returns bench data", async () => {
    setEndpoint(OWNER_TOKEN);
    const out: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => { out.push(String(s)); return true; });
    await benchCommand("list", ["--json"]);
    expect(JSON.parse(out.join(""))).toBeTruthy();
  });
});

describe("session list", () => {
  it("returns an array", async () => {
    setEndpoint(OWNER_TOKEN);
    const out: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => { out.push(String(s)); return true; });
    await sessionCommand("list", ["--json"]);
    expect(JSON.parse(out.join(""))).toEqual([]);
  });
});

describe("exit 2 when endpoint absent", () => {
  it("exits 2 with not-running message", async () => {
    delete process.env.FCODE_ENDPOINT_FILE;
    const exits: number[] = [];
    vi.spyOn(process, "exit").mockImplementation((code) => { exits.push(code as number); throw new Error("exit"); });
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await expect(worktreeCommand("list", [])).rejects.toThrow("exit");
    expect(exits[0]).toBe(2);
  });
});
