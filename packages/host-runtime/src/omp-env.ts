import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { HostRpc } from "./host-ports.js";
import type { HostProviderRecord } from "./launch-resolver.js";

/** Fcode `apiStyle` values → omp's `api` field. */
const FCODE_API_STYLE_MAP: Record<string, string> = {
  anthropic_messages: "anthropic-messages",
  chat_completions: "openai-completions",
  responses: "openai-responses",
  openai_codex_responses: "openai-codex-responses",
  google_generative_ai: "google-generative-ai",
};

/**
 * The environment omp-bridge needs to reach the user's providers: one
 * `FCODE_PROVIDER_<ID>_KEY` per keyed provider, `FCODE_MODELS_CONFIG` pointing
 * at a generated `fcode-providers.yml` (it stores variable names, never key
 * values), and `FCODE_DEFAULT_MODEL`. Shared by the desktop and `pi-host` so
 * both launch omp the same way. Empty when no provider is usable.
 */
export async function ompProviderEnv(
  host: HostRpc,
  providers: readonly HostProviderRecord[],
  dataDir: string,
): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  const lines = ["# Fcode-injected providers — generated on each launch, do not edit.", "providers:"];
  const injected = new Set<string>();
  for (const p of providers) {
    if (p.hasOauth) continue;
    const keyless = p.authKind === "none";
    const envKey = `FCODE_PROVIDER_${p.id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_KEY`;
    if (!keyless) {
      const secret = await host.call<{ value?: string }>("providers.getSecret", { id: p.id }).then(
        (r) => r.value,
        () => undefined,
      );
      if (!secret) continue;
      env[envKey] = secret;
    }
    lines.push(`  fcode-${p.id}:`);
    if (p.baseUrl) lines.push(`    baseUrl: "${p.baseUrl}"`);
    lines.push(`    api: ${FCODE_API_STYLE_MAP[p.apiStyle ?? "chat_completions"] ?? "openai-completions"}`);
    lines.push(keyless ? "    auth: none" : `    apiKey: ${envKey}`);
    const models = p.models ?? [];
    if (models.length) {
      lines.push("    models:");
      for (const m of models) lines.push(`      - id: "${m.id}"`);
    }
    injected.add(p.id);
  }
  if (!injected.size) return {};
  const configPath = join(dataDir, "fcode-providers.yml");
  writeFileSync(configPath, `${lines.join("\n")}\n`, "utf8");
  env.FCODE_MODELS_CONFIG = configPath;
  // Start omp on Fcode's default model, not whichever model it discovers first.
  const settings = await host
    .call<{ defaultProviderId?: string; defaultModelId?: string }>("settings.get")
    .catch(() => undefined);
  const { defaultProviderId: id, defaultModelId: model } = settings ?? {};
  if (id && model && injected.has(id)) env.FCODE_DEFAULT_MODEL = `fcode-${id}/${model}`;
  return env;
}

/** Read omp-settings.json; returns {} on any error (file absent or invalid JSON). */
function readOmpSettings(dataDir: string): Record<string, unknown> {
  try {
    const raw = JSON.parse(readFileSync(join(dataDir, "omp-settings.json"), "utf8")) as unknown;
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  } catch { /* absent or invalid */ }
  return {};
}

/** Read approval-mode.json; returns "always-ask" on any error. */
function readApprovalMode(dataDir: string): string {
  try {
    const raw = JSON.parse(readFileSync(join(dataDir, "approval-mode.json"), "utf8")) as unknown;
    if (typeof raw === "string" && ["always-ask", "write", "yolo"].includes(raw)) return raw;
  } catch { /* absent or invalid */ }
  return "always-ask";
}

/** Read memory.json; returns { backend: "mnemopi" } on any error. */
function readMemoryConfig(dataDir: string): { backend: string; hindsightUrl?: string; hindsightBank?: string } {
  try {
    const raw = JSON.parse(readFileSync(join(dataDir, "memory.json"), "utf8")) as Record<string, unknown>;
    const backends = ["mnemopi", "hindsight", "sharpshooter", "local", "off"];
    const backend = typeof raw.backend === "string" && backends.includes(raw.backend) ? raw.backend : null;
    if (!backend) throw new Error("invalid backend");
    const out: { backend: string; hindsightUrl?: string; hindsightBank?: string } = { backend };
    if (typeof raw.hindsightUrl === "string") out.hindsightUrl = raw.hindsightUrl;
    if (typeof raw.hindsightBank === "string") out.hindsightBank = raw.hindsightBank;
    return out;
  } catch { /* absent or invalid */ }
  return { backend: "mnemopi" };
}

/**
 * Env vars that the sidecar (omp-bridge) reads to configure overlay settings,
 * memory backend, and tool approval mode. Shared by pi-host (and usable by
 * the desktop as a single-source reader for these three JSON config files).
 *
 * Does NOT include provider secrets (use ompProviderEnv for those) or
 * HINDSIGHT_API_TOKEN (desktop fetches it from the host-core secret store;
 * pi-host users pass it via environment directly).
 */
export function ompSidecarExtraEnv(dataDir: string): Record<string, string> {
  const env: Record<string, string> = {};
  // omp settings (curated + advanced)
  const settings = readOmpSettings(dataDir);
  env.FCODE_OMP_SETTINGS = JSON.stringify(settings);
  // Tool approval mode
  env.FCODE_TOOL_APPROVAL_MODE = readApprovalMode(dataDir);
  // Memory backend
  const mem = readMemoryConfig(dataDir);
  env.FCODE_MEMORY_BACKEND = mem.backend;
  if (mem.hindsightUrl) env.FCODE_HINDSIGHT_URL = mem.hindsightUrl;
  if (mem.hindsightBank) env.FCODE_HINDSIGHT_BANK = mem.hindsightBank;
  return env;
}
