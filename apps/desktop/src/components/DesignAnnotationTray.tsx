import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import type { DesignAnnotation } from "../stores/slices/design-annotations-slice";
import type { AnnotationIntent } from "../lib/element-grab";
import { ScreenshotMarkup } from "./ScreenshotMarkup";

/** Compact annotation row with thumbnail, selector, intent select, editable comment and remove. */
function AnnotationRow({
  annotation,
  onCommentChange,
  onIntentChange,
  onRemove,
  onThumbClick,
}: {
  annotation: DesignAnnotation;
  onCommentChange: (id: string, comment: string) => void;
  onIntentChange: (id: string, intent: AnnotationIntent) => void;
  onRemove: (id: string) => void;
  onThumbClick: (annotation: DesignAnnotation) => void;
}) {
  const { t } = useTranslation();
  const shot = annotation.grab.screenshot;
  return (
    <div className="design-annotation-row" data-id={annotation.id}>
      {shot ? (
        <button
          type="button"
          className="design-annotation-thumb-btn"
          onClick={() => onThumbClick(annotation)}
          title={t("panel.design.markupOpen")}
          aria-label={t("panel.design.markupOpen")}
        >
          <img
            className="design-annotation-thumb"
            src={`data:${shot.mimeType};base64,${shot.dataBase64}`}
            alt={annotation.grab.selector}
          />
        </button>
      ) : null}
      <div className="design-annotation-meta">
        <span className="design-annotation-selector" title={annotation.grab.path}>
          {annotation.grab.selector}
        </span>
        <input
          className="design-annotation-comment"
          type="text"
          value={annotation.comment}
          placeholder={t("panel.design.commentPlaceholder")}
          onChange={(e) => onCommentChange(annotation.id, e.target.value)}
        />
        <select
          className="design-annotation-intent field-select"
          value={annotation.intent}
          aria-label={t("panel.design.intentLabel")}
          onChange={(e) => onIntentChange(annotation.id, e.target.value as AnnotationIntent)}
        >
          <option value="change">{t("panel.design.intentChange")}</option>
          <option value="fix">{t("panel.design.intentFix")}</option>
          <option value="question">{t("panel.design.intentQuestion")}</option>
        </select>
      </div>
      <button
        type="button"
        className="design-annotation-remove icon-btn"
        title={t("panel.design.remove")}
        aria-label={t("panel.design.remove")}
        onClick={() => onRemove(annotation.id)}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Design Mode annotation tray shown above the composer when annotations exist.
 * Survives Work-panel tab switches; not persisted across reload.
 *
 * NOTE: The split-send button duplicates a small menu pattern also used by ReviewTab.
 * When ReviewTab's shared SendNotesControl lands, these two can be de-duped.
 */
export function DesignAnnotationTray({ supportsImages }: { supportsImages: boolean }) {
  const { t } = useTranslation();
  const annotations = useAppStore((state) => state.designAnnotations);
  const updateAnnotationComment = useAppStore((state) => state.updateAnnotationComment);
  const updateAnnotationIntent = useAppStore((state) => state.updateAnnotationIntent);
  const updateAnnotationScreenshot = useAppStore((state) => state.updateAnnotationScreenshot);
  const removeDesignAnnotation = useAppStore((state) => state.removeDesignAnnotation);
  const clearDesignAnnotations = useAppStore((state) => state.clearDesignAnnotations);
  const sendDesignAnnotations = useAppStore((state) => state.sendDesignAnnotations);

  const sending = useRef(false);
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const sendMenuRef = useRef<HTMLDivElement>(null);
  const [markupTarget, setMarkupTarget] = useState<DesignAnnotation | null>(null);

  // Close the send-target menu on outside click.
  useEffect(() => {
    if (!sendMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (!sendMenuRef.current?.contains(e.target as Node)) setSendMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [sendMenuOpen]);

  if (annotations.length === 0) return null;

  const handleSend = async (target: "current" | "new" = "current") => {
    if (sending.current) return;
    sending.current = true;
    setSendMenuOpen(false);
    try {
      await sendDesignAnnotations(supportsImages, target);
    } finally {
      sending.current = false;
    }
  };

  return (
    <div className="design-annotation-tray" aria-label={t("panel.design.trayLabel")}>
      <div className="design-annotation-header">
        <span className="design-annotation-count">
          {t("panel.design.annotations", { count: annotations.length })}
        </span>
        <button
          type="button"
          className="design-annotation-clear"
          onClick={clearDesignAnnotations}
          title={t("panel.design.clear")}
        >
          {t("panel.design.clear")}
        </button>
      </div>

      <div className="design-annotation-list">
        {annotations.map((a) => (
          <AnnotationRow
            key={a.id}
            annotation={a}
            onCommentChange={updateAnnotationComment}
            onIntentChange={updateAnnotationIntent}
            onRemove={removeDesignAnnotation}
            onThumbClick={setMarkupTarget}
          />
        ))}
      </div>

      {/* Split send button: main action sends to current session; ▾ opens target menu. */}
      <div ref={sendMenuRef} style={{ position: "relative", display: "flex", gap: 1, alignSelf: "flex-end" }}>
        <button
          type="button"
          className="design-annotation-send"
          onClick={() => void handleSend("current")}
        >
          {t("panel.design.send")}
        </button>
        <button
          type="button"
          className="design-annotation-send design-annotation-send-chevron"
          onClick={() => setSendMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={sendMenuOpen}
          aria-label={t("panel.design.sendMenu")}
        >
          ▾
        </button>
        {sendMenuOpen && (
          <div
            className="design-send-menu"
            role="menu"
            style={{ position: "absolute", right: 0, bottom: "100%", marginBottom: 2, zIndex: 100 }}
          >
            <button
              role="menuitem"
              className="design-send-menu-item"
              onClick={() => void handleSend("current")}
            >
              {t("panel.design.sendCurrentSession")}
            </button>
            <button
              role="menuitem"
              className="design-send-menu-item"
              onClick={() => void handleSend("new")}
            >
              {t("panel.design.sendNewSession")}
            </button>
          </div>
        )}
      </div>

      {/* Screenshot markup editor — opened by clicking a thumbnail. */}
      {markupTarget?.grab.screenshot && (
        <ScreenshotMarkup
          mimeType={markupTarget.grab.screenshot.mimeType}
          dataBase64={markupTarget.grab.screenshot.dataBase64}
          onSave={(dataBase64) => {
            updateAnnotationScreenshot(markupTarget.id, dataBase64);
            setMarkupTarget(null);
          }}
          onCancel={() => setMarkupTarget(null)}
        />
      )}
    </div>
  );
}
