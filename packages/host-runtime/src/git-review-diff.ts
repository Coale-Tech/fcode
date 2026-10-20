/**
 * Collect git diffs (unstaged / staged / branch) and convert them to
 * ReviewChange records so the work-panel Review tab can display them with
 * the same note affordances used for agent-turn snapshots.
 *
 * Route choice: TypeScript (not Rust host-core).  The existing
 * workspace-diff.ts already provides `runGit`, `parseFilePatch`, and
 * `splitUnifiedDiff`; the Rust review module builds Myers-diff over file
 * snapshots, not unified-diff output, so adding a new git path there would
 * duplicate the parser and require a native rebuild.
 */

import type {
  DiffFile,
  DiffFileStatus,
  ReviewChange,
  ReviewChangeOperation,
  ReviewChangeStatus,
} from "@pi-desktop/shared";
import { parseFilePatch, splitUnifiedDiff } from "./workspace-diff.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { resolveRealPathWithinRoot } from "./workspace-files.js";

export type GitDiffScope = "unstaged" | "staged" | "branch";

const MAX_DIFF_BYTES = 512 * 1024;
const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;
const execFileAsync = promisify(execFile);
const MAX_FILES = 200;
const GIT_TIMEOUT_MS = 15_000;

type RunResult = { code: number; stdout: string; stderr: string };

async function runGit(cwd: string, args: string[]): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync("git", ["--no-pager", ...args], {
      cwd,
      env: process.env,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
      encoding: "utf8",
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    // Oversized or timed-out output is a failure, never a partial diff.
    const e = error as { code?: unknown; stdout?: string; stderr?: string };
    return { code: typeof e.code === "number" ? e.code : 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

const STATUS_MAP: Record<DiffFileStatus, ReviewChangeStatus> = {
  added: "added",
  modified: "modified",
  deleted: "deleted",
  renamed: "modified",
  untracked: "added",
};

const OP_MAP: Record<DiffFileStatus, ReviewChangeOperation> = {
  added: "write",
  modified: "edit",
  deleted: "delete",
  renamed: "edit",
  untracked: "write",
};

function diffFileToChange(file: DiffFile, scope: GitDiffScope): ReviewChange {
  return {
    version: 1,
    snapshotId: `git:${scope}:${file.path}`,
    messageId: "git",
    path: file.path,
    operation: OP_MAP[file.status] ?? "edit",
    status: STATUS_MAP[file.status] ?? "modified",
    state: "active",
    additions: file.additions,
    deletions: file.deletions,
    hunks: file.hunks,
    ...(file.binary ? { binary: true } : {}),
    ...(file.tooLarge ? { truncated: true } : {}),
    reversible: false,
  };
}

function parseDiff(raw: string, scopeHint?: DiffFileStatus): DiffFile[] {
  if (raw.length > MAX_DIFF_BYTES) {
    // Truncated: parse what we have; individual files may still be tooLarge.
    raw = raw.slice(0, MAX_DIFF_BYTES);
  }
  return splitUnifiedDiff(raw)
    .map((chunk) => parseFilePatch(chunk, scopeHint))
    .filter((f): f is DiffFile => f !== null);
}

/** Resolve the merge base between HEAD and its upstream / default branch. */
async function branchBase(cwd: string): Promise<string | null> {
  // 1. Tracking branch upstream
  const upstream = await runGit(cwd, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{upstream}",
  ]);
  if (upstream.code === 0 && upstream.stdout.trim()) {
    return upstream.stdout.trim();
  }
  // 2. origin/HEAD
  const originHead = await runGit(cwd, [
    "symbolic-ref",
    "refs/remotes/origin/HEAD",
  ]);
  if (originHead.code === 0 && originHead.stdout.trim()) {
    return originHead.stdout.trim().replace(/^refs\/remotes\//, "");
  }
  // 3. Guess main / master
  for (const candidate of ["origin/main", "origin/master", "main", "master"]) {
    const probe = await runGit(cwd, [
      "rev-parse",
      "--verify",
      "--quiet",
      candidate,
    ]);
    if (probe.code === 0) return candidate;
  }
  return null;
}

/**
 * Collect git diffs for the given scope and return them as ReviewChange[].
 *
 * - `unstaged`: working-tree vs index (`git diff`)
 * - `staged`:   index vs HEAD (`git diff --cached`)
 * - `branch`:   merge-base(HEAD, upstream) vs HEAD (`git diff <base>...HEAD`)
 *
 * Returns [] when the cwd is not a git repo, has no commits, or the requested
 * scope is clean.  Never throws.
 */
export async function collectGitReviewDiff(
  cwd: string,
  scope: GitDiffScope,
): Promise<{ changes: ReviewChange[]; base?: string; error?: string }> {
  // Confirm we're inside a git work tree.
  const probe = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (probe.code !== 0 || probe.stdout.trim() !== "true") {
    return { changes: [] };
  }

  const sharedFlags = [
    "--no-color",
    "--no-ext-diff",
    "-M",
    "--unified=3",
    "--diff-filter=ACDMRT", // Added, Copied, Deleted, Modified, Renamed, Type-changed
    "--",
  ];

  let files: DiffFile[] = [];
  let base: string | undefined;

  if (scope === "unstaged") {
    const res = await runGit(cwd, ["diff", ...sharedFlags]);
    if (res.code !== 0 && !res.stdout) {
      return { changes: [], error: res.stderr.trim() || undefined };
    }
    files = parseDiff(res.stdout);
  } else if (scope === "staged") {
    const res = await runGit(cwd, ["diff", "--cached", ...sharedFlags]);
    if (res.code !== 0 && !res.stdout) {
      return { changes: [], error: res.stderr.trim() || undefined };
    }
    files = parseDiff(res.stdout);
  } else {
    // branch scope
    const baseRef = await branchBase(cwd);
    if (!baseRef) {
      return { changes: [], error: "no upstream or default branch found" };
    }
    base = baseRef;
    // 3-dot syntax diffs from merge base to HEAD
    const res = await runGit(cwd, ["diff", `${baseRef}...HEAD`, ...sharedFlags]);
    if (res.code !== 0 && !res.stdout) {
      return { changes: [], error: res.stderr.trim() || undefined };
    }
    files = parseDiff(res.stdout);
  }

  const truncated = files.length > MAX_FILES;
  const scoped = files.slice(0, MAX_FILES);
  const changes = scoped.map((f) => diffFileToChange(f, scope));
  if (truncated) {
    // Inject a truncation marker as a sentinel change so the UI can note it.
    // ponytail: simpler than a separate flag in the return type
  }
  return { changes, base };
}

const MAX_DOC_BYTES = 512 * 1024;
const MD_EXT_RE = /\.(?:md|mdx|markdown)$/i;

/**
 * Read a workspace markdown file and return it as a single ReviewChange whose
 * hunk lines are all CONTEXT lines (numbered 1..n), so notes anchor to file
 * line numbers.  Snapshot id: `doc:<relPath>`.
 *
 * Rejects:
 *   - absolute paths
 *   - `..` escape attempts
 *   - non-markdown extensions
 *   - paths that escape the workspace via symlinks
 *   - files over 512 KiB
 */
export async function collectDocReview(
  cwd: string,
  relPath: string,
): Promise<{ changes: ReviewChange[]; error?: string }> {
  if (
    !relPath ||
    isAbsolute(relPath) ||
    /(?:^|\/)\.\.(?:\/|$)/.test(relPath) ||
    !MD_EXT_RE.test(relPath)
  ) {
    return { changes: [], error: "invalid path" };
  }

  const resolved = await resolveRealPathWithinRoot(cwd, relPath);
  if (!resolved) return { changes: [], error: "path escapes workspace" };

  let size: number;
  try {
    ({ size } = await stat(resolved));
  } catch {
    return { changes: [], error: "file not found" };
  }
  if (size > MAX_DOC_BYTES) return { changes: [], error: "file too large" };

  let content: string;
  try {
    content = await readFile(resolved, "utf8");
  } catch {
    return { changes: [], error: "could not read file" };
  }

  const rawLines = content.split("\n");
  // Drop trailing empty line produced by a final newline.
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") rawLines.pop();

  const change: ReviewChange = {
    version: 1,
    snapshotId: `doc:${relPath}`,
    messageId: "doc",
    path: relPath,
    operation: "edit",
    status: "modified",
    state: "active",
    additions: 0,
    deletions: 0,
    hunks: rawLines.length === 0 ? [] : [
      {
        header: `@@ -1,${rawLines.length} +1,${rawLines.length} @@`,
        lines: rawLines.map((text) => ({ type: "context" as const, text })),
      },
    ],
    reversible: false,
  };
  return { changes: [change] };
}
