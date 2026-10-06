import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentMessage } from "@oh-my-pi/pi-agent-core";
import { openRpcSession, type RpcOpenSessionSession } from "@oh-my-pi/pi-coding-agent/modes/rpc/rpc-mode";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";
import { getConfigRootDir, setAgentDir } from "@oh-my-pi/pi-utils";
import { makeAssistantMessage } from "./session-manager/helpers";

/** AgentSession stand-in whose session transitions run against a real SessionManager. */
function sessionOver(manager: SessionManager): { session: RpcOpenSessionSession; transitions: string[] } {
	const transitions: string[] = [];
	const session: RpcOpenSessionSession = {
		sessionManager: manager,
		get sessionFile() {
			return manager.getSessionFile();
		},
		get sessionId() {
			return manager.getSessionId();
		},
		get messages(): AgentMessage[] {
			return manager.getEntries().flatMap(entry => (entry.type === "message" ? [entry.message] : []));
		},
		async newSession(options) {
			transitions.push("new");
			await manager.newSession(options);
			return true;
		},
		async switchSession(sessionPath, options) {
			transitions.push("switch");
			const previousCwd = manager.getCwd();
			await manager.setSessionFile(sessionPath);
			if (options?.preserveLocalCwd) manager.setCwdWithoutRelocation(previousCwd);
			return true;
		},
	};
	return { session, transitions };
}

describe("openRpcSession", () => {
	let root: string;
	let cwd: string;
	let threadDir: string;
	const originalAgentDir = process.env.PI_CODING_AGENT_DIR;

	beforeEach(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), "omp-rpc-open-session-"));
		setAgentDir(path.join(root, "agent"));
		cwd = path.join(root, "project");
		threadDir = path.join(root, "threads", "thread-a");
		await fs.mkdir(cwd, { recursive: true });
	});

	afterEach(async () => {
		if (originalAgentDir) setAgentDir(originalAgentDir);
		else {
			setAgentDir(path.join(getConfigRootDir(), "agent"));
			delete process.env.PI_CODING_AGENT_DIR;
		}
		await fs.rm(root, { recursive: true, force: true });
	});

	it("starts a fresh session in an unused directory and treats reopening it as a no-op", async () => {
		const manager = SessionManager.create(cwd);
		const { session, transitions } = sessionOver(manager);
		try {
			const opened = await openRpcSession(session, threadDir);
			expect(opened).toMatchObject({ cancelled: false, resumed: false });
			expect(path.dirname(opened.sessionFile ?? "")).toBe(threadDir);

			const reopened = await openRpcSession(session, threadDir);
			expect(reopened).toEqual({ ...opened, resumed: false });
			expect(transitions).toEqual(["new"]);
		} finally {
			await manager.close();
		}
	});

	it("resumes the newest answered session in the directory, then no-ops while it stays open", async () => {
		const previous = SessionManager.create(cwd, threadDir);
		previous.appendMessage({ role: "user", content: "remember the codeword", timestamp: 1 });
		previous.appendMessage(makeAssistantMessage());
		await previous.flush();
		const previousFile = previous.getSessionFile();
		const previousId = previous.getSessionId();
		await previous.close();

		const manager = SessionManager.create(cwd);
		const { session, transitions } = sessionOver(manager);
		try {
			const opened = await openRpcSession(session, threadDir);
			expect(opened).toEqual({ cancelled: false, resumed: true, sessionId: previousId, sessionFile: previousFile });
			expect(session.messages).toHaveLength(2);

			await openRpcSession(session, threadDir);
			expect(transitions).toEqual(["switch"]);
		} finally {
			await manager.close();
		}
	});

	it("starts a fresh session in the conversation's project directory", async () => {
		const project = path.join(root, "other-project");
		await fs.mkdir(project);
		const manager = SessionManager.create(cwd);
		const { session, transitions } = sessionOver(manager);
		const moves: string[] = [];
		try {
			const opened = await openRpcSession(session, threadDir, undefined, {
				path: project,
				rescope: async dir => {
					moves.push(dir);
					return true;
				},
			});
			expect(opened).toMatchObject({ cancelled: false, resumed: false });
			expect(moves).toEqual([project]);
			expect(manager.getRecordedCwd()).toBe(project);
			expect(path.dirname(opened.sessionFile ?? "")).toBe(threadDir);
			expect(transitions).toEqual(["new"]);
		} finally {
			await manager.close();
		}
	});

	it("resumes a conversation in its project directory, following a project move", async () => {
		const previous = SessionManager.create(cwd, threadDir);
		previous.appendMessage({ role: "user", content: "remember the codeword", timestamp: 1 });
		previous.appendMessage(makeAssistantMessage());
		await previous.flush();
		const previousFile = previous.getSessionFile();
		await previous.close();
		const elsewhere = path.join(root, "elsewhere");
		const moved = path.join(root, "moved-project");
		await fs.mkdir(elsewhere);
		await fs.mkdir(moved);

		const manager = SessionManager.create(elsewhere);
		const { session, transitions } = sessionOver(manager);
		const moves: string[] = [];
		const open = (project: string) =>
			openRpcSession(session, threadDir, undefined, {
				path: project,
				rescope: async dir => {
					moves.push(dir);
					return true;
				},
			});
		try {
			expect(await open(cwd)).toMatchObject({ cancelled: false, resumed: true, sessionFile: previousFile });
			expect(manager.getCwd()).toBe(cwd);

			expect(await open(moved)).toMatchObject({ cancelled: false, sessionFile: previousFile });
			expect(manager.getCwd()).toBe(moved);
			expect(manager.getRecordedCwd()).toBe(moved);

			await open(moved);
			expect(moves).toEqual([cwd, moved]);
			expect(transitions).toEqual(["switch", "switch"]);
		} finally {
			await manager.close();
		}
	});

	it("starts nothing when the project directory cannot be entered", async () => {
		const manager = SessionManager.create(cwd);
		const startCwd = manager.getCwd();
		const startFile = manager.getSessionFile();
		const { session, transitions } = sessionOver(manager);
		try {
			const opened = await openRpcSession(session, threadDir, undefined, {
				path: path.join(root, "missing-project"),
				rescope: async () => false,
			});
			expect(opened.cancelled).toBe(true);
			expect(transitions).toEqual([]);
			expect(manager.getCwd()).toBe(startCwd);
			expect(manager.getSessionFile()).toBe(startFile);
		} finally {
			await manager.close();
		}
	});

	it("rejects when the process has no session persistence", async () => {
		const manager = SessionManager.inMemory(cwd);
		const { session, transitions } = sessionOver(manager);
		await expect(openRpcSession(session, threadDir)).rejects.toThrow(/requires session persistence/);
		expect(transitions).toEqual([]);
	});
});
