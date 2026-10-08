import { type } from "@oh-my-pi/omptype";
import type { AgentTool, AgentToolResult } from "@oh-my-pi/pi-agent-core";
import {
	applyMemoryNote,
	getProjectMemoryPath,
	getUserMemoryPath,
} from "../memory-backend/frozen";
import { cfgMemoryFrozenMaxChars } from "../memory-backend/settings";
import type { ToolSession } from ".";

const memoryNoteSchema = type({
	op: type("'add' | 'replace' | 'remove'").describe(
		"add: append a new named entry (fails if key exists); replace: update existing entry body; remove: delete entry",
	),
	scope: type("'project' | 'user'").describe(
		"project: writes to <cwd>/.omp/MEMORY.md (per-project); user: writes to <agentDir>/USER.md (global profile)",
	),
	key: type("string").describe("short heading label for this entry, e.g. 'style-preferences'"),
	"content?": type("string").describe("entry body (required for add/replace; omit for remove)"),
});

export type MemoryNoteParams = typeof memoryNoteSchema.infer;

/**
 * Writes to frozen per-session memory files (.omp/MEMORY.md or USER.md).
 * Changes take effect on the NEXT session — the current session's system prompt
 * is never altered, keeping the prefix cache stable.
 */
export class MemoryNoteTool implements AgentTool<typeof memoryNoteSchema> {
	readonly name = "memory_note";
	readonly approval = "read" as const;
	readonly label = "Memory Note";
	readonly description =
		"Add, replace, or remove a named entry in the frozen memory files (USER.md or .omp/MEMORY.md). " +
		"Changes take effect on the NEXT session — the current session's system prompt is not altered. " +
		"Each file is capped to memory.frozen.maxChars chars. Use `add` for new facts, `replace` to " +
		"update, `remove` to delete. Scope `user` = global profile; `project` = this project only.";
	readonly parameters = memoryNoteSchema;
	readonly strict = true;
	readonly loadMode = "discoverable" as const;
	readonly summary = "Add/replace/remove entries in frozen session-start memory files";

	constructor(private readonly session: ToolSession) {}

	static createIf(session: ToolSession): MemoryNoteTool | null {
		return cfgMemoryFrozenMaxChars.get(session.settings) > 0 ? new MemoryNoteTool(session) : null;
	}

	async execute(_id: string, params: MemoryNoteParams): Promise<AgentToolResult> {
		const maxChars = cfgMemoryFrozenMaxChars.get(this.session.settings);
		const agentDir = this.session.settings.getAgentDir();
		const cwd = this.session.settings.getCwd();

		const filePath =
			params.scope === "user" ? getUserMemoryPath(agentDir) : getProjectMemoryPath(cwd);

		const result = await applyMemoryNote(filePath, params.op, params.key, params.content, maxChars);

		const text: string =
			result.status === "ok"
				? `Entry "${params.key}" ${params.op === "add" ? "added" : params.op === "replace" ? "updated" : "removed"} in ${params.scope} memory. ` +
				  `File size: ${result.newLength} chars${result.remaining !== undefined ? `, ${result.remaining} remaining` : ""}. ` +
				  `Takes effect next session.`
				: result.status === "budget_exceeded"
					? `Cannot ${params.op} entry "${params.key}": would exceed the ${maxChars}-char budget for ${params.scope} memory (${result.newLength} chars needed). Shorten the content or remove an existing entry first.`
					: result.status === "key_exists"
						? `Entry "${params.key}" already exists in ${params.scope} memory. Use op "replace" to update it.`
						: `Entry "${params.key}" not found in ${params.scope} memory.`;

		return { content: [{ type: "text", text }] };
	}
}
