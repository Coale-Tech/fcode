/**
 * Allowlisted omp CLI runner (slice F).
 *
 * Runs the BUNDLED omp binary (via omp-binary.ts resolveOmpBin)
 * spawned directly with an argv array.  Each call gets a unique runId so the
 * renderer can match streaming output events and cancel in-flight runs.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolveOmpBin, ompChildEnv } from "./omp-binary";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OmpCliSubcommand =
  | "stats"
  | "usage"
  | "gc"
  | "models"
  | "ps"
  | "worktree"
  | "tiny-models"
  | "toks"
  | "config"
  | "web-search";

/** One field descriptor for the UI. */
export interface OmpCliField {
  id: string;
  /** English label from omp. */
  label: string;
  type: "text" | "checkbox" | "select";
  options?: string[];
  defaultValue: string | boolean;
  /** Placeholder for text fields. */
  placeholder?: string;
}

/** One wired CLI command spec. */
export interface OmpCliSpec {
  /** Subcommand passed to omp. */
  subcommand: OmpCliSubcommand;
  /** English description from omp. */
  label: string;
  description: string;
  /** Fixed argv segments always appended before user args. */
  fixedArgs: string[];
  /** User-supplied flag args must satisfy at least one pattern. */
  allowedFlagPatterns: RegExp[];
  /** Form fields shown to the user. */
  fields: OmpCliField[];
  /** Timeout in ms. */
  timeoutMs: number;
  /** Build the argv segments from the form values. */
  buildArgs(values: Record<string, string | boolean>): string[];
}

// ── Command specs ─────────────────────────────────────────────────────────────

export const OMP_CLI_SPECS: OmpCliSpec[] = [
  {
    subcommand: "stats",
    label: "Usage Statistics",
    description: "View AI usage statistics: requests, tokens, cost, error rate.",
    fixedArgs: ["--summary"],
    allowedFlagPatterns: [/^--(json|summary)$/],
    fields: [
      {
        id: "format",
        label: "Output format",
        type: "select",
        options: ["summary", "json"],
        defaultValue: "summary",
      },
    ],
    timeoutMs: 60_000,
    buildArgs(v) {
      return v.format === "json" ? ["--json"] : ["--summary"];
    },
  },
  {
    subcommand: "usage",
    label: "Provider Usage",
    description: "Show provider usage limits for every authenticated account.",
    fixedArgs: ["--json"],
    allowedFlagPatterns: [/^--provider=[\w-]+$/, /^--(redact|history)$/, /^--days=\d+$/],
    fields: [
      {
        id: "provider",
        label: "Provider (optional)",
        type: "text",
        defaultValue: "",
        placeholder: "anthropic, openai, …",
      },
    ],
    timeoutMs: 30_000,
    buildArgs(v) {
      const args: string[] = [];
      const p = String(v.provider ?? "").trim();
      if (p) args.push(`--provider=${p}`);
      return args;
    },
  },
  {
    subcommand: "gc",
    label: "Storage Cleanup",
    description: "Run on-disk storage maintenance: sweep blobs, archive cold sessions, checkpoint WAL files.",
    fixedArgs: ["--json"],
    allowedFlagPatterns: [/^--(apply|blobs|archive|wal)$/],
    fields: [
      {
        id: "apply",
        label: "Apply changes (default: dry-run preview)",
        type: "checkbox",
        defaultValue: false,
      },
    ],
    timeoutMs: 120_000,
    buildArgs(v) {
      return v.apply ? ["--apply"] : [];
    },
  },
  {
    subcommand: "models",
    label: "Available Models",
    description: "List, search, and refresh available AI models from the catalog.",
    fixedArgs: ["--json"],
    allowedFlagPatterns: [
      /^--kind=(chat|all|embedding|completion)$/,
      /^(ls|find|refresh)$/,
      /^[\w.@/-]+$/,
    ],
    fields: [
      {
        id: "action",
        label: "Action",
        type: "select",
        options: ["ls", "find", "refresh"],
        defaultValue: "ls",
      },
      {
        id: "kind",
        label: "Kind",
        type: "select",
        options: ["chat", "all", "embedding"],
        defaultValue: "chat",
      },
    ],
    timeoutMs: 30_000,
    buildArgs(v) {
      const args: string[] = [];
      if (v.action && v.action !== "ls") args.push(String(v.action));
      if (v.kind && v.kind !== "chat") args.push(`--kind=${v.kind}`);
      return args;
    },
  },
  {
    subcommand: "ps",
    label: "Process List",
    description: "Inspect daemon-broker supervised processes (omp services).",
    fixedArgs: ["--plain", "--json"],
    allowedFlagPatterns: [/^--all$/, /^(list|info|logs)$/, /^[\w.-]+$/],
    fields: [
      {
        id: "all",
        label: "Show all project and global service scopes",
        type: "checkbox",
        defaultValue: false,
      },
    ],
    timeoutMs: 15_000,
    buildArgs(v) {
      return v.all ? ["--all"] : [];
    },
  },
  {
    subcommand: "worktree",
    label: "Worktrees",
    description: "List and manage agent-managed git worktrees under ~/.omp/wt.",
    fixedArgs: ["--json"],
    allowedFlagPatterns: [/^--(dry-run|all)$/, /^(list|clear)$/],
    fields: [
      {
        id: "action",
        label: "Action",
        type: "select",
        options: ["list", "clear"],
        defaultValue: "list",
      },
      {
        id: "dryRun",
        label: "Dry-run (preview, no changes)",
        type: "checkbox",
        defaultValue: true,
      },
    ],
    timeoutMs: 15_000,
    buildArgs(v) {
      const args: string[] = [];
      if (v.action && v.action !== "list") args.push(String(v.action));
      if (v.dryRun) args.push("--dry-run");
      return args;
    },
  },
  {
    subcommand: "tiny-models",
    label: "Tiny Models",
    description: "Download and list bundled offline tokenizer models for token counting.",
    fixedArgs: ["--json"],
    allowedFlagPatterns: [/^(list|download)$/, /^[\w.-]+$/],
    fields: [
      {
        id: "action",
        label: "Action",
        type: "select",
        options: ["list", "download"],
        defaultValue: "list",
      },
      {
        id: "model",
        label: "Model key (or 'all'; leave blank for default)",
        type: "text",
        defaultValue: "",
        placeholder: "lfm2.5-230m, all, …",
      },
    ],
    timeoutMs: 60_000,
    buildArgs(v) {
      const args: string[] = [];
      if (v.action) args.push(String(v.action));
      const m = String(v.model ?? "").trim();
      if (m) args.push(m);
      return args;
    },
  },
  {
    subcommand: "toks",
    label: "Token Count",
    description: "Count a file or text through every embedded offline tokenizer and print a per-encoding stats table.",
    fixedArgs: [],
    allowedFlagPatterns: [],
    fields: [
      {
        id: "input",
        label: "File path or text to count",
        type: "text",
        defaultValue: "",
        placeholder: "/path/to/file.txt or paste text…",
      },
    ],
    timeoutMs: 10_000,
    buildArgs(v) {
      const input = String(v.input ?? "").trim();
      return input ? [input] : [];
    },
  },
  {
    subcommand: "config",
    label: "Config",
    description: "Read omp configuration settings (read-only: list or get).",
    fixedArgs: ["--json"],
    allowedFlagPatterns: [/^(list|get)$/, /^[\w.-]+$/],
    fields: [
      {
        id: "action",
        label: "Action",
        type: "select",
        options: ["list", "get"],
        defaultValue: "list",
      },
      {
        id: "key",
        label: "Config key (required for 'get')",
        type: "text",
        defaultValue: "",
        placeholder: "retry.maxRetries",
      },
    ],
    timeoutMs: 10_000,
    buildArgs(v) {
      const args: string[] = [];
      if (v.action) args.push(String(v.action));
      const key = String(v.key ?? "").trim();
      if (key && v.action === "get") args.push(key);
      return args;
    },
  },
  {
    subcommand: "web-search",
    label: "Web Search",
    description: "Test omp web search models: run a query through the configured search provider.",
    fixedArgs: ["--compact"],
    allowedFlagPatterns: [/^.+$/],
    fields: [
      {
        id: "query",
        label: "Search query",
        type: "text",
        defaultValue: "",
        placeholder: "TypeScript async generators tutorial",
      },
    ],
    timeoutMs: 30_000,
    buildArgs(v) {
      const q = String(v.query ?? "").trim();
      return q ? q.split(/\s+/) : [];
    },
  },
];

export const OMP_CLI_SPEC_RECORD: Record<OmpCliSubcommand, OmpCliSpec> = Object.fromEntries(
  OMP_CLI_SPECS.map((s) => [s.subcommand, s]),
) as Record<OmpCliSubcommand, OmpCliSpec>;

// ── Arg safety ────────────────────────────────────────────────────────────────

/** No null bytes, newlines (spawn is not shell — all other chars are safe). */
const SAFE_ARG_RE = /^[^\x00\n\r]{1,1000}$/;

/**
 * Validate user-supplied args for a given subcommand.
 * Returns null on success, or an error string.
 * Exported for unit tests.
 */
export function validateOmpCliArgs(
  subcommand: string,
  userArgs: string[],
): string | null {
  if (!(subcommand in OMP_CLI_SPEC_RECORD)) {
    return `subcommand not allowlisted: ${JSON.stringify(subcommand)}`;
  }
  const spec = OMP_CLI_SPEC_RECORD[subcommand as OmpCliSubcommand];

  for (const arg of userArgs) {
    if (!SAFE_ARG_RE.test(arg)) {
      return `unsafe characters in arg: ${JSON.stringify(arg)}`;
    }
    // Flag args must match an allowed pattern; positional args pass through.
    if (arg.startsWith("-")) {
      const ok = spec.allowedFlagPatterns.some((re) => re.test(arg));
      if (!ok) return `flag not allowed for ${subcommand}: ${JSON.stringify(arg)}`;
    }
  }
  return null;
}

// ── Active run registry ───────────────────────────────────────────────────────

type ActiveRun = {
  kill: () => void;
  timeout: NodeJS.Timeout;
};

const activeRuns = new Map<string, ActiveRun>();

export function cancelRun(runId: string): void {
  const run = activeRuns.get(runId);
  if (!run) return;
  clearTimeout(run.timeout);
  run.kill();
  activeRuns.delete(runId);
}

// ── Runner ────────────────────────────────────────────────────────────────────

export interface OmpCliRunOptions {
  subcommand: OmpCliSubcommand;
  /** User-supplied args (already validated by caller or validateOmpCliArgs). */
  userArgs: string[];
  /** Called with each stdout/stderr chunk. */
  onChunk: (chunk: string, stream: "stdout" | "stderr") => void;
  /** Called when the process exits or is killed. */
  onDone: (exitCode: number | null, killed: boolean) => void;
}

/**
 * Launch an omp CLI command.  Returns { runId } immediately; callbacks
 * fire asynchronously.  The caller MUST validate args with validateOmpCliArgs
 * before calling this.
 */
export function startOmpCli(opts: OmpCliRunOptions): string {
  const { subcommand, userArgs, onChunk, onDone } = opts;
  const spec = OMP_CLI_SPEC_RECORD[subcommand];
  const bin = resolveOmpBin();
  const argv = [subcommand, ...spec.fixedArgs, ...userArgs];
  const runId = randomUUID();

  const child = spawn(bin, argv, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: ompChildEnv(),
  });

  let killed = false;

  child.stdout.on("data", (buf: Buffer) => {
    onChunk(buf.toString("utf8"), "stdout");
  });
  child.stderr.on("data", (buf: Buffer) => {
    onChunk(buf.toString("utf8"), "stderr");
  });

  child.on("close", (code) => {
    const run = activeRuns.get(runId);
    if (run) {
      clearTimeout(run.timeout);
      activeRuns.delete(runId);
    }
    onDone(code, killed);
  });

  const timeoutHandle = setTimeout(() => {
    killed = true;
    child.kill("SIGTERM");
    activeRuns.delete(runId);
  }, spec.timeoutMs);

  activeRuns.set(runId, {
    kill: () => {
      killed = true;
      child.kill("SIGTERM");
    },
    timeout: timeoutHandle,
  });

  return runId;
}
