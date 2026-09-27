/**
 * Build IPC — registers every `pi-desktop/build/*` channel (T6, T10).
 *
 * Drives the shared BrowserPane (canvas ownership E13) and the bench
 * supervisor's studio watcher. All canvas channels require the build-tab
 * to hold canvas ownership; acquire is a force-acquire (user-initiated
 * surface switch) per the plan's ownership protocol.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { IPC } from "@pi-desktop/shared";
import type { BrowserWindow } from "electron";
import { parseSiteConfig } from "../bench/discovery";
import { benchSupervisor } from "../bench/supervisor";
import type { BrowserPane } from "../browser-view";
import type { IpcRegistrar } from "./types";

export type BuildIpcDependencies = {
  registrar: IpcRegistrar;
  mainWindow: () => BrowserWindow | null;
  browserPane: BrowserPane;
};

export function registerBuildIpc({
  registrar,
  mainWindow,
  browserPane,
}: BuildIpcDependencies): void {
  const { handle } = registrar;

  // ── Forward studio watcher events to the renderer ─────────────────────────

  benchSupervisor.on("log", ({ process: proc, line }: { process: string; line: { ts: number; text: string } }) => {
    if (proc === "watch-studio") {
      mainWindow()?.webContents.send(IPC.event.buildWatcherLog, { line });
    }
  });

  benchSupervisor.on("watcher:exit", (data: unknown) => {
    mainWindow()?.webContents.send(IPC.event.buildWatcherExit, data);
  });

  // ── Build availability: query installed apps ───────────────────────────────

  handle(IPC.invoke.buildListApps, async () => {
    const benchPath = benchSupervisor.activeBenchPath;
    const site = benchSupervisor.activeSite;

    if (!benchPath) {
      return { apps: [], webserverPort: 8000, builderPath: "builder", site: null };
    }

    // Read common_site_config.json for bench-level webserver port
    let webserverPort = 8000;
    let builderPath = "builder";
    try {
      const common = JSON.parse(
        readFileSync(join(benchPath, "sites", "common_site_config.json"), "utf8"),
      ) as Record<string, unknown>;
      const parsed = parseSiteConfig(common);
      if (parsed.webserverPort) webserverPort = parsed.webserverPort;
      if (parsed.builderPath) builderPath = parsed.builderPath;
    } catch {
      // fallback to defaults
    }

    // Site-level config may override builder_path
    if (site) {
      try {
        const raw = JSON.parse(
          readFileSync(join(benchPath, "sites", site, "site_config.json"), "utf8"),
        ) as Record<string, unknown>;
        const parsed = parseSiteConfig(raw);
        if (parsed.builderPath) builderPath = parsed.builderPath;
        if (parsed.webserverPort) webserverPort = parsed.webserverPort;
      } catch {
        // site config absent — use common values
      }
    }

    // Run bench list-apps -f json to get installed app names
    const result = await benchSupervisor.runOneShot({
      benchPath,
      site: site ?? null,
      verb: "list-apps",
      args: ["-f", "json"],
    });

    let apps: string[] = [];
    if (result.exitCode === 0) {
      try {
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        // Output shape: { "<site>": ["frappe", "builder", ...] }
        const values = Object.values(parsed);
        if (values.length > 0 && Array.isArray(values[0])) {
          apps = values[0] as string[];
        }
      } catch {
        // unparseable output — treat as empty
      }
    }

    return {
      apps,
      webserverPort,
      builderPath,
      site,
      error: result.exitCode !== 0 ? result.output.slice(-500) : undefined,
    };
  });

  // ── Canvas ownership (E13) ────────────────────────────────────────────────

  handle(IPC.invoke.buildCanvasAcquire, async () => {
    // Force-acquire: user navigated to Build tab (user-initiated, E13).
    browserPane.forceAcquireCanvas("build-tab");
    return { ok: true, owner: "build-tab" };
  });

  handle(IPC.invoke.buildCanvasRelease, async () => {
    browserPane.setVisible(false);
    browserPane.releaseCanvas("build-tab");
    return { ok: true };
  });

  // ── Canvas navigation & display ──────────────────────────────────────────

  handle(IPC.invoke.buildCanvasNavigate, async (input: { url: string }) => {
    if (browserPane.currentOwner() !== "build-tab") {
      return { ok: false, error: "canvas not owned by build-tab" };
    }
    browserPane.navigate(input.url, null);
    return { ok: true };
  });

  handle(
    IPC.invoke.buildCanvasSetBounds,
    async (bounds: { x: number; y: number; width: number; height: number }) => {
      browserPane.setBounds(bounds);
      return { ok: true };
    },
  );

  handle(IPC.invoke.buildCanvasSetVisible, async (input: { visible: boolean }) => {
    browserPane.setVisible(input.visible);
    return { ok: true };
  });

  handle(IPC.invoke.buildCanvasGetState, async () => {
    return {
      state: browserPane.getState(),
      owner: browserPane.currentOwner(),
    };
  });

  handle(
    IPC.invoke.buildCanvasAction,
    async (input: { action: "back" | "forward" | "reload" | "stop" }) => {
      browserPane.action(input.action);
      return { ok: true };
    },
  );

  // ── Studio watcher (E21) ─────────────────────────────────────────────────

  handle(IPC.invoke.buildStartWatcher, async () => {
    const benchPath = benchSupervisor.activeBenchPath;
    const site = benchSupervisor.activeSite;
    if (!benchPath || !site) {
      return { ok: false, error: "No active bench/site" };
    }
    benchSupervisor.startWatcher(benchPath, site);
    return { ok: true };
  });

  handle(IPC.invoke.buildStopWatcher, async () => {
    benchSupervisor.stopWatcher();
    return { ok: true };
  });

  // ── Builder "Sync files → site" (T6) ────────────────────────────────────

  handle(IPC.invoke.buildSync, async () => {
    const benchPath = benchSupervisor.activeBenchPath;
    const site = benchSupervisor.activeSite;
    if (!benchPath || !site) {
      return { exitCode: 1, output: "No active bench/site" };
    }
    // Bypass ALLOWED_BENCH_VERBS — this is an internal UI path, not an agent
    // tool call. The execute call is intentional (sync_standard_builder_pages
    // is a read-only sync from builder_files to DB).
    return benchSupervisor.runOneShot({
      benchPath,
      site,
      verb: "execute",
      args: ["builder.export_import_standard_page.sync_standard_builder_pages"],
    });
  });

  // ── Studio precondition checks ───────────────────────────────────────────

  handle(IPC.invoke.buildCheckDeveloperMode, async () => {
    const benchPath = benchSupervisor.activeBenchPath;
    const site = benchSupervisor.activeSite;
    if (!benchPath || !site) return { developerMode: false };
    try {
      const raw = JSON.parse(
        readFileSync(join(benchPath, "sites", site, "site_config.json"), "utf8"),
      ) as Record<string, unknown>;
      const config = parseSiteConfig(raw);
      return { developerMode: config.developerMode === true };
    } catch {
      return { developerMode: false };
    }
  });

  handle(IPC.invoke.buildCheckWatchdog, async () => {
    const benchPath = benchSupervisor.activeBenchPath;
    if (!benchPath) return { ok: false };
    const pythonBin = join(benchPath, "env", "bin", "python");
    return new Promise<{ ok: boolean }>((resolve) => {
      const child = spawn(pythonBin, ["-c", "import watchdog"], {
        shell: false,
        windowsHide: true,
      });
      const timer = setTimeout(() => {
        child.kill();
        resolve({ ok: false });
      }, 5_000);
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ ok: code === 0 });
      });
      child.on("error", () => {
        clearTimeout(timer);
        resolve({ ok: false });
      });
    });
  });
}
