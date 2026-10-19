/**
 * Resolve the bench (apps/ + sites/ ancestor) that contains a given path.
 *
 * Used by the benchForPath IPC channel so the Bench page can auto-select the
 * correct bench when the active workspace changes to a worktree or sub-path.
 */
import { stat } from "node:fs/promises";
import { dirname, join, parse } from "node:path";
import { readWorktreeLink } from "../worktree-provision.ts";

/**
 * Walk up from `p` looking for a directory that has both `apps/` and `sites/`
 * sub-directories (the Frappe bench layout). When none is found AND `p` is a
 * git worktree, retry from its parent repo root.
 *
 * Returns null when no bench is found, and never throws.
 */
export async function benchForPath(p: string): Promise<string | null> {
  try {
    await stat(p);
  } catch {
    return null;
  }

  const found = await walkUpForBench(p);
  if (found) return found;

  const parentRepo = (await readWorktreeLink(p))?.parentRepo;
  if (!parentRepo) return null;
  return walkUpForBench(parentRepo);
}

async function walkUpForBench(p: string): Promise<string | null> {
  let s: { isDirectory(): boolean } | null = null;
  try { s = await stat(p); } catch { return null; }
  let dir = s.isDirectory() ? p : dirname(p);
  const root = parse(dir).root;

  while (true) {
    try {
      const [apps, sites] = await Promise.all([stat(join(dir, "apps")), stat(join(dir, "sites"))]);
      if (apps.isDirectory() && sites.isDirectory()) return dir;
    } catch { /* not a bench dir, keep walking */ }
    if (dir === root) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
