/** Compact age for a sidebar session row (`.d-session-time`): now, 47m, 2h, 3d. */
export function compactSessionAge(updatedAt: string | undefined, now = Date.now()): string | null {
  const at = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  if (!Number.isFinite(at)) return null;
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
