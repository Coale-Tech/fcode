import type { AppNotification } from "@pi-desktop/shared";

/**
 * Full inbox: all notification kinds visible (approved design R11g).
 * The old outcomes-only filter is removed; completed tasks appear alongside
 * failures, ask-for-input, permission requests and plan-approval notifications.
 */
export function inboxNotifications(
  notifications: AppNotification[],
): AppNotification[] {
  return notifications;
}

export function inboxUnreadCount(notifications: AppNotification[]): number {
  return notifications.reduce(
    (count, n) => count + (n.readAt ? 0 : 1),
    0,
  );
}
