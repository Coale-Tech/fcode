/**
 * Managed local Hindsight server supervisor.
 *
 * Detects available launchers (hindsight-api binary, uvx, docker) and
 * starts/stops a locally installed Hindsight API server on demand.
 * Does NOT install anything; the user must install separately.
 *
 * Mirrors bench/supervisor.ts: EventEmitter, argv spawn (no shell),
 * process-supersede guard on stale child events.
 *
 * LLM key note: the Hindsight server manages its own LLM config via
 * ~/.hindsight/config.toml. If the server exits immediately with an LLM key
 * error, state becomes "unavailable" with the relevant message. Fcode cannot
 * inject the session model's credentials into the standalone subprocess.
 */

import { EventEmitter } from "node:events";
import { spawn, execFile } from "node:child_process";
import { get as httpGet } from "node:http";
import type { ChildProcess } from "node:child_process";
import type { HindsightLocalLauncher, HindsightLocalState } from "@pi-desktop/shared";

// ── Constants ─────────────────────────────────────────────────────────────────

export const HINDSIGHT_DEFAULT_PORT = 8888;

/** How long (ms) to wait for the HTTP probe before treating it as not ready. */
const PROBE_TIMEOUT_MS = 2_000;

/** How frequently (ms) to probe for "server is ready" after spawning. */
const PROBE_INTERVAL_MS = 2_000;

/** Give up probing after this many ms; mark as failed. */
const PROBE_MAX_WAIT_MS = 30_000;

/** If the process exits within this many ms, check for an LLM key error. */
const FAST_EXIT_MS = 5_000;

/** Ring buffer capacity for log lines. */
const LOG_RING_SIZE = 2_000;

// ── LLM detection ─────────────────────────────────────────────────────────────

const LLM_KEY_PATTERNS = [
  /api[_-]key/i,
  /OPENAI_API_KEY/i,
  /llm.*key/i,
  /no.*model/i,
  /missing.*key/i,
  /ANTHROPIC_API_KEY/i,
];

// ── Start command builder ─────────────────────────────────────────────────────

/** Detection order: binary first (fastest), then uvx, then docker. */
const LAUNCHER_ORDER: HindsightLocalLauncher[] = ["binary", "uvx", "docker"];

/**
 * ponytail: these commands are best-effort guesses based on the typical
 * FastAPI/CLI pattern for `hindsight-api`. Upgrade: let the user override
 * the launch command in Settings if the actual CLI differs.
 */
function buildLaunchArgv(launcher: HindsightLocalLauncher, port: number): { cmd: string; args: string[] } {
  switch (launcher) {
    case "binary":
      return { cmd: "hindsight-api", args: ["--port", String(port)] };
    case "uvx":
      return { cmd: "uvx", args: ["hindsight-api", "--port", String(port)] };
    case "docker":
      // ponytail: image tag is a guess; update when Hindsight publishes a stable image URI
      return {
        cmd: "docker",
        args: ["run", "--rm", "-p", `${port}:${port}`, "ghcr.io/vectorize-io/hindsight-api:latest", "--port", String(port)],
      };
  }
}

// ── Log ring buffer ───────────────────────────────────────────────────────────

interface LogLine {
  seq: number;
  text: string;
}

class RingBuffer {
  private readonly buf: LogLine[] = [];
  private seq = 0;

  push(text: string): LogLine {
    const line: LogLine = { seq: this.seq++, text };
    if (this.buf.length >= LOG_RING_SIZE) this.buf.shift();
    this.buf.push(line);
    return line;
  }

  all(): readonly LogLine[] {
    return this.buf;
  }

  clear(): void {
    this.buf.length = 0;
  }

  tail(n: number): string {
    return this.buf
      .slice(-n)
      .map((l) => l.text)
      .join("\n");
  }
}

// ── Supervisor ────────────────────────────────────────────────────────────────

export class HindsightSupervisor extends EventEmitter {
  private _state: HindsightLocalState = { launchers: [], state: "stopped" };
  private child: ChildProcess | null = null;
  private buffer = new RingBuffer();
  private probeTimer: ReturnType<typeof setTimeout> | undefined;
  private probeStart = 0;

  getState(): HindsightLocalState {
    return { ...this._state };
  }

  /**
   * Detect which launchers are available on PATH. Updates `state.launchers`
   * and emits a `status` event.
   */
  async detect(): Promise<HindsightLocalLauncher[]> {
    const whichCmd = process.platform === "win32" ? "where" : "which";
    const cmdForLauncher: Record<HindsightLocalLauncher, string> = {
      binary: "hindsight-api",
      uvx: "uvx",
      docker: "docker",
    };

    const results = await Promise.all(
      LAUNCHER_ORDER.map((launcher) => {
        const { promise, resolve } = Promise.withResolvers<boolean>();
        execFile(whichCmd, [cmdForLauncher[launcher]], { timeout: 3_000 }, (err) => resolve(!err));
        return promise.then((found) => ({ launcher, found }));
      }),
    );

    const launchers = results.filter((r) => r.found).map((r) => r.launcher);
    this._setState({ ...this._state, launchers });
    return launchers;
  }

  /**
   * Start the local Hindsight server on `port`. Picks the first available
   * launcher. Re-detects if launcher list is empty.
   */
  async start(port: number = HINDSIGHT_DEFAULT_PORT): Promise<void> {
    if (this._state.state === "starting" || this._state.state === "running") return;

    let launchers = this._state.launchers;
    if (launchers.length === 0) launchers = await this.detect();

    if (launchers.length === 0) {
      this._setState({
        launchers,
        state: "unavailable",
        message: "No launcher found. Install hindsight-api, uvx, or docker first.",
      });
      return;
    }

    const { cmd, args } = buildLaunchArgv(launchers[0], port);

    this._setState({ launchers, state: "starting", port, message: undefined });
    this.buffer.clear();

    const child = spawn(cmd, args, { env: { ...process.env }, shell: false, windowsHide: true });
    this.child = child;

    const spawnedAt = Date.now();
    const collected: string[] = [];

    const onData = (chunk: Buffer | string) => {
      if (this.child !== child) return;
      const text = String(chunk);
      collected.push(text);
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        const logLine = this.buffer.push(line);
        this.emit("log", logLine);
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (this.child !== child) return;
      this.child = null;
      this._clearProbe();
      this._setState({
        ...this._state,
        state: "unavailable",
        message: err.code === "ENOENT" ? `${cmd}: command not found` : err.message,
      });
    });

    child.on("close", (code) => {
      if (this.child !== child) return;
      this.child = null;
      this._clearProbe();

      if (this._state.state === "stopped") return; // intentional stop

      const output = collected.join("");
      const elapsed = Date.now() - spawnedAt;

      if (elapsed < FAST_EXIT_MS && LLM_KEY_PATTERNS.some((re) => re.test(output))) {
        const snippet = this.buffer.tail(5).slice(0, 300);
        this._setState({
          ...this._state,
          state: "unavailable",
          // i18n note: this message is also shown raw in MemoryTab; keep it short
          message: `Hindsight needs an LLM API key. Configure ~/.hindsight/config.toml. (${snippet || `exit ${code ?? "?"}`})`,
        });
      } else {
        this._setState({
          ...this._state,
          state: "failed",
          message: `exited with code ${code ?? "?"}`,
        });
      }
    });

    // Start probing for readiness
    this.probeStart = Date.now();
    this._scheduleProbe(port);
  }

  /** Stop the supervised server. */
  stop(): void {
    this._clearProbe();
    if (this.child) {
      this.child.kill("SIGTERM");
      this.child = null;
    }
    this._setState({ ...this._state, state: "stopped", message: undefined });
  }

  // ── Probe loop ─────────────────────────────────────────────────────────────

  private _scheduleProbe(port: number): void {
    this.probeTimer = setTimeout(() => {
      void this._probe(port);
    }, PROBE_INTERVAL_MS);
  }

  private async _probe(port: number): Promise<void> {
    if (this._state.state !== "starting") return;

    if (Date.now() - this.probeStart > PROBE_MAX_WAIT_MS) {
      if (this.child) {
        this.child.kill("SIGTERM");
        this.child = null;
      }
      this._setState({ ...this._state, state: "failed", message: "timed out waiting for server to become ready" });
      return;
    }

    const ready = await probeHttp(`http://localhost:${port}/v1/default/banks`, PROBE_TIMEOUT_MS);
    if (this._state.state !== "starting") return; // state changed while probing

    if (ready) {
      this._setState({ ...this._state, state: "running" });
    } else {
      this._scheduleProbe(port);
    }
  }

  private _clearProbe(): void {
    if (this.probeTimer !== undefined) {
      clearTimeout(this.probeTimer);
      this.probeTimer = undefined;
    }
  }

  private _setState(next: HindsightLocalState): void {
    this._state = next;
    this.emit("status", this.getState());
  }
}

// ── HTTP probe ────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget GET; resolves true on any response (server is up),
 * false on network error or timeout. Used to detect subprocess readiness.
 */
function probeHttp(url: string, timeoutMs: number): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>();
  const timer = setTimeout(() => resolve(false), timeoutMs);
  const req = httpGet(url, (res) => {
    res.resume();
    clearTimeout(timer);
    resolve(true);
  });
  req.on("error", () => {
    clearTimeout(timer);
    resolve(false);
  });
  req.setTimeout(timeoutMs, () => {
    req.destroy();
    clearTimeout(timer);
    resolve(false);
  });
  return promise;
}

/** Singleton used by hindsight-local-ipc.ts. */
export const hindsightSupervisor = new HindsightSupervisor();
