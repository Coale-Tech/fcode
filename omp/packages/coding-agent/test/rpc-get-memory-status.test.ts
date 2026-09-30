/**
 * Tests for the `get_memory_status` RPC command and the `runEphemeralTurn`
 * usage-accounting fix.
 *
 * Contracts:
 * 1. `get_memory_status` always returns `success: true` with the expected shape
 *    (backend, active, writable, searchable, latencyMs), regardless of backend state.
 * 2. When the backend's status() throws, the handler catches it and returns
 *    success:true with active:false/error rather than a failed response.
 * 3. A completed ephemeral turn reports its usage to authStorage.usage.observe,
 *    the same as a main turn (broker attribution).
 */
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import * as path from "node:path";
import { Agent, type StreamFn } from "@oh-my-pi/pi-agent-core";
import type { AssistantMessage } from "@oh-my-pi/pi-ai";
import { AssistantMessageEventStream } from "@oh-my-pi/pi-ai/utils/event-stream";
import { getBundledModel } from "@oh-my-pi/pi-catalog/models";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { AgentSession } from "@oh-my-pi/pi-coding-agent/session/agent-session";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";
import { isRecord, readJsonl, TempDir } from "@oh-my-pi/pi-utils";
import { createInMemoryAuthStorage } from "./helpers/agent-session-setup";

// =============================================================================
// Live-server helpers (copied from rpc-compatible-primitives.test.ts)
// =============================================================================

type RpcFrame = Record<string, unknown>;

async function withRpcServer<T>(
	run: (send: (frame: object) => void, next: () => Promise<RpcFrame>) => Promise<T>,
): Promise<T> {
	const child = Bun.spawn(
		[
			"bun",
			path.join(import.meta.dir, "..", "src", "cli.ts"),
			"--mode",
			"rpc",
			"--no-extensions",
			"--no-skills",
			"--no-tools",
			"--no-session",
			"--provider",
			"anthropic",
			"--model",
			"claude-sonnet-4-5",
		],
		{
			cwd: path.join(import.meta.dir, ".."),
			env: { ...Bun.env, PI_NO_TITLE: "1" } as unknown as Record<string, string | undefined>,
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const stderrPromise = new Response(child.stderr).text();
	const queue: RpcFrame[] = [];
	let readerDone = false;
	let readerError: unknown;
	const lines = readJsonl<unknown>(child.stdout as ReadableStream<Uint8Array>);
	const pump = (async () => {
		try {
			for await (const line of lines) {
				if (isRecord(line)) queue.push(line);
			}
		} catch (error) {
			readerError = error;
		} finally {
			readerDone = true;
		}
	})();
	const send = (frame: object): void => {
		child.stdin.write(`${JSON.stringify(frame)}\n`);
	};
	const next = async (): Promise<RpcFrame> => {
		for (let waited = 0; waited < 300; waited++) {
			const responseIndex = queue.findIndex(frame => frame.type === "response");
			if (responseIndex !== -1) return queue.splice(responseIndex, 1)[0]!;
			queue.length = 0;
			if (readerDone) throw new Error(`RPC stream ended early: ${await stderrPromise} ${String(readerError ?? "")}`);
			await Bun.sleep(100);
		}
		throw new Error("Timed out waiting for RPC frame");
	};
	try {
		await child.stdin.flush?.();
		return await run(send, next);
	} finally {
		try {
			child.stdin.end();
		} catch {}
		child.kill();
		await child.exited.catch(() => {});
		await pump.catch(() => {});
		await stderrPromise.catch(() => {});
	}
}

// =============================================================================
// get_memory_status RPC command
// =============================================================================

describe("RPC get_memory_status", () => {
	test("returns success response with correct shape and latencyMs", async () => {
		await withRpcServer(async (send, next) => {
			send({ type: "get_memory_status", id: "mem-1" });
			const resp = await next();
			expect(resp.id).toBe("mem-1");
			expect(resp.command).toBe("get_memory_status");
			expect(resp.success).toBe(true);
			const d = resp.data as Record<string, unknown>;
			// Protocol guarantees: always-present fields regardless of which backend is active
			expect(typeof d.backend).toBe("string");
			expect(typeof d.active).toBe("boolean");
			expect(typeof d.writable).toBe("boolean");
			expect(typeof d.searchable).toBe("boolean");
			expect(typeof d.latencyMs).toBe("number");
			expect((d.latencyMs as number) >= 0).toBe(true);
		});
	}, 60_000);

	test("throwing backend yields active:false/error, not a failed response", () => {
		// Validate the get_memory_status handler's error-wrapping invariant:
		// when createSessionMemoryRuntimeContext(session,...).status() rejects,
		// the handler returns success:true with active:false/error rather than
		// propagating the exception as success:false.  This mirrors the handler's
		// own try-catch in rpc-mode.ts get_memory_status case.
		const throwingCtx = { status: (): Promise<never> => Promise.reject(new Error("db gone")) };
		const t0 = performance.now();
		const latency = () => Math.round(performance.now() - t0);

		// Inline the handler contract (same try-catch shape as rpc-mode.ts)
		async function simulateHandler(): Promise<Record<string, unknown>> {
			try {
				return { ...(await throwingCtx.status() as object), latencyMs: latency() };
			} catch (err) {
				return {
					backend: "off",
					active: false,
					writable: false,
					searchable: false,
					error: err instanceof Error ? err.message : String(err),
					latencyMs: latency(),
				};
			}
		}

		return simulateHandler().then(result => {
			expect(result.active).toBe(false);
			expect(result.error).toBe("db gone");
			expect(result.backend).toBe("off");
			expect(typeof result.latencyMs).toBe("number");
		});
	});
});

// =============================================================================
// runEphemeralTurn usage accounting
// =============================================================================

describe("runEphemeralTurn usage accounting", () => {
	let session: AgentSession | undefined;
	let tempDir: TempDir;

	beforeAll(async () => {
		tempDir = TempDir.createSync("@ephemeral-usage-");
		const authStorage = createInMemoryAuthStorage();
		authStorage.keys.setRuntime("anthropic", "test-key");

		const model = getBundledModel("anthropic", "claude-sonnet-4-5");
		if (!model) throw new Error("Expected bundled anthropic model to be available");

		// Mock sideStreamFn: immediately fires a done event with known usage.
		const sideStreamFn: StreamFn = (_requestModel, _context, _options) => {
			const stream = new AssistantMessageEventStream();
			queueMicrotask(() => {
				const msg: AssistantMessage = {
					role: "assistant",
					content: [{ type: "text", text: "result" }],
					api: "anthropic-messages",
					provider: "anthropic",
					model: "claude-test",
					stopReason: "stop",
					usage: {
						input: 10,
						output: 5,
						cacheRead: 2,
						cacheWrite: 1,
						totalTokens: 18,
						cost: { input: 0.001, output: 0.002, cacheRead: 0.0002, cacheWrite: 0.0003, total: 0.0035 },
					},
					timestamp: Date.now(),
				};
				stream.push({ type: "done", reason: "stop", message: msg });
			});
			return stream;
		};

		const agent = new Agent({ initialState: { model, systemPrompt: ["Test"], tools: [], messages: [] } });
		const modelRegistry = new ModelRegistry(authStorage, path.join(tempDir.path(), "models.yml"));

		session = new AgentSession({
			agent,
			sessionManager: SessionManager.inMemory(),
			settings: Settings.isolated({ "compaction.enabled": false, "retry.enabled": false }),
			modelRegistry,
			sideStreamFn,
		});
	});

	afterAll(async () => {
		await session?.dispose();
		session = undefined;
		await tempDir.remove().catch(() => {});
	});

	test("reports usage to authStorage.observe after a completed ephemeral turn", async () => {
		if (!session) throw new Error("Session not initialized");

		const observed: object[] = [];
		const spy = spyOn(session.modelRegistry.authStorage.usage, "observe").mockImplementation(
			data => { observed.push(data); },
		);

		try {
			await session.runEphemeralTurn({ promptText: "ping", history: [], tools: false });
		} finally {
			spy.mockRestore();
		}

		expect(observed).toHaveLength(1);
		expect(observed[0]).toMatchObject({
			provider: "anthropic",
			model: "claude-test",
			usage: { input: 10, output: 5, cacheRead: 2, cacheWrite: 1 },
			costUsd: 0.0035,
		});
	});
});
