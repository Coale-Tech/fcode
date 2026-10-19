import { writeFileSync } from "node:fs";

import { connect, fail, printResult } from "../endpoint.js";

export async function canvasCommand(sub: string, args: string[]): Promise<void> {
  const asJson = args.includes("--json");

  if (sub === "snapshot") {
    const client = await connect();
    try {
      const result = await client.request<unknown>("canvas/snapshot", {});
      printResult(result, asJson);
    } finally {
      await client.close();
    }
    return;
  }

  if (sub === "screenshot") {
    const outIdx = args.indexOf("--out");
    const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined;
    const client = await connect();
    try {
      const result = await client.request<{ mimeType: string; data: string }>("canvas/screenshot", {});
      if (outPath) {
        writeFileSync(outPath, Buffer.from(result.data, "base64"));
        if (!asJson) { process.stdout.write(`screenshot saved: ${outPath}\n`); return; }
      }
      printResult(result, asJson);
    } finally {
      await client.close();
    }
    return;
  }

  if (sub === "click") {
    const uid = args.find((a) => !a.startsWith("-"));
    if (!uid) fail("canvas click requires a uid");
    const client = await connect();
    try {
      await client.request("canvas/act", { action: "click", uid });
      if (!asJson) process.stdout.write("ok\n");
      else printResult({ ok: true }, true);
    } finally {
      await client.close();
    }
    return;
  }

  if (sub === "fill") {
    const positional = args.filter((a) => !a.startsWith("-"));
    const uid = positional[0];
    const text = positional[1] ?? "";
    if (!uid) fail("canvas fill requires a uid");
    const client = await connect();
    try {
      await client.request("canvas/act", { action: "fill", uid, text });
      if (!asJson) process.stdout.write("ok\n");
      else printResult({ ok: true }, true);
    } finally {
      await client.close();
    }
    return;
  }

  if (sub === "goto") {
    const url = args.find((a) => !a.startsWith("-"));
    if (!url) fail("canvas goto requires a url");
    const client = await connect();
    try {
      await client.request("canvas/act", { action: "navigate", url });
      if (!asJson) process.stdout.write("ok\n");
      else printResult({ ok: true }, true);
    } finally {
      await client.close();
    }
    return;
  }

  fail(`canvas: unknown subcommand: ${sub}`);
}
