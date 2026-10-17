import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppNotification } from "@pi-desktop/shared";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import {
  inboxNotifications,
  inboxUnreadCount,
} from "../lib/notification-inbox";
import { notificationAge } from "../lib/notification-time";
import {
  IconBell,
  IconCircleCheck,
  IconCircleX,
  IconCheckCheck,
  IconExternal,
  IconTrash,
} from "./icons";
import { Button, TooltipButton } from "./ui";

type NotificationFilter = "all" | "unread";

/** Group a sorted notification list into Today / Yesterday / dated buckets. */
function groupByDate(
  notifications: AppNotification[],
  today: string,
  yesterday: string,
  locale: string,
): { key: string; label: string; items: AppNotification[] }[] {
  const now = new Date();
  const todayStr = now.toDateString();
  const yestDate = new Date(now);
  yestDate.setDate(yestDate.getDate() - 1);
  const yestStr = yestDate.toDateString();
  const dayFormat = new Intl.DateTimeFormat(locale || undefined, { weekday: "long", month: "short", day: "numeric" });

  const groups: { key: string; label: string; items: AppNotification[] }[] = [];
  for (const n of notifications) {
    const date = new Date(n.createdAt);
    const key = date.toDateString();
    const label = key === todayStr ? today : key === yestStr ? yesterday : dayFormat.format(date);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(n);
    else groups.push({ key, label, items: [n] });
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
  navRailLabel,
}: {
  onBeforeOpen?: () => void;
  /** When set, renders the trigger as a .nav-rail-labeled item with a visible label
   *  (shown on .expanded rail) and wraps the icon in .nav-rail-icon. */
  navRailLabel?: string;
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
        className={`footer-notification notification-trigger${navRailLabel ? " nav-rail-labeled" : ""}`}
        tooltip={unreadLabel}
        ariaLabel={unreadLabel}
        onClick={() => {
          onBeforeOpen?.();
          setPage("notifications");
        }}
      >
        {navRailLabel ? (
          <span className="nav-rail-icon"><IconBell size={16} aria-hidden /></span>
        ) : (
          <IconBell size={14} aria-hidden />
        )}
        {unreadCount > 0 ? (
          <span className="notification-badge" aria-hidden>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
        {navRailLabel && <span className="nav-rail-label">{navRailLabel}</span>}
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

  const locale = i18n.resolvedLanguage || i18n.language;

  const groups = useMemo(
    () => groupByDate(visible, t("notifications.today"), t("notifications.yesterday"), locale),
    [visible, t, locale],
  );

  /** "just now" / "2 m ago" / "2 h ago" / "Yesterday 07:30" / "Oct 11, 08:00". */
  const ageLabel = (value: string) => {
    const age = notificationAge(new Date(value), new Date(), locale);
    switch (age.kind) {
      case "now": return t("notifications.justNow");
      case "minutes": return t("notifications.minutesAgo", { minutes: age.minutes });
      case "hours": return t("notifications.hoursAgo", { hours: age.hours });
      case "yesterday": return t("notifications.yesterdayAt", { time: age.time });
      case "today":
      case "tomorrow": return age.time;
      case "date": return age.text;
    }
  };

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

  return (
    <div className="notifications-page">
      <div className="notifications-card">
      {/* Page head — labeled actions (T12-F07) */}
      <div className="d-page-head">
        <IconBell size={16} aria-hidden className="notifications-page-bell" />
        <span className="d-page-title">{t("notifications.title")}</span>
        {unreadCount > 0 && (
          <span className="d-pill accent" aria-live="polite">
            <span className="d-pill-dot" aria-hidden />
            {t("notifications.unreadCount", { count: unreadCount })}
          </span>
        )}
        <div className="d-page-head-actions">
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
              {value === "all" && notifications.length > 0 && (
                <span className="notifications-filter-count">{notifications.length}</span>
              )}
              {value === "unread" && unreadCount > 0 && (
                <span className="notifications-filter-count">{unreadCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Notification list with date groups (T12-F07) */}
      <div className="notifications-body" role="main">
        {visible.length > 0 ? (
          <ul className="notifications-list">
            {groups.map((group) => (
              <Fragment key={group.key}>
                <li role="presentation">
                  <div className="notifications-date-head">{group.label}</div>
                </li>
                {group.items.map((notification) => {
                  const failed = notification.kind === "task.failed";
                  const sessionTitle = notification.sessionTitle || t("chat.untitledTask");
                  const title = failed
                    ? t("notifications.failedTitle", { sessionTitle })
                    : t("notifications.completedTitle", { sessionTitle });
                  const body = notification.body ?? (failed
                    ? (notification.errorCode
                        ? t("notifications.failedBodyWithCode", { code: notification.errorCode })
                        : t("notifications.failedBody"))
                    : t("notifications.completedBody"));


                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        className={`notifications-page-row${notification.readAt ? "" : " unread"}`}
                        data-notification-id={notification.id}
                        data-kind={notification.kind}
                        disabled={busy}
                        onClick={() => void activateNotification(notification)}
                      >
                        <span className={`notif-page-icon ${failed ? "failed" : "ok"}`} aria-hidden>
                          {failed ? <IconCircleX size={14} /> : <IconCircleCheck size={14} />}
                        </span>
                        <span className="notif-page-copy">
                          <span className="notif-page-title">{title}</span>
                          <span className="notif-page-body">{body}</span>
                        </span>
                        <time className="notif-page-time" dateTime={notification.createdAt}>
                          {ageLabel(notification.createdAt)}
                        </time>
                        <span className="notif-page-link" aria-hidden>
                          <IconExternal size={12} />
                        </span>
                        {!notification.readAt && <span className="notif-page-unread-dot" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </Fragment>
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
    </div>
  );
}
