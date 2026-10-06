import { afterEach, beforeEach, expect, test } from "bun:test";
import * as path from "node:path";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { AuthStorage } from "@oh-my-pi/pi-coding-agent/session/auth-storage";
import { TempDir } from "@oh-my-pi/pi-utils";

let tempDir: TempDir;
beforeEach(() => {
	tempDir = TempDir.createSync("@model-registry-extra-");
});
afterEach(async () => {
	await tempDir.remove().catch(() => {});
});

// Fcode injects its providers with --models-config; a fresh machine has no models.yml.
test("--models-config providers load when the user has no models.yml", async () => {
	const extra = path.join(tempDir.path(), "extra.yml");
	await Bun.write(
		extra,
		[
			"providers:",
			"  fcode-test:",
			'    baseUrl: "http://127.0.0.1:9/v1"',
			"    api: openai-completions",
			"    auth: none",
			"    models:",
			'      - id: "fixture"',
			"",
		].join("\n"),
	);
	const authStorage = await AuthStorage.create(":memory:");
	try {
		const registry = new ModelRegistry(authStorage, path.join(tempDir.path(), "models.yml"), {
			extraModelsPath: extra,
		});
		expect(registry.find("fcode-test", "fixture")?.id).toBe("fixture");
	} finally {
		authStorage.close();
	}
});
