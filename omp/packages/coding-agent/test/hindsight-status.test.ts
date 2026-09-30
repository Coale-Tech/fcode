import { afterEach, describe, expect, it } from "bun:test";
import { hindsightBackend } from "../src/hindsight/backend";
import { createHindsightClient } from "../src/hindsight/client";

let server: ReturnType<typeof Bun.serve> | undefined;
afterEach(() => server?.stop(true));

function sessionFor(url: string) {
	const client = createHindsightClient({ hindsightApiUrl: url, hindsightApiToken: null, requestTimeoutMs: 5000 } as never);
	const state = { client, bankId: "b1", config: { scoping: "per-project" } };
	return { getHindsightSessionState: () => state } as never;
}

async function statusWith(handler: () => Response) {
	server = Bun.serve({ port: 0, fetch: handler });
	return hindsightBackend.status!({ agentDir: "", cwd: "", session: sessionFor(`http://127.0.0.1:${server.port}`) });
}

describe("hindsight status", () => {
	it("ok when list succeeds", async () => {
		const s = await statusWith(() => Response.json({ items: [], total: 0 }));
		expect(s).toMatchObject({ backend: "hindsight", active: true, retainBank: "b1" });
	});
	it("degraded on 404 bank missing", async () => {
		const s = await statusWith(() => new Response("nope", { status: 404 }));
		expect(s.active).toBe(false);
		expect(s.message).toContain("does not exist");
	});
	it("error on 500", async () => {
		const s = await statusWith(() => new Response("boom", { status: 500 }));
		expect(s.active).toBe(false);
		expect(s.error).toBeTruthy();
	});
	it("not initialised without state", async () => {
		const s = await hindsightBackend.status!({ agentDir: "", cwd: "", session: { getHindsightSessionState: () => undefined } as never });
		expect(s.active).toBe(false);
	});
});
