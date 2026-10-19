import { benchCommand } from "./commands/bench.js";
import { canvasCommand } from "./commands/canvas.js";
import { sessionCommand } from "./commands/session.js";
import { worktreeCommand } from "./commands/worktree.js";

/** Dispatch one CLI invocation. Exit codes: 0 ok, 1 error, 2 Fcode not running. */
export async function runCli(args: string[]): Promise<void> {
  const [cmd, sub = "", ...rest] = args;
  try {
    switch (cmd) {
      case "worktree": return await worktreeCommand(sub, rest);
      case "bench":    return await benchCommand(sub, rest);
      case "session":  return await sessionCommand(sub, rest);
      case "canvas":   return await canvasCommand(sub, rest);
      default:
        process.stderr.write(`fcode: unknown command: ${cmd ?? "(none)"}\n`);
        process.stderr.write("Usage: fcode <worktree|bench|session|canvas> <subcommand> [options]\n");
        process.exit(1);
    }
  } catch (error: unknown) {
    process.stderr.write(`fcode: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
