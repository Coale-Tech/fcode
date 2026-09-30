/**
 * Bench supervisor (E4, E21, DX4).
 *
 * One supervised bench at a time; long-running children (`bench start`,
 * `watch-studio`) live under it. All spawns use argv style with
 * `shell: false`, following the pattern in git-clone.ts:33,
 * pulls-ipc.ts:27 and mcp-stdio-launch.ts:417. No bash -lc string
 * interpolation.
 *
 * Platform: macOS and Linux only. `bench` requires a POSIX shell env;
 * Windows is explicitly unsupported in v1.
 */

import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { userLookupPath } from "../user-login-path";
import { minimalChildEnv } from "../child-process-env";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Verbs the fcode_bench_run host tool may invoke. "start" stays in BenchPage. */
export const ALLOWED_BENCH_VERBS = new Set([
  "migrate",
  "clear-cache",
  "build",
  "build-studio-app",
  "list-apps",
  "install-app",
]);

/** Returns true when the verb is safe for the fcode_bench_run host tool. */
export function shouldAutoApproveVerb(verb: string): boolean {
  return ALLOWED_BENCH_VERBS.has(verb);
}

/** Maximum automatic restarts for the studio watcher (E21). */
export const WATCHER_MAX_RESTARTS = 5;

/** Initial backoff before the first watcher restart (ms). Doubles each time. */
const WATCHER_INITIAL_BACKOFF_MS = 1_000;

/** Ring buffer capacity per managed process. */
const LOG_RING_SIZE = 5_000;

// ── Bench failure classification (DX4) ───────────────────────────────────────

export const BENCH_FAILURE_CODES = {
  BENCH_NOT_FOUND: "BENCH_NOT_FOUND",
  WRONG_PYTHON_ENV: "WRONG_PYTHON_ENV",
  PORT_BOUND: "PORT_BOUND",
  REDIS_DOWN: "REDIS_DOWN",
  MARIADB_DOWN: "MARIADB_DOWN",
  MISSING_SITE: "MISSING_SITE",
  DEVELOPER_MODE_OFF: "DEVELOPER_MODE_OFF",
  APP_NOT_INSTALLED: "APP_NOT_INSTALLED",
  UNKNOWN: "UNKNOWN",
} as const;

export type BenchFailureCode = (typeof BENCH_FAILURE_CODES)[keyof typeof BENCH_FAILURE_CODES];

export type BenchFailure = {
  code: BenchFailureCode;
  problem: string;
  cause: string;
  fix: string;
  docsUrl: string;
};

const FRAPPE_DOCS = "https://frappeframework.com/docs/";

/**
 * Classify a bench process failure into a typed failure record with actionable
 * copy. The caller provides the spawn error code (e.g. "ENOENT") if the
 * process never started, the raw output, and the command that was run.
 */
export function classifyBenchFailure(
  spawnCode: string | null,
  output: string,
  command: string,
  platform: string = process.platform,
): BenchFailure {
  const out = output.toLowerCase();

  if (spawnCode === "ENOENT" || out.includes("bench: command not found") || command === "bench" && spawnCode === "ENOENT") {
    if (platform === "win32") {
      return {
        code: BENCH_FAILURE_CODES.BENCH_NOT_FOUND,
        problem: "bench command not found",
        cause: "Frappe bench is not supported natively on Windows.",
        fix: "Use WSL2, macOS, or Linux to run Frappe bench.",
        docsUrl: `${FRAPPE_DOCS}user/en/installation`,
      };
    }
    return {
      code: BENCH_FAILURE_CODES.BENCH_NOT_FOUND,
      problem: "bench command not found",
      cause: "bench is not on PATH. It is installed inside a Frappe virtualenv that must be activated first.",
      fix: "Run `source env/bin/activate` in the bench directory, or ensure the bench's bin/ is on your PATH.",
      docsUrl: `${FRAPPE_DOCS}user/en/installation`,
    };
  }

  if (out.includes("address already in use") || out.includes("port") && out.includes("in use")) {
    return {
      code: BENCH_FAILURE_CODES.PORT_BOUND,
      problem: "Web server port is already in use",
      cause: "Another process is listening on the bench's HTTP port (default 8000).",
      fix: "Stop the conflicting process, or change `webserver_port` in sites/common_site_config.json.",
      docsUrl: `${FRAPPE_DOCS}user/en/bench/bench-commands-cheatsheet`,
    };
  }

  const connErr = out.includes("connection refused") || out.includes("connection reset") || out.includes("onnection");
  if (connErr && (out.includes("redis") || command.toLowerCase().includes("redis"))) {
    return {
      code: BENCH_FAILURE_CODES.REDIS_DOWN,
      problem: "Redis is not running",
      cause: "Frappe requires Redis for background jobs and caching.",
      fix: "Start Redis: `brew services start redis` (macOS) or `sudo systemctl start redis`.",
      docsUrl: `${FRAPPE_DOCS}user/en/installation`,
    };
  }

  if (out.includes("connection refused") || out.includes("can't connect to mysql") || out.includes("mariadb")) {
    return {
      code: BENCH_FAILURE_CODES.MARIADB_DOWN,
      problem: "MariaDB / MySQL is not running",
      cause: "Frappe requires MariaDB for all persistent data.",
      fix: "Start MariaDB: `brew services start mariadb` (macOS) or `sudo systemctl start mariadb`.",
      docsUrl: `${FRAPPE_DOCS}user/en/installation`,
    };
  }

  if (out.includes("developer_mode")) {
    return {
      code: BENCH_FAILURE_CODES.DEVELOPER_MODE_OFF,
      problem: "developer_mode is not enabled",
      cause: "This feature requires developer mode to be on.",
      fix: 'Enable it: `bench set-config developer_mode 1` and `bench clear-cache`.',
      docsUrl: `${FRAPPE_DOCS}user/en/config`,
    };
  }

  if (out.includes("no module named") || out.includes("app is not installed") || out.includes("not installed")) {
    return {
      code: BENCH_FAILURE_CODES.APP_NOT_INSTALLED,
      problem: "App is not installed on this site",
      cause: "The required Frappe app is not present.",
      fix: "Install it: `bench get-app <app> && bench --site <site> install-app <app>`.",
      docsUrl: `${FRAPPE_DOCS}user/en/bench/bench-commands-cheatsheet`,
    };
  }

  if (out.includes("site") && out.includes("not found")) {
    return {
      code: BENCH_FAILURE_CODES.MISSING_SITE,
      problem: "Site does not exist",
      cause: "The selected site has not been created yet.",
      fix: "Create it: `bench new-site <site>` or select an existing site.",
      docsUrl: `${FRAPPE_DOCS}user/en/bench/bench-commands-cheatsheet`,
    };
  }

  return {
    code: BENCH_FAILURE_CODES.UNKNOWN,
    problem: "Bench command failed",
    cause: "An unrecognised error occurred.",
    fix: "Check the collapsible output below for details.",
    docsUrl: `${FRAPPE_DOCS}user/en/bench/bench-commands-cheatsheet`,
  };
}

// ── Log ring buffer ───────────────────────────────────────────────────────────

export type LogLine = {
  ts: number;
  text: string;
};

class RingBuffer {
  private readonly lines: LogLine[] = [];
  private readonly size: number;

  constructor(size = LOG_RING_SIZE) {
    this.size = size;
  }

  push(text: string): LogLine {
    const line: LogLine = { ts: Date.now(), text };
    if (this.lines.length >= this.size) this.lines.shift();
    this.lines.push(line);
    return line;
  }

  all(): readonly LogLine[] {
    return this.lines;
  }

  clear(): void {
    this.lines.length = 0;
  }
}

// ── Spawn helpers (E4) ────────────────────────────────────────────────────────

/**
 * Build the env for a bench child. Uses userLookupPath so login-shell
 * shims (nvm, pyenv, virtualenv) are on PATH.
 */
function benchChildEnv(): Record<string, string> {
  const base = minimalChildEnv();
  base.PATH = userLookupPath(base.PATH ?? process.env.PATH ?? "");
  return base;
}

type RunOneShot = {
  benchPath: string;
  site: string | null;
  verb: string;
  args?: string[];
};

type OneShotResult = {
  exitCode: number;
  output: string;
  failure?: BenchFailure;
};

// ── Process record ────────────────────────────────────────────────────────────

type ManagedProcess = {
  name: string;
  buffer: RingBuffer;
  child: ReturnType<typeof spawn> | null;
  /** For the watcher: number of restarts so far (E21). */
  restarts?: number;
  /** For the watcher: current backoff delay ms (E21). */
  backoffMs?: number;
  /** Timer handle for scheduled restart (E21). */
  restartTimer?: ReturnType<typeof setTimeout>;
};

export type BenchStatus = "stopped" | "starting" | "running" | "failed";

// ── Supervisor ────────────────────────────────────────────────────────────────

export class BenchSupervisor extends EventEmitter {
  /** Currently supervised bench path, or null if none. */
  activeBenchPath: string | null = null;
  /** Currently selected site, or null. */
  activeSite: string | null = null;

  private status: BenchStatus = "stopped";
  private readonly processes = new Map<string, ManagedProcess>();

  // ── Public API ────────────────────────────────────────────────────────────

  getStatus(): BenchStatus {
    return this.status;
  }

  getLog(processName: string): readonly LogLine[] {
    return this.processes.get(processName)?.buffer.all() ?? [];
  }

  /**
   * Start `bench start` in the active bench (E4: argv spawn, shell:false).
   */
  async start(benchPath: string): Promise<{ conflict: boolean }> {
    if (this.status === "running" || this.status === "starting") {
      // Same bench already running/starting is a harmless idempotent no-op;
      // a DIFFERENT bench is a conflict the caller must surface, not silently
      // swallow (cross-bench Start bug — mirrors the Stop guard in bench-ipc.ts).
      return { conflict: this.activeBenchPath !== benchPath };
    }
    this.activeBenchPath = benchPath;
    this.status = "starting";
    this.emit("status", this.status);

    const proc = this.ensureProc("start");
    proc.buffer.clear();

    // argv spawn — no bash, no shell interpolation (E4)
    const env = benchChildEnv();
    const child = spawn("bench", ["start"], {
      cwd: benchPath,
      env,
      shell: false,
      windowsHide: true,
    });
    proc.child = child;

    const onData = (chunk: Buffer | string) => {
      if (proc.child !== child) return; // superseded by a later start()/stop() — ignore this process's events
      const text = String(chunk);
      for (const line of text.split("\n")) {
        if (!line) continue;
        const logLine = proc.buffer.push(line);
        this.emit("log", { process: "start", line: logLine });

        // Heuristic: Frappe prints "Starting watchdog" or serves requests once ready
        if (this.status === "starting" && (line.includes("Serving on") || line.includes("Watching files"))) {
          this.status = "running";
          this.emit("status", this.status);
        }

        // Gap 5 / T6: non-fatal port-conflict warning while otherwise running
        if (line.includes("EADDRINUSE") || line.toLowerCase().includes("failed to bind")) {
          this.emit("warning", { process: "start", message: line.trim() });
        }
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (proc.child !== child) return; // superseded by a later start()/stop() — ignore this process's events
      const failure = classifyBenchFailure(err.code ?? null, err.message, "bench");
      this.status = "failed";
      this.emit("status", this.status);
      // Gap 1 / T6: include logTail so the renderer can show the last output
      this.emit("failure", { process: "start", benchPath, failure, logTail: err.message });
      proc.child = null;
    });

    child.on("close", (code) => {
      if (proc.child !== child) return; // superseded by a later start()/stop() — ignore this process's events
      proc.child = null;
      if (this.status !== "stopped") {
        const lastLines = proc.buffer.all().slice(-20).map((l) => l.text).join("\n");
        const failure = classifyBenchFailure(null, lastLines, "bench start");
        this.status = "failed";
        this.emit("status", this.status);
        // Gap 1 / T6: include logTail so the renderer can show the last output
        this.emit("failure", { process: "start", benchPath, failure, exitCode: code, logTail: lastLines });
      }
    });
    return { conflict: false };
  }

  stop(): void {
    const proc = this.processes.get("start");
    if (proc?.child) {
      // ponytail: SIGTERM kills only the direct child on Windows; use taskkill /T /F /PID if native Windows bench ever lands
      proc.child.kill("SIGTERM");
      proc.child = null;
    }
    this.stopWatcher();
    this.status = "stopped";
    this.activeBenchPath = null;
    this.emit("status", this.status);
  }

  /**
   * Run a one-shot bench command (E4: argv, shell:false; E5: verb allow-list).
   * The call-site (bench-ipc.ts) must verify the verb is in ALLOWED_BENCH_VERBS.
   */
  async runOneShot({ benchPath, site, verb, args = [] }: RunOneShot): Promise<OneShotResult> {
    const argv: string[] = site ? ["--site", site, verb, ...args] : [verb, ...args];
    const env = benchChildEnv();

    return new Promise((resolve) => {
      const chunks: string[] = [];

      const child = spawn("bench", argv, {
        cwd: benchPath,
        env,
        shell: false,
        windowsHide: true,
      });

      const onData = (chunk: Buffer | string) => chunks.push(String(chunk));
      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);

      child.on("error", (err: NodeJS.ErrnoException) => {
        const output = chunks.join("");
        resolve({
          exitCode: 1,
          output,
          failure: classifyBenchFailure(err.code ?? null, err.message, verb),
        });
      });

      child.on("close", (code) => {
        const output = chunks.join("");
        const exitCode = code ?? 1;
        resolve({
          exitCode,
          output,
          failure:
            exitCode !== 0
              ? classifyBenchFailure(null, output, verb)
              : undefined,
        });
      });
    });
  }

  // ── Studio watcher (E21: bounded restart with backoff) ────────────────────

  startWatcher(benchPath: string, site: string): void {
    const key = "watch-studio";
    this.stopWatcher(); // stop any existing watcher first

    const proc = this.ensureProc(key);
    proc.restarts = 0;
    proc.backoffMs = WATCHER_INITIAL_BACKOFF_MS;
    this.spawnWatcher(proc, benchPath, site);
  }

  stopWatcher(): void {
    const proc = this.processes.get("watch-studio");
    if (!proc) return;
    clearTimeout(proc.restartTimer);
    proc.restartTimer = undefined;
    if (proc.child) {
      // ponytail: SIGTERM kills only the direct child on Windows; use taskkill /T /F /PID if native Windows bench ever lands
      proc.child.kill("SIGTERM");
      proc.child = null;
    }
  }

  private spawnWatcher(proc: ManagedProcess, benchPath: string, site: string): void {
    // watch-studio print()s without flushing; on a pipe Python block-buffers, so the Build tab would never see a line.
    const env = { ...benchChildEnv(), PYTHONUNBUFFERED: "1" };
    const child = spawn("bench", ["--site", site, "watch-studio"], {
      cwd: benchPath,
      env,
      shell: false,
      windowsHide: true,
    });
    proc.child = child;

    const onData = (chunk: Buffer | string) => {
      if (proc.child !== child) return; // superseded by a later startWatcher()/stopWatcher() — ignore this process's events
      const text = String(chunk);
      for (const line of text.split("\n")) {
        if (!line) continue;
        const logLine = proc.buffer.push(line);
        this.emit("log", { process: "watch-studio", line: logLine });
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (proc.child !== child) return; // superseded by a later startWatcher()/stopWatcher() — ignore this process's events
      proc.child = null;
      const output = err.message;
      proc.buffer.push(`[error] ${output}`);
      this.emit("watcher:exit", {
        failure: classifyBenchFailure(err.code ?? null, output, "watch-studio"),
        willRetry: false,
      });
    });

    child.on("close", (code) => {
      if (proc.child !== child) return; // superseded by a later startWatcher()/stopWatcher() — ignore this process's events
      proc.child = null;
      const lastOutput = proc.buffer.all().slice(-10).map((l) => l.text).join("\n");
      const failure = classifyBenchFailure(null, lastOutput, "watch-studio");

      const restarts = proc.restarts ?? 0;
      if (restarts < WATCHER_MAX_RESTARTS) {
        const backoff = proc.backoffMs ?? WATCHER_INITIAL_BACKOFF_MS;
        proc.restarts = restarts + 1;
        proc.backoffMs = Math.min(backoff * 2, 30_000);
        this.emit("watcher:exit", { failure, willRetry: true, attempt: proc.restarts, backoffMs: backoff });
        proc.restartTimer = setTimeout(() => {
          this.spawnWatcher(proc, benchPath, site);
        }, backoff);
      } else {
        this.emit("watcher:exit", {
          failure,
          willRetry: false,
          message: `watch-studio exited ${WATCHER_MAX_RESTARTS} times; not restarting`,
        });
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private ensureProc(name: string): ManagedProcess {
    if (!this.processes.has(name)) {
      this.processes.set(name, { name, buffer: new RingBuffer(), child: null });
    }
    return this.processes.get(name)!;
  }
}

/** Singleton supervisor instance used by bench-ipc.ts. */
export const benchSupervisor = new BenchSupervisor();
