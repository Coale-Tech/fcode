/**
 * IPC handlers for omp extension management:
 *   - ompExtensionsList    — list installed plugins via `omp plugin list --json`
 *   - ompExtensionInstall  — install by npm/git spec via `omp plugin install`
 *   - ompExtensionUninstall — uninstall by name via `omp plugin uninstall`
 *   - ompExtensionSetEnabled — toggle disabledExtensions in omp-settings + restart sidecar
 *
 * Install/uninstall spawn the omp binary directly (no shell) with a 120 s timeout.
 * The spec is validated before spawning to reject paths and shell metacharacters.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { ErrorCodes, IPC } from "@pi-desktop/shared";
import type {
  OmpExtensionEntry,
  OmpExtensionListResult,
  OmpExtensionMutateResult,
  OmpSettingsValues,
} from "@pi-desktop/shared";
import { readOmpSettings, validateOmpSettings, writeOmpSettings } from "../omp-settings-config";
import type { IpcRegistrar } from "./types";

const execFileP = promisify(execFile);

// ── omp binary resolution (matches omp-ipc.ts) ──────────────────────────────
function resolveOmpBin(): string {
  if (process.env.OMP_BIN) return process.env.OMP_BIN;
  const rp = process.resourcesPath ?? "";
  for (const p of [join(rp, "bin", "omp"), join(rp, "bin", "omp.exe")]) {
    if (existsSync(p)) return p;
  }
  return "omp";
}

// ── Spec validation ──────────────────────────────────────────────────────────

/**
 * Shell metacharacters that would be dangerous in a spawned argv, even without
 * a shell. We still reject them to prevent future regressions if the spawn
 * method ever changes.
 *
 * Allow: letters, digits, `@`, `/`, `.`, `-`, `_`, `:`, `+`, `#`, `~`, `=`
 * `<`, `(`, `)`, `!`, `"`, `'`, whitespace, newlines, etc.).
 * `^` is included because it is a valid npm semver range prefix and execFile
 * does not invoke a shell, so no history expansion risk applies.
 */
const SAFE_SPEC_RE = /^[a-zA-Z0-9@/.:\-_+#~=^]+$/;

/** Local-path prefixes that classify a spec as a filesystem path, not a package. */
function isLocalPath(spec: string): boolean {
  // Block dangerous URI schemes even though their chars pass SAFE_SPEC_RE.
  if (/^file:/i.test(spec)) return true;
  if (/^git\+file:/i.test(spec)) return true;
  if (/^(?:svn|hg)\+/i.test(spec)) return true;
  if (spec === "." || spec === ".." || spec === "~") return true;
  if (spec.startsWith("./") || spec.startsWith("../")) return true;
  if (spec.startsWith(".\\") || spec.startsWith("..\\")) return true;
  if (spec.startsWith("~/") || spec.startsWith("~\\")) return true;
  if (spec.startsWith("/")) return true;
  if (spec.startsWith("\\\\")) return true;
  if (/^[A-Za-z]:[\\/]/.test(spec)) return true;
  return false;
}

export type SpecValidation = { valid: true } | { valid: false; error: string };

/**
 * Validate an install spec string.
 * Exported for unit tests.
 */
export function validateInstallSpec(spec: string): SpecValidation {
  if (!spec || !spec.trim()) return { valid: false, error: "spec is required" };
  const s = spec.trim();
  if (s.length > 300) return { valid: false, error: "spec too long (max 300 chars)" };
  if (isLocalPath(s)) return { valid: false, error: "local paths are not allowed; use an npm or git spec" };
  if (!SAFE_SPEC_RE.test(s)) {
    const bad = [...s].find((c) => !SAFE_SPEC_RE.test(c)) ?? "?";
    return { valid: false, error: `invalid character '${bad}' in spec` };
  }
  return { valid: true };
}

// ── List output parsing ──────────────────────────────────────────────────────

interface RawNpmPlugin {
  name?: unknown;
  version?: unknown;
  enabled?: unknown;
  manifest?: { description?: unknown };
}

interface RawMarketplacePlugin {
  id?: unknown;
  scope?: unknown;
  entries?: Array<{ version?: unknown }>;
  shadowedBy?: unknown;
}

interface RawPluginListOutput {
  npm?: RawNpmPlugin[];
  marketplace?: RawMarketplacePlugin[];
}

/**
 * Parse the JSON output of `omp plugin list --json` into `OmpExtensionEntry[]`.
 * Exported for unit tests.
 */
export function parsePluginListOutput(raw: string): OmpExtensionEntry[] {
  let parsed: RawPluginListOutput;
  try {
    parsed = JSON.parse(raw.trim()) as RawPluginListOutput;
  } catch {
    return [];
  }

  const result: OmpExtensionEntry[] = [];

  for (const p of parsed.npm ?? []) {
    const name = typeof p.name === "string" ? p.name : null;
    if (!name) continue;
    result.push({
      id: name,
      name,
      version: typeof p.version === "string" ? p.version : undefined,
      source: "npm",
      enabled: p.enabled !== false,
      description:
        typeof p.manifest?.description === "string" ? p.manifest.description : undefined,
    });
  }

  for (const p of parsed.marketplace ?? []) {
    const id = typeof p.id === "string" ? p.id : null;
    if (!id) continue;
    const version = p.entries?.[0]?.version;
    result.push({
      id,
      name: id,
      version: typeof version === "string" ? version : undefined,
      source: "marketplace",
      // shadowed = disabled by a same-name user-scope entry; otherwise active
      enabled: !p.shadowedBy,
      description: undefined,
    });
  }

  return result;
}

// ── IPC dependencies ─────────────────────────────────────────────────────────

export type ExtensionsMgmtIpcDependencies = {
  registrar: IpcRegistrar;
  dataDir: string;
  restartSidecar: () => Promise<void>;
};

/** Throw a typed INVALID_ARGUMENT error. */
function invalid(message: string): never {
  throw Object.assign(new Error(message), { errorCode: ErrorCodes.INVALID_ARGUMENT });
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerExtensionsMgmtIpc({
  registrar,
  dataDir,
  restartSidecar,
}: ExtensionsMgmtIpcDependencies): void {
  const { handle } = registrar;

  // ── ompExtensionsList ───────────────────────────────────────────────────────
  handle(IPC.invoke.ompExtensionsList, async (): Promise<OmpExtensionListResult> => {
    const bin = resolveOmpBin();
    let stdout = "";
    try {
      ({ stdout } = await execFileP(bin, ["plugin", "list", "--json"], { timeout: 30_000 }));
    } catch {
      // omp not available or no plugins installed — return empty list
      return { extensions: [] };
    }
    return { extensions: parsePluginListOutput(stdout) };
  });

  // ── ompExtensionInstall ─────────────────────────────────────────────────────
  handle(
    IPC.invoke.ompExtensionInstall,
    async (input: { spec?: unknown } = {}): Promise<OmpExtensionMutateResult> => {
      const spec = typeof input?.spec === "string" ? input.spec.trim() : "";
      const check = validateInstallSpec(spec);
      if (!check.valid) invalid(check.error);

      const bin = resolveOmpBin();
      let stdout = "";
      let stderr = "";
      try {
        ({ stdout, stderr } = await execFileP(bin, ["plugin", "install", spec], {
          timeout: 120_000,
        }));
      } catch (rawErr) {
        let msg = rawErr instanceof Error ? rawErr.message : String(rawErr);
        if (rawErr !== null && typeof rawErr === "object" && "stderr" in rawErr) {
          const s = rawErr.stderr;
          if (typeof s === "string" && s) msg = s;
        }
        return { ok: false, output: msg };
      }
      await restartSidecar();
      return { ok: true, output: stdout || stderr };
    },
  );

  // ── ompExtensionUninstall ───────────────────────────────────────────────────
  handle(
    IPC.invoke.ompExtensionUninstall,
    async (input: { name?: unknown } = {}): Promise<OmpExtensionMutateResult> => {
      const name = typeof input?.name === "string" ? input.name.trim() : "";
      if (!name) invalid("name is required");
      // Validate name: same safe-char rules as specs
      const check = validateInstallSpec(name);
      if (!check.valid) invalid(check.error);

      const bin = resolveOmpBin();
      let stdout = "";
      let stderr = "";
      try {
        ({ stdout, stderr } = await execFileP(bin, ["plugin", "uninstall", name], {
          timeout: 60_000,
        }));
      } catch (rawErr) {
        let msg = rawErr instanceof Error ? rawErr.message : String(rawErr);
        if (rawErr !== null && typeof rawErr === "object" && "stderr" in rawErr) {
          const s = rawErr.stderr;
          if (typeof s === "string" && s) msg = s;
        }
        return { ok: false, output: msg };
      }
      await restartSidecar();
      return { ok: true, output: stdout || stderr };
    },
  );

  // ── ompExtensionSetEnabled ──────────────────────────────────────────────────
  // Toggles the extension-module:<name> entry in disabledExtensions and
  // persists via omp-settings + sidecar restart.
  handle(
    IPC.invoke.ompExtensionSetEnabled,
    async (input: { id?: unknown; enabled?: unknown } = {}): Promise<OmpSettingsValues> => {
      const id = typeof input?.id === "string" ? input.id.trim() : "";
      if (!id) invalid("id is required");
      if (typeof input?.enabled !== "boolean") invalid("enabled (boolean) required");
      const enabled = input.enabled; // typeof guard above narrows to boolean

      // Build the disabledExtensions ID: extension-module:<name>
      // For scoped packages like @scope/name, use the full name as-is.
      const disabledId = `extension-module:${id}`;

      const current = readOmpSettings(dataDir);
      const disabled = new Set<string>(current.disabledExtensions ?? []);
      if (enabled) {
        disabled.delete(disabledId);
      } else {
        disabled.add(disabledId);
      }
      const patch = validateOmpSettings({ disabledExtensions: [...disabled] });
      const merged: OmpSettingsValues = { ...current, ...patch };
      writeOmpSettings(dataDir, merged);
      await restartSidecar();
      return merged;
    },
  );
}
