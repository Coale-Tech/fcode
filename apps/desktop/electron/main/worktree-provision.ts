/**
 * Worktree provisioning — copies and symlinks gitignored state from the main
 * checkout into a freshly-created git worktree, reading `.worktreeinclude`
 * (copy) and `.worktreeshare` (symlink) manifests at the repo root.
 *
 * Both manifests: blank lines and `#` comments ignored; literal relative paths
 * only (glob chars *, ?, !, {, } and absolute/traversal paths are skipped with
 * a reason). A path that is missing, not gitignored, or whose destination
 * already exists is skipped — provisioning is best-effort and never throws.
 */
import type { OmpWorktreeProvisionEntry } from "@pi-desktop/shared";
import { cp, mkdir, readFile, stat, symlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, isAbsolute, join } from "node:path";

const execFileP = promisify(execFile);

/** Parse one manifest file. Returns [] when the file is absent. */
async function readWorktreeManifest(repoPath: string, name: string): Promise<string[]> {
  try {
    const raw = await readFile(join(repoPath, name), "utf8");
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
  } catch {
    return [];
  }
}

/**
 * Read a linked worktree's `.git` file. `gitdir` is `<repo>/.git/worktrees/<name>`;
 * `parentRepo` (`<repo>`) is absent when the gitdir has another layout. Null when
 * `dir` is not a linked worktree.
 */
export async function readWorktreeLink(dir: string): Promise<{ gitdir: string; parentRepo?: string } | null> {
  const raw = await readFile(join(dir, ".git"), "utf8").catch(() => "");
  const gitdir = /gitdir:\s*(.+)/.exec(raw.trim())?.[1].trim();
  if (!gitdir) return null;
  const parentRepo = gitdir.replace(/\/\.git\/worktrees\/.+$/, "");
  return parentRepo === gitdir ? { gitdir } : { gitdir, parentRepo };
}

/**
 * Copy/symlink gitignored state from `repoPath` into `wtPath`. Never throws.
 * Returns [] when neither `.worktreeinclude` nor `.worktreeshare` exists.
 *
 * - `.worktreeinclude` entries are **copied** (each worktree can diverge).
 * - `.worktreeshare` entries are **symlinked** (one shared copy).
 */
export async function provisionWorktree(
  repoPath: string,
  wtPath: string,
  log?: (message: string) => void,
): Promise<OmpWorktreeProvisionEntry[]> {
  const [includeLines, shareLines] = await Promise.all([
    readWorktreeManifest(repoPath, ".worktreeinclude"),
    readWorktreeManifest(repoPath, ".worktreeshare"),
  ]);

  if (includeLines.length === 0 && shareLines.length === 0) return [];

  const candidates: Array<{ path: string; mode: "copy" | "link" }> = [
    ...includeLines.map((p) => ({ path: p, mode: "copy" as const })),
    ...shareLines.map((p) => ({ path: p, mode: "link" as const })),
  ];

  const results: OmpWorktreeProvisionEntry[] = [];

  for (const { path: p, mode } of candidates) {
    // Reject absolute paths and path traversal (`..` as any segment)
    if (isAbsolute(p) || p.split(/[\\/]/).some((part) => part === "..")) {
      results.push({ path: p, mode, status: "skipped", reason: "path escapes repo root" });
      log?.(`provision: skipped "${p}" (path escapes repo root)`);
      continue;
    }
    // Reject glob patterns — only literal paths are supported
    if (/[*?!{}[\]]/.test(p)) {
      results.push({ path: p, mode, status: "skipped", reason: "glob patterns not supported" });
      log?.(`provision: skipped "${p}" (glob pattern)`);
      continue;
    }

    // Source must exist in the main checkout
    const src = join(repoPath, p);
    try {
      await stat(src);
    } catch {
      results.push({ path: p, mode, status: "skipped", reason: "missing" });
      log?.(`provision: skipped "${p}" (missing source)`);
      continue;
    }

    // Must be gitignored — exit 0 = ignored, non-zero = not ignored / error
    let ignored = false;
    try {
      await execFileP("git", ["-C", repoPath, "check-ignore", "-q", p], { timeout: 5_000 });
      ignored = true;
    } catch {
      ignored = false;
    }
    if (!ignored) {
      results.push({ path: p, mode, status: "skipped", reason: "not gitignored" });
      log?.(`provision: skipped "${p}" (not gitignored)`);
      continue;
    }

    // Destination must not already exist
    const dest = join(wtPath, p);
    try {
      await stat(dest);
      results.push({ path: p, mode, status: "skipped", reason: "exists" });
      log?.(`provision: skipped "${p}" (destination already exists)`);
      continue;
    } catch { /* dest missing — proceed */ }

    // Ensure parent directory exists
    try { await mkdir(dirname(dest), { recursive: true }); } catch { /* ignore */ }

    // Perform copy or symlink
    try {
      if (mode === "link") {
        // ponytail: symlink only; APFS clone if copy-on-write ever matters.
        await symlink(src, dest);
      } else {
        await cp(src, dest, { recursive: true, force: false, errorOnExist: false });
      }
      results.push({ path: p, mode, status: "done" });
      log?.(`provision: ${mode === "link" ? "linked" : "copied"} "${p}"`);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      results.push({ path: p, mode, status: "skipped", reason });
      log?.(`provision: failed "${p}": ${reason}`);
    }
  }

  return results;
}
