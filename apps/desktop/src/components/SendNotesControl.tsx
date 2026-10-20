/**
 * Shared split-button for sending review notes.
 * Used by both ReviewTab (agent-source) and GitReviewSource / DocReviewSource.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShortcut } from "../lib/use-shortcut";
import { Button } from "./ui";

export function SendNotesControl({
  count,
  sending,
  onSend,
}: {
  count: number;
  sending: boolean;
  onSend: (target: "current" | "new") => void;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  useShortcut("sendReviewNotes", () => onSend("current"), count > 0 && !sending);

  if (count === 0) return null;

  return (
    <div ref={menuRef} style={{ position: "relative", display: "flex", gap: 1 }}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => { setMenuOpen(false); onSend("current"); }}
        disabled={sending}
        style={{ height: 24, fontSize: 11, padding: "0 8px" }}
      >
        {t("panel.review.sendNotes", { count })}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setMenuOpen((v) => !v)}
        disabled={sending}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        style={{ height: 24, fontSize: 11, padding: "0 5px" }}
      >
        ▾
      </Button>
      {menuOpen && (
        <div
          className="wp-send-notes-menu"
          role="menu"
          style={{ position: "absolute", right: 0, top: "100%", marginTop: 2, zIndex: 100 }}
        >
          <button
            role="menuitem"
            className="wp-send-notes-menu-item"
            onClick={() => { setMenuOpen(false); onSend("current"); }}
          >
            {t("panel.review.sendNotesCurrentSession")}
          </button>
          <button
            role="menuitem"
            className="wp-send-notes-menu-item"
            onClick={() => { setMenuOpen(false); onSend("new"); }}
          >
            {t("panel.review.sendNotesNewSession")}
          </button>
        </div>
      )}
    </div>
  );
}
