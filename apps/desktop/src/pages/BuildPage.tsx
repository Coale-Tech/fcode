/**
 * Build tab — Studio and Builder canvases over a supervised local bench (T10).
 *
 * Layout:
 *   ┌─ build-control-strip ─────────────────────────────────────────────┐
 *   │ [Studio] [Builder]  route  [Sync →]  [⟳ Reload]                   │
 *   │ PreconditionList (visible only when one or more checks fail)        │
 *   └───────────────────────────────────────────────────────────────────┘
 *   ┌─ build-canvas-area ───────────────────────────────────────────────┐
 *   │  (WebContentsView driven by agent N / bench-cockpit lane)          │
 *   └───────────────────────────────────────────────────────────────────┘
 *
 * Agent N (bench-cockpit) owns the actual bench state and WebContentsView
 * wiring. This file establishes the control-strip chrome so it exists when
 * agent N's canvas logic lands.
 *
 * T14 a11y: the canvas region is an opaque embedded site — announce focus
 * entry through an `aria-live="polite"` region so screen-reader users know
 * they entered a web page.
 */
import { useState } from "react";
import type { Precondition } from "../components/PreconditionList";
import { PreconditionList } from "../components/PreconditionList";

type Canvas = "studio" | "builder";

/**
 * Default preconditions shown before any real bench check has run.
 * Agent N will replace these with live results from `list-apps` output.
 */
const DEFAULT_PRECONDITIONS: Precondition[] = [
  { label: "Bench is running", ok: false, remedy: "bench start" },
  {
    label: "Studio app installed",
    ok: false,
    remedy: "bench get-app studio && bench --site <site> install-app studio",
  },
  {
    label: "developer_mode enabled",
    ok: false,
    remedy: "bench --site <site> set-config developer_mode 1",
  },
  {
    label: "watchdog installed",
    ok: false,
    remedy: "pip install watchdog",
  },
];

export function BuildPage() {
  const [canvas, setCanvas] = useState<Canvas>("studio");
  // Agent N provides real precondition state; we start with all-failing so
  // the checklist is always visible until a bench confirms the setup.
  const [preconditions] = useState<Precondition[]>(DEFAULT_PRECONDITIONS);
  const [canvasFocused, setCanvasFocused] = useState(false);

  return (
    <main className="page-frame build-page" aria-label="Build">
      {/* ── Control strip ───────────────────────────────────────────────── */}
      <div className="build-control-strip" role="toolbar" aria-label="Build controls">
        {/* Studio / Builder switch */}
        <div className="build-canvas-switch" role="group" aria-label="Canvas">
          <button
            type="button"
            className={`build-switch-btn ${canvas === "studio" ? "is-active" : ""}`}
            aria-pressed={canvas === "studio"}
            onClick={() => setCanvas("studio")}
          >
            Studio
          </button>
          <button
            type="button"
            className={`build-switch-btn ${canvas === "builder" ? "is-active" : ""}`}
            aria-pressed={canvas === "builder"}
            onClick={() => setCanvas("builder")}
          >
            Builder
          </button>
        </div>

        <div className="build-control-actions">
          {/* Sync action — Builder only (file → DB). Agent N wires the IPC call. */}
          {canvas === "builder" && (
            <button type="button" className="build-sync-btn" disabled>
              Sync files → site
            </button>
          )}
          <button type="button" className="build-reload-btn" disabled>
            ⟳ Reload
          </button>
        </div>

        {/* Precondition checklist (Studio only) */}
        {canvas === "studio" && (
          <PreconditionList items={preconditions} />
        )}
      </div>

      {/*
       * ── Canvas area ─────────────────────────────────────────────────────
       * T14 a11y: announce when focus moves into the embedded canvas.
       */}
      <div className="build-canvas-area">
        {/* Polite region that announces canvas focus transitions to SR users. */}
        <div
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {canvasFocused ? `${canvas === "studio" ? "Studio" : "Builder"} canvas focused` : ""}
        </div>

        {/* Canvas placeholder — agent N (bench-cockpit) mounts the real view. */}
        <div
          className="build-canvas-placeholder"
          tabIndex={0}
          role="region"
          aria-label={`${canvas === "studio" ? "Studio" : "Builder"} canvas`}
          onFocus={() => setCanvasFocused(true)}
          onBlur={() => setCanvasFocused(false)}
        >
          <p>
            {canvas === "studio"
              ? "Studio canvas — start the bench and install Studio to enable."
              : "Builder canvas — start the bench to enable."}
          </p>
          {canvas === "builder" && (
            <p className="build-canvas-note">
              Note: Frappe login page here is expected on first load.
              Builder file edits require "Sync files → site" to take effect.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
