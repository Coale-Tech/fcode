/**
 * Tests for I.6: /learn slash command.
 *
 * Verifies that:
 * - The command produces a prompt containing the user's free text.
 * - The prompt includes the correct authoring structure (skill payload, omp tools).
 * - The command returns a "disabled" message when autolearn.enabled=false.
 */
import { describe, expect, it } from "bun:test";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import type { ParsedSlashCommand, SlashCommandRuntime } from "@oh-my-pi/pi-coding-agent/slash-commands/types";
import { BUILTIN_SLASH_COMMANDS_INTERNAL } from "@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry";

function findLearnCommand() {
	const cmd = BUILTIN_SLASH_COMMANDS_INTERNAL.find(c => c.name === "learn");
	if (!cmd) throw new Error("/learn command not found in registry");
	return cmd;
}

function makeRuntime(autolearnEnabled: boolean): SlashCommandRuntime & { messages: string[] } {
	const settings = Settings.isolated({ "autolearn.enabled": autolearnEnabled });
	const messages: string[] = [];
	return {
		session: {} as SlashCommandRuntime["session"],
		sessionManager: {} as SlashCommandRuntime["sessionManager"],
		settings,
		cwd: "/tmp",
		output: async (text: string) => {
			messages.push(text);
		},
		refreshCommands: () => {},
		reloadPlugins: async () => {},
		messages,
	};
}

function makeCmd(args: string): ParsedSlashCommand {
	return { name: "learn", args, text: `/learn ${args}`.trimEnd() };
}

function assertPromptResult(result: unknown): asserts result is { prompt: string } {
	if (!result || typeof result !== "object" || !("prompt" in result) || typeof (result as Record<string, unknown>).prompt !== "string") {
		throw new Error(`Expected { prompt: string }, got: ${JSON.stringify(result)}`);
	}
}

describe("/learn slash command", () => {
	it("is registered in the builtin command registry", () => {
		expect(() => findLearnCommand()).not.toThrow();
	});

	it("returns consumed + message when autolearn.enabled=false", async () => {
		const cmd = findLearnCommand();
		const runtime = makeRuntime(false);
		const result = await (cmd.handle as (c: ParsedSlashCommand, r: SlashCommandRuntime) => unknown)(
			makeCmd("some skill"),
			runtime,
		);
		// Should be consumed (not a prompt)
		if (result && typeof result === "object" && "prompt" in result) {
			throw new Error("Expected consumed, got prompt");
		}
		expect(runtime.messages.length).toBeGreaterThan(0);
		expect(runtime.messages[0]).toContain("autolearn.enabled");
	});

	it("returns a prompt with the user's free text when autolearn.enabled=true", async () => {
		const cmd = findLearnCommand();
		const runtime = makeRuntime(true);
		const result = await (cmd.handle as (c: ParsedSlashCommand, r: SlashCommandRuntime) => unknown)(
			makeCmd("the git-worktree workflow we just used"),
			runtime,
		);
		assertPromptResult(result);
		expect(result.prompt).toContain("git-worktree workflow we just used");
	});

	it("prompt references the learn tool with skill payload", async () => {
		const cmd = findLearnCommand();
		const runtime = makeRuntime(true);
		const result = await (cmd.handle as (c: ParsedSlashCommand, r: SlashCommandRuntime) => unknown)(
			makeCmd("test workflow"),
			runtime,
		);
		assertPromptResult(result);
		expect(result.prompt).toContain("`learn`");
		expect(result.prompt).toContain("skill.name");
		expect(result.prompt).toContain("skill.description");
		expect(result.prompt).toContain("skill.body");
	});

	it("prompt uses omp-native tools (read/grep/glob/bash), not Hermes tools", async () => {
		const cmd = findLearnCommand();
		const runtime = makeRuntime(true);
		const result = await (cmd.handle as (c: ParsedSlashCommand, r: SlashCommandRuntime) => unknown)(
			makeCmd("some workflow"),
			runtime,
		);
		assertPromptResult(result);
		expect(result.prompt).toMatch(/`read`|`grep`|`glob`|`bash`/);
		expect(result.prompt).not.toContain("skill_manage");
		expect(result.prompt).not.toContain("read_file");
		expect(result.prompt).not.toContain("search_files");
	});

	it("uses default request text when no args provided", async () => {
		const cmd = findLearnCommand();
		const runtime = makeRuntime(true);
		const result = await (cmd.handle as (c: ParsedSlashCommand, r: SlashCommandRuntime) => unknown)(
			makeCmd(""),
			runtime,
		);
		assertPromptResult(result);
		expect(result.prompt).toContain("workflow we just went through");
	});

	it("requires description ≤60 characters (standard is in the prompt)", async () => {
		const cmd = findLearnCommand();
		const runtime = makeRuntime(true);
		const result = await (cmd.handle as (c: ParsedSlashCommand, r: SlashCommandRuntime) => unknown)(
			makeCmd("some thing"),
			runtime,
		);
		assertPromptResult(result);
		expect(result.prompt).toContain("60 characters");
	});
});
