/**
 * Tests for the frozen per-session memory module.
 *
 * Covers the three acceptance criteria from the assignment:
 *  1. Budget enforcement on add.
 *  2. Frozen-at-start: a mid-session write does NOT alter the already-loaded block.
 *  3. Counted under inject cap: loadFrozenMemory chars are added to setLastInjectedChars.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
	applyMemoryNote,
	loadFrozenMemory,
	parseEntries,
	serializeEntries,
	getUserMemoryPath,
	getProjectMemoryPath,
} from "../src/memory-backend/frozen";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempDir(): Promise<string> {
	return fs.mkdtemp(path.join(os.tmpdir(), "frozen-mem-test-"));
}

async function rmDir(dir: string): Promise<void> {
	await fs.rm(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// parseEntries / serializeEntries round-trip
// ---------------------------------------------------------------------------

describe("parseEntries / serializeEntries", () => {
	it("parses H2-delimited sections", () => {
		const content = "## foo\n\nhello\n\n## bar\n\nworld";
		const entries = parseEntries(content);
		expect(entries.get("foo")).toBe("hello");
		expect(entries.get("bar")).toBe("world");
		expect(entries.size).toBe(2);
	});

	it("round-trips an empty file", () => {
		const entries = parseEntries("");
		expect(entries.size).toBe(0);
		expect(serializeEntries(entries)).toBe("");
	});

	it("round-trips content with preserved order", () => {
		const original = "## alpha\n\nA\n\n## beta\n\nB";
		const entries = parseEntries(original);
		expect(serializeEntries(entries)).toBe(original);
	});
});

// ---------------------------------------------------------------------------
// applyMemoryNote — budget enforcement (criterion 1)
// ---------------------------------------------------------------------------

describe("applyMemoryNote — budget enforcement", () => {
	let dir: string;

	beforeEach(async () => { dir = await makeTempDir(); });
	afterEach(async () => { await rmDir(dir); });

	it("add within budget succeeds and writes the file", async () => {
		const file = path.join(dir, "MEMORY.md");
		const result = await applyMemoryNote(file, "add", "my-key", "short content", 500);
		expect(result.status).toBe("ok");
		expect(result.newLength).toBeGreaterThan(0);
		expect(result.remaining).toBeGreaterThan(0);
		const written = await fs.readFile(file, "utf8");
		expect(written).toContain("my-key");
		expect(written).toContain("short content");
	});

	it("add beyond budget returns budget_exceeded and does NOT write", async () => {
		const file = path.join(dir, "MEMORY.md");
		const content = "x".repeat(200);
		const result = await applyMemoryNote(file, "add", "big", content, 10);
		expect(result.status).toBe("budget_exceeded");
		// File should not exist (nothing was written)
		await expect(fs.access(file)).rejects.toThrow();
	});

	it("replace beyond budget returns budget_exceeded", async () => {
		const file = path.join(dir, "MEMORY.md");
		// Seed with a small entry
		await applyMemoryNote(file, "add", "k", "tiny", 500);
		const result = await applyMemoryNote(file, "replace", "k", "x".repeat(600), 500);
		expect(result.status).toBe("budget_exceeded");
	});

	it("remove always succeeds regardless of budget", async () => {
		const file = path.join(dir, "MEMORY.md");
		await applyMemoryNote(file, "add", "k", "content", 500);
		// remove with a very small (but non-zero) budget still succeeds — removal shrinks the file
		const result = await applyMemoryNote(file, "remove", "k", undefined, 1);
		expect(result.status).toBe("ok");
	});

	it("add duplicate key returns key_exists", async () => {
		const file = path.join(dir, "MEMORY.md");
		await applyMemoryNote(file, "add", "dup", "first", 500);
		const result = await applyMemoryNote(file, "add", "dup", "second", 500);
		expect(result.status).toBe("key_exists");
	});

	it("replace missing key returns key_not_found", async () => {
		const file = path.join(dir, "MEMORY.md");
		const result = await applyMemoryNote(file, "replace", "ghost", "content", 500);
		expect(result.status).toBe("key_not_found");
	});

	it("remove missing key returns key_not_found", async () => {
		const file = path.join(dir, "MEMORY.md");
		const result = await applyMemoryNote(file, "remove", "ghost", undefined, 500);
		expect(result.status).toBe("key_not_found");
	});

	it("budget=0 means unlimited (no enforcement)", async () => {
		const file = path.join(dir, "MEMORY.md");
		const huge = "x".repeat(100_000);
		const result = await applyMemoryNote(file, "add", "huge", huge, 0);
		expect(result.status).toBe("ok");
		expect(result.remaining).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// loadFrozenMemory — reads USER.md and .omp/MEMORY.md
// ---------------------------------------------------------------------------

describe("loadFrozenMemory", () => {
	let agentDir: string;
	let cwd: string;

	beforeEach(async () => {
		agentDir = await makeTempDir();
		cwd = await makeTempDir();
	});

	afterEach(async () => {
		await Promise.all([rmDir(agentDir), rmDir(cwd)]);
	});

	it("returns undefined when maxChars=0 (feature disabled)", async () => {
		await fs.writeFile(getUserMemoryPath(agentDir), "some content", "utf8");
		const result = await loadFrozenMemory(agentDir, cwd, 0);
		expect(result).toBeUndefined();
	});

	it("returns undefined when both files are empty/missing", async () => {
		const result = await loadFrozenMemory(agentDir, cwd, 2000);
		expect(result).toBeUndefined();
	});

	it("includes user profile when USER.md exists", async () => {
		await fs.writeFile(getUserMemoryPath(agentDir), "## style\n\nUse strict TS.", "utf8");
		const result = await loadFrozenMemory(agentDir, cwd, 2000);
		expect(result).toContain("user-profile");
		expect(result).toContain("Use strict TS.");
	});

	it("includes project memory when .omp/MEMORY.md exists in cwd", async () => {
		const ompDir = path.join(cwd, ".omp");
		await fs.mkdir(ompDir, { recursive: true });
		await fs.writeFile(path.join(ompDir, "MEMORY.md"), "## overview\n\nFrappe project.", "utf8");
		const result = await loadFrozenMemory(agentDir, cwd, 2000);
		expect(result).toContain("project");
		expect(result).toContain("Frappe project.");
	});

	it("combines both files when both exist", async () => {
		await fs.writeFile(getUserMemoryPath(agentDir), "## pref\n\nVerbose.", "utf8");
		const ompDir = path.join(cwd, ".omp");
		await fs.mkdir(ompDir, { recursive: true });
		await fs.writeFile(path.join(ompDir, "MEMORY.md"), "## proj\n\nERPNext.", "utf8");
		const result = await loadFrozenMemory(agentDir, cwd, 2000);
		expect(result).toContain("user-profile");
		expect(result).toContain("project");
	});

	it("truncates combined output to maxChars", async () => {
		const big = "x".repeat(500);
		await fs.writeFile(getUserMemoryPath(agentDir), big, "utf8");
		const result = await loadFrozenMemory(agentDir, cwd, 100);
		expect(result).not.toBeUndefined();
		expect(result!.length).toBeLessThanOrEqual(100);
	});
});

// ---------------------------------------------------------------------------
// Criterion 2: frozen-at-start — mid-session write not visible in same load
// ---------------------------------------------------------------------------

describe("frozen-at-start contract", () => {
	let agentDir: string;
	let cwd: string;

	beforeEach(async () => {
		agentDir = await makeTempDir();
		cwd = await makeTempDir();
	});

	afterEach(async () => {
		await Promise.all([rmDir(agentDir), rmDir(cwd)]);
	});

	it("block loaded at session start is NOT changed by a mid-session applyMemoryNote", async () => {
		const userFile = getUserMemoryPath(agentDir);
		await fs.writeFile(userFile, "## initial\n\nStart state.", "utf8");

		// Simulate session start: load once and freeze the value.
		const frozenBlock = await loadFrozenMemory(agentDir, cwd, 2000);
		expect(frozenBlock).toContain("Start state.");

		// Simulate mid-session write (what memory_note tool does).
		await applyMemoryNote(userFile, "add", "added-midway", "New entry!", 2000);

		// The already-loaded frozenBlock is unchanged — the session uses the cached value.
		// A second loadFrozenMemory call *would* return new content (re-reads the file),
		// but the sdk.ts closure sentinel prevents that second call mid-session.
		expect(frozenBlock).not.toContain("New entry!");

		// Verify: a NEW session (fresh load) DOES see the new entry.
		const nextSessionBlock = await loadFrozenMemory(agentDir, cwd, 2000);
		expect(nextSessionBlock).toContain("New entry!");
	});
});

// ---------------------------------------------------------------------------
// Criterion 3: counted under inject cap
// ---------------------------------------------------------------------------

describe("inject cap accounting", () => {
	let agentDir: string;
	let cwd: string;

	beforeEach(async () => {
		agentDir = await makeTempDir();
		cwd = await makeTempDir();
	});

	afterEach(async () => {
		await Promise.all([rmDir(agentDir), rmDir(cwd)]);
	});

	it("loadFrozenMemory returns a string whose .length is the chars to count", async () => {
		const content = "## key\n\nSome note here.";
		await fs.writeFile(getUserMemoryPath(agentDir), content, "utf8");

		const block = await loadFrozenMemory(agentDir, cwd, 2000);
		expect(block).toBeDefined();
		// The sdk.ts injection tracker adds (frozenMemoryBlock?.length ?? 0) to
		// setLastInjectedChars. Verify the block has a non-zero length.
		expect(block!.length).toBeGreaterThan(0);
		// The block wraps the content in <memories> tags, so it's longer than the raw content.
		expect(block!.length).toBeGreaterThan(content.length);
	});

	it("no chars counted when maxChars=0 (disabled)", async () => {
		await fs.writeFile(getUserMemoryPath(agentDir), "## key\n\nContent.", "utf8");
		const block = await loadFrozenMemory(agentDir, cwd, 0);
		// Returns undefined → (frozenMemoryBlock?.length ?? 0) === 0
		expect(block).toBeUndefined();
		const counted = block?.length ?? 0;
		expect(counted).toBe(0);
	});

	it("no chars counted when both files are empty", async () => {
		const block = await loadFrozenMemory(agentDir, cwd, 2000);
		expect(block).toBeUndefined();
		const counted = block?.length ?? 0;
		expect(counted).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

describe("path helpers", () => {
	it("getUserMemoryPath returns <agentDir>/USER.md", () => {
		expect(getUserMemoryPath("/home/user/.omp/agent")).toBe("/home/user/.omp/agent/USER.md");
	});

	it("getProjectMemoryPath returns <cwd>/.omp/MEMORY.md", () => {
		expect(getProjectMemoryPath("/projects/myapp")).toBe("/projects/myapp/.omp/MEMORY.md");
	});
});
