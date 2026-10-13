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
  IconCheckCheck,
  IconCircleAlert,
  IconCircleCheck,
  IconTrash,
} from "./icons";
import { TooltipButton } from "./ui";

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
  const markAllNotificationsRead = useAppStore(
    (state) => state.markAllNotificationsRead,
  );
  const clearNotifications = useAppStore((state) => state.clearNotifications);
  const openNotification = useAppStore((state) => state.openNotification);
  const showToast = useAppStore((state) => state.showToast);

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

  const visibleNotifications = useMemo(
    () =>
      filter === "unread"
        ? notifications.filter((n) => !n.readAt)
        : notifications,
    [filter, notifications],
  );

  const runAction = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      try {
        await action();
      } catch {
        showToast(t("notifications.actionFailed"), { variant: "error" });
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [showToast, t],
  );

  const activateNotification = useCallback(
    async (notification: AppNotification) => {
      try {
        await openNotification(notification.id);
      } catch {
        showToast(t("notifications.actionFailed"), { variant: "error" });
      }
    },
    [openNotification, showToast, t],
  );

  return (
    <div className="notifications-page">
      {/* Page head */}
      <div className="notifications-page-head">
        <IconBell size={16} aria-hidden />
        <span className="notifications-page-title">{t("notifications.title")}</span>
        {unreadCount > 0 && (
          <span className="d-pill violet" aria-live="polite">
            {t("notifications.openUnread", { count: unreadCount })}
          </span>
        )}
        <div className="notifications-page-actions">
          <TooltipButton
            type="button"
            className="notification-action"
            tooltip={t("notifications.markAllRead")}
            ariaLabel={t("notifications.markAllRead")}
            disabled={busy || allUnreadCount === 0}
            onClick={() => void runAction(markAllNotificationsRead)}
          >
            <IconCheckCheck size={15} aria-hidden />
          </TooltipButton>
          <TooltipButton
            type="button"
            className="notification-action"
            tooltip={t("notifications.clearAll")}
            ariaLabel={t("notifications.clearAll")}
            disabled={busy || storedNotifications.length === 0}
            onClick={() => void runAction(clearNotifications)}
          >
            <IconTrash size={15} aria-hidden />
          </TooltipButton>
        </div>
      </div>

      {/* All / Unread filter */}
      <div className="notifications-filter-bar" role="group" aria-label={t("notifications.title")}>
        <div className="d-seg">
          {(["all", "unread"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`d-seg-opt${filter === value ? " active" : ""}`}
              aria-pressed={filter === value}
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

      {/* Notification list */}
      <div className="notifications-body" role="main">
        {visibleNotifications.length > 0 ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {visibleNotifications.map((notification) => {
              const failed = notification.kind === "task.failed";
              const sessionTitle = notification.sessionTitle || t("chat.untitledTask");
              const title = t(
                failed ? "notifications.failedTitle" : "notifications.completedTitle",
                { sessionTitle },
              );
              const body = failed
                ? notification.errorCode
                  ? t("notifications.failedBodyWithCode", { code: notification.errorCode })
                  : t("notifications.failedBody")
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
                    <span
                      className={`notif-page-icon${failed ? " failed" : " ok"}`}
                      aria-hidden
                    >
                      {failed ? (
                        <IconCircleAlert size={16} />
                      ) : (
                        <IconCircleCheck size={16} />
                      )}
                    </span>
                    <span className="notif-page-copy">
                      <span className="notif-page-title">{title}</span>
                      <span className="notif-page-body">{body}</span>
                    </span>
                    <time
                      className="notif-page-time"
                      dateTime={notification.createdAt}
                    >
                      {formatRelativeTime(
                        notification.createdAt,
                        i18n.resolvedLanguage || i18n.language,
                        t("notifications.justNow"),
                      )}
                    </time>
                    {!notification.readAt && (
                      <span className="notif-page-unread-dot" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="notifications-page-empty" role="status">
            <IconBell size={22} aria-hidden />
            <strong>
              {t(
                filter === "unread"
                  ? "notifications.emptyUnreadTitle"
                  : "notifications.emptyTitle",
              )}
            </strong>
            <span>
              {t(
                filter === "unread"
                  ? "notifications.emptyUnreadBody"
                  : "notifications.emptyBody",
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
