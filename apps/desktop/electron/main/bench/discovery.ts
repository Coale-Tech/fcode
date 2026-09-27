/**
 * Bench discovery (E11, E12, DX1, DX10).
 *
 * Scans configured roots (default `~/ERPNext`) for directories containing
 * both `apps/` and `sites/`. Discovery is lazy and cancellable (E11):
 * - concurrency limit: at most 4 roots scanned in parallel
 * - depth cap: only the direct children of each root are checked
 * - aborts immediately when AbortSignal fires
 * - stale-result guard: callers supply a signal tied to a generation counter
 *
 * site_config.json is read with a field allow-list (E12): only the fields
 * Fcode needs are extracted; passwords, keys and secrets never reach an event,
 * a log line or a tool result.
 *
 * Frappe version is parsed from apps/frappe/frappe/__init__.py. Unparseable
 * versions are badged as "unknown" rather than coerced to 16 (DX10).
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

export type BenchVersion = 15 | 16 | 17 | "unknown";

export type BenchSite = {
  name: string;
  isDefault: boolean;
  /** Frappe webserver port from common_site_config.json, defaulting to 8000 */
  webserverPort?: number;
};

export type BenchSummary = {
  id: string;
  path: string;
  version: BenchVersion;
  sites: BenchSite[];
};

/**
 * Parsed subset of site_config.json — only non-sensitive fields (E12).
 */
export interface SiteConfigAllowed {
  webserverPort?: number;
  builderPath?: string;
  defaultSite?: string;
}

/** Default discovery roots when none are configured. */
export const DEFAULT_ROOTS = [join(homedir(), "ERPNext")];

/** Maximum number of sub-roots to scan in parallel (E11). */
const CONCURRENCY = 4;

/**
 * Extract only the allowed fields from a raw site_config.json object (E12).
 * Sensitive fields (db_password, encryption_key, administrator_password, etc.)
 * are excluded by not being in the allow-list.
 */
export function parseSiteConfig(raw: Record<string, unknown>): SiteConfigAllowed {
  const result: SiteConfigAllowed = {};
  if (typeof raw.webserver_port === "number") result.webserverPort = raw.webserver_port;
  if (typeof raw.builder_path === "string") result.builderPath = raw.builder_path;
  return result;
}

/**
 * Parse Frappe version from the `__version__` line in `frappe/__init__.py`.
 * Returns `"unknown"` if the file is absent or the major version is not 15/16/17.
 * Never coerces an unrecognised version to a default (DX10).
 */
function parseFrappeVersion(benchPath: string): BenchVersion {
  const initPath = join(benchPath, "apps", "frappe", "frappe", "__init__.py");
  try {
    const content = readFileSync(initPath, "utf8");
    const match = content.match(/__version__\s*=\s*["']([^"']+)["']/);
    if (!match) return "unknown";
    const major = Number.parseInt(match[1].split(".")[0], 10);
    if (major === 15 || major === 16 || major === 17) return major;
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Read all sites in `<bench>/sites/` and determine which is the default.
 */
function readSites(benchPath: string): BenchSite[] {
  const sitesDir = join(benchPath, "sites");
  let defaultSite: string | null = null;

  try {
    const current = readFileSync(join(sitesDir, "currentsite.txt"), "utf8").trim();
    if (current) defaultSite = current;
  } catch {
    // no default site
  }

  // Read common_site_config.json for the shared webserver port
  let sharedWebserverPort: number | undefined;
  try {
    const common = JSON.parse(readFileSync(join(sitesDir, "common_site_config.json"), "utf8")) as Record<string, unknown>;
    if (typeof common.webserver_port === "number") sharedWebserverPort = common.webserver_port;
  } catch {
    // no common config
  }

  try {
    return readdirSync(sitesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "assets")
      .map((d) => {
        let webserverPort = sharedWebserverPort ?? 8000;
        try {
          const raw = JSON.parse(
            readFileSync(join(sitesDir, d.name, "site_config.json"), "utf8"),
          ) as Record<string, unknown>;
          const parsed = parseSiteConfig(raw);
          if (parsed.webserverPort) webserverPort = parsed.webserverPort;
        } catch {
          // site_config.json absent or unparseable; use defaults
        }
        return {
          name: d.name,
          isDefault: d.name === defaultSite,
          webserverPort,
        };
      });
  } catch {
    return [];
  }
}

/**
 * Check whether `dir` looks like a Frappe bench (has both apps/ and sites/).
 */
function isBench(dir: string): boolean {
  return existsSync(join(dir, "apps")) && existsSync(join(dir, "sites"));
}

/**
 * Discover all Frappe benches under the given roots.
 *
 * Returns `{ benches, failedRoots }`.  `failedRoots` lists every root that
 * could not be read (missing directory, permission denied, etc.) so the UI can
 * surface a PARTIAL or ERROR state instead of silently dropping results.
 *
 * Options:
 *  - `roots`: directories to search (defaults to `~/ERPNext`)
 *  - `signal`: AbortSignal to cancel the scan (E11)
 */
export async function discoverBenches(options: {
  roots?: string[];
  signal?: AbortSignal;
} = {}): Promise<{ benches: BenchSummary[]; failedRoots: Array<{ root: string; reason: string }> }> {
  const { roots = DEFAULT_ROOTS, signal } = options;
  if (signal?.aborted) return { benches: [], failedRoots: [] };

  const results: BenchSummary[] = [];
  const failedRoots: Array<{ root: string; reason: string }> = [];
  const seen = new Set<string>();

  // Process roots in batches of CONCURRENCY (E11 — concurrency limit).
  for (let i = 0; i < roots.length; i += CONCURRENCY) {
    if (signal?.aborted) break;
    const batch = roots.slice(i, i + CONCURRENCY);

    const batchResults = await Promise.all(
      batch.map((root) => scanRoot(root, signal)),
    );

    for (let j = 0; j < batch.length; j++) {
      const { benches, failed } = batchResults[j];
      if (failed) {
        failedRoots.push(failed);
      }
      if (signal?.aborted) break;
      for (const bench of benches) {
        const resolved = resolve(bench.path);
        if (!seen.has(resolved)) {
          seen.add(resolved);
          results.push(bench);
        }
      }
    }
  }

  return { benches: results, failedRoots };
}

/**
 * Scan a single root directory for bench subdirectories.
 * Only direct children are checked (depth cap, E11).
 *
 * Returns `{ benches, failed }` — `failed` is non-null when the root itself
 * could not be read (Gap 4 / T6: surface per-root errors to the UI).
 */
async function scanRoot(
  root: string,
  signal?: AbortSignal,
): Promise<{ benches: BenchSummary[]; failed: { root: string; reason: string } | null }> {
  if (signal?.aborted) return { benches: [], failed: null };
  const results: BenchSummary[] = [];

  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch (err) {
    // root missing or unreadable — report it (E11 / T6 Gap 4)
    const reason = err instanceof Error ? err.message : String(err);
    return { benches: [], failed: { root, reason } };
  }

  for (const name of entries) {
    if (signal?.aborted) break;
    const fullPath = join(root, name);
    if (!isBench(fullPath)) continue;

    const version = parseFrappeVersion(fullPath);
    const sites = readSites(fullPath);
    results.push({
      id: resolve(fullPath),
      path: fullPath,
      version,
      sites,
    });
  }

  return { benches: results, failed: null };
}
