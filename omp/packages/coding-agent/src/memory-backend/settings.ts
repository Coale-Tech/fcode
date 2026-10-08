/**
 * Settings declared by this domain (see `config/registry.ts`). Declaration order is the
 * settings-panel order; `config/all-settings.ts` registers every domain.
 */
import { register } from "../config/registry";

// Memory backend selector — picks between local memories pipeline,
// Mnemopi local SQLite, Hindsight remote memory, Sharpshooter project
// decisions, or off. The legacy
// `memories.enabled` flag is migration input only; see config/settings.ts.
// Protocol hosts (RPC/ACP) start with memory off: embedders opt in through their own settings layer.
export const cfgMemoryBackend = register({
	id: "memory.backend",
	protocolDefault: ["rpc", "acp"],
	type: "enum",
	values: ["off", "local", "hindsight", "mnemopi", "sharpshooter"] as const,
	default: "off",
	ui: {
		tab: "memory",
		group: "General",
		label: "Memory Backend",
		description: "Off, local summary pipeline, Mnemopi SQLite, Hindsight remote memory, or Sharpshooter",
		options: [
			{ value: "off", label: "Off", description: "No memory subsystem runs" },
			{ value: "local", label: "Local", description: "Local rollout summarisation pipeline (memory_summary.md)" },
			{ value: "hindsight", label: "Hindsight", description: "Vectorize Hindsight remote memory service" },
			{
				value: "mnemopi",
				label: "Mnemopi",
				description: "Local SQLite recall/retain backend with optional embeddings",
			},
			{
				value: "sharpshooter",
				label: "Sharpshooter",
				description:
					"Friction-gated project decision files (architecture/product/style), consolidated in the background",
			},
		],
	},
});

/** Cross-backend char cap for memory injected at session start. 0 = unlimited. */
export const cfgMemoryInjectMaxChars = register({
	id: "memory.injectMaxChars",
	type: "number",
	default: 6000,
});

/**
 * Char budget for each frozen memory file (USER.md and .omp/MEMORY.md).
 * 0 = disabled (feature is off; upstream-compatible default).
 * Fcode overlay sets this to 2000 to enable the feature.
 * Each file is individually capped; both counts against memory.injectMaxChars.
 */
export const cfgMemoryFrozenMaxChars = register({
	id: "memory.frozen.maxChars",
	protocolDefault: ["rpc", "acp"],
	type: "number",
	default: 0,
});
