import { writeFileSync } from "node:fs";
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
