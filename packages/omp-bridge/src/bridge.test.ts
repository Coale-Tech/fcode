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
    expect(overlay).toContain("approval_mode");
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

  it("sets enableClaudeUser: true", () => {
    const overlay = makeOmpOverlay({
      dataDir: dir,
      resourcesPath: "/app/resources",
      screenshotsDir: join(dir, "screenshots"),
    });
    expect(overlay).toContain("enableClaudeUser");
    expect(overlay).toContain("true");
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
      toolCallId: "tc1",
      toolName: "fcode_bench_execute",
      args: { method: "frappe.utils.now", kwargs: {} },
    }));

    // The bridge should have written a host.proxy call to stdout.
    const hostCall = hostFrames.find((f) => (f as Record<string, unknown>).method === "host.proxy");
    expect(hostCall).toBeDefined();
    const hc = hostCall as Record<string, unknown>;
    expect((hc.params as Record<string, unknown>).method).toBe("fcode_bench_execute");
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
    expect(rf.toolCallId).toBe("tc1");
    expect((rf.result as Record<string, unknown>).ok).toBe(true);

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
      toolCallId: "tc2",
      toolName: "fcode_bench_run",
      args: { command: "migrate" },
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
    expect(rf.toolCallId).toBe("tc2");
    expect((rf.result as Record<string, unknown>).isError).toBe(true);
    expect(String((rf.result as Record<string, unknown>).content)).toContain("no active bench");

    process.stdout.write = origWrite;
  });
});

describe("OmpBridge — registerHostTools sends set_host_tools after v2 negotiation (T7)", () => {
  it("writes set_host_tools with 5 fcode_ tool names to omp stdin after protocol negotiation", async () => {
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
  });
});
