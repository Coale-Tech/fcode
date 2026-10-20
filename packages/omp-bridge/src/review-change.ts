/**
 * Review evidence for omp's `write` / `edit` tools.
 *
 * host-core's `Write`/`Edit` embed a `details.review` record the Review tab reads;
 * omp's tools return no such record (`write` returns only `resolvedPath`, `edit` a
 * private diff format). The bridge builds the same v1 record from the file text
 * before and after the call, so the Review tab and its line notes work for omp turns.
 * Line diff and hunking mirror `crates/host-core/src/review.rs`.
 */
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

const MAX_DIFF_LINES = 4000;
const MAX_DP_CELLS = 4_000_000;
const MAX_FILE_BYTES = 1 << 20;
const CONTEXT_LINES = 3;

type Op = { type: "context" | "add" | "del"; text: string };

/** File text, `null` when the file does not exist, `undefined` when it cannot be previewed (too large, unreadable). */
export function readFileText(root: string, path: string): string | null | undefined {
  const abs = isAbsolute(path) ? path : resolve(root, path);
  try {
    const stat = statSync(abs);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return undefined;
    return readFileSync(abs, "utf8");
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? null : undefined;
  }
}

function toLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function diffOps(before: string[], after: string[]): Op[] | null {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endB = before.length;
  let endA = after.length;
  while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) {
    endB--;
    endA--;
  }
  const n = endB - start;
  const m = endA - start;
  if ((n + 1) * (m + 1) > MAX_DP_CELLS) return null;
  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        before[start + i] === after[start + j]
          ? lcs[(i + 1) * width + j + 1]! + 1
          : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!);
    }
  }
  const ops: Op[] = before.slice(0, start).map((text) => ({ type: "context", text }));
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && before[start + i] === after[start + j]) {
      ops.push({ type: "context", text: before[start + i]! });
      i++;
      j++;
    } else if (i < n && (j === m || lcs[(i + 1) * width + j]! >= lcs[i * width + j + 1]!)) {
      ops.push({ type: "del", text: before[start + i]! });
      i++;
    } else {
      ops.push({ type: "add", text: after[start + j]! });
      j++;
    }
  }
  for (const text of before.slice(endB)) ops.push({ type: "context", text });
  return ops;
}

const oldCount = (op: Op) => (op.type === "add" ? 0 : 1);
const newCount = (op: Op) => (op.type === "del" ? 0 : 1);

function makeHunks(ops: Op[]): { header: string; lines: Op[] }[] {
  const ranges: [number, number][] = [];
  ops.forEach((op, index) => {
    if (op.type === "context") return;
    const start = Math.max(0, index - CONTEXT_LINES);
    const end = Math.min(ops.length, index + CONTEXT_LINES + 1);
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else ranges.push([start, end]);
  });
  return ranges.map(([start, end]) => {
    const oldStart = ops.slice(0, start).reduce((sum, op) => sum + oldCount(op), 0) + 1;
    const newStart = ops.slice(0, start).reduce((sum, op) => sum + newCount(op), 0) + 1;
    const lines = ops.slice(start, end);
    const oldLen = lines.reduce((sum, op) => sum + oldCount(op), 0);
    const newLen = lines.reduce((sum, op) => sum + newCount(op), 0);
    return { header: `@@ -${oldStart},${oldLen} +${newStart},${newLen} @@`, lines };
  });
}

/**
 * The `details` patch (`root` + `review`) for one successful omp write/edit, or
 * `null` when nothing changed or the change cannot be previewed.
 */
export function buildReviewDetails(input: {
  root: string;
  path: string;
  toolCallId: string;
  operation: "write" | "edit";
  before: string | null;
  after: string | null | undefined;
}): { root: "workspace"; review: Record<string, unknown> } | null {
  const { before, after } = input;
  if (after === undefined || after === null || before === after) return null;
  const abs = isAbsolute(input.path) ? input.path : resolve(input.root, input.path);
  const rel = relative(input.root, abs);
  const base = {
    version: 1,
    snapshotId: `omp:${input.toolCallId}`,
    messageId: input.toolCallId,
    path: rel && !rel.startsWith("..") ? rel : abs,
    operation: input.operation,
    status: before === null ? "added" : "modified",
    state: "active",
    reversible: false,
  };
  const wrap = (extra: Record<string, unknown>) => ({
    root: "workspace" as const,
    review: { ...base, additions: 0, deletions: 0, hunks: [], ...extra },
  });
  if (before?.includes("\0") || after.includes("\0")) return wrap({ binary: true });
  const beforeLines = toLines(before ?? "");
  const afterLines = toLines(after);
  const ops =
    beforeLines.length > MAX_DIFF_LINES || afterLines.length > MAX_DIFF_LINES
      ? null
      : diffOps(beforeLines, afterLines);
  if (!ops) return wrap({ truncated: true });
  return wrap({
    additions: ops.filter((op) => op.type === "add").length,
    deletions: ops.filter((op) => op.type === "del").length,
    hunks: makeHunks(ops),
  });
}
