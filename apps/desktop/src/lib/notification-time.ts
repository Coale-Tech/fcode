import { formatDayTime, type DayTime } from "./scheduled-format.ts";

/**
 * Inbox row timestamp (Direction D `notifications/fragment.html`): "just now",
 * "2 m ago", "2 h ago" within today, then "Yesterday 07:30" / "Oct 11, 08:00".
 */
export type NotificationAge =
  | { kind: "now" }
  | { kind: "minutes"; minutes: number }
  | { kind: "hours"; hours: number }
  | DayTime;

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function notificationAge(date: Date, now: Date, locale: string): NotificationAge {
  const delta = now.getTime() - date.getTime();
  if (!Number.isFinite(delta) || Math.abs(delta) < 45_000) return { kind: "now" };
  if (delta > 0 && delta < 3_600_000) return { kind: "minutes", minutes: Math.max(1, Math.round(delta / 60_000)) };
  if (delta > 0 && sameDay(date, now)) return { kind: "hours", hours: Math.max(1, Math.floor(delta / 3_600_000)) };
  return formatDayTime(date, now, locale);
}
