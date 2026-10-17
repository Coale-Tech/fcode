/**
 * Build tab — Studio and Builder canvases over a supervised local bench.
 *
 * Interaction states (T6, plan Pass-2 table):
 *
 * Build availability (Studio/Builder switch):
 *   LOADING  skeleton while list-apps runs
 *   EMPTY    neither app installed — both halves disabled with install commands
 *   ERROR    list-apps failed — message + Retry
 *   SUCCESS  apps installed — switch halves enabled
 *   PARTIAL  one installed, one not
 *
 * Build canvas:
 *   LOADING  skeleton + 15s escalation → note in control strip
 *   EMPTY    bench stopped → "Start bench" CTA
 *   ERROR    navigate failure → URL + status + Reload
 *   SUCCESS  canvas visible (Frappe login page is labelled expected)
 *
 * Studio live sync:
 *   LOADING  "watch-studio starting…" in control strip
 *   ERROR    exit → preconditions checklist shows failing link
 *   SUCCESS  ● watching + last import time
 *   PARTIAL  watching but developer_mode off → amber note
 *
 * Builder sync:
 *   LOADING  button → spinner + canvas dimmed
 *   ERROR    non-zero exit → tail + Copy
 *   SUCCESS  re-navigate + "Synced to site"
 *
 * T14 a11y: the canvas is an opaque embedded site — announce focus via
 * aria-live so screen-reader users know they entered a web page.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { IPC, type Result } from "@pi-desktop/shared";
import { buildChecks, checksFor, failing } from "../lib/build-checks";
import { useAppStore } from "../stores/app-store";
import { Button, SegmentedControl } from "../components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

type Canvas = "studio" | "builder";
type BenchStatus = "stopped" | "starting" | "running" | "failed";
type WatcherStatus = "stopped" | "starting" | "running" | "failed";
type SyncStatus = "idle" | "loading" | "success" | "error";
type ListAppsStatus = "loading" | "loaded" | "error";

// ── IPC helper ────────────────────────────────────────────────────────────────

async function invoke<T>(channel: string, args?: unknown): Promise<T> {
  const bridge = window.piDesktop;
  if (!bridge) throw new Error("piDesktop bridge unavailable");
  const result: Result<T> = await bridge.invoke<T>(channel, args);
  if (!result.ok) throw new Error(result.error.message ?? "IPC call failed");
  return result.data;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BuildPage() {
  const [canvas, setCanvas] = useState<Canvas>("studio");
  const setPage = useAppStore((s) => s.setPage);
  const viewedBenchPath = useAppStore((s) => s.viewedBenchPath);

  // Bench status (polled every 2s)
  const [benchStatus, setBenchStatus] = useState<BenchStatus>("stopped");
  const [benchPath, setBenchPath] = useState<string | null>(null);
  const [site, setSite] = useState<string | null>(null);
  // Check keys whose banner the user dismissed; pruned once the check recovers.
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  // Build availability — installed apps query
  const [listAppsStatus, setListAppsStatus] = useState<ListAppsStatus>("loading");
  const [installedApps, setInstalledApps] = useState<string[]>([]);
  const [listAppsError, setListAppsError] = useState<string | null>(null);
  const [webserverPort, setWebserverPort] = useState(8000);
  const [builderPath, setBuilderPath] = useState("builder");

  // Canvas state
  const [canvasNavigating, setCanvasNavigating] = useState(false);
  const [canvasTimedOut, setCanvasTimedOut] = useState(false);
  const [canvasOwned, setCanvasOwned] = useState(false);
  const [canvasFocused, setCanvasFocused] = useState(false);
  const [agentUsingCanvas, setAgentUsingCanvas] = useState(false);

  // Studio watcher
  const [watcherStatus, setWatcherStatus] = useState<WatcherStatus>("stopped");
  const [watcherLastImport, setWatcherLastImport] = useState<string | null>(null);

  // Studio preconditions (checked when bench running + studio installed)
  const [developerMode, setDeveloperMode] = useState<boolean | null>(null);
  const [watchdogOk, setWatchdogOk] = useState<boolean | null>(null);

  // Builder sync
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // Canvas area ref for bounds reporting
  const canvasAreaRef = useRef<HTMLDivElement>(null);

  // ── Bench status polling ──────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      // Capture-rig override: mirrors the same pattern as BenchPage/use-bench-context.
      const override = window.__PI_BENCH_OVERRIDE__;
      if (override !== undefined && override !== null) {
        if (!cancelled) {
          setBenchStatus(override.status as BenchStatus);
          setBenchPath(override.benchPath);
          setSite(override.site);
        }
        return;
      }
      try {
        const s = await invoke<{ status: BenchStatus; benchPath: string | null; site: string | null }>(IPC.invoke.benchStatus);
        if (!cancelled) {
          setBenchStatus(s.status);
          setBenchPath(s.benchPath);
          setSite(s.site);
        }
      } catch { /* ignore */ }
    };
    const onBenchUpdate = () => { void poll(); };
    document.addEventListener("pi:bench-update", onBenchUpdate);
    poll();
    const id = setInterval(poll, 2_000);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("pi:bench-update", onBenchUpdate);
    };
  }, []);

  // ── List apps when bench becomes running ─────────────────────────────────

  const loadApps = useCallback(async () => {
    setListAppsStatus("loading");
    setListAppsError(null);
    // Capture-rig: seed Studio + Builder as installed so the sidebar shows ● green dots.
    if (window.__PI_CAPTURE__) {
      setInstalledApps(["studio", "builder", "frappe", "erpnext", "hrms", "raven"]);
      setWebserverPort(8000);
      setBuilderPath("builder");
      setListAppsStatus("loaded");
      return;
    }
    try {
      const data = await invoke<{
        apps: string[];
        webserverPort: number;
        builderPath: string;
        error?: string;
      }>(IPC.invoke.buildListApps);
      if (data.error) {
        setListAppsStatus("error");
        setListAppsError(data.error);
      } else {
        setInstalledApps(data.apps);
        setWebserverPort(data.webserverPort ?? 8000);
        setBuilderPath(data.builderPath ?? "builder");
        setListAppsStatus("loaded");
      }
    } catch (err: unknown) {
      setListAppsStatus("error");
      setListAppsError(err instanceof Error ? err.message : "Failed to list apps");
    }
  }, []);

  useEffect(() => {
    const pathForDetail = benchPath ?? viewedBenchPath;
    if (benchStatus === "running") {
      void loadApps();
    } else if (pathForDetail) {
      // Bench stopped but known: read app names from disk so the sidebar shows real apps.
      invoke<{ apps: Array<{ name: string; version: string }> }>(IPC.invoke.benchDetail, { benchPath: pathForDetail })
        .then(({ apps }) => {
          setInstalledApps(apps.map((a) => a.name));
          setListAppsStatus("loaded");
        })
        .catch(() => {
          setInstalledApps([]);
          setListAppsStatus("loading");
        });
    } else {
      setListAppsStatus("loading");
      setInstalledApps([]);
    }
  }, [benchStatus, benchPath, viewedBenchPath, loadApps]);

  // ── Studio preconditions ─────────────────────────────────────────────────

  useEffect(() => {
    if (benchStatus !== "running" || !installedApps.includes("studio")) return;
    // Capture-rig: seed dev mode = false (shows "developer_mode is off" banner like reference).
    if (window.__PI_CAPTURE__) {
      setDeveloperMode(false);
      setWatchdogOk(true);
      return;
    }
    // Check developer_mode and watchdog in parallel
    void invoke<{ developerMode: boolean }>(IPC.invoke.buildCheckDeveloperMode)
      .then((r) => setDeveloperMode(r.developerMode))
      .catch(() => setDeveloperMode(false));
    void invoke<{ ok: boolean }>(IPC.invoke.buildCheckWatchdog)
      .then((r) => setWatchdogOk(r.ok))
      .catch(() => setWatchdogOk(false));
  }, [benchStatus, installedApps]);

  // ── Canvas acquisition + navigation ─────────────────────────────────────

  const canvasUrl = benchStatus === "running"
    ? canvas === "studio"
      ? `http://localhost:${webserverPort}/studio`
      : `http://localhost:${webserverPort}/${builderPath}`
    : null;

  // Acquire canvas and set initial bounds on mount (skip in capture mode — no live canvas).
  useEffect(() => {
    if (window.__PI_CAPTURE__) return;
    void invoke(IPC.invoke.buildCanvasAcquire).then(() => setCanvasOwned(true));
    return () => {
      void invoke(IPC.invoke.buildCanvasRelease);
      void invoke(IPC.invoke.buildStopWatcher);
      setCanvasOwned(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigate when URL changes
  useEffect(() => {
    if (!canvasOwned || !canvasUrl) return;
    setCanvasNavigating(true);
    setCanvasTimedOut(false);
    void invoke(IPC.invoke.buildCanvasNavigate, { url: canvasUrl });
    void invoke(IPC.invoke.buildCanvasSetVisible, { visible: true });
    // 15s escalation — show a note in the control strip
    const timer = setTimeout(() => setCanvasTimedOut(true), 15_000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasOwned, canvasUrl]);

  // Track canvas loading via browserState events
  useEffect(() => {
    const bridge = window.piDesktop;
    if (!bridge) return;
    const off = bridge.on(IPC.event.browserState, (data: unknown) => {
      // Only react when build-tab owns the canvas.
      // `isLoading: false` means the page settled (success or error).
      if (data !== null && typeof data === "object" && "isLoading" in data) {
        const isLoading = data.isLoading; // narrowed to unknown by `in`
        if (isLoading === false) {
          setCanvasNavigating(false);
          setCanvasTimedOut(false);
        }
      }
    });
    return () => off?.();
  }, []);

  // Track agent canvas takeover via browserCanvasOwner events (E13)
  useEffect(() => {
    const bridge = window.piDesktop;
    if (!bridge) return;
    const off = bridge.on(IPC.event.browserCanvasOwner, (data: unknown) => {
      const owner =
        data !== null && typeof data === "object" && "owner" in data
          ? (data.owner as string | null)
          : null;
      setAgentUsingCanvas(owner === "agent");
    });
    return () => off?.();
  }, []);

  // ── Canvas bounds + resize ────────────────────────────────────────────────

  useEffect(() => {
    const surface = canvasAreaRef.current;
    if (!surface || !canvasOwned) return;
    let frame = 0;
    const report = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = surface.getBoundingClientRect();
        void invoke(IPC.invoke.buildCanvasSetBounds, {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      });
    };
    const observer = new ResizeObserver(report);
    observer.observe(surface);
    window.addEventListener("resize", report);
    report();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", report);
    };
  }, [canvasOwned]);

  // Show/hide canvas based on bench + app availability
  useEffect(() => {
    if (!canvasOwned) return;
    const appKey = canvas === "studio" ? "studio" : "builder";
    const shouldShow =
      benchStatus === "running" &&
      listAppsStatus === "loaded" &&
      installedApps.includes(appKey);
    void invoke(IPC.invoke.buildCanvasSetVisible, { visible: shouldShow });
  }, [canvasOwned, benchStatus, listAppsStatus, installedApps, canvas]);

  // ── Studio watcher ───────────────────────────────────────────────────────

  // Start watcher when on Studio canvas + bench running + studio installed
  useEffect(() => {
    const shouldWatch =
      canvas === "studio" &&
      benchStatus === "running" &&
      listAppsStatus === "loaded" &&
      installedApps.includes("studio");

    if (shouldWatch) {
      setWatcherStatus("starting");
      void invoke(IPC.invoke.buildStartWatcher).catch(() => setWatcherStatus("failed"));
    } else {
      setWatcherStatus("stopped");
      void invoke(IPC.invoke.buildStopWatcher);
    }
    return () => {
      if (canvas === "studio") void invoke(IPC.invoke.buildStopWatcher);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, benchStatus, listAppsStatus, installedApps]);

  // Subscribe to watcher log events
  useEffect(() => {
    const bridge = window.piDesktop;
    if (!bridge) return;
    const offLog = bridge.on(IPC.event.buildWatcherLog, (data: unknown) => {
      if (data !== null && typeof data === "object" && "line" in data) {
        const line = data.line; // unknown
        if (
          line !== null &&
          typeof line === "object" &&
          "text" in line &&
          typeof line.text === "string"
        ) {
          const text = line.text;
          // Exact lines printed by studio/watch.py: "watching N studio folder(s) …", "synced <doctype> from <file>".
          if (text.includes("] watching ")) setWatcherStatus("running");
          if (text.includes("] synced ")) {
            setWatcherStatus("running");
            setWatcherLastImport(new Date().toLocaleTimeString());
          }
        }
      }
    });
    const offExit = bridge.on(IPC.event.buildWatcherExit, (data: unknown) => {
      const willRetry =
        data !== null &&
        typeof data === "object" &&
        "willRetry" in data &&
        data.willRetry === true;
      setWatcherStatus(willRetry ? "starting" : "failed");
    });
    return () => {
      offLog?.();
      offExit?.();
    };
  }, []);

  // ── Builder sync ──────────────────────────────────────────────────────────

  const doSync = useCallback(async () => {
    setSyncStatus("loading");
    setSyncError(null);
    setSyncMsg(null);
    try {
      const result = await invoke<{ exitCode: number; output: string }>(
        IPC.invoke.buildSync,
      );
      if (result.exitCode === 0) {
        setSyncStatus("success");
        setSyncMsg("Synced to site");
        // Re-navigate to refresh the canvas
        if (canvasUrl) {
          void invoke(IPC.invoke.buildCanvasNavigate, { url: canvasUrl });
        }
        setTimeout(() => setSyncStatus("idle"), 3_000);
      } else {
        setSyncStatus("error");
        setSyncError(result.output.slice(-300));
      }
    } catch (err: unknown) {
      setSyncStatus("error");
      setSyncError(err instanceof Error ? err.message : "Sync failed");
    }
  }, [canvasUrl]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const studioInstalled = installedApps.includes("studio");
  const builderInstalled = installedApps.includes("builder");

  const allChecks = buildChecks({
    benchRunning: benchStatus === "running",
    appsLoaded: listAppsStatus === "loaded",
    studioInstalled,
    developerMode,
    watchdogOk,
    site,
  });
  const checks = checksFor(canvas, allChecks);
  const problems = failing(checks);
  const firstProblem = problems[0];
  // Bench-down is communicated through the canvas empty-state overlay (Start bench CTA).
  // Suppressing the "bench" key banner avoids a redundant red banner in stopped state.
  const showBanner = firstProblem !== undefined && !dismissed.includes(firstProblem.key) && firstProblem.key !== "bench";
  const benchDown = allChecks[0].state === "fail";
  // Use supervisor benchPath when running; fall back to last-viewed bench from store.
  const effectiveBenchPath = benchPath ?? viewedBenchPath;
  const benchName = effectiveBenchPath?.split(/[\\/]/).filter(Boolean).pop() ?? null;
  const problemKeys = problems.map((p) => p.key).join(",");
  useEffect(() => {
    setDismissed((d) => d.filter((k) => problemKeys.split(",").includes(k)));
  }, [problemKeys]);

  const goBench = () => setPage("bench");
  const copyRemedy = async (cmd: string) => {
    await navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1_500);
  };

  const handleReload = () => {
    void invoke(IPC.invoke.buildCanvasAction, { action: "reload" });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const benchBadge = BENCH_BADGES[benchStatus];
  const watcherHue = watcherStatus === "running" ? "green" : watcherStatus === "failed" ? "red" : "amber";

  const otherApps = installedApps.filter((a) => a !== "studio" && a !== "builder");

  return (
    <main className="wb-page build-page" aria-label="Build">
      {/* Direction D: Left sidebar — bench hero card + Studio Apps / Other Apps list */}
      <aside className="context-sidebar">
        {/* Bench hero card */}
        <div className="wb-panel d-panel" style={{ flexShrink: 0 }}>
          <div className="wb-island-hd" style={{ height: 32, padding: "0 8px 0 10px" }}>
            <span className="wb-island-title wb-truncate" style={{ fontSize: 13 }}>
              {benchName ?? "No bench"}
            </span>
          </div>
          <div className="wb-build-hero-body">
            <div className="wb-build-hero-row">
              <span className={`wb-dot wb-dot-${benchBadge.hue}`} aria-hidden="true" />
              <span className="wb-build-hero-name">{site ?? benchName ?? "—"}</span>
              <span className={`wb-badge wb-badge-${benchBadge.hue}`} style={{ flexShrink: 0 }}>
                {benchBadge.label}
              </span>
            </div>
            <div className="wb-build-meta">
              {benchStatus === "running" && (
                <span className="wb-build-meta-row">
                  <span aria-hidden="true">↕</span>
                  Port :{webserverPort ?? 8000}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* App list: Studio Apps + Other Apps */}
        <div className="wb-panel d-panel" style={{ flex: 1, overflow: "hidden" }}>
          <div className="wb-app-section">Studio Apps</div>
          {(["studio", "builder"] as const).map((app) => {
            const installed = installedApps.includes(app);
            return (
              <button
                key={app}
                type="button"
                className={`wb-app-row${canvas === app && installed ? " is-selected" : ""}${!installed ? " is-muted" : ""}`}
                onClick={() => { if (installed) setCanvas(app as Canvas); }}
                disabled={!installed || listAppsStatus !== "loaded"}
                title={!installed ? `${app} not installed` : undefined}
              >
                <span className={`wb-dot wb-dot-${installed ? "green" : "gray"}`} aria-hidden="true" />
                {app}
                {!installed && <span className="wb-muted" style={{ marginLeft: "auto", fontSize: 11 }}>not installed</span>}
              </button>
            );
          })}
          {otherApps.length > 0 && (
            <>
              <div className="wb-app-section is-sep">Other Apps</div>
              {otherApps.map((app) => (
                <div key={app} className="wb-app-row is-muted">
                  <span className="wb-dot wb-dot-gray" aria-hidden="true" />
                  {app}
                </div>
              ))}
            </>
          )}
          {listAppsStatus === "loading" && (
            <p className="wb-sidebar-note" style={{ padding: "8px 10px", fontSize: 11, color: "var(--ink-gray-5)" }}>
              {benchStatus !== "running" ? "Bench not running" : "Checking installed apps…"}
            </p>
          )}
          {listAppsStatus === "error" && (
            <p className="wb-sidebar-note" style={{ padding: "8px 10px", fontSize: 11, color: "var(--ink-red-8)" }}>
              Could not read installed apps.
            </p>
          )}
        </div>
      </aside>

      <section className="island">
        {/* Direction D: "Build" title header (not bench name) */}
        <div className="build-hd">
          <span className="build-title">Build</span>
          {site && <span className="wb-note wb-muted" style={{ fontSize: 11 }}>{site}</span>}
          {benchStatus === "running" && (
            <span className="wb-note wb-muted" style={{ fontSize: 11 }}>:{webserverPort}</span>
          )}
          <span className={`wb-badge wb-badge-${benchBadge.hue}`}>
            <span className={`wb-dot wb-dot-${benchBadge.hue}`} aria-hidden="true" />
            {benchBadge.label}
          </span>
          <span className="wb-spacer" />
          {benchDown ? (
            <Button variant="primary" size="sm" onClick={goBench}>
              Start bench
            </Button>
          ) : problems.length > 0 ? (
            <Button variant="primary" size="sm" onClick={() => setDismissed([])}>
              Fix {problems.length} issue{problems.length === 1 ? "" : "s"}
            </Button>
          ) : canvas === "builder" ? (
            <Button
              variant="primary"
              size="sm"
              disabled={syncStatus === "loading" || !builderInstalled || benchStatus !== "running"}
              onClick={() => void doSync()}
              aria-label="Sync Builder files to site database"
            >
              {syncStatus === "loading" ? "Syncing…" : "Sync files → site"}
            </Button>
          ) : null}
        </div>

        {/* Direction D: SegmentedControl (Studio | Builder) + Reload */}
        <div className="wb-tabs">
          <SegmentedControl
            value={canvas}
            onChange={(v) => setCanvas(v as Canvas)}
            options={[
              {
                value: "studio",
                label: "Studio",
                id: "canvas-tab-studio",
                controls: "canvas-region",
              },
              {
                value: "builder",
                label: "Builder",
                id: "canvas-tab-builder",
                controls: "canvas-region",
              },
            ]}
            label="Canvas"
            role="tablist"
            disabled={listAppsStatus === "loading"}
          />
          <span className="wb-spacer" />

          {/* Agent is actively driving the shared canvas (E13) */}
          {agentUsingCanvas && (
            <span className="wb-note wb-text-amber" role="status" aria-live="polite">
              ⚡ Agent is using this canvas
            </span>
          )}

          {/* Canvas 15s timeout note */}
          {canvasTimedOut && (
            <span className="wb-note wb-text-amber" aria-live="polite">
              Still loading — the site may not be running.{" "}
              {benchStatus !== "running" && (
                <button type="button" className="wb-link-btn" onClick={() => setPage("bench")}>
                  Start bench
                </button>
              )}
            </span>
          )}

          {/* Canvas navigating indicator */}
          {canvasNavigating && !canvasTimedOut && (
            <span className="wb-note wb-muted" aria-live="polite" aria-busy="true">Loading…</span>
          )}

          <Button
            variant="ghost"
            size="sm"
            disabled={benchStatus !== "running"}
            onClick={handleReload}
            aria-label="Reload canvas"
          >
            ⟳ Reload
          </Button>
        </div>

        {/* Problem banner: framed inset block per design .d-banner */}
        {showBanner && (
          <div className={`build-banner ${firstProblem.key === "bench" ? "is-red" : "is-amber"}`} role="alert">
            <strong>{firstProblem.problem}</strong>
            <code className="build-banner-cmd">{firstProblem.remedy}</code>
            <Button variant="ghost" size="sm" onClick={() => void copyRemedy(firstProblem.remedy)}>
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDismissed((d) => [...d, firstProblem.key])}>
              Dismiss
            </Button>
          </div>
        )}

        {/* ── Canvas area ───────────────────────────────────────────────────── */}
        {/* T14 a11y: announce canvas focus */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {canvasFocused ? `${canvas === "studio" ? "Studio" : "Builder"} canvas focused` : ""}
        </div>

        <div
          ref={canvasAreaRef}
          className="wb-canvas"
          role="region"
          aria-label={`${canvas === "studio" ? "Studio" : "Builder"} canvas`}
          onFocus={() => setCanvasFocused(true)}
          onBlur={() => setCanvasFocused(false)}
        >
          {/* Renderer-side overlays (shown when canvas WebContentsView is hidden) */}
          <CanvasOverlay
            canvas={canvas}
            benchStatus={benchStatus}
            listAppsStatus={listAppsStatus}
            listAppsError={listAppsError}
            studioInstalled={studioInstalled}
            builderInstalled={builderInstalled}
            syncDimmed={syncStatus === "loading"}
            onRetryApps={() => void loadApps()}
            onGoBench={goBench}
          />
        </div>

        {/* Status bar: watcher / sync state left, the four checks right */}
        <div className="wb-strip build-status">
          <div role="toolbar" aria-label="Build controls" className="wb-strip-row build-control-strip">
            {listAppsStatus === "loading" && benchStatus === "running" && (
              <span className="wb-note wb-muted" aria-live="polite">Checking installed apps…</span>
            )}
            {listAppsStatus === "error" && (
              <span className="wb-note wb-text-red" aria-live="polite">
                Could not read installed apps.{" "}
                <button type="button" className="wb-link-btn" onClick={() => void loadApps()}>Retry</button>
              </span>
            )}

            {/* Watcher status (Studio) */}
            {canvas === "studio" && watcherStatus !== "stopped" && (
              <span className="wb-note" aria-live="polite">
                <span className={`wb-dot wb-dot-${watcherHue}`} aria-hidden="true" />
                {watcherStatus === "starting" && "watch-studio starting…"}
                {watcherStatus === "running" && `watching${watcherLastImport ? ` · last import ${watcherLastImport}` : ""}`}
                {watcherStatus === "failed" && "watch-studio stopped"}
              </span>
            )}

            {/* Sync status (Builder) */}
            {canvas === "builder" && syncStatus === "success" && syncMsg && (
              <span className="wb-note wb-text-green" aria-live="polite">{syncMsg}</span>
            )}
            {canvas === "builder" && listAppsStatus === "loaded" && (
              <span className="wb-note wb-muted">Files are the source; sync to apply</span>
            )}

            <span className="wb-spacer" />

            <ul className="build-checks" aria-label="Build checks">
              {checks.map((c) => (
                <li key={c.key} className={`build-check is-${c.state}`}>
                  <span
                    className={`wb-dot wb-dot-${c.state === "ok" ? "green" : c.state === "fail" ? "red" : "gray"}`}
                    aria-hidden="true"
                  />
                  {c.short}
                  <span className="sr-only">: {c.state}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Sync error */}
          {canvas === "builder" && syncStatus === "error" && syncError && (
            <div className="wb-failure" role="alert">
              <span className="wb-failure-title">Sync failed.</span>
              <pre className="wb-pre">{syncError}</pre>
              <button type="button" className="wb-link-btn" onClick={() => setSyncStatus("idle")}>
                Dismiss
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

// ── Canvas overlay sub-component ─────────────────────────────────────────────

function CanvasOverlay({
  canvas,
  benchStatus,
  listAppsStatus,
  listAppsError,
  studioInstalled,
  builderInstalled,
  syncDimmed,
  onRetryApps,
  onGoBench,
}: {
  canvas: Canvas;
  benchStatus: BenchStatus;
  listAppsStatus: ListAppsStatus;
  listAppsError: string | null;
  studioInstalled: boolean;
  builderInstalled: boolean;
  syncDimmed: boolean;
  onRetryApps: () => void;
  /** Navigate to bench page so user can start the bench. */
  onGoBench: () => void;
}) {
  // Bench not running → Direction D: icon + help text + Start bench CTA
  if (benchStatus !== "running") {
    return (
      <div className="wb-overlay">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ink-gray-3)" strokeWidth="1.5" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="m10 8 6 4-6 4V8z"/>
        </svg>
        <p className="wb-empty-title" style={{ marginTop: 8 }}>
          {canvas === "studio" ? "Studio" : "Builder"} canvas
        </p>
        <p className="wb-muted" style={{ fontSize: 13, maxWidth: 280, textAlign: "center" }}>
          Start the bench to launch the {canvas === "studio" ? "Studio" : "Builder"} canvas.
        </p>
        <Button variant="primary" size="sm" onClick={onGoBench} style={{ marginTop: 12 }}>
          Start bench
        </Button>
      </div>
    );
  }


  // list-apps loading
  if (listAppsStatus === "loading") {
    return (
      <div className="wb-overlay" aria-busy="true">
        <div className="wb-skeleton" />
        <div className="wb-skeleton is-short" />
        <p className="wb-muted">Checking installed apps…</p>
      </div>
    );
  }

  // list-apps error
  if (listAppsStatus === "error") {
    return (
      <div className="wb-overlay">
        <p className="wb-text-red">Could not read installed apps.</p>
        {listAppsError && <pre className="wb-pre">{listAppsError}</pre>}
        <Button variant="primary" onClick={onRetryApps}>
          Retry
        </Button>
      </div>
    );
  }

  // App not installed
  const isInstalled = canvas === "studio" ? studioInstalled : builderInstalled;

  if (!isInstalled) {
    const installCmd =
      canvas === "studio"
        ? "bench get-app studio && bench --site <site> install-app studio"
        : "bench get-app builder && bench --site <site> install-app builder";
    return (
      <div className="wb-overlay">
        <p className="wb-empty-title">
          {canvas === "studio" ? "Studio" : "Builder"} is not installed
        </p>
        <p className="wb-muted">Run this command then reload:</p>
        <code className="wb-code-block" title="Copy to install">
          {installCmd}
        </code>
        {canvas === "builder" && (
          <p className="wb-muted">
            Note: Builder files are the source of truth — file edits need "Sync files → site" to apply.
          </p>
        )}
      </div>
    );
  }

  // Canvas is shown (WebContentsView is on top). Show expected-state note
  // for Builder so users know the Frappe login page is not an error.
  if (canvas === "builder") {
    return (
      <div className={`wb-overlay${syncDimmed ? " is-dimmed" : ""}`}>
        <p className="wb-muted">
          Frappe login here is expected on first load. Builder file edits require
          "Sync files → site" to take effect.
        </p>
      </div>
    );
  }

  // Studio — canvas is live; show nothing (precondition list handles errors)
  return null;
}

// Status hues: Espresso reserves hue for status only (subtle badge + dot).
const BENCH_BADGES: Record<BenchStatus, { hue: "green" | "amber" | "red" | "gray"; label: string }> = {
  running: { hue: "green", label: "Running" },
  starting: { hue: "amber", label: "Starting…" },
  failed: { hue: "red", label: "Failed" },
  stopped: { hue: "gray", label: "Stopped" },
};
