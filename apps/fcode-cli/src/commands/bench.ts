import { connect, fail, printResult } from "../endpoint.js";

export async function benchCommand(sub: string, args: string[]): Promise<void> {
  const asJson = args.includes("--json");

  if (sub === "list") {
    const client = await connect();
    try {
      const result = await client.request<unknown>("bench/list", {});
      printResult(result, asJson);
    } finally {
      await client.close();
    }
    return;
  }

  if (sub === "status") {
    const client = await connect();
    try {
      const result = await client.request<unknown>("bench/status", {});
      printResult(result, asJson);
    } finally {
      await client.close();
    }
    return;
  }

  if (sub === "run") {
    // fcode bench run <benchPath> <verb> [args...]
    const positional = args.filter((a) => !a.startsWith("-"));
    const benchPath = positional[0];
    const verb = positional[1];
    const runArgs = positional.slice(2);
    if (!benchPath) fail("bench run requires a bench path");
    if (!verb) fail("bench run requires a verb");
    const client = await connect();
    try {
      const result = await client.request<unknown>("bench/run", { benchPath, verb, args: runArgs });
      printResult(result, asJson);
    } finally {
      await client.close();
    }
    return;
  }

  fail(`bench: unknown subcommand: ${sub}`);
}
