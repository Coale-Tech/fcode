/**
 * ScreenshotMarkup — canvas markup editor shown when the user clicks an
 * annotation thumbnail. Saves an annotated JPEG back to the annotation store
 * via the updateAnnotationScreenshot action.
 *
 * Accessibility: labelled dialog, focus-trapped, Esc cancels, Cmd/Ctrl+Z undoes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { portalToBody } from "../lib/portal-visibility";
import { normalizePt, arrowHeadPoints } from "../lib/screenshot-markup";
import { ELEMENT_GRAB_BUDGETS } from "../lib/element-grab";
import type { Point } from "../lib/screenshot-markup";

type Tool = "pen" | "rect" | "arrow";

type Stroke =
  | { type: "pen"; pts: Point[]; color: string; lw: number }
  | { type: "rect"; from: Point; to: Point; color: string; lw: number }
  | { type: "arrow"; from: Point; to: Point; color: string; lw: number };

// CSS variable names for the colour palette — resolved at render time, not hardcoded.
const COLOR_VARS = ["--ds-accent", "--ds-danger", "--ds-warning", "--ds-text-primary"] as const;
const LW = 2.5;

function readCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#000";
}

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: readonly Stroke[]) {
  for (const s of strokes) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.lw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (s.type === "pen") {
      if (s.pts.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(s.pts[0].x, s.pts[0].y);
      for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y);
      ctx.stroke();
    } else if (s.type === "rect") {
      ctx.strokeRect(s.from.x, s.from.y, s.to.x - s.from.x, s.to.y - s.from.y);
    } else {
      // arrow
      ctx.beginPath();
      ctx.moveTo(s.from.x, s.from.y);
      ctx.lineTo(s.to.x, s.to.y);
      ctx.stroke();
      const [w1, w2] = arrowHeadPoints(s.from, s.to);
      ctx.beginPath();
      ctx.moveTo(w1.x, w1.y);
      ctx.lineTo(s.to.x, s.to.y);
      ctx.lineTo(w2.x, w2.y);
      ctx.stroke();
    }
  }
}

export function ScreenshotMarkup({
  mimeType,
  dataBase64,
  onSave,
  onCancel,
}: {
  mimeType: string;
  dataBase64: string;
  onSave: (dataBase64: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tool, setTool] = useState<Tool>("pen");
  // Resolved colour values captured once at mount (runtime CSS vars).
  const [colors] = useState(() => COLOR_VARS.map(readCssVar));
  const [colorIdx, setColorIdx] = useState(0);
  const [strokes, setStrokes] = useState<Stroke[]>([]);

  // Refs used inside pointer handlers to avoid stale closures.
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const colorRef = useRef(colors[0]);
  colorRef.current = colors[colorIdx];
  const drawing = useRef(false);
  const liveStroke = useRef<Stroke | null>(null);

  // Load image; set canvas natural dimensions.
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.drawImage(img, 0, 0);
      setLoaded(true);
    };
    img.src = `data:${mimeType};base64,${dataBase64}`;
  }, [mimeType, dataBase64]);

  // Redraw canvas whenever committed strokes change.
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    drawStrokes(ctx, strokesRef.current);
  }, []);

  useEffect(() => { if (loaded) redraw(); }, [strokes, loaded, redraw]);

  // Focus first control; block body scroll; handle Esc, Ctrl+Z, Tab trap.
  useEffect(() => {
    requestAnimationFrame(() => closeRef.current?.focus());
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); return; }
      if (e.key === "z" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setStrokes((prev) => prev.slice(0, -1));
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), canvas[tabindex="0"]',
      );
      if (!focusable?.length) return;
      const arr = Array.from(focusable);
      const idx = arr.indexOf(document.activeElement as HTMLElement);
      if (idx === -1) return;
      const atBoundary = e.shiftKey ? idx === 0 : idx === arr.length - 1;
      if (!atBoundary) return;
      e.preventDefault();
      arr[e.shiftKey ? arr.length - 1 : 0].focus();
    };

    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); document.body.style.overflow = prevOverflow; };
  }, [onCancel]);

  // Pointer handlers — normalize coords to image-natural space.
  const toPt = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return normalizePt(
      e.clientX - rect.left, e.clientY - rect.top,
      rect.width, rect.height,
      canvas.width, canvas.height,
    );
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const pt = toPt(e);
    const color = colorRef.current;
    liveStroke.current =
      toolRef.current === "pen"
        ? { type: "pen", pts: [pt], color, lw: LW }
        : toolRef.current === "rect"
        ? { type: "rect", from: pt, to: pt, color, lw: LW }
        : { type: "arrow", from: pt, to: pt, color, lw: LW };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !liveStroke.current) return;
    const pt = toPt(e);
    const s = liveStroke.current;
    // Update liveStroke via discriminant narrowing — no unchecked casts.
    if (s.type === "pen") {
      liveStroke.current = { ...s, pts: [...s.pts, pt] };
    } else {
      liveStroke.current = { ...s, to: pt };
    }
    // Live preview: render directly without a state update.
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    drawStrokes(ctx, strokesRef.current);
    drawStrokes(ctx, [liveStroke.current]);
  };

  const onPointerUp = () => {
    const done = liveStroke.current;
    if (!drawing.current || !done) return;
    drawing.current = false;
    liveStroke.current = null;
    setStrokes((prev) => [...prev, done]); // capture first: the updater runs after the ref is cleared
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const b64 = dataUrl.split(",")[1] ?? "";
    if (b64.length > ELEMENT_GRAB_BUDGETS.screenshotBase64) {
      // Very unlikely for element screenshots at 0.85 JPEG quality, but guard it.
      console.warn("[screenshot-markup] encoded base64 exceeds screenshotBase64 budget");
    }
    onSave(b64);
  };

  const tools: [Tool, string][] = [
    ["pen",   t("panel.design.markupPen")],
    ["rect",  t("panel.design.markupRect")],
    ["arrow", t("panel.design.markupArrow")],
  ];

  const dialog = (
    <div
      className="overlay"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("panel.design.markupTitle")}
        className="dialog screenshot-markup-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-head screenshot-markup-head">
          <span>{t("panel.design.markupTitle")}</span>
          <button
            ref={closeRef}
            type="button"
            className="icon-btn"
            onClick={onCancel}
            aria-label={t("common.close")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="screenshot-markup-toolbar">
          <div className="screenshot-markup-tools" role="group" aria-label={t("panel.design.markupTools")}>
            {tools.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`screenshot-markup-tool${tool === id ? " active" : ""}`}
                aria-pressed={tool === id}
                onClick={() => setTool(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="screenshot-markup-colors" role="group" aria-label={t("panel.design.markupColor")}>
            {colors.map((c, i) => (
              <button
                key={i}
                type="button"
                className={`screenshot-markup-swatch${colorIdx === i ? " active" : ""}`}
                style={{ background: c }}
                aria-pressed={colorIdx === i}
                aria-label={`Color ${i + 1}`}
                onClick={() => setColorIdx(i)}
              />
            ))}
          </div>

          <button
            type="button"
            className="screenshot-markup-action"
            onClick={() => setStrokes((s) => s.slice(0, -1))}
            disabled={strokes.length === 0}
            aria-label={t("panel.design.markupUndo")}
          >
            {t("panel.design.markupUndo")}
          </button>
          <button
            type="button"
            className="screenshot-markup-action"
            onClick={() => setStrokes([])}
            disabled={strokes.length === 0}
            aria-label={t("panel.design.markupClear")}
          >
            {t("panel.design.markupClear")}
          </button>
        </div>

        <div className="screenshot-markup-canvas-wrap">
          {!loaded && (
            <div className="screenshot-markup-loading">{t("common.loading")}</div>
          )}
          <canvas
            ref={canvasRef}
            className="screenshot-markup-canvas"
            tabIndex={0}
            aria-label={t("panel.design.markupCanvas")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{ touchAction: "none", cursor: "crosshair" }}
          />
        </div>

        <div className="dialog-foot">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!loaded}>
            {t("panel.design.markupSave")}
          </button>
        </div>
      </div>
    </div>
  );

  return portalToBody(dialog);
}
