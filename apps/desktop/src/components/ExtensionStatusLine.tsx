import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { applyExtStatus, type ExtStatusState } from "../features/chat/composer/ext-ui-state";

/** omp `setStatus` text for the active session, shown as a status line. */
export function ExtensionStatusLine() {
  const [ompStatus, setOmpStatus] = useState<Record<string, ExtStatusState>>({});
  const activeSessionId = useAppStore((state) => state.activeSessionId);

  useEffect(
    () =>
      api.onSidecarExtUi((event) => {
        if (event.kind !== "status") return;
        setOmpStatus((prev) => ({
          ...prev,
          [event.sessionId]: applyExtStatus(prev[event.sessionId] ?? {}, event.key, event.text),
        }));
      }),
    [],
  );

  const statusTexts = activeSessionId ? Object.values(ompStatus[activeSessionId] ?? {}) : [];
  if (!statusTexts.length) return null;
  return (
    <div className="extension-status-line" role="status" aria-live="polite">
      {statusTexts.map((text, index) => (
        <span key={index} className="extension-status-item">
          {text}
        </span>
      ))}
    </div>
  );
}
