import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ompProviderEnv, ompSidecarExtraEnv } from "./omp-env.js";
import type { HostProviderRecord } from "./launch-resolver.js";

const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "omp-env-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const host = (secrets: Record<string, string>, settings: Record<string, string> = {}) => ({
  call: async <T,>(method: string, params?: Record<string, unknown>): Promise<T> => {
    if (method === "settings.get") return settings as T;
    const value = secrets[String(params?.id)];
    if (!value) throw new Error("no secret");
    return { value } as T;
  },
});

const row = (id: string, extra: Partial<HostProviderRecord> = {}): HostProviderRecord => ({ id, name: id, models: [{ id: "m1" } as never], ...extra });

describe("ompProviderEnv", () => {
  it("keeps key values in env and only variable names in the config file", async () => {
    const dir = tempDir();
    const env = await ompProviderEnv(host({ a: "sk-secret" }, { defaultProviderId: "a", defaultModelId: "m1" }), [row("a", { apiStyle: "anthropic_messages" })], dir);
    expect(env.FCODE_PROVIDER_A_KEY).toBe("sk-secret");
    expect(env.FCODE_DEFAULT_MODEL).toBe("fcode-a/m1");
    const yaml = readFileSync(env.FCODE_MODELS_CONFIG!, "utf8");
    expect(yaml).toContain("api: anthropic-messages");
    expect(yaml).toContain("apiKey: FCODE_PROVIDER_A_KEY");
    expect(yaml).not.toContain("sk-secret");
  });

  it("skips OAuth providers and providers whose secret cannot be read, and treats keyless as usable", async () => {
    const dir = tempDir();
    const env = await ompProviderEnv(host({}, { defaultProviderId: "oauth", defaultModelId: "m1" }), [row("oauth", { hasOauth: true }), row("nokey"), row("local", { authKind: "none" })], dir);
    expect(Object.keys(env).filter((key) => key.startsWith("FCODE_PROVIDER_"))).toEqual([]);
    const yaml = readFileSync(env.FCODE_MODELS_CONFIG!, "utf8");
    expect(yaml).toContain("fcode-local:");
    expect(yaml).toContain("auth: none");
    expect(yaml).not.toContain("fcode-oauth:");
    expect(yaml).not.toContain("fcode-nokey:");
    // The default model points at a provider that was not injected, so it is not set.
    expect(env.FCODE_DEFAULT_MODEL).toBeUndefined();
  });

  it("returns nothing when no provider is usable", async () => {
    expect(await ompProviderEnv(host({}), [row("nokey")], tempDir())).toEqual({});
  });
});

describe("ompSidecarExtraEnv", () => {
  it("returns defaults when no config files exist", () => {
    const dir = tempDir();
    const env = ompSidecarExtraEnv(dir);
    expect(env.FCODE_OMP_SETTINGS).toBe("{}");
    expect(env.FCODE_TOOL_APPROVAL_MODE).toBe("always-ask");
    expect(env.FCODE_MEMORY_BACKEND).toBe("mnemopi");
    expect(env.FCODE_HINDSIGHT_URL).toBeUndefined();
  });

  it("reads omp-settings.json including advanced key into FCODE_OMP_SETTINGS", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "omp-settings.json"), JSON.stringify({ "eval.py": true, advanced: { "memory.injectMaxChars": 4000 } }));
    const env = ompSidecarExtraEnv(dir);
    const parsed = JSON.parse(env.FCODE_OMP_SETTINGS) as Record<string, unknown>;
    expect(parsed["eval.py"]).toBe(true);
    expect((parsed.advanced as Record<string, unknown>)["memory.injectMaxChars"]).toBe(4000);
  });

  it("reads approval-mode.json into FCODE_TOOL_APPROVAL_MODE", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "approval-mode.json"), JSON.stringify("yolo"));
    expect(ompSidecarExtraEnv(dir).FCODE_TOOL_APPROVAL_MODE).toBe("yolo");
  });

  it("rejects invalid approval modes and falls back to always-ask", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "approval-mode.json"), JSON.stringify("superadmin"));
    expect(ompSidecarExtraEnv(dir).FCODE_TOOL_APPROVAL_MODE).toBe("always-ask");
  });

  it("reads memory.json backend and Hindsight fields", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "memory.json"), JSON.stringify({ backend: "hindsight", hindsightUrl: "https://h.example.com", hindsightBank: "fcode" }));
    const env = ompSidecarExtraEnv(dir);
    expect(env.FCODE_MEMORY_BACKEND).toBe("hindsight");
    expect(env.FCODE_HINDSIGHT_URL).toBe("https://h.example.com");
    expect(env.FCODE_HINDSIGHT_BANK).toBe("fcode");
  });
});
