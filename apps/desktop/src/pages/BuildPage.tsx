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
import React, { useCallback, useEffect, useRef, useState } from "react";
import { IPC, type Result } from "@pi-desktop/shared";
import type { Precondition } from "../components/PreconditionList";
import { PreconditionList } from "../components/PreconditionList";

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

  // Bench status (polled every 2s)
  const [benchStatus, setBenchStatus] = useState<BenchStatus>("stopped");

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
      try {
        const s = await invoke<{ status: BenchStatus }>(IPC.invoke.benchStatus);
        if (!cancelled) setBenchStatus(s.status);
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 2_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ── List apps when bench becomes running ─────────────────────────────────

  const loadApps = useCallback(async () => {
    setListAppsStatus("loading");
    setListAppsError(null);
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
    if (benchStatus === "running") {
      void loadApps();
    } else {
      setListAppsStatus("loading");
      setInstalledApps([]);
    }
  }, [benchStatus, loadApps]);

  // ── Studio preconditions ─────────────────────────────────────────────────

  useEffect(() => {
    if (benchStatus !== "running" || !installedApps.includes("studio")) return;
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

  // Acquire canvas and set initial bounds on mount
  useEffect(() => {
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
          if (text.includes("Watching") || text.includes("Imported")) {
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

  // Studio precondition items (plan D13)
  const preconditions: Precondition[] = [
    {
      label: "Bench is running",
      ok: benchStatus === "running",
      remedy: "bench start",
    },
    {
      label: "Studio app installed",
      ok: studioInstalled,
      remedy: "bench get-app studio && bench --site <site> install-app studio",
    },
    {
      label: "developer_mode enabled",
      ok: developerMode === true,
      remedy: 'bench set-config -g developer_mode 1 && bench --site <site> clear-cache',
    },
    {
      label: "watchdog Python package installed",
      ok: watchdogOk === true,
      remedy: "env/bin/pip install watchdog",
    },
  ];

  const handleReload = () => {
    void invoke(IPC.invoke.buildCanvasAction, { action: "reload" });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="page-frame build-page" aria-label="Build">
      <div style={PAGE_STYLE}>
      <div style={STRIP_STYLE} role="toolbar" aria-label="Build controls" className="build-control-strip">

        {/* Studio / Builder switch */}
        <div role="group" aria-label="Canvas" style={SWITCH_GROUP_STYLE}>
          <button
            type="button"
            style={switchBtnStyle(canvas === "studio", !studioInstalled && listAppsStatus === "loaded")}
            aria-pressed={canvas === "studio"}
            disabled={listAppsStatus === "loading"}
            onClick={() => setCanvas("studio")}
            title={!studioInstalled && listAppsStatus === "loaded" ? "Studio not installed" : undefined}
          >
            Studio
          </button>
          <button
            type="button"
            style={switchBtnStyle(canvas === "builder", !builderInstalled && listAppsStatus === "loaded")}
            aria-pressed={canvas === "builder"}
            disabled={listAppsStatus === "loading"}
            onClick={() => setCanvas("builder")}
            title={!builderInstalled && listAppsStatus === "loaded" ? "Builder not installed" : undefined}
          >
            Builder
          </button>
        </div>

        {/* list-apps loading/error feedback */}
        {listAppsStatus === "loading" && (
          <span style={MUTED_STYLE} aria-live="polite">Checking installed apps…</span>
        )}
        {listAppsStatus === "error" && (
          <span style={ERROR_INLINE_STYLE} aria-live="polite">
            Could not read installed apps.{" "}
            <button type="button" style={LINK_BTN_STYLE} onClick={() => void loadApps()}>Retry</button>
          </span>
        )}

        {/* Watcher status (Studio) */}
        {canvas === "studio" && watcherStatus !== "stopped" && (
          <span
            style={watcherStatus === "running" ? SUCCESS_INLINE_STYLE : watcherStatus === "failed" ? ERROR_INLINE_STYLE : MUTED_STYLE}
            aria-live="polite"
          >
            {watcherStatus === "starting" && "watch-studio starting…"}
            {watcherStatus === "running" && `● watching${watcherLastImport ? ` · last import ${watcherLastImport}` : ""}`}
            {watcherStatus === "failed" && "watch-studio stopped (see preconditions)"}
          </span>
        )}
        {/* developer_mode off warning (amber) */}
        {canvas === "studio" && watcherStatus === "running" && developerMode === false && (
          <span style={WARN_INLINE_STYLE} role="alert">
            ⚠ developer_mode is off — imports are disabled
          </span>
        )}

        {/* Canvas 15s timeout note */}
        {canvasTimedOut && (
          <span style={WARN_INLINE_STYLE} aria-live="polite">
            Still loading — the site may not be running.{" "}
            {benchStatus !== "running" && (
              <button
                type="button"
                style={LINK_BTN_STYLE}
                onClick={() => void invoke(IPC.invoke.benchStart, {})}
              >
                Start bench
              </button>
            )}
          </span>
        )}

        {/* Canvas navigating indicator */}
        {canvasNavigating && !canvasTimedOut && (
          <span style={MUTED_STYLE} aria-live="polite" aria-busy="true">Loading…</span>
        )}

        {/* Sync status (Builder) */}
        {canvas === "builder" && syncStatus === "success" && syncMsg && (
          <span style={SUCCESS_INLINE_STYLE} aria-live="polite">{syncMsg}</span>
        )}

        {/* Right-side actions */}
        <div style={{ marginLeft: "auto", display: "flex", gap: "var(--ds-space-1)", alignItems: "center" }}>
          {/* Builder sync note */}
          {canvas === "builder" && listAppsStatus === "loaded" && (
            <span style={{ ...MUTED_STYLE, fontSize: "var(--text-2xs)" }}>
              Files are the source; sync to apply
            </span>
          )}

          {canvas === "builder" && (
            <button
              type="button"
              style={ACTION_BTN_STYLE}
              disabled={
                syncStatus === "loading" ||
                !builderInstalled ||
                benchStatus !== "running"
              }
              onClick={() => void doSync()}
              aria-label="Sync Builder files to site database"
            >
              {syncStatus === "loading" ? "Syncing…" : "Sync files → site"}
            </button>
          )}
          <button
            type="button"
            style={ACTION_BTN_STYLE}
            disabled={benchStatus !== "running"}
            onClick={handleReload}
            aria-label="Reload canvas"
          >
            ⟳ Reload
          </button>
        </div>
      </div>

      {/* Sync error */}
      {canvas === "builder" && syncStatus === "error" && syncError && (
        <div style={ERROR_BANNER_STYLE} role="alert">
          <span>Sync failed.</span>
          <pre style={ERROR_CODE_STYLE}>{syncError}</pre>
          <button type="button" style={LINK_BTN_STYLE} onClick={() => setSyncStatus("idle")}>
            Dismiss
          </button>
        </div>
      )}

      {/* Studio precondition checklist (only when any fail) */}
      {canvas === "studio" && (
        <PreconditionList items={preconditions} />
      )}

      {/* ── Canvas area ───────────────────────────────────────────────────── */}
      {/* T14 a11y: announce canvas focus */}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}
      >
        {canvasFocused ? `${canvas === "studio" ? "Studio" : "Builder"} canvas focused` : ""}
      </div>

      <div
        ref={canvasAreaRef}
        style={CANVAS_AREA_STYLE}
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
          onStartBench={() => void invoke(IPC.invoke.benchStart, {})}
          onRetryApps={() => void loadApps()}
        />
      </div>
      </div>
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
  onStartBench,
  onRetryApps,
}: {
  canvas: Canvas;
  benchStatus: BenchStatus;
  listAppsStatus: ListAppsStatus;
  listAppsError: string | null;
  studioInstalled: boolean;
  builderInstalled: boolean;
  syncDimmed: boolean;
  onStartBench: () => void;
  onRetryApps: () => void;
}) {
  // Bench not running → most prominent message
  if (benchStatus !== "running") {
    return (
      <div style={OVERLAY_STYLE}>
        <p style={OVERLAY_HEADING_STYLE}>Bench not running</p>
        <button type="button" style={CTA_BTN_STYLE} onClick={onStartBench}>
          Start bench
        </button>
      </div>
    );
  }

  // list-apps loading
  if (listAppsStatus === "loading") {
    return (
      <div style={OVERLAY_STYLE} aria-busy="true">
        <div style={SKELETON_LINE_STYLE} />
        <div style={{ ...SKELETON_LINE_STYLE, width: "60%" }} />
        <p style={MUTED_STYLE}>Checking installed apps…</p>
      </div>
    );
  }

  // list-apps error
  if (listAppsStatus === "error") {
    return (
      <div style={OVERLAY_STYLE}>
        <p style={ERROR_INLINE_STYLE}>Could not read installed apps.</p>
        {listAppsError && <pre style={ERROR_CODE_STYLE}>{listAppsError}</pre>}
        <button type="button" style={CTA_BTN_STYLE} onClick={onRetryApps}>
          Retry
        </button>
      </div>
    );
  }

  // App not installed
  const appKey = canvas === "studio" ? "studio" : "builder";
  const isInstalled = canvas === "studio" ? studioInstalled : builderInstalled;

  if (!isInstalled) {
    const installCmd =
      canvas === "studio"
        ? "bench get-app studio && bench --site <site> install-app studio"
        : "bench get-app builder && bench --site <site> install-app builder";
    return (
      <div style={OVERLAY_STYLE}>
        <p style={OVERLAY_HEADING_STYLE}>
          {canvas === "studio" ? "Studio" : "Builder"} is not installed
        </p>
        <p style={MUTED_STYLE}>Run this command then reload:</p>
        <code
          style={INSTALL_CMD_STYLE}
          // biome-ignore lint: userSelect is intentional for copy-paste
          title="Copy to install"
        >
          {installCmd}
        </code>
        {canvas === "builder" && (
          <p style={{ ...MUTED_STYLE, marginTop: "var(--ds-space-2)" }}>
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
      <div style={{ ...OVERLAY_STYLE, opacity: syncDimmed ? 0.3 : 1 }}>
        <p style={MUTED_STYLE}>
          Frappe login here is expected on first load. Builder file edits require
          "Sync files → site" to take effect.
        </p>
      </div>
    );
  }

  // Studio — canvas is live; show nothing (precondition list handles errors)
  return null;
}

// ── Styles (design tokens only, no raw px) ────────────────────────────────────

const PAGE_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "var(--ds-bg-primary)",
  color: "var(--ds-text-primary)",
  overflow: "hidden",
};

const STRIP_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ds-space-2)",
  padding: "var(--ds-space-1) var(--ds-space-2)",
  borderBottom: "1px solid var(--ds-border-primary)",
  flexShrink: 0,
  flexWrap: "wrap",
  minHeight: "var(--ds-toolbar-height, 40px)",
};

const SWITCH_GROUP_STYLE: React.CSSProperties = {
  display: "flex",
  gap: "var(--ds-space-1)",
};

const CANVAS_AREA_STYLE: React.CSSProperties = {
  flex: 1,
  position: "relative",
  overflow: "hidden",
};

const OVERLAY_STYLE: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--ds-space-2)",
  padding: "var(--ds-space-4)",
  textAlign: "center",
};

const OVERLAY_HEADING_STYLE: React.CSSProperties = {
  fontSize: "var(--text-base)",
  fontWeight: 500,
  color: "var(--ds-text-secondary)",
  margin: 0,
};

const CTA_BTN_STYLE: React.CSSProperties = {
  padding: "var(--ds-space-1) var(--ds-space-3)",
  borderRadius: "var(--radius-sm)",
  background: "var(--ds-bg-secondary)",
  border: "1px solid var(--ds-border-primary)",
  color: "var(--ds-text-primary)",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
};

const ACTION_BTN_STYLE: React.CSSProperties = {
  padding: "var(--ds-space-1) var(--ds-space-2)",
  borderRadius: "var(--radius-xs)",
  background: "var(--ds-bg-secondary)",
  border: "1px solid var(--ds-border-primary)",
  color: "var(--ds-text-primary)",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
};

const LINK_BTN_STYLE: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--ds-text-accent, var(--ds-text-secondary))",
  cursor: "pointer",
  fontSize: "inherit",
  padding: 0,
  textDecoration: "underline",
};

const MUTED_STYLE: React.CSSProperties = {
  color: "var(--ds-text-tertiary)",
  fontSize: "var(--text-sm)",
  margin: 0,
};

const ERROR_INLINE_STYLE: React.CSSProperties = {
  color: "var(--ds-error)",
  fontSize: "var(--text-sm)",
};

const SUCCESS_INLINE_STYLE: React.CSSProperties = {
  color: "var(--ds-success)",
  fontSize: "var(--text-sm)",
};

const WARN_INLINE_STYLE: React.CSSProperties = {
  color: "var(--ds-warning)",
  fontSize: "var(--text-sm)",
};

const ERROR_BANNER_STYLE: React.CSSProperties = {
  padding: "var(--ds-space-2)",
  background: "color-mix(in srgb, var(--ds-error) 10%, var(--ds-bg-primary))",
  borderBottom: "1px solid var(--ds-border-primary)",
  fontSize: "var(--text-sm)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--ds-space-1)",
};

const ERROR_CODE_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-2xs)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  margin: 0,
  maxHeight: "6em",
  overflow: "auto",
};

const SKELETON_LINE_STYLE: React.CSSProperties = {
  height: "var(--text-base)",
  width: "80%",
  borderRadius: "var(--radius-2xs)",
  background: "var(--ds-bg-secondary)",
  animation: "pulse 1.5s ease-in-out infinite",
};

const INSTALL_CMD_STYLE: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-sm)",
  padding: "var(--ds-space-2)",
  background: "var(--ds-bg-secondary)",
  borderRadius: "var(--radius-sm)",
  userSelect: "all",
  cursor: "text",
  wordBreak: "break-all",
};

function switchBtnStyle(active: boolean, dimmed: boolean): React.CSSProperties {
  return {
    padding: "var(--ds-space-1) var(--ds-space-2)",
    borderRadius: "var(--radius-xs)",
    border: "1px solid var(--ds-border-primary)",
    background: active ? "var(--ds-bg-secondary)" : "transparent",
    color: dimmed ? "var(--ds-text-tertiary)" : "var(--ds-text-primary)",
    cursor: dimmed ? "default" : "pointer",
    opacity: dimmed ? 0.5 : 1,
    fontSize: "var(--text-sm)",
    fontWeight: active ? 500 : 400,
  };
}
