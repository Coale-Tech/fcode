import { randomUUID } from "node:crypto";

import { connect, fail, printResult } from "../endpoint.js";

export async function sessionCommand(sub: string, args: string[]): Promise<void> {
  const asJson = args.includes("--json");

  if (sub === "list") {
    const client = await connect();
    try {
      const result = await client.request<{ sessions: unknown[] }>("session/list", {});
      printResult(result.sessions ?? [], asJson);
    } finally {
      await client.close();
    }
    return;
  }

  if (sub === "create") {
    const projectIdx = args.indexOf("--project");
    const projectPath = projectIdx >= 0 ? args[projectIdx + 1] : undefined;
    const modeIdx = args.indexOf("--mode");
    const mode = modeIdx >= 0 ? args[modeIdx + 1] : undefined;
    if (!projectPath) fail("session create requires --project <path>");
    const client = await connect();
    try {
      // Register the project then create a session in it
      const proj = await client.request<{ project?: { id: string } }>("project/register", { path: projectPath });
      const projectId = proj.project?.id;
      const result = await client.request<{ session: unknown }>("session/create", {
        ...(projectId ? { projectId } : {}),
        ...(mode ? { mode } : {}),
      });
      printResult(result.session, asJson);
    } finally {
      await client.close();
    }
    return;
  }

  if (sub === "send") {
    const sessionId = args.find((a) => !a.startsWith("-"));
    const rest = args.filter((a) => !a.startsWith("-")).slice(1);
    const prompt = rest.join(" ");
    if (!sessionId) fail("session send requires <sessionId>");
    if (!prompt) fail("session send requires a prompt");
    const client = await connect();
    try {
      const result = await client.request<unknown>("turn/start", {
        sessionId,
        input: { text: prompt },
        context: { requestId: randomUUID() },
      });
      printResult(result, asJson);
    } finally {
      await client.close();
    }
    return;
  }

  fail(`session: unknown subcommand: ${sub}`);
}
