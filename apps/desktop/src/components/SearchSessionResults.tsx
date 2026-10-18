import { useTranslation } from "react-i18next";
import type { SessionSearchHit, SessionSummary } from "@pi-desktop/shared";
import { IconChat } from "./icons";
import { SearchHighlight } from "./SearchHighlight";

/** Relative time for search result meta (e.g. "47m ago", "3d ago"). */
function relativeTime(iso: string | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - Date.parse(iso);
  if (ms <= 0) return "";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(ms / 3_600_000);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(ms / 86_400_000);
  return `${d}d ago`;
}

export type SearchRow = {
  session: SessionSummary;
  hit?: SessionSearchHit;
  archived: boolean;
  projectLabel: string;
  optionIndex: number;
};

export function SearchSessionResults({
  groups,
  query,
  active,
  runningSessions,
  onActivate,
  onSelect,
  showGroupLabels = true,
}: {
  groups: { key: string; rows: SearchRow[] }[];
  query: string;
  active: number;
  runningSessions: Record<string, boolean>;
  onActivate: (index: number) => void;
  onSelect: (row: SearchRow, messageId?: string) => void;
  /** When false, per-group time-bucket headers are suppressed (used in search mode). */
  showGroupLabels?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      {groups.map((group) => (
        <div key={group.key} role="presentation">
          {showGroupLabels ? (
            <div className="search-group-label" role="presentation">
              {t(`search.${group.key}`)}
            </div>
          ) : null}
          {group.rows.map((row) => (
            <div key={row.session.id} role="presentation">
              <button
                id={`global-search-option-${row.optionIndex}`}
                type="button"
                role="option"
                aria-selected={active === row.optionIndex}
                className={`search-item ${active === row.optionIndex ? "active" : ""}`}
                title={row.session.title}
                onMouseEnter={() => onActivate(row.optionIndex)}
                onClick={() => onSelect(row)}
              >
                <IconChat size={15} className="search-item-icon" />
                <span className="search-session-details">
                  <span className="search-item-title">
                    <SearchHighlight text={row.session.title} query={query} />
                  </span>
                  <span className="search-item-meta search-session-meta">
                    <span className="search-item-project">
                      {query.trim()
                        ? relativeTime(row.session.updatedAt)
                        : <SearchHighlight text={row.projectLabel} query={query} />
                      }
                    </span>
                    {row.hit?.metadataMatch ? (
                      <span className="search-item-badge">
                        {t("search.metadataMatch")}
                      </span>
                    ) : null}
                    {row.hit?.messageCount ? (
                      <span className="search-item-badge">
                        {t("search.messageMatches", { count: row.hit.messageCount })}
                      </span>
                    ) : null}
                    {row.archived ? (
                      <span className="search-item-badge">{t("search.archived")}</span>
                    ) : null}
                  </span>
                </span>
                {runningSessions[row.session.id] ? (
                  <span
                    className="search-item-running"
                    aria-label={t("nav.sessionRunning", { defaultValue: "Running" })}
                  />
                ) : null}
              </button>
              {row.hit?.matches.map((match, index) => {
                const optionIndex = row.optionIndex + index + 1;
                return (
                  <button
                    key={match.messageId}
                    id={`global-search-option-${optionIndex}`}
                    type="button"
                    role="option"
                    aria-selected={active === optionIndex}
                    className={`search-item search-message-hit ${active === optionIndex ? "active" : ""}`}
                    onMouseEnter={() => onActivate(optionIndex)}
                    onClick={() => onSelect(row, match.messageId)}
                  >
                    <span className="search-message-meta">
                      {match.role === "user" ? t("search.user") : t("search.assistant")} ·{" "}
                      {new Date(match.createdAt).toLocaleString()}
                    </span>
                    <span className="search-message-snippet">
                      <SearchHighlight text={match.snippet} query={query} />
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
