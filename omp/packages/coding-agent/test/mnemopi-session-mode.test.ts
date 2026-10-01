import { describe, expect, it } from "bun:test";
import { resolveMnemopiProviderOptions } from "../src/mnemopi/backend";
import type { MnemopiBackendConfig } from "../src/mnemopi/config";

function config(llmMode: MnemopiBackendConfig["llmMode"]): MnemopiBackendConfig {
	return {
		llmMode,
		providerOptions: { noEmbeddings: true },
	} as unknown as MnemopiBackendConfig;
}

// Session mode never reads settings/modelRegistry; only the base options need them.
const registry = { getApiKeyForProvider: async () => undefined } as never;

async function complete(llm: unknown, prompt: string, opts?: unknown): Promise<string | null> {
	if (typeof llm === "function") return llm(prompt, opts);
	if (llm && typeof llm === "object" && "complete" in llm && typeof llm.complete === "function") {
		return llm.complete(prompt, opts);
	}
	throw new Error("no llm completion function");
}
describe("mnemopi llmMode=session", () => {
	it("completes through a bounded, tool-free ephemeral turn on the session model", async () => {
		const calls: Record<string, unknown>[] = [];
		const session = {
			runEphemeralTurn: async (args: Record<string, unknown>) => {
				calls.push(args);
				return { replyText: "  ok \n" };
			},
		};
		const opts = await resolveMnemopiProviderOptions(config("session"), {} as never, registry, "s1", session as never);
		expect(await complete(opts.llm, "hello")).toBe("ok");
		expect(calls[0]).toMatchObject({ promptText: "hello", history: [], tools: false });
		expect(typeof calls[0].maxContextBytes).toBe("number");
	});

	it("degrades to null instead of throwing when the session has no usable model", async () => {
		const session = {
			runEphemeralTurn: async () => {
				throw new Error("No active model on session");
			},
		};
		const opts = await resolveMnemopiProviderOptions(config("session"), {} as never, registry, "s1", session as never);
		expect(await complete(opts.llm, "hello")).toBeNull();
	});
});
