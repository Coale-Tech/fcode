/**
 * Fcode-owned memory backend selection. Non-secret fields live in
 * `<dataDir>/memory.json`; the Hindsight token lives in the host secret store
 * and only ever reaches omp as the HINDSIGHT_API_TOKEN env var.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MemoryConfig } from "@pi-desktop/shared";

export const MEMORY_TOKEN_SECRET_REF = "secret:memory:hindsight-token";
const BACKENDS = ["mnemopi", "hindsight", "off"] as const;

export function readMemoryConfig(dataDir: string): MemoryConfig {
  try {
    const raw = JSON.parse(readFileSync(join(dataDir, "memory.json"), "utf8")) as Partial<MemoryConfig>;
    return validateMemoryConfig(raw);
  } catch {
    return { backend: "mnemopi" };
  }
}

/** Trust boundary: renderer input is normalised, never passed through. */
export function validateMemoryConfig(input: Partial<MemoryConfig>): MemoryConfig {
  const backend = BACKENDS.find((b) => b === input.backend);
  if (!backend) throw new Error("invalid memory backend");
  const out: MemoryConfig = { backend };
  if (backend === "hindsight") {
    const url = String(input.hindsightUrl ?? "").trim();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("Hindsight URL must be an http(s) URL");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Hindsight URL must be an http(s) URL");
    }
    out.hindsightUrl = url;
    const bank = String(input.hindsightBank ?? "").trim();
    if (bank) out.hindsightBank = bank;
  }
  return out;
}

export function writeMemoryConfig(dataDir: string, config: MemoryConfig): void {
  writeFileSync(join(dataDir, "memory.json"), JSON.stringify(config), "utf8");
}

/** Env for the sidecar launch; `token` is the resolved secret or null. */
export function memoryEnv(config: MemoryConfig, token: string | null): Record<string, string> {
  const env: Record<string, string> = { FCODE_MEMORY_BACKEND: config.backend };
  if (config.hindsightUrl) env.FCODE_HINDSIGHT_URL = config.hindsightUrl;
  if (config.hindsightBank) env.FCODE_HINDSIGHT_BANK = config.hindsightBank;
  if (config.backend === "hindsight" && token) env.HINDSIGHT_API_TOKEN = token;
  return env;
}
