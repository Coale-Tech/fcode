/**
 * Tests for omp-bridge core functions (DX3, DX6, DX7, DX10, E9, T7).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OmpBridge,
  isReadOnlyExecuteMethod,
  makeOmpOverlay,
  resolveOmpBinary,
  writeOmpOverlay,
} from "./bridge.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "omp-bridge-test-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("resolveOmpBinary (DX6 / T7 — sidecar.fatal paths)", () => {
  it("returns OMP_BIN env var when set", () => {
    const result = resolveOmpBinary({
      resourcesPath: "/nonexistent",
      env: { OMP_BIN: "/custom/omp" },
    });
    expect(result).toBe("/custom/omp");
  });

  it("returns resourcesPath/bin/omp as first candidate", () => {
    // Using a real temp dir that exists so the file-exists check passes.
    // Create the binary there.
    const { mkdirSync } = require("node:fs");
    mkdirSync(join(dir, "bin"), { recursive: true });
    writeFileSync(join(dir, "bin", "omp"), "#!/bin/sh");

    const result = resolveOmpBinary({ resourcesPath: dir, env: {} });
    expect(result).toBe(join(dir, "bin", "omp"));
  });

  it("returns all three candidate paths when binary is not found (for sidecar.fatal)", () => {
    // resolveOmpBinary with a non-existent resourcesPath returns last fallback
    const result = resolveOmpBinary({ resourcesPath: "/no-such-path", env: {} });
    // Should return the last candidate (PATH fallback "omp") since none exist
    expect(result).toBe("omp");
  });
});

describe("makeOmpOverlay (DX3 / DX6 / DX7 / DX10)", () => {
  it("includes always-ask approval mode (DX3 — never yolo)", () => {
    const overlay = makeOmpOverlay({
      dataDir: dir,
      resourcesPath: "/app/resources",
      screenshotsDir: join(dir, "screenshots"),
    });
    expect(overlay).toContain("always-ask");
  });

  it("auto-approves fcode_bench_execute reads only (DX7)", () => {
    const overlay = makeOmpOverlay({
      dataDir: dir,
      resourcesPath: "/app/resources",
      screenshotsDir: join(dir, "screenshots"),
    });
    // Read-only execute is auto-approved
    expect(overlay).toContain("fcode_bench_execute_read");
    expect(overlay).toContain("allow");
  });

  it("sets customDirectories for fcode-skills (DX6)", () => {
    const overlay = makeOmpOverlay({
      dataDir: dir,
      resourcesPath: "/app/resources",
      screenshotsDir: join(dir, "screenshots"),
    });
    expect(overlay).toContain("customDirectories");
    expect(overlay).toContain("fcode-skills");
  });

  it("keeps ~/.claude/skills opt-in", () => {
    const base = { dataDir: dir, resourcesPath: "/app/resources", screenshotsDir: join(dir, "screenshots") };
    expect(makeOmpOverlay(base)).toContain("enableClaudeUser: false");
    expect(makeOmpOverlay({ ...base, ompSettings: { "skills.enableClaudeUser": true } })).toContain("enableClaudeUser: true");
  });

  it("includes browser config (headless, screenshotDir)", () => {
    const overlay = makeOmpOverlay({
      dataDir: dir,
      resourcesPath: "/app/resources",
      screenshotsDir: join(dir, "screenshots"),
    });
    expect(overlay).toContain("headless");
    expect(overlay).toContain("screenshotDir");
  });
});

describe("makeOmpOverlay memory section", () => {
  const base = { dataDir: "/d", resourcesPath: "/r", screenshotsDir: "/s" };
  it("omits memory when unset", () => {
    expect(makeOmpOverlay(base)).not.toContain("memory:");
  });
  it("emits session llmMode and hindsight target, never a token", () => {
    const o = makeOmpOverlay({
      ...base,
      memory: { backend: "hindsight", hindsightUrl: "http://h:8888", hindsightBank: "fcode" },
    });
    expect(o).toContain("backend: hindsight");
    expect(o).toContain("llmMode: session");
    expect(o).toContain('apiUrl: "http://h:8888"');
    expect(o.toLowerCase()).not.toContain("token");
  });
  it("mnemopi emits no hindsight block", () => {
    expect(makeOmpOverlay({ ...base, memory: { backend: "mnemopi" } })).not.toContain("hindsight:");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// YAML injection guards — agentModelOverrides key quoting (security)
// ─────────────────────────────────────────────────────────────────────────────

import { parse as parseYaml } from "yaml";

describe("makeOmpOverlay — agentModelOverrides YAML injection (security)", () => {
  const base = { dataDir: "/d", resourcesPath: "/r", screenshotsDir: "/s" };

  it("keys with newlines are quoted and do not inject extra YAML lines", () => {
    const overlay = makeOmpOverlay({
      ...base,
      ompSettings: {
        "task.agentModelOverrides": { "x:\n  approval_mode: allow-all-without-asking\n  y": "bad" },
      },
    });
    const parsed = parseYaml(overlay) as Record<string, unknown>;
    // The injected approval_mode must NOT appear at the top level.
    expect(parsed).not.toHaveProperty("approval_mode");
    // task.agentModelOverrides should contain exactly one entry.
    const overrides = (parsed.task as Record<string, unknown>)?.agentModelOverrides as Record<string, unknown>;
    expect(Object.keys(overrides)).toHaveLength(1);
  });

  it("keys with colons are quoted and do not split the mapping", () => {
    const overlay = makeOmpOverlay({
      ...base,
      ompSettings: {
        "task.agentModelOverrides": { "agent:extra": "model-id" },
      },
    });
    const parsed = parseYaml(overlay) as Record<string, unknown>;
    const overrides = (parsed.task as Record<string, unknown>)?.agentModelOverrides as Record<string, unknown>;
    // The key "agent:extra" must be preserved as a single key, not split.
    expect(Object.keys(overrides)).toHaveLength(1);
    expect(Object.keys(overrides)[0]).toBe("agent:extra");
  });

  it("normal agent name and model id round-trips through YAML cleanly", () => {
    const overlay = makeOmpOverlay({
      ...base,
      ompSettings: {
        "task.agentModelOverrides": { "my-agent": "claude-opus-4" },
      },
    });
    const parsed = parseYaml(overlay) as Record<string, unknown>;
    const overrides = (parsed.task as Record<string, unknown>)?.agentModelOverrides as Record<string, unknown>;
    expect(overrides["my-agent"]).toBe("claude-opus-4");
  });

  it("model id with special chars is quoted and round-trips", () => {
    const overlay = makeOmpOverlay({
      ...base,
      ompSettings: {
        "task.agentModelOverrides": { "agent": "model: with: colons\nnewline" },
      },
    });
    const parsed = parseYaml(overlay) as Record<string, unknown>;
    const overrides = (parsed.task as Record<string, unknown>)?.agentModelOverrides as Record<string, unknown>;
    expect(overrides["agent"]).toBe("model: with: colons\nnewline");
  });
});

describe("writeOmpOverlay (DX3 — overlay write failure is fatal)", () => {
  it("writes the overlay file and returns the path", () => {
    const overlayPath = writeOmpOverlay({
      dataDir: dir,
      resourcesPath: "/app/resources",
      screenshotsDir: join(dir, "screenshots"),
    });
    const { readFileSync, existsSync } = require("node:fs");
    expect(existsSync(overlayPath)).toBe(true);
    const content = readFileSync(overlayPath, "utf8");
    expect(content).toContain("always-ask");
  });

  it("throws when the directory is not writable (DX3)", () => {
    // Provide a path that cannot exist as a directory
    expect(() =>
      writeOmpOverlay({
        dataDir: "/no-such-dir-that-exists",
        resourcesPath: "/app/resources",
        screenshotsDir: join(dir, "screenshots"),
      }),
    ).toThrow();
  });
});

describe("isReadOnlyExecuteMethod (DX7 — prefix-based auto-approval gate)", () => {
  it("approves frappe.client.get", () => {
    expect(isReadOnlyExecuteMethod("frappe.client.get")).toBe(true);
  });

  it("approves frappe.client.get_list", () => {
    expect(isReadOnlyExecuteMethod("frappe.client.get_list")).toBe(true);
  });

  it("approves frappe.db.get_value", () => {
    expect(isReadOnlyExecuteMethod("frappe.db.get_value")).toBe(true);
  });

  it("approves frappe.db.count", () => {
    expect(isReadOnlyExecuteMethod("frappe.db.count")).toBe(true);
  });

  it("approves frappe.utils.*", () => {
    expect(isReadOnlyExecuteMethod("frappe.utils.now")).toBe(true);
    expect(isReadOnlyExecuteMethod("frappe.utils.get_url")).toBe(true);
  });

  it("approves studio.api.get_something", () => {
    expect(isReadOnlyExecuteMethod("studio.api.get_page")).toBe(true);
    expect(isReadOnlyExecuteMethod("studio.api.list_apps")).toBe(true);
  });

  it("approves builder.api.get_page", () => {
    expect(isReadOnlyExecuteMethod("builder.api.get_page")).toBe(true);
  });

  it("rejects frappe.client.set_value (mutating)", () => {
    expect(isReadOnlyExecuteMethod("frappe.client.set_value")).toBe(false);
  });

  it("rejects frappe.db.delete_doc (mutating)", () => {
    expect(isReadOnlyExecuteMethod("frappe.db.delete_doc")).toBe(false);
  });

  it("is segment-aware: frappe.client.get_list_evil is NOT approved (DX7)", () => {
    // The prefix `frappe.client.get_list` should not match `frappe.client.get_list_evil`
    // because segment boundaries matter.
    expect(isReadOnlyExecuteMethod("frappe.client.get_list_evil")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isReadOnlyExecuteMethod("")).toBe(false);
  });

  it("rejects arbitrary.method.name", () => {
    expect(isReadOnlyExecuteMethod("arbitrary.method.name")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OmpBridge class — failure-handling and traceability (E9, failure-handling)
// ─────────────────────────────────────────────────────────────────────────────

describe("OmpBridge.disposeSession — cancels pending extension_ui_response (E9)", () => {
  it("sends extension_ui_response cancelled:true for each pending request matching the session", () => {
    const bridge = new OmpBridge();
    const emitted: unknown[] = [];

    // Capture notifications emitted by the bridge (they go to stdout as JSON-RPC).
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((data: string) => {
      try { emitted.push(JSON.parse(data.trim())); } catch { /* ignore */ }
      return true;
    }) as typeof process.stdout.write;

    // Inject two pending UI requests: one for "session-A", one for "session-B".
    // Use internal access via casting to any to inject test state.
    const b = bridge as unknown as Record<string, unknown>;
    const pendingMap = b.pendingUiRequests as Map<string, { sessionId: string; toolCallId: string; toolName: string }>;
    pendingMap.set("req-1", { sessionId: "session-A", toolCallId: "tc-1", toolName: "tool" });
    pendingMap.set("req-2", { sessionId: "session-B", toolCallId: "tc-2", toolName: "tool" });

    // Simulate disposeSession for "session-A".
    bridge.handleHostFrame({ jsonrpc: "2.0", id: "host-id-1", method: "agent.disposeSession", params: { sessionId: "session-A" } });

    // req-1 should be gone; req-2 should still be present.
    expect(pendingMap.has("req-1")).toBe(false);
    expect(pendingMap.has("req-2")).toBe(true);

    process.stdout.write = origWrite;
  });
});

describe("OmpBridge.handleOmpFrame — frame reassembly failure settles active sessions (E10)", () => {
  it("emits system messages to all active sessions and clears ompPending on FrameTooLargeError", () => {
    const bridge = new OmpBridge();
    const emitted: unknown[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((data: string) => {
      try { emitted.push(JSON.parse(data.trim())); } catch { /* ignore */ }
      return true;
    }) as typeof process.stdout.write;

    const b = bridge as unknown as Record<string, unknown>;
    // Add a fake active session.
    const sessMap = b.sessions as Map<string, unknown>;
    sessMap.set("sess-1", { ompSessionDir: undefined, projectPath: "/", inputModalities: [] });
    // Add a fake pending omp call.
    const pendingOmp = b.ompPending as Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
    let rejected: Error | null = null;
    pendingOmp.set("omp-call-1", { resolve: () => undefined, reject: (e) => { rejected = e; } });

    // Pre-populate the chunk buffer to exactly the 64 MiB limit so the next byte trips the error.
    // reassembleChunk checks buf.byteLength AFTER adding decoded content, so starting at the limit
    // means even 1 extra byte ("a" = 1 byte) causes FrameTooLargeError.
    const MAX_REASSEMBLED = 64 * 1024 * 1024;
    const state = b.state as Record<string, unknown>;
    const chunksMap = state.chunks as Map<string, { count: number; received: string[]; byteLength: number }>;
    chunksMap.set("chunk-x", { count: 2, received: [], byteLength: MAX_REASSEMBLED });

    // Send one more byte — tips byteLength over MAX_REASSEMBLED_BYTES.
    bridge.handleOmpFrame(JSON.stringify({
      type: "rpc_chunk",
      chunkId: "chunk-x",
      index: 1,
      count: 2,
      byteLength: 1,
      data: "YQ==", // "a" — 1 decoded byte
    }));

    // The bridge should have rejected the pending omp call.
    expect(rejected).not.toBeNull();
    expect(rejected?.message).toContain("Frame reassembly failed");

    // ompPending should be cleared.
    expect(pendingOmp.size).toBe(0);

    // A system message should have been emitted for sess-1.
    const systemMsg = emitted.find((e) => {
      const ev = (e as Record<string, unknown>);
      return ev.method === "agent.event" && (ev.params as Record<string, unknown>)?.sessionId === "sess-1";
    });
    expect(systemMsg).toBeDefined();

    process.stdout.write = origWrite;
  });
});

describe("OmpBridge.setTracer — traces in-omp and out-omp frames (FCODE_BRIDGE_TRACE=1)", () => {
  it("calls the tracer for incoming omp frames (in-omp)", () => {
    const bridge = new OmpBridge();
    const traced: Array<{ dir: string; line: string }> = [];
    bridge.setTracer((dir, line) => traced.push({ dir, line }));

    // A valid event frame from omp.
    const frame = JSON.stringify({ type: "agent_start", sessionId: "s1" });
    bridge.handleOmpFrame(frame);

    expect(traced.length).toBeGreaterThanOrEqual(1);
    expect(traced[0].dir).toBe("in-omp");
    expect(traced[0].line).toBe(frame);
  });

  it("calls the tracer for outgoing calls to omp (out-omp)", () => {
    const bridge = new OmpBridge();
    const traced: Array<{ dir: string; line: string }> = [];
    bridge.setTracer((dir, line) => traced.push({ dir, line }));

    // Simulate ompProcess.stdin so the write doesn't throw.
    const b = bridge as unknown as Record<string, unknown>;
    b.ompProcess = { stdin: { write: vi.fn() } };

    // Trigger an ompCall by feeding a method that uses ompCallAndForward.
    // steer is simple: it calls ompCall directly.
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
    bridge.handleHostFrame({ jsonrpc: "2.0", id: "h1", method: "agent.steer", params: { sessionId: "s1", message: "hi" } });
    process.stdout.write = origWrite;

    // out-omp trace should be present.
    const outEntry = traced.find((t) => t.dir === "out-omp");
    expect(outEntry).toBeDefined();
    const parsed = JSON.parse(outEntry!.line);
    expect(parsed.type).toBe("steer");
  });

  it("writes traces to a file when used with appendFileSync", () => {
    const traceFile = join(dir, "test-trace.ndjson");
    const { appendFileSync } = require("node:fs");
    const bridge = new OmpBridge();
    bridge.setTracer((dir, line) => appendFileSync(traceFile, `${dir}: ${line}\n`));

    bridge.handleOmpFrame(JSON.stringify({ type: "agent_start", sessionId: "s1" }));

    expect(existsSync(traceFile)).toBe(true);
    const content = readFileSync(traceFile, "utf8");
    expect(content).toContain("in-omp:");
    expect(content).toContain("agent_start");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T7 — host tool dispatch (fcode_ tools via host_tool_call / set_host_tools)
// ─────────────────────────────────────────────────────────────────────────────

describe("makeOmpOverlay (T7 — fcode_canvas_read auto-approved)", () => {
  it("auto-approves fcode_canvas_read (read-only canvas inspection)", () => {
    const overlay = makeOmpOverlay({
      dataDir: dir,
      resourcesPath: "/app/resources",
      screenshotsDir: join(dir, "screenshots"),
    });
    expect(overlay).toContain("fcode_canvas_read");
    expect(overlay).toContain("allow");
  });
});

describe("OmpBridge.handleOmpFrame — host_tool_call dispatches to host and returns result (T7)", () => {
  it("writes host.proxy to stdout for host_tool_call, then writes host_tool_result to omp stdin after host responds", async () => {
    const bridge = new OmpBridge();
    const b = bridge as unknown as Record<string, unknown>;

    // Capture writes to process.stdout (host calls).
    const hostFrames: unknown[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((data: string) => {
      try { hostFrames.push(JSON.parse(data.trim())); } catch { /* ignore */ }
      return true;
    }) as typeof process.stdout.write;

    // Capture writes to omp stdin (host_tool_result).
    const ompStdinWrites: unknown[] = [];
    b.ompProcess = { stdin: { write: vi.fn((data: string) => { try { ompStdinWrites.push(JSON.parse(data.trim())); } catch { /* ignore */ } }) } };

    // Register a session so the bridge has a sessionId to fall back on.
    const sessMap = b.sessions as Map<string, unknown>;
    sessMap.set("sess-A", { ompSessionDir: undefined, projectPath: "/", inputModalities: [] });

    // Feed a host_tool_call frame (as omp would send it).
    bridge.handleOmpFrame(JSON.stringify({
      type: "host_tool_call",
      id: "call-1",
      toolCallId: "tc1",
      toolName: "fcode_bench_execute",
      arguments: { method: "frappe.utils.now", kwargs: {} },
    }));

    // The bridge should have written a host.proxy call to stdout.
    const hostCall = hostFrames.find((f) => (f as Record<string, unknown>).method === "host.proxy");
    expect(hostCall).toBeDefined();
    const hc = hostCall as Record<string, unknown>;
    expect((hc.params as Record<string, unknown>).method).toBe("fcode_bench_execute");
    // omp sends `arguments`, never `args`; the host must receive them.
    expect(((hc.params as Record<string, unknown>).params as Record<string, unknown>).args).toEqual({ method: "frappe.utils.now", kwargs: {} });
    const callId = String(hc.id);

    // Simulate the host responding (via handleHostFrame).
    bridge.handleHostFrame({
      jsonrpc: "2.0",
      id: callId,
      result: { ok: true, content: "2025-01-01 00:00:00" },
    });

    // Give the promise chain a microtask to resolve.
    await Promise.resolve();

    // omp stdin should now have received the host_tool_result.
    const resultFrame = ompStdinWrites.find((f) => (f as Record<string, unknown>).type === "host_tool_result");
    expect(resultFrame).toBeDefined();
    const rf = resultFrame as Record<string, unknown>;
    // omp resolves the pending call by `id` and expects AgentToolResult content blocks.
    expect(rf.id).toBe("call-1");
    expect(rf.isError).toBe(false);
    expect(rf.result).toEqual({ content: [{ type: "text", text: "2025-01-01 00:00:00" }] });

    process.stdout.write = origWrite;
  });

  it("writes host_tool_result with error content when host rejects (T7 error path)", async () => {
    const bridge = new OmpBridge();
    const b = bridge as unknown as Record<string, unknown>;

    const hostFrames: unknown[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((data: string) => {
      try { hostFrames.push(JSON.parse(data.trim())); } catch { /* ignore */ }
      return true;
    }) as typeof process.stdout.write;

    const ompStdinWrites: unknown[] = [];
    b.ompProcess = { stdin: { write: vi.fn((data: string) => { try { ompStdinWrites.push(JSON.parse(data.trim())); } catch { /* ignore */ } }) } };

    bridge.handleOmpFrame(JSON.stringify({
      type: "host_tool_call",
      id: "call-2",
      toolCallId: "tc2",
      toolName: "fcode_bench_run",
      arguments: { command: "migrate" },
    }));

    const hostCall = hostFrames.find((f) => (f as Record<string, unknown>).method === "host.proxy");
    expect(hostCall).toBeDefined();
    const callId = String((hostCall as Record<string, unknown>).id);

    // Simulate host error response.
    bridge.handleHostFrame({
      jsonrpc: "2.0",
      id: callId,
      error: { code: -32603, message: "no active bench" },
    });

    // Rejection propagates: reject P1 → skip .then → .catch fires — 3 ticks needed.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const resultFrame = ompStdinWrites.find((f) => (f as Record<string, unknown>).type === "host_tool_result");
    expect(resultFrame).toBeDefined();
    const rf = resultFrame as Record<string, unknown>;
    expect(rf.id).toBe("call-2");
    expect(rf.isError).toBe(true);
    expect(JSON.stringify(rf.result)).toContain("no active bench");

    process.stdout.write = origWrite;
  });
});

describe("OmpBridge — registerHostTools sends set_host_tools after v2 negotiation (T7)", () => {
  it("writes set_host_tools with the fcode_ tool names to omp stdin after protocol negotiation", async () => {
    const bridge = new OmpBridge();
    const b = bridge as unknown as Record<string, unknown>;
    // Clear any handshake timer that start() would set (not invoked here).

    const ompStdinWrites: unknown[] = [];
    const stdinMock = vi.fn((data: string) => {
      try { ompStdinWrites.push(JSON.parse(data.trim())); } catch { /* ignore */ }
    });
    b.ompProcess = { stdin: { write: stdinMock } };

    // Silence stdout (negotiate call is written there — no, ompCall writes to omp stdin).
    // Actually ompCall writes to ompProcess.stdin, which we've mocked above.

    // Feed a ready frame to trigger handshake.
    bridge.handleOmpFrame(JSON.stringify({
      type: "ready",
      protocolVersion: 1,
      supportedProtocolVersions: [1, 2],
      maxFrameBytes: 1048576,
      maxReassembledFrameBytes: 67108864,
    }));

    // Find the negotiate_protocol call written to omp stdin.
    const negotiateCall = ompStdinWrites.find((f) => (f as Record<string, unknown>).type === "negotiate_protocol");
    expect(negotiateCall).toBeDefined();
    const negotiateId = String((negotiateCall as Record<string, unknown>).id);

    // Simulate omp responding with protocol v2.
    bridge.handleOmpFrame(JSON.stringify({
      id: negotiateId,
      type: "response",
      command: "negotiate_protocol",
      success: true,
      data: { protocolVersion: 2 },
    }));

    // Give microtasks a chance to run (ompCall .then handler + registerHostTools).
    await Promise.resolve();
    await Promise.resolve();

    // Find the set_host_tools call.
    const setToolsCall = ompStdinWrites.find((f) => (f as Record<string, unknown>).type === "set_host_tools");
    expect(setToolsCall).toBeDefined();
    const tools = (setToolsCall as Record<string, unknown>).tools as Array<{ name: string }>;
    const names = tools.map((t) => t.name);
    expect(names).toContain("fcode_bench_execute");
    expect(names).toContain("fcode_bench_execute_read");
    expect(names).toContain("fcode_bench_run");
    expect(names).toContain("fcode_canvas");
    expect(names).toContain("fcode_canvas_read");
    expect(names).toContain("fcode_studio");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §9 — set_subagent_subscription + subagent frame mapping
// ─────────────────────────────────────────────────────────────────────────────

/** A configured bridge whose omp stdin and host stdout writes are captured. */
function promptBridge() {
  const bridge = new OmpBridge();
  const b = bridge as unknown as Record<string, unknown>;
  const ompStdinWrites: Array<Record<string, unknown>> = [];
  const hostWrites: Array<Record<string, unknown>> = [];
  b.config = { dataDir: "/d", resourcesPath: "" };
  b.ompProcess = {
    stdin: {
      write: vi.fn((data: string) => {
        try { ompStdinWrites.push(JSON.parse(data.trim())); } catch { /* ignore */ }
      }),
    },
  };
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((data: string) => {
    try { hostWrites.push(JSON.parse(String(data).trim())); } catch { /* ignore */ }
    return true;
  }) as typeof process.stdout.write;
  const prompt = (id: string, sessionId: string, projectPath: string, extra: Record<string, unknown> = {}) =>
    bridge.handleHostFrame({
      jsonrpc: "2.0", id, method: "agent.prompt",
      params: { sessionId, turnId: `turn-${id}`, content: "hello", projectPath, ...extra },
    });
  const respondOmp = (type: string, data: unknown) => {
    const call = ompStdinWrites.findLast((f) => f.type === type);
    if (!call) throw new Error(`no ${type} call found`);
    bridge.handleOmpFrame(
      JSON.stringify({ id: call.id, type: "response", command: type, success: true, data }),
    );
  };
  /** Let the ompPrompt chain reach its next omp call (pure microtasks, no clock). */
  const tick = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };
  /** Answer the ompPrompt chain: open_session → set_subagent_subscription → prompt. */
  const drive = async (opts: { alreadySubscribed?: boolean } = {}) => {
    respondOmp("open_session", { cancelled: false });
    await tick();
    if (!opts.alreadySubscribed) {
      respondOmp("set_subagent_subscription", { level: "progress" });
      await tick();
    }
    respondOmp("prompt", { agentInvoked: true });
    await tick();
  };
  const restore = () => { process.stdout.write = origWrite; };
  return { bridge, ompStdinWrites, hostWrites, prompt, respondOmp, drive, tick, restore };
}

describe("OmpBridge — set_subagent_subscription sent once on session open (§9)", () => {
  it("sends set_subagent_subscription{level:progress} before the first prompt", async () => {
    const { ompStdinWrites, prompt, drive, restore } = promptBridge();
    try {
      void prompt("h1", "s1", "/p");
      await drive();

      const subIdx = ompStdinWrites.findIndex((f) => f.type === "set_subagent_subscription");
      const promptIdx = ompStdinWrites.findIndex((f) => f.type === "prompt");
      expect(ompStdinWrites[subIdx]?.level).toBe("progress");
      expect(subIdx).toBeGreaterThanOrEqual(0);
      expect(promptIdx).toBeGreaterThan(subIdx);
    } finally {
      restore();
    }
  });

  it("does not send set_subagent_subscription a second time for a subsequent prompt", async () => {
    const { ompStdinWrites, prompt, drive, restore } = promptBridge();
    try {
      void prompt("h1", "s1", "/p");
      await drive();
      void prompt("h2", "s1", "/p");
      await drive({ alreadySubscribed: true });

      expect(ompStdinWrites.filter((f) => f.type === "set_subagent_subscription")).toHaveLength(1);
      expect(ompStdinWrites.filter((f) => f.type === "prompt")).toHaveLength(2);
    } finally {
      restore();
    }
  });
});

describe("OmpBridge — one omp session per Fcode session", () => {
  it("opens each Fcode session in its own omp session directory and project", async () => {
    const { ompStdinWrites, prompt, drive, restore } = promptBridge();
    try {
      void prompt("h1", "s1", "/p1");
      await drive();
      void prompt("h2", "s2", "/p2");
      await drive({ alreadySubscribed: true });
      void prompt("h3", "s1", "/p1");
      await drive({ alreadySubscribed: true });

      expect(ompStdinWrites.filter((f) => f.type === "open_session")).toMatchObject([
        { sessionDir: join("/d", "omp-threads", "s1"), cwd: "/p1" },
        { sessionDir: join("/d", "omp-threads", "s2"), cwd: "/p2" },
        { sessionDir: join("/d", "omp-threads", "s1"), cwd: "/p1" },
      ]);
    } finally {
      restore();
    }
  });

  it("fails the turn without prompting when omp cannot open the conversation", async () => {
    const { ompStdinWrites, hostWrites, prompt, respondOmp, restore } = promptBridge();
    try {
      const done = prompt("h1", "s1", "/deleted-project");
      respondOmp("open_session", { cancelled: true });
      await done;

      expect(ompStdinWrites.some((f) => f.type === "prompt")).toBe(false);
      expect(hostWrites.find((f) => f.id === "h1")?.error).toMatchObject({
        message: expect.stringContaining("/deleted-project"),
      });
    } finally {
      restore();
    }
  });
});

describe("OmpBridge — runs each chat on its Fcode model", () => {
  const tick = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };
  /** Drive one turn whose omp thread opens on `model`; return the set_model writes. */
  const turn = async (resumed: boolean, model: { provider: string; id: string }, pick?: string) => {
    const h = promptBridge();
    try {
      if (pick) {
        void h.bridge.handleHostFrame({
          jsonrpc: "2.0", id: "m", method: "omp.models.set", params: { provider: pick, modelId: model.id },
        });
        h.respondOmp("set_model", {});
        await tick();
      }
      const before = h.ompStdinWrites.length;
      void h.prompt("h1", "s1", "/p", { provider: { id: "p1", modelId: "m1" } });
      h.respondOmp("open_session", { cancelled: false, resumed });
      await tick();
      h.respondOmp("get_state", { model });
      await tick();
      const sets = h.ompStdinWrites.slice(before).filter((f) => f.type === "set_model");
      if (sets.length > 0) h.respondOmp("set_model", {});
      await tick();
      h.respondOmp("set_subagent_subscription", {});
      await tick();
      h.respondOmp("prompt", { agentInvoked: true });
      await tick();
      return sets;
    } finally {
      h.restore();
    }
  };

  it("moves a new chat off the model the previous chat used", async () => {
    expect(await turn(false, { provider: "ollama", id: "qwen" })).toMatchObject([
      { provider: "fcode-p1", modelId: "m1" },
    ]);
  });

  it("moves a resumed chat back from another Fcode model", async () => {
    expect(await turn(true, { provider: "fcode-p2", id: "m2" })).toHaveLength(1);
  });

  it("keeps a chat on a model picked from omp's own providers", async () => {
    expect(await turn(true, { provider: "ollama", id: "qwen" })).toHaveLength(0);
    expect(await turn(false, { provider: "ollama", id: "qwen" }, "ollama")).toHaveLength(0);
  });

  it("leaves a chat already on its model alone", async () => {
    expect(await turn(false, { provider: "fcode-p1", id: "m1" })).toHaveLength(0);
  });
});

describe("OmpBridge.handleSubagentFrame — lifecycle and progress frames map to agent.event (§9)", () => {
  // Helper: capture agent.event notifications emitted to stdout.
  function captureAgentEvents(): { events: unknown[]; restore: () => void } {
    const events: unknown[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((data: string) => {
      try {
        const msg = JSON.parse(data.trim()) as Record<string, unknown>;
        if (msg.method === "agent.event") events.push(msg.params);
      } catch { /* ignore */ }
      return true;
    }) as typeof process.stdout.write;
    return { events, restore: () => { process.stdout.write = origWrite; } };
  }

  it("lifecycle started → tool_start with parentToolCallId and agentName", () => {
    const bridge = new OmpBridge();
    const b = bridge as unknown as Record<string, unknown>;
    const sessMap = b.sessions as Map<string, unknown>;
    sessMap.set("sess-A", { ompSessionDir: undefined, projectPath: "/", inputModalities: [] });

    const { events, restore } = captureAgentEvents();

    bridge.handleOmpFrame(JSON.stringify({
      type: "subagent_lifecycle",
      payload: {
        id: "sub-1",
        agent: "coder",
        agentSource: "builtin",
        status: "started",
        index: 0,
        parentToolCallId: "task-call-99",
        description: "Write tests",
      },
    }));

    expect(events).toHaveLength(1);
    const env = events[0] as Record<string, unknown>;
    expect(env.sessionId).toBe("sess-A");
    expect(env.parentToolCallId).toBe("task-call-99");
    expect(env.agentName).toBe("coder");
    const evt = env.event as Record<string, unknown>;
    expect(evt.type).toBe("tool_start");
    expect(evt.toolCallId).toBe("sub-1");
    expect(evt.toolName).toBe("task");

    restore();
  });

  it("lifecycle completed → tool_end with parentToolCallId and agentName", () => {
    const bridge = new OmpBridge();
    const b = bridge as unknown as Record<string, unknown>;
    (b.sessions as Map<string, unknown>).set("sess-A", { ompSessionDir: undefined, projectPath: "/", inputModalities: [] });

    const { events, restore } = captureAgentEvents();

    bridge.handleOmpFrame(JSON.stringify({
      type: "subagent_lifecycle",
      payload: {
        id: "sub-2",
        agent: "reviewer",
        agentSource: "builtin",
        status: "completed",
        index: 1,
        parentToolCallId: "task-call-7",
      },
    }));

    expect(events).toHaveLength(1);
    const env = events[0] as Record<string, unknown>;
    expect(env.parentToolCallId).toBe("task-call-7");
    expect(env.agentName).toBe("reviewer");
    const evt = env.event as Record<string, unknown>;
    expect(evt.type).toBe("tool_end");
    expect(evt.toolCallId).toBe("sub-2");
    expect(evt.isError).toBe(false);

    restore();
  });

  it("lifecycle failed → tool_end with isError:true", () => {
    const bridge = new OmpBridge();
    const b = bridge as unknown as Record<string, unknown>;
    (b.sessions as Map<string, unknown>).set("sess-A", { ompSessionDir: undefined, projectPath: "/", inputModalities: [] });

    const { events, restore } = captureAgentEvents();

    bridge.handleOmpFrame(JSON.stringify({
      type: "subagent_lifecycle",
      payload: {
        id: "sub-3",
        agent: "tester",
        agentSource: "builtin",
        status: "failed",
        index: 2,
        parentToolCallId: "tc-fail",
      },
    }));

    expect(events).toHaveLength(1);
    const evt = (events[0] as Record<string, unknown>).event as Record<string, unknown>;
    expect(evt.type).toBe("tool_end");
    expect(evt.isError).toBe(true);

    restore();
  });

  it("progress frame → tool_update with parentToolCallId and agentName", () => {
    const bridge = new OmpBridge();
    const b = bridge as unknown as Record<string, unknown>;
    (b.sessions as Map<string, unknown>).set("sess-A", { ompSessionDir: undefined, projectPath: "/", inputModalities: [] });

    const { events, restore } = captureAgentEvents();

    bridge.handleOmpFrame(JSON.stringify({
      type: "subagent_progress",
      payload: {
        index: 0,
        agent: "coder",
        agentSource: "builtin",
        task: "Write unit tests for auth module",
        parentToolCallId: "task-call-99",
        progress: {
          id: "sub-1",
          status: "running",
          description: "In progress",
        },
      },
    }));

    expect(events).toHaveLength(1);
    const env = events[0] as Record<string, unknown>;
    expect(env.parentToolCallId).toBe("task-call-99");
    expect(env.agentName).toBe("coder");
    const evt = env.event as Record<string, unknown>;
    expect(evt.type).toBe("tool_update");
    expect(evt.toolCallId).toBe("sub-1");
    expect(evt.partialResult).toBe("Write unit tests for auth module");

    restore();
  });

  it("lifecycle without parentToolCallId omits parentToolCallId from envelope", () => {
    const bridge = new OmpBridge();
    const b = bridge as unknown as Record<string, unknown>;
    (b.sessions as Map<string, unknown>).set("sess-A", { ompSessionDir: undefined, projectPath: "/", inputModalities: [] });

    const { events, restore } = captureAgentEvents();

    bridge.handleOmpFrame(JSON.stringify({
      type: "subagent_lifecycle",
      payload: {
        id: "sub-orphan",
        agent: "solo",
        agentSource: "builtin",
        status: "started",
        index: 0,
        // no parentToolCallId
      },
    }));

    const env = events[0] as Record<string, unknown>;
    expect("parentToolCallId" in env).toBe(false);
    expect(env.agentName).toBe("solo");

    restore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DX10 / T7 — handshake logging (protocol version + tool registration)
// ─────────────────────────────────────────────────────────────────────────────

/** Complete a v2 handshake capturing stdout notifications emitted to the host. */
async function negotiateV2(bridge: OmpBridge): Promise<{
  ompStdinWrites: unknown[];
  emitted: unknown[];
  origStdout: typeof process.stdout.write;
}> {
  const b = bridge as unknown as Record<string, unknown>;
  const ompStdinWrites: unknown[] = [];
  b.ompProcess = { stdin: { write: vi.fn((data: string) => {
    try { ompStdinWrites.push(JSON.parse(data.trim())); } catch { /* ignore */ }
  }) } };

  const emitted: unknown[] = [];
  const origStdout = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((data: string) => {
    try { emitted.push(JSON.parse(data.trim())); } catch { /* ignore */ }
    return true;
  }) as typeof process.stdout.write;

  bridge.handleOmpFrame(JSON.stringify({
    type: "ready", protocolVersion: 1,
    supportedProtocolVersions: [1, 2], maxFrameBytes: 1048576, maxReassembledFrameBytes: 67108864,
  }));

  const negotiateCall = ompStdinWrites.find((f) => (f as Record<string, unknown>).type === "negotiate_protocol");
  const negotiateId = String((negotiateCall as Record<string, unknown>).id);

  bridge.handleOmpFrame(JSON.stringify({
    id: negotiateId, type: "response", command: "negotiate_protocol", success: true,
    data: { protocolVersion: 2 },
  }));

  await Promise.resolve(); await Promise.resolve();
  return { ompStdinWrites, emitted, origStdout };
}

describe("OmpBridge — registration failure emits HOST_TOOL_REGISTRATION_FAILED notification (DX10, T7)", () => {
  it("emits sidecar.notification when set_host_tools fails", async () => {
    const bridge = new OmpBridge();
    const { ompStdinWrites, emitted, origStdout } = await negotiateV2(bridge);
    try {
      const setToolsCall = ompStdinWrites.find((f) => (f as Record<string, unknown>).type === "set_host_tools");
      const setToolsId = String((setToolsCall as Record<string, unknown>).id);

      bridge.handleOmpFrame(JSON.stringify({
        id: setToolsId, type: "response", command: "set_host_tools", success: false,
        error: "set_host_tools unsupported",
      }));
      // Rejection propagates: ompCall→registerHostTools→.then(skip)→.catch — 4 flushes.
      await Promise.resolve(); await Promise.resolve();
      await Promise.resolve(); await Promise.resolve();

      const notification = emitted.find((e) => {
        const ev = e as Record<string, unknown>;
        return ev.method === "sidecar.notification" &&
          (ev.params as Record<string, unknown>)?.code === "HOST_TOOL_REGISTRATION_FAILED";
      });
      expect(notification).toBeDefined();
    } finally {
      process.stdout.write = origStdout;
    }
  });
});

describe("OmpBridge — kanban host tools follow kanban.enabled", () => {
  async function registered(settings: unknown): Promise<string[]> {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dataDir = mkdtempSync(join(tmpdir(), "bridge-kanban-"));
    if (settings) writeFileSync(join(dataDir, "kanban-settings.json"), JSON.stringify(settings));
    const b = new OmpBridge() as unknown as Record<string, unknown>;
    b.config = { dataDir };
    let sent: Array<{ name: string }> = [];
    b.ompCall = async (cmd: { tools: Array<{ name: string }> }) => { sent = cmd.tools; return undefined; };
    await (b.registerHostTools as () => Promise<string[]>).call(b);
    return sent.map((t) => t.name);
  }

  it("registers the kanban tools only when enabled", async () => {
    expect(await registered({ enabled: true })).toContain("kanban_complete");
    expect(await registered({ enabled: false })).not.toContain("kanban_complete");
    expect(await registered(null)).not.toContain("kanban_complete");
    expect(await registered({ enabled: false })).toContain("fcode_bench_execute");
  });
});

describe("OmpBridge — system lines need a session", () => {
  it("drops notices, todo and subagent frames until a session exists (host rejects empty sessionId)", () => {
    const bridge = new OmpBridge();
    const b = bridge as unknown as Record<string, unknown>;
    const notifications: unknown[] = [];
    b.notify = (_channel: string, payload: unknown) => { notifications.push(payload); };

    for (const frame of [
      { type: "notice", message: "early" },
      { type: "todo_reminder" },
      { type: "subagent_event", payload: { id: "a1", event: { type: "message_start" } } },
    ]) bridge.handleOmpFrame(JSON.stringify(frame));
    expect(notifications).toHaveLength(0);

    (b.sessions as Map<string, unknown>).set("s1", { projectPath: "/", inputModalities: [] });
    bridge.handleOmpFrame(JSON.stringify({ type: "notice", message: "later" }));
    expect(notifications).toMatchObject([{ sessionId: "s1" }]);
  });
});
