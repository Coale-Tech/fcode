/**
 * Subagents receive the parent's RPC host tools. Subagents run `tools.approvalMode: yolo`, so the
 * only thing standing between a subagent and `fcode_bench_run migrate` is the PARENT's approval
 * gate. These tests pin that the forwarded tool still obeys the parent's policy, and that a
 * subagent only sees the tools it was handed.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type } from "@oh-my-pi/omptype";
import type { AgentTool } from "@oh-my-pi/pi-agent-core";
import { getBundledModel } from "@oh-my-pi/pi-catalog/models";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { createAgentSession, discoverAuthStorage } from "@oh-my-pi/pi-coding-agent/sdk";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";
import { removeSyncWithRetries, Snowflake } from "@oh-my-pi/pi-utils";

const dirs: string[] = [];
let modelRegistry!: ModelRegistry;

beforeAll(async () => {
	const authDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subhost-auth-"));
	dirs.push(authDir);
	modelRegistry = new ModelRegistry(await discoverAuthStorage(authDir));
});
afterAll(() => {
	for (const dir of dirs.splice(0)) removeSyncWithRetries(dir);
});

function fakeHostTool(name: string, calls: string[]): AgentTool {
	return {
		name,
		label: name,
		description: `Fake host tool ${name}`,
		parameters: type({ "command?": "string" }),
		async execute(_id: string, params: { command?: string }) {
			calls.push(`${name}:${params.command ?? ""}`);
			return { content: [{ type: "text" as const, text: "ran" }] };
		},
	} as unknown as AgentTool;
}

async function newSession(settings: Settings) {
	const cwd = path.join(os.tmpdir(), `pi-subhost-${Snowflake.next()}`);
	fs.mkdirSync(cwd, { recursive: true });
	dirs.push(cwd);
	const { session } = await createAgentSession({
		cwd,
		agentDir: cwd,
		modelRegistry,
		sessionManager: SessionManager.inMemory(),
		settings,
		model: getBundledModel("openai", "gpt-4o-mini"),
		disableExtensionDiscovery: true,
		skills: [],
		contextFiles: [],
		promptTemplates: [],
		slashCommands: [],
		enableMCP: false,
		enableLsp: false,
		rules: [],
		workspaceTree: { rootPath: cwd, rendered: "", truncated: false, totalLines: 0, agentsMdFiles: [] },
	});
	return session;
}

describe("RPC host tools forwarded to subagents", () => {
	it("keeps the parent's approval policy: a prompt-gated tool does not run headless", async () => {
		const calls: string[] = [];
		const parent = await newSession(
			Settings.isolated({ "tools.approvalMode": "yolo", "tools.approval": { fcode_bench_run: "prompt" } }),
		);
		const sub = await newSession(Settings.isolated({ "tools.approvalMode": "yolo" }));
		try {
			await parent.refreshRpcHostTools([fakeHostTool("fcode_bench_run", calls)]);
			await sub.refreshSubagentRpcHostTools(parent.getRpcHostTools());

			const tool = sub.getToolByName("fcode_bench_run");
			expect(tool).toBeDefined();
			await expect(tool!.execute("c1", { command: "migrate" } as never)).rejects.toThrow(/approval/i);
			expect(calls).toEqual([]);
		} finally {
			await parent.dispose();
			await sub.dispose();
		}
	});

	it("runs the tool when the parent policy allows it", async () => {
		const calls: string[] = [];
		const parent = await newSession(
			Settings.isolated({ "tools.approvalMode": "yolo", "tools.approval": { fcode_bench_execute_read: "allow" } }),
		);
		const sub = await newSession(Settings.isolated({ "tools.approvalMode": "yolo" }));
		try {
			await parent.refreshRpcHostTools([fakeHostTool("fcode_bench_execute_read", calls)]);
			await sub.refreshSubagentRpcHostTools(parent.getRpcHostTools());

			await sub.getToolByName("fcode_bench_execute_read")!.execute("c1", { command: "x" } as never);
			expect(calls).toEqual(["fcode_bench_execute_read:x"]);
		} finally {
			await parent.dispose();
			await sub.dispose();
		}
	});

	it("a subagent only has the host tools it was handed", async () => {
		const calls: string[] = [];
		const parent = await newSession(Settings.isolated({ "tools.approvalMode": "yolo" }));
		const sub = await newSession(Settings.isolated({ "tools.approvalMode": "yolo" }));
		try {
			await parent.refreshRpcHostTools([fakeHostTool("fcode_a", calls), fakeHostTool("fcode_b", calls)]);
			await sub.refreshSubagentRpcHostTools(parent.getRpcHostTools().filter(t => t.name === "fcode_a"));

			expect(sub.getToolByName("fcode_a")).toBeDefined();
			expect(sub.getToolByName("fcode_b")).toBeUndefined();
		} finally {
			await parent.dispose();
			await sub.dispose();
		}
	});
});
