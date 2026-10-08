/**
 * Frozen per-session memory files.
 *
 * Two files are loaded ONCE at session start and injected as a stable system-prompt
 * block (prefix-cache-friendly — never changes mid-session):
 *   - <agentDir>/USER.md  — global user profile, shared across all projects
 *   - <cwd>/.omp/MEMORY.md (nearest ancestor) — per-project notes
 *
 * Writes via `memory_note` take effect on the NEXT session only.
 * Each file is capped to `memory.frozen.maxChars` chars. Both count against
 * the cross-backend `memory.injectMaxChars` budget.
 *
 * Entry format: `## key` H2 headings delimit named entries.
 *   ## style-preferences
 *   Prefer TypeScript strict mode. Compact code.
 *
 *   ## project-overview
 *   A Frappe/ERPNext project.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Canonical paths (exported stable domain contracts)
// ---------------------------------------------------------------------------

/** Path to the global user-profile file. */
export function getUserMemoryPath(agentDir: string): string {
	return path.join(agentDir, "USER.md");
}

/** Path to the per-project notes file for a given working directory. */
export function getProjectMemoryPath(cwd: string): string {
	return path.join(cwd, ".omp", "MEMORY.md");
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

/** Read a file, returning "" if it does not exist. Used in 3+ sites. */
async function readFileSafe(filePath: string): Promise<string> {
	try {
		return await fs.readFile(filePath, "utf8");
	} catch {
		return "";
	}
}

/** Walk up from `cwd` to find the nearest `.omp/MEMORY.md`. Returns null if none. */
async function findProjectMemoryFile(cwd: string): Promise<string | null> {
	const home = process.env.HOME ?? "/";
	let dir = cwd;
	while (true) {
		const candidate = getProjectMemoryPath(dir);
		try {
			await fs.access(candidate, fs.constants.R_OK);
			return candidate;
		} catch {
			// not found at this level
		}
		const parent = path.dirname(dir);
		if (parent === dir || dir === home) break;
		dir = parent;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Load: called once at session start
// ---------------------------------------------------------------------------

/**
 * Load both frozen memory files and return a formatted block for the system prompt.
 * Returns undefined when both files are empty/missing or maxChars === 0 (disabled).
 */
export async function loadFrozenMemory(
	agentDir: string,
	cwd: string,
	maxChars: number,
): Promise<string | undefined> {
	if (maxChars === 0) return undefined;

	const projectFilePath = await findProjectMemoryFile(cwd);
	const [projectRaw, userRaw] = await Promise.all([
		projectFilePath ? readFileSafe(projectFilePath) : Promise.resolve(""),
		readFileSafe(getUserMemoryPath(agentDir)),
	]);

	const userContent = userRaw.trim();
	const projectContent = projectRaw.trim();

	const parts: string[] = [];
	if (userContent) parts.push(`<memories source="user-profile">\n${userContent}\n</memories>`);
	if (projectContent) parts.push(`<memories source="project">\n${projectContent}\n</memories>`);

	if (parts.length === 0) return undefined;

	const combined = parts.join("\n\n");
	return maxChars > 0 && combined.length > maxChars ? combined.slice(0, maxChars) : combined;
}

// ---------------------------------------------------------------------------
// Entry editing (used by memory_note tool)
// ---------------------------------------------------------------------------

/**
 * Parse `## key\n\nbody` sections from file content.
 * Map preserves insertion order (needed for round-trip serialization).
 */
export function parseEntries(content: string): Map<string, string> {
	const entries = new Map<string, string>();
	const sections = content.split(/^## /m);
	for (const section of sections) {
		if (!section.trim()) continue;
		const newline = section.indexOf("\n");
		if (newline === -1) {
			entries.set(section.trim(), "");
		} else {
			const key = section.slice(0, newline).trim();
			const body = section.slice(newline).trim();
			if (key) entries.set(key, body);
		}
	}
	return entries;
}

/** Serialize entries back to file content. */
export function serializeEntries(entries: Map<string, string>): string {
	const parts: string[] = [];
	for (const [key, body] of entries) {
		parts.push(body ? `## ${key}\n\n${body}` : `## ${key}`);
	}
	return parts.join("\n\n");
}

export type MemoryNoteOp = "add" | "replace" | "remove";
export type MemoryNoteScope = "project" | "user";

export interface MemoryNoteResult {
	status: "ok" | "budget_exceeded" | "key_not_found" | "key_exists";
	/** New file length after the operation. */
	newLength?: number;
	/** Remaining chars in budget. */
	remaining?: number;
}

/**
 * Apply one `memory_note` operation to a file.
 * Reads, mutates in-memory, validates the char budget, and writes.
 *
 * @param filePath Absolute path to the file (may not exist yet for "add").
 * @param op       Operation.
 * @param key      Entry key (## heading text).
 * @param content  New body text (required for add/replace).
 * @param maxChars Per-file char budget (0 = unlimited).
 */
export async function applyMemoryNote(
	filePath: string,
	op: MemoryNoteOp,
	key: string,
	content: string | undefined,
	maxChars: number,
): Promise<MemoryNoteResult> {
	const raw = await readFileSafe(filePath);
	const entries = parseEntries(raw);

	if (op === "add") {
		if (entries.has(key)) return { status: "key_exists" };
		entries.set(key, content ?? "");
	} else if (op === "replace") {
		if (!entries.has(key)) return { status: "key_not_found" };
		entries.set(key, content ?? "");
	} else {
		// remove
		if (!entries.has(key)) return { status: "key_not_found" };
		entries.delete(key);
	}

	const newContent = serializeEntries(entries);
	if (maxChars > 0 && newContent.length > maxChars) {
		return { status: "budget_exceeded", newLength: newContent.length, remaining: 0 };
	}

	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, newContent, "utf8");

	return {
		status: "ok",
		newLength: newContent.length,
		remaining: maxChars > 0 ? maxChars - newContent.length : undefined,
	};
}
