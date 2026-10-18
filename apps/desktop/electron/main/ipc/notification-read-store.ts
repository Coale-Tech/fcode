/**
 * Persists notification read state (readBefore watermark + per-id acks) to a
 * local JSON file so "Mark all read" survives process restarts regardless of
 * whether the OMP host backend implements notification.markAllRead.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeJsonAtomicSync } from "../atomic-json";

const FILE = "notification-read-state.json";
/** Cap stored ids to bound file size. */
const MAX_IDS = 512;

export type NotificationReadStore = {
  /** Unix-ms watermark: every notification created at or before this time is read. */
  readBefore: number | null;
  /** Individually acknowledged ids (for notifications created after a mark-all). */
  readIds: string[];
};

export function readNotificationReadStore(dataDir: string): NotificationReadStore {
  try {
    const raw = readFileSync(join(dataDir, FILE), "utf8");
    const parsed = JSON.parse(raw) as Partial<NotificationReadStore>;
    return {
      readBefore: typeof parsed.readBefore === "number" && Number.isFinite(parsed.readBefore)
        ? parsed.readBefore
        : null,
      readIds: Array.isArray(parsed.readIds)
        ? parsed.readIds.filter((x) => typeof x === "string").slice(-MAX_IDS)
        : [],
    };
  } catch {
    return { readBefore: null, readIds: [] };
  }
}

export function writeNotificationReadStore(dataDir: string, store: NotificationReadStore): void {
  writeJsonAtomicSync(join(dataDir, FILE), store);
}

/** Return a new store with id acknowledged (deduped, bounded). */
export function storeWithReadId(store: NotificationReadStore, id: string): NotificationReadStore {
  const filtered = store.readIds.filter((x) => x !== id);
  return { ...store, readIds: [...filtered, id].slice(-MAX_IDS) };
}

/** Return a new store with readBefore raised to `timestamp` (never lowered). */
export function storeWithReadBefore(
  store: NotificationReadStore,
  timestamp: number,
): NotificationReadStore {
  const next = Math.max(store.readBefore ?? 0, timestamp);
  return { ...store, readBefore: next };
}

/**
 * Overlay local read-state onto a list of notifications.
 * Any notification whose id is in readIds, or whose createdAt is ≤ readBefore,
 * is returned with a non-null readAt (preserving any already-set value).
 */
export function overlayReadStore<T extends { id: string; createdAt: string; readAt: string | null }>(
  notifications: T[],
  store: NotificationReadStore,
): T[] {
  if (store.readBefore === null && store.readIds.length === 0) return notifications;
  const readSet = new Set(store.readIds);
  return notifications.map((n) => {
    if (n.readAt) return n;
    const createdAt = Date.parse(n.createdAt);
    const byId = readSet.has(n.id);
    const byTime =
      store.readBefore !== null &&
      Number.isFinite(createdAt) &&
      createdAt <= store.readBefore;
    if (byId || byTime) {
      const ts = byTime && store.readBefore !== null ? store.readBefore : Date.now();
      return { ...n, readAt: new Date(ts).toISOString() };
    }
    return n;
  });
}
