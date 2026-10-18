/**
 * IPC handlers for omp hook and slash-command authoring (slice E1).
 *
 * Hooks are shell scripts stored in:
 *   User scope:    <dataDir>/omp-agent/hooks/{pre,post}/<tool>.<ext>
 *   Project scope: <projectPath>/.omp/hooks/{pre,post}/<tool>.<ext>
 *
 * Slash commands are markdown files stored in:
 *   User scope:    <dataDir>/omp-agent/commands/<name>.md
 *   Project scope: <projectPath>/.omp/commands/<name>.md
 *
 * User scope uses the Fcode-isolated agent dir (decision G1).
 * All writes are atomic (temp + rename). Only paths inside the allowed omp
 * config directories are written to prevent path-traversal attacks.
 *
 * Handlers registered: ompHooksList, ompHooksCreate, ompHooksEdit,
 *   ompHooksDelete, ompCommandsCreate, ompCommandsEdit, ompCommandsDelete,
 *   ompCommandRead.
 */
import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { ErrorCodes, IPC } from "@pi-desktop/shared";
import type {
  OmpCommandMutateResult,
  OmpCommandReadResult,
  OmpHookEntry,
  OmpHookMutateResult,
  OmpHooksListResult,
} from "@pi-desktop/shared";
import { readOmpSettings, validateOmpSettings, writeOmpSettings } from "../omp-settings-config";
import { ompAgentDir } from "../omp-agent-dir";
import type { IpcRegistrar } from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Allowed hook file extensions (static lookup). */
const HOOK_EXTENSIONS: Record<string, true> = {
  ".sh": true, ".bash": true, ".zsh": true, ".fish": true,
};

/** Valid hook tool name: alphanumeric, dash, underscore, dot, or * (wildcard). No path separators. */
const SAFE_TOOL_NAME_RE = /^[a-zA-Z0-9_.\-*]+$/;

/**
 * Valid slash-command name: alphanumeric, dash, underscore, forward-slash for
 * namespacing (e.g. "foo/bar"). No leading/trailing slash, no "..".
 */
const SAFE_COMMAND_NAME_RE = /^[a-zA-Z0-9_\-]([a-zA-Z0-9_\-/]*[a-zA-Z0-9_\-])?$/;

const MAX_HOOK_CONTENT_BYTES = 512 * 1024; // 512 KiB
const MAX_COMMAND_CONTENT_BYTES = 256 * 1024; // 256 KiB
const MAX_NAME_LENGTH = 200;

// ── Path helpers (3+ call sites each) ────────────────────────────────────────

/** User-scope hooks root. Called from list, create, edit (3+). */
function userHooksRoot(): string {
  return join(ompAgentDir(), "hooks");
}

/** User-scope commands dir. Called from create, edit, delete (3+). */
function userCommandsDir(): string {
  return join(ompAgentDir(), "commands");
}

/** Project-scope hooks root: <projectPath>/.omp/hooks. Called from list, create, edit (3+). */
function projectHooksRoot(projectPath: string): string {
  return join(projectPath, ".omp", "hooks");
}

/** Project-scope commands directory: <projectPath>/.omp/commands. Called from create, edit, delete. */
function projectCommandsDir(projectPath: string): string {
  return join(projectPath, ".omp", "commands");
}

// ── Validation ────────────────────────────────────────────────────────────────

export type HookValidation = { valid: true } | { valid: false; error: string };
export type CommandNameValidation = { valid: true } | { valid: false; error: string };

/**
 * Validate a hook tool name (e.g. "bash", "*", "edit").
 * Exported for unit tests.
 */
export function validateHookToolName(tool: string): HookValidation {
  if (!tool || !tool.trim()) return { valid: false, error: "tool name is required" };
  const t = tool.trim();
  if (t.length > MAX_NAME_LENGTH) return { valid: false, error: "tool name too long (max 200 chars)" };
  if (!SAFE_TOOL_NAME_RE.test(t)) {
    const bad = [...t].find((c) => !SAFE_TOOL_NAME_RE.test(c)) ?? "?";
    return { valid: false, error: `invalid character '${bad}' in tool name` };
  }
  return { valid: true };
}

/**
 * Validate a slash-command name (e.g. "my-cmd", "frappe/sync").
 * Exported for unit tests.
 */
export function validateCommandName(name: string): CommandNameValidation {
  if (!name || !name.trim()) return { valid: false, error: "command name is required" };
  const n = name.trim();
  if (n.length > MAX_NAME_LENGTH) return { valid: false, error: "command name too long (max 200 chars)" };
  if (n.includes("..")) return { valid: false, error: "command name must not contain '..'" };
  if (!SAFE_COMMAND_NAME_RE.test(n)) {
    const bad = [...n].find((c) => !SAFE_COMMAND_NAME_RE.test(c) && c !== "/") ?? "?";
    return { valid: false, error: `invalid character '${bad}' in command name` };
  }
  return { valid: true };
}

/**
 * Assert that `target` resolves inside `allowedRoot`.
 * Throws with an INVALID_ARGUMENT errorCode if it does not.
 * Exported for unit tests.
 */
export function assertInsideRoot(target: string, allowedRoot: string): void {
  const resolved = resolve(target);
  const root = resolve(allowedRoot);
  if (!resolved.startsWith(root + "/") && resolved !== root) {
    throw Object.assign(
      new Error(`path ${JSON.stringify(resolved)} is outside the allowed directory ${JSON.stringify(root)}`),
      { errorCode: ErrorCodes.INVALID_ARGUMENT },
    );
  }
}

function invalid(message: string): never {
  throw Object.assign(new Error(message), { errorCode: ErrorCodes.INVALID_ARGUMENT });
}

// ── Atomic text write ─────────────────────────────────────────────────────────

async function writeTextAtomic(dest: string, content: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  const tmp = `${dest}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, content, { encoding: "utf8", mode: 0o644 });
    await rename(tmp, dest);
  } finally {
    await rm(tmp, { force: true });
  }
}

// ── Hook discovery ────────────────────────────────────────────────────────────

async function scanHooksDir(
  dir: string,
  hookType: "pre" | "post",
  level: "user" | "project",
  // Dynamic set: built from runtime settings.disabledExtensions array at call time.
  disabled: Set<string>,
): Promise<OmpHookEntry[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const result: OmpHookEntry[] = [];
  for (const entry of entries) {
    const ext = extname(entry);
    if (!HOOK_EXTENSIONS[ext]) continue;
    const filePath = join(dir, entry);
    let content = "";
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const tool = basename(entry, ext);
    // Extension id as produced by omp's hookCapability.toExtensionId
    const extensionId = `hook:${hookType}:${tool}:${entry}`;
    result.push({ name: entry, path: filePath, type: hookType, tool, level, content, enabled: !disabled.has(extensionId) });
  }
  return result;
}

// ── IPC dependencies ──────────────────────────────────────────────────────────

export type HooksCommandsIpcDependencies = {
  registrar: IpcRegistrar;
  dataDir: string;
  restartSidecar: () => Promise<void>;
};

// ── Registration ──────────────────────────────────────────────────────────────

export function registerHooksCommandsIpc({
  registrar,
  dataDir,
  restartSidecar,
}: HooksCommandsIpcDependencies): void {
  const { handle } = registrar;

  // ── ompHooksList ────────────────────────────────────────────────────────────
  handle(IPC.invoke.ompHooksList, async (input: { projectPath?: unknown } = {}): Promise<OmpHooksListResult> => {
    const settings = readOmpSettings(dataDir);
    // Dynamic: comes from runtime settings; used for O(1) membership across all hook entries.
    const disabled = new Set<string>(settings.disabledExtensions ?? []);

    const userRoot = userHooksRoot();
    const scanTasks: Promise<OmpHookEntry[]>[] = [
      scanHooksDir(join(userRoot, "pre"), "pre", "user", disabled),
      scanHooksDir(join(userRoot, "post"), "post", "user", disabled),
    ];

    const projectPath = typeof input?.projectPath === "string" ? input.projectPath.trim() : null;
    if (projectPath) {
      const projRoot = projectHooksRoot(projectPath);
      scanTasks.push(
        scanHooksDir(join(projRoot, "pre"), "pre", "project", disabled),
        scanHooksDir(join(projRoot, "post"), "post", "project", disabled),
      );
    }

    return { hooks: (await Promise.all(scanTasks)).flat() };
  });

  // ── ompHooksCreate ──────────────────────────────────────────────────────────
  handle(IPC.invoke.ompHooksCreate, async (input: {
    tool?: unknown; hookType?: unknown; ext?: unknown;
    content?: unknown; scope?: unknown; projectPath?: unknown;
  } = {}): Promise<OmpHookMutateResult> => {
    const tool = typeof input?.tool === "string" ? input.tool.trim() : "";
    const hookType = input?.hookType === "pre" || input?.hookType === "post" ? input.hookType : null;
    const ext = typeof input?.ext === "string" ? input.ext.trim() : ".sh";
    const content = typeof input?.content === "string" ? input.content : "";
    const scope = input?.scope === "project" ? "project" : "user";
    const projectPath = typeof input?.projectPath === "string" ? input.projectPath.trim() : null;

    const toolCheck = validateHookToolName(tool);
    if (!toolCheck.valid) invalid(toolCheck.error);
    if (!hookType) invalid("hookType must be 'pre' or 'post'");
    if (!HOOK_EXTENSIONS[ext]) invalid("ext must be one of .sh, .bash, .zsh, .fish");
    if (Buffer.byteLength(content, "utf8") > MAX_HOOK_CONTENT_BYTES) invalid("hook content exceeds 512 KiB limit");

    const root = scope === "project"
      ? (projectPath ? projectHooksRoot(projectPath) : invalid("projectPath is required for project scope"))
      : userHooksRoot();

    const dest = join(root, hookType, `${tool}${ext}`);
    assertInsideRoot(dest, root);

    try {
      await writeTextAtomic(dest, content);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // ── ompHooksEdit ────────────────────────────────────────────────────────────
  handle(IPC.invoke.ompHooksEdit, async (input: {
    path?: unknown; content?: unknown; scope?: unknown; projectPath?: unknown;
  } = {}): Promise<OmpHookMutateResult> => {
    const filePath = typeof input?.path === "string" ? input.path.trim() : "";
    const content = typeof input?.content === "string" ? input.content : "";
    const scope = input?.scope === "project" ? "project" : "user";
    const projectPath = typeof input?.projectPath === "string" ? input.projectPath.trim() : null;

    if (!filePath) invalid("path is required");
    if (Buffer.byteLength(content, "utf8") > MAX_HOOK_CONTENT_BYTES) invalid("hook content exceeds 512 KiB limit");

    const root = scope === "project"
      ? (projectPath ? projectHooksRoot(projectPath) : invalid("projectPath is required for project scope"))
      : userHooksRoot();

    assertInsideRoot(filePath, root);

    try {
      await access(filePath, fsConstants.F_OK);
    } catch {
      return { ok: false, error: `hook file not found: ${filePath}` };
    }

    try {
      await writeTextAtomic(filePath, content);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // ── ompHooksDelete ──────────────────────────────────────────────────────────
  handle(IPC.invoke.ompHooksDelete, async (input: {
    path?: unknown; scope?: unknown; projectPath?: unknown; extensionId?: unknown;
  } = {}): Promise<OmpHookMutateResult> => {
    const filePath = typeof input?.path === "string" ? input.path.trim() : "";
    const scope = input?.scope === "project" ? "project" : "user";
    const projectPath = typeof input?.projectPath === "string" ? input.projectPath.trim() : null;

    if (!filePath) invalid("path is required");

    const root = scope === "project"
      ? (projectPath ? projectHooksRoot(projectPath) : invalid("projectPath is required for project scope"))
      : userHooksRoot();

    assertInsideRoot(filePath, root);

    try {
      await unlink(filePath);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    // Clean up any disabled-extensions entry for this hook (dynamic: runtime mutation).
    const extId = typeof input?.extensionId === "string" ? input.extensionId : null;
    if (extId) {
      const current = readOmpSettings(dataDir);
      // Dynamic set: built from runtime array, with deletion mutation.
      const disabledMut = new Set<string>(current.disabledExtensions ?? []);
      if (disabledMut.has(extId)) {
        disabledMut.delete(extId);
        const patch = validateOmpSettings({ disabledExtensions: [...disabledMut] });
        writeOmpSettings(dataDir, { ...current, ...patch });
      }
    }

    return { ok: true };
  });

  // ── ompCommandsCreate ───────────────────────────────────────────────────────
  handle(IPC.invoke.ompCommandsCreate, async (input: {
    name?: unknown; content?: unknown; scope?: unknown; projectPath?: unknown;
  } = {}): Promise<OmpCommandMutateResult> => {
    const name = typeof input?.name === "string" ? input.name.trim() : "";
    const content = typeof input?.content === "string" ? input.content : "";
    const scope = input?.scope === "project" ? "project" : "user";
    const projectPath = typeof input?.projectPath === "string" ? input.projectPath.trim() : null;

    const nameCheck = validateCommandName(name);
    if (!nameCheck.valid) invalid(nameCheck.error);
    if (Buffer.byteLength(content, "utf8") > MAX_COMMAND_CONTENT_BYTES) invalid("command content exceeds 256 KiB limit");

    const dir = scope === "project"
      ? (projectPath ? projectCommandsDir(projectPath) : invalid("projectPath is required for project scope"))
      : userCommandsDir();

    const dest = join(dir, `${name}.md`);
    assertInsideRoot(dest, dir);

    try {
      await writeTextAtomic(dest, content);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // ── ompCommandsEdit ─────────────────────────────────────────────────────────
  handle(IPC.invoke.ompCommandsEdit, async (input: {
    name?: unknown; content?: unknown; scope?: unknown; projectPath?: unknown;
  } = {}): Promise<OmpCommandMutateResult> => {
    const name = typeof input?.name === "string" ? input.name.trim() : "";
    const content = typeof input?.content === "string" ? input.content : "";
    const scope = input?.scope === "project" ? "project" : "user";
    const projectPath = typeof input?.projectPath === "string" ? input.projectPath.trim() : null;

    const nameCheck = validateCommandName(name);
    if (!nameCheck.valid) invalid(nameCheck.error);
    if (Buffer.byteLength(content, "utf8") > MAX_COMMAND_CONTENT_BYTES) invalid("command content exceeds 256 KiB limit");

    const dir = scope === "project"
      ? (projectPath ? projectCommandsDir(projectPath) : invalid("projectPath is required for project scope"))
      : userCommandsDir();

    const filePath = join(dir, `${name}.md`);
    assertInsideRoot(filePath, dir);

    try {
      await access(filePath, fsConstants.F_OK);
    } catch {
      return { ok: false, error: `command not found: ${name}` };
    }

    try {
      await writeTextAtomic(filePath, content);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // ── ompCommandsDelete ───────────────────────────────────────────────────────
  handle(IPC.invoke.ompCommandsDelete, async (input: {
    name?: unknown; scope?: unknown; projectPath?: unknown;
  } = {}): Promise<OmpCommandMutateResult> => {
    const name = typeof input?.name === "string" ? input.name.trim() : "";
    const scope = input?.scope === "project" ? "project" : "user";
    const projectPath = typeof input?.projectPath === "string" ? input.projectPath.trim() : null;

    const nameCheck = validateCommandName(name);
    if (!nameCheck.valid) invalid(nameCheck.error);

    const dir = scope === "project"
      ? (projectPath ? projectCommandsDir(projectPath) : invalid("projectPath is required for project scope"))
      : userCommandsDir();

    const filePath = join(dir, `${name}.md`);
    assertInsideRoot(filePath, dir);

    try {
      await unlink(filePath);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // ── ompCommandRead ──────────────────────────────────────────────────────────
  // Returns the raw markdown content of a user/project slash-command file.
  // Used by CommandsSection to pre-fill the edit form with the actual file content.
  handle(IPC.invoke.ompCommandRead, async (input: {
    name?: unknown; scope?: unknown; projectPath?: unknown;
  } = {}): Promise<OmpCommandReadResult> => {
    const name = typeof input?.name === "string" ? input.name.trim() : "";
    const scope = input?.scope === "project" ? "project" : "user";
    const projectPath = typeof input?.projectPath === "string" ? input.projectPath.trim() : null;

    const nameCheck = validateCommandName(name);
    if (!nameCheck.valid) invalid(nameCheck.error);

    const dir = scope === "project"
      ? (projectPath ? projectCommandsDir(projectPath) : invalid("projectPath is required for project scope"))
      : userCommandsDir();

    const filePath = join(dir, `${name}.md`);
    assertInsideRoot(filePath, dir);

    const content = await readFile(filePath, "utf8").catch(() => "");
    return { content };
  });
}
