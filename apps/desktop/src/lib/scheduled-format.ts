/**
 * Pure formatters for the Scheduled page (Direction D `scheduled/fragment.html`):
 * "Today 08:00" / "Tomorrow 02:00" / "Mon 07:30" / "Oct 11, 08:00" run times,
 * "Mon – Fri" weekday spans and "12 s" run durations.
 *
 * The day word ("Today") is the caller's translation; these helpers only
 * decide which one applies and format the locale-aware parts with Intl.
 */

export type DayTime =
  | { kind: "today" | "tomorrow" | "yesterday"; time: string }
  | { kind: "date"; text: string };

const DAY_MS = 86_400_000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** 24-hour "08:00" in the given locale's digits. */
export function formatClock(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

/** Classifies `date` relative to `now` by local calendar day. */
export function formatDayTime(date: Date, now: Date, locale: string): DayTime {
  const days = Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
  const time = formatClock(date, locale);
  if (days === 0) return { kind: "today", time };
  if (days === 1) return { kind: "tomorrow", time };
  if (days === -1) return { kind: "yesterday", time };
  if (days > 1 && days < 7) {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
    return { kind: "date", text: `${weekday} ${time}` };
  }
  return {
    kind: "date",
    text: new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date),
  };
}

/** Short weekday name for a Monday = 0 index. */
function weekdayName(index: number, locale: string): string {
  // 2024-01-01 was a Monday.
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2024, 0, 1 + index));
}

/**
 * "Mon – Fri" for consecutive runs of three or more days, comma-joined
 * otherwise ("Mon, Wed"). Days are Monday = 0; duplicates are ignored.
 */
export function formatWeekdays(days: readonly number[], locale: string): string {
  const sorted = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  const parts: string[] = [];
  let start = 0;
  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === sorted[i - 1]! + 1) continue;
    const run = sorted.slice(start, i);
    if (run.length >= 3) parts.push(`${weekdayName(run[0]!, locale)} – ${weekdayName(run[run.length - 1]!, locale)}`);
    else parts.push(...run.map((d) => weekdayName(d, locale)));
    start = i;
  }
  return parts.join(", ");
}

/** Whole seconds between two ISO timestamps, or null while still running. */
export function runDurationSeconds(startedAt: string, endedAt: string | null): number | null {
  if (!endedAt) return null;
  const ms = Date.parse(endedAt) - Date.parse(startedAt);
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 1000) : null;
}
