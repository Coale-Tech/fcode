/**
 * Historical AI usage stats — shells out to `omp stats --json` via the
 * ompHistoricalStats IPC channel and shows aggregated cost/tokens/requests.
 *
 * Per-session stats are already shown in ContextUsageInspector (composer ring).
 * This section covers all-time historical aggregates.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OmpHistoricalStatsResult } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Button } from "../ui";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatPercent(r: number): string {
  return `${(r * 100).toFixed(1)}%`;
}

export function OmpUsageSection() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<OmpHistoricalStatsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .ompHistoricalStats()
      .then(setStats)
      .catch(() => setError(t("settings.ompUsageError")))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="settings-card-block">
      <h2 className="settings-card-heading">{t("settings.ompUsageGroup")}</h2>
      {loading && <p className="settings-row-desc">{t("common.loading")}</p>}
      {error && (
        <div className="settings-row-desc">
          <span>{error}</span>{" "}
          <Button size="sm" variant="secondary" onClick={load}>
            {t("settings.ompUsageRetry")}
          </Button>
        </div>
      )}
      {stats && !loading && (
        <dl className="omp-usage-stats">
          <div className="omp-usage-row">
            <dt>{t("settings.ompUsageRequests")}</dt>
            <dd>{stats.totalRequests.toLocaleString()}</dd>
          </div>
          <div className="omp-usage-row">
            <dt>{t("settings.ompUsageCost")}</dt>
            <dd>{formatCost(stats.totalCost)}</dd>
          </div>
          <div className="omp-usage-row">
            <dt>{t("settings.ompUsageTokensIn")}</dt>
            <dd>{formatTokens(stats.totalInputTokens)}</dd>
          </div>
          <div className="omp-usage-row">
            <dt>{t("settings.ompUsageTokensOut")}</dt>
            <dd>{formatTokens(stats.totalOutputTokens)}</dd>
          </div>
          <div className="omp-usage-row">
            <dt>{t("settings.ompUsageCacheRate")}</dt>
            <dd>{formatPercent(stats.cacheRate)}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
