/**
 * scanDoctypes — Frappe bench DocType scanner.
 *
 * Walks apps/ directory, runs git ls-files and git status from each
 * app's own git repo (or bench root if it is a monorepo). Returns
 * bench-relative entries with a dirty flag.
 *
 * ponytail: git-status heuristic; misses committed-but-not-migrated changes.
 * Not proof migration is required. Upgrade: compare installed schema hash.
 */
import { readdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";

export type DoctypeEntry = {
  path: string; // bench-relative: apps/<app>/<pkg>/<module>/doctype/<name>/<name>.json
  app: string;
  module: string;
  name: string;
  dirty: boolean; // heuristic: modified in git working tree
};

const GIT_TIMEOUT_MS = 30_000;

/**
 * Read-only git: no index lock (never blocks a concurrent user git command),
 * no fsmonitor daemon spawn, bounded runtime. `-z` output is raw NUL-separated
 * paths, so no quoting or octal-escape decoding is ever needed.
 */
function spawnGit(cwd: string, args: string[]): Promise<{ code: number; out: string }> {
  const { promise, resolve: res } = Promise.withResolvers<{ code: number; out: string }>();
  execFile(
    "git",
    ["--no-optional-locks", "-c", "core.fsmonitor=false", ...args],
    { cwd, maxBuffer: 64 * 1024 * 1024, timeout: GIT_TIMEOUT_MS },
    (err, stdout) => {
      const code = !err ? 0 : typeof err.code === "number" ? err.code : 1;
      res({ code, out: stdout });
    },
  );
  return promise;
}

/** `status --porcelain=v1 -z` → paths (new path for renames/copies). */
function parsePorcelainZ(out: string): string[] {
  const paths: string[] = [];
  const records = out.split("\0");
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (rec.length <= 3) continue;
    paths.push(rec.slice(3));
    // Rename/copy records are followed by a separate record holding the old path.
    if (rec[0] === "R" || rec[0] === "C" || rec[1] === "R" || rec[1] === "C") i++;
  }
  return paths;
}

export async function scanDoctypes(benchPath: string): Promise<DoctypeEntry[]> {
  const appsDir = join(benchPath, "apps");
  const benchIsMonorepo = existsSync(join(benchPath, ".git"));

  let appNames: string[] = [];
  try {
    appNames = await readdir(appsDir);
  } catch {
    return [];
  }

  const entries: DoctypeEntry[] = [];

  for (const appName of appNames) {
    const appDir = join(appsDir, appName);
    try {
      if (!statSync(appDir).isDirectory()) continue;
    } catch {
      continue;
    }

    const appIsGit = existsSync(join(appDir, ".git"));
    if (!appIsGit && !benchIsMonorepo) continue;

    const gitCwd = appIsGit ? appDir : benchPath;
    const scope = appIsGit ? [] : ["--", `apps/${appName}`];
    // --others: a brand-new, never-added DocType is still a DocType (and is dirty).
    const [ls, st] = await Promise.all([
      spawnGit(gitCwd, ["ls-files", "-z", "--cached", "--others", "--exclude-standard", ...scope]),
      spawnGit(gitCwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all", ...scope]),
    ]);
    if (ls.code !== 0) continue;

    const dirtySet = new Set<string>();
    for (const rel of parsePorcelainZ(st.out)) {
      dirtySet.add(appIsGit ? `apps/${appName}/${rel}` : rel);
    }

    // Set: --cached lists a conflicted (unmerged) path once per stage.
    for (const rel of new Set(ls.out.split("\0").filter(Boolean))) {
      const benchRel = appIsGit ? `apps/${appName}/${rel}` : rel;
      const parts = benchRel.split("/");
      // apps/<app>/<pkg>/<module>/doctype/<name>/<name>.json
      if (
        parts.length === 7 &&
        parts[0] === "apps" &&
        parts[4] === "doctype" &&
        parts[6] === `${parts[5]}.json`
      ) {
        entries.push({
          path: benchRel,
          app: parts[1],
          module: parts[3],
          name: parts[5],
          dirty: dirtySet.has(benchRel),
        });
      }
    }
  }

  return entries;
}
