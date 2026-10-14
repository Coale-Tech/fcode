import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppNotification } from "@pi-desktop/shared";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import {
  inboxNotifications,
  inboxUnreadCount,
} from "../lib/notification-inbox";
import {
  IconBell,
  IconCircleAlert,
  IconCircleCheck,
  IconCheckCheck,
  IconTrash,
} from "./icons";
import { Button, TooltipButton } from "./ui";

type NotificationFilter = "all" | "unread";

function formatRelativeTime(value: string, locale: string, justNow: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return justNow;

  const delta = timestamp - Date.now();
  const absoluteDelta = Math.abs(delta);
  if (absoluteDelta < 45_000) return justNow;

  try {
    const formatter = new Intl.RelativeTimeFormat(locale || undefined, {
      numeric: "auto",
    });
    if (absoluteDelta < 60 * 60_000) {
      return formatter.format(Math.round(delta / 60_000), "minute");
    }
    if (absoluteDelta < 24 * 60 * 60_000) {
      return formatter.format(Math.round(delta / (60 * 60_000)), "hour");
    }
    if (absoluteDelta < 7 * 24 * 60 * 60_000) {
      return formatter.format(Math.round(delta / (24 * 60 * 60_000)), "day");
    }
    return new Intl.DateTimeFormat(locale || undefined, {
      month: "short",
      day: "numeric",
    }).format(timestamp);
  } catch {
    return justNow;
  }
}

/** Group a sorted notification list into Today / Yesterday / Earlier buckets. */
function groupByDate(
  notifications: AppNotification[],
  today: string,
  yesterday: string,
): { label: string; items: AppNotification[] }[] {
  const now = new Date();
  const todayStr = now.toDateString();
  const yestDate = new Date(now);
  yestDate.setDate(yestDate.getDate() - 1);
  const yestStr = yestDate.toDateString();

  const groups: { label: string; items: AppNotification[] }[] = [];
  for (const n of notifications) {
    const ds = new Date(n.createdAt).toDateString();
    const label = ds === todayStr ? today : ds === yestStr ? yesterday : ds;
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }
  return groups;
}

/**
 * Bell trigger shown in the nav rail footer.
 * Clicking navigates to the full Notifications inbox page (R11g).
 * The badge reflects the unread count.
 */
export function NotificationCenter({
  onBeforeOpen,
}: {
  onBeforeOpen?: () => void;
}) {
  const { t } = useTranslation();
  const storedNotifications = useAppStore((state) => state.notifications);
  const unreadCount = useMemo(
    () => inboxUnreadCount(storedNotifications),
    [storedNotifications],
  );
  const setPage = useAppStore((state) => state.setPage);

  const unreadLabel =
    unreadCount > 0
      ? t("notifications.openUnread", { count: unreadCount })
      : t("notifications.open");

  return (
    <div className="notification-center">
      <TooltipButton
        type="button"
        className={`footer-notification notification-trigger`}
        tooltip={unreadLabel}
        ariaLabel={unreadLabel}
        onClick={() => {
          onBeforeOpen?.();
          setPage("notifications");
        }}
      >
        <IconBell size={14} aria-hidden />
        {unreadCount > 0 ? (
          <span className="notification-badge" aria-hidden>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </TooltipButton>
    </div>
  );
}

/**
 * Full-page Notifications inbox (Direction D, R11g).
 * Rendered as a routed page via AppShell when page === "notifications".
 */
export function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const storedNotifications = useAppStore((state) => state.notifications);
  const notifications = useMemo(
    () => inboxNotifications(storedNotifications),
    [storedNotifications],
  );
  const unreadCount = useMemo(
    () => inboxUnreadCount(storedNotifications),
    [storedNotifications],
  );
  const allUnreadCount = useAppStore((state) => state.unreadNotificationCount);
  const refreshNotifications = useAppStore((state) => state.refreshNotifications);
  const markAllNotificationsRead = useAppStore((s) => s.markAllNotificationsRead);
  const clearNotifications = useAppStore((s) => s.clearNotifications);
  const openNotification = useAppStore((s) => s.openNotification);
  const showToast = useAppStore((s) => s.showToast);

  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setBusy(true);
    void refreshNotifications()
      .catch(() => showToast(t("notifications.actionFailed"), { variant: "error" }))
      .finally(() => { if (mounted.current) setBusy(false); });
    return () => { mounted.current = false; };
  }, [refreshNotifications, showToast, t]);

  const visible = useMemo(
    () => filter === "unread" ? notifications.filter((n) => !n.readAt) : notifications,
    [filter, notifications],
  );

  const groups = useMemo(
    () => groupByDate(visible, t("notifications.today"), t("notifications.yesterday")),
    [visible, t],
  );

  const runAction = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      try { await action(); }
      catch { showToast(t("notifications.actionFailed"), { variant: "error" }); }
      finally { if (mounted.current) setBusy(false); }
    },
    [showToast, t],
  );

  const activateNotification = useCallback(
    async (notification: AppNotification) => {
      try { await openNotification(notification.id); }
      catch { showToast(t("notifications.actionFailed"), { variant: "error" }); }
    },
    [openNotification, showToast, t],
  );

  const locale = i18n.resolvedLanguage || i18n.language;

  return (
    <div className="notifications-page">
      {/* Page head — labeled actions (T12-F07) */}
      <div className="notifications-page-head">
        <IconBell size={16} aria-hidden />
        <span className="notifications-page-title">{t("notifications.title")}</span>
        {unreadCount > 0 && (
          <span className="d-pill violet" aria-live="polite">
            <span className="d-pill-dot" aria-hidden />
            {t("notifications.unreadCount", { count: unreadCount })}
          </span>
        )}
        <div className="notifications-page-actions">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || allUnreadCount === 0}
            onClick={() => void runAction(markAllNotificationsRead)}
            aria-label={t("notifications.markAllRead")}
          >
            <IconCheckCheck size={13} aria-hidden />
            {t("notifications.markAllRead")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || storedNotifications.length === 0}
            onClick={() => void runAction(clearNotifications)}
            aria-label={t("notifications.clearAll")}
          >
            <IconTrash size={13} aria-hidden />
            {t("notifications.clearAll")}
          </Button>
        </div>
      </div>

      {/* All / Unread filter using existing settings-segment primitive */}
      <div className="notifications-filter-bar" role="group" aria-label={t("notifications.title")}>
        <div className="settings-segment" role="radiogroup" aria-label={t("notifications.title")}>
          {(["all", "unread"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={filter === value}
              className={`settings-segment-item${filter === value ? " active" : ""}`}
              onClick={() => setFilter(value)}
            >
              {t(`notifications.${value}`)}
              {value === "unread" && unreadCount > 0 && (
                <span className="d-mini-count">{unreadCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Notification list with date groups (T12-F07) */}
      <div className="notifications-body" role="main">
        {visible.length > 0 ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {groups.map((group) => (
              <>
                <li key={group.label} role="presentation">
                  <div className="notifications-date-head">{group.label}</div>
                </li>
                {group.items.map((notification) => {
                  const failed = notification.kind === "task.failed";
                  const sessionTitle = notification.sessionTitle || t("chat.untitledTask");
                  const title = failed
                    ? t("notifications.failedTitle", { sessionTitle })
                    : t("notifications.completedTitle", { sessionTitle });
                  const body = failed
                    ? (notification.errorCode
                        ? t("notifications.failedBodyWithCode", { code: notification.errorCode })
                        : t("notifications.failedBody"))
                    : t("notifications.completedBody");


                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        className={`notifications-page-row${notification.readAt ? "" : " unread"}`}
                        data-notification-id={notification.id}
                        disabled={busy}
                        onClick={() => void activateNotification(notification)}
                      >
                        <span className={`notif-page-icon ${failed ? "failed" : "ok"}`} aria-hidden>
                          {failed ? <IconCircleAlert size={16} /> : <IconCircleCheck size={16} />}
                        </span>
                        <span className="notif-page-copy">
                          <span className="notif-page-title">{title}</span>
                          <span className="notif-page-body">{body}</span>
                        </span>
                        <time className="notif-page-time" dateTime={notification.createdAt}>
                          {formatRelativeTime(notification.createdAt, locale, t("notifications.justNow"))}
                        </time>
                        {!notification.readAt && <span className="notif-page-unread-dot" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </>
            ))}
          </ul>
        ) : (
          <div className="notifications-page-empty" role="status">
            <IconBell size={22} aria-hidden />
            <strong>{t(filter === "unread" ? "notifications.emptyUnreadTitle" : "notifications.emptyTitle")}</strong>
            <span>{t(filter === "unread" ? "notifications.emptyUnreadBody" : "notifications.emptyBody")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
