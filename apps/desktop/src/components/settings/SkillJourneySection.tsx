/**
 * Compact read-only journey timeline: combines curator events, review commits
 * on fcode/self-improve, and approved/rejected proposals, newest first.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OmpJourneyEvent } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Badge } from "../ui";
import { SettingsCard } from "../../features/settings/primitives";

const EVENT_TONE: Record<string, "neutral" | "warning" | "error" | "success"> = {
  "curator-archive":          "error",
  "curator-mark_stale":       "warning",
  "curator-restore":          "success",
  "curator-pin":              "neutral",
  "curator-unpin":            "neutral",
  "git-commit":               "success",
  "proposal-approved":        "success",
  "proposal-rejected":        "error",
};

function eventTone(e: OmpJourneyEvent): "neutral" | "warning" | "error" | "success" {
  if (e.type === "curator") return EVENT_TONE[`curator-${e.action}`] ?? "neutral";
  return EVENT_TONE[e.type] ?? "neutral";
}

function eventLabel(e: OmpJourneyEvent, t: (k: string) => string): string {
  if (e.type === "curator") return t(`settings.journeyAction_${e.action}`) || e.action;
  if (e.type === "git-commit") return t("settings.journeyActionCommit");
  if (e.type === "proposal-approved") return t("settings.journeyActionApproved");
  return t("settings.journeyActionRejected");
}

export function SkillJourneySection() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<OmpJourneyEvent[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.ompSkillJourney()
      .then((r) => setEvents(r.events))
      .catch((e: unknown) => setError(String((e as Error).message ?? e)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SettingsCard title={t("settings.skillJourneyTitle")}>
      <p className="settings-row-desc">{t("settings.skillJourneyDesc")}</p>
      {events.length === 0 && !error && (
        <p className="settings-row-desc">{t("settings.skillJourneyEmpty")}</p>
      )}
      {error && <p className="settings-row-desc">{error}</p>}
      {events.length > 0 && (
        <ul className="model-provider-list">
          {events.slice(0, 50).map((e, i) => (
            // ponytail: slice at 50 to keep DOM size sane; full export via git log if needed
            <li key={`${e.type}-${e.ts}-${i}`} className="model-provider-row">
              <div className="model-provider-name" style={{ flex: 1 }}>
                <span className="font-mono text-sm">{e.skill}</span>
                {" "}
                <Badge tone={eventTone(e)}>{eventLabel(e, t)}</Badge>
                <span className="settings-row-desc" style={{ marginLeft: 8 }}>
                  {new Date(e.ts).toLocaleString()}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}
