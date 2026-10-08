import { useEffect, useMemo, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  permissionSecondsLeft,
  PERMISSION_TIMEOUT_MS,
  type PendingPermission,
} from "../lib/pending-permissions";
import { useAppStore } from "../stores/app-store";
import { buildToolPresentation } from "../lib/tool-presentation";
import { ToolDetailBlocks } from "./ToolDetails";
import { Button } from "./ui";
import { DestructiveActionDialog } from "./DestructiveActionDialog";

export function PermissionCard({
  permission,
  queued = 0,
}: {
  permission: PendingPermission;
  /** Requests waiting behind this one; the user answers them in order. */
  queued?: number;
}) {
  const { t } = useTranslation();
  const resolvePermission = useAppStore((state) => state.resolvePermission);
  const showToast = useAppStore((state) => state.showToast);
  const workspace = useAppStore((state) =>
    state.sessions.find((session) => session.id === permission.sessionId)?.projectPath,
  );
  const [secondsLeft, setSecondsLeft] = useState(() =>
    permissionSecondsLeft(permission.receivedAt),
  );
  const [resolving, setResolving] = useState(false);
  const timeoutHandled = useRef(false);
  // fcode_bench_run and fcode_bench_execute use DestructiveActionDialog (T8, D14:
  // no auto-deny timer; names site, command and consequence explicitly).
  // fcode_bench_execute_read is auto-approved and never reaches this card.
  const isBenchDestructive =
    permission.toolName === "fcode_bench_run" ||
    permission.toolName === "fcode_bench_execute" ||
    permission.toolName === "fcode_studio";

  const restoreComposerFocus = () => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>(".composer-input")?.focus();
    });
  };

  const resolve = async (
    decision: "allow-once" | "allow-session" | "deny",
  ) => {
    if (resolving) return;
    setResolving(true);
    try {
      await resolvePermission(permission.sessionId, permission.requestId, decision);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), {
        variant: "error",
      });
      setResolving(false);
    } finally {
      restoreComposerFocus();
    }
  };

  useEffect(() => {
    timeoutHandled.current = false;
    const update = () => setSecondsLeft(permissionSecondsLeft(permission.receivedAt));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [permission.receivedAt, permission.requestId]);

  useEffect(() => {
    // Bench-destructive tools use DestructiveActionDialog; no timer here.
    if (isBenchDestructive) return;
    if (secondsLeft > 0 || timeoutHandled.current || resolving) return;
    timeoutHandled.current = true;
    void resolve("deny");
  }, [isBenchDestructive, resolving, secondsLeft]);

  // Same structured presentation as the transcript tool rows: a command reads
  // as shell, file content as code, everything else as labeled fields.
  const argBlocks = useMemo(
    () =>
      buildToolPresentation({
        toolName: permission.toolName,
        toolArgs: permission.argsPreview,
      }),
    [permission.argsPreview, permission.toolName],
  );
  const risk = (permission.risk || "high") as "low" | "medium" | "high";
  // fcode_bench_run / fcode_bench_execute: render the dedicated dialog that
  // names site, command and consequence without an auto-deny timer (plan D14).
  if (isBenchDestructive) {
    const p = permission.argsPreview;
    const isObj = p != null && typeof p === "object";
    const site = isObj && "site" in p && p.site != null ? String(p.site) : "active site";
    const fields = (isObj ? p : {}) as Record<string, unknown>;
    const field = (key: string) => (fields[key] != null ? String(fields[key]) : "");
    const rawCommand =
      permission.toolName === "fcode_bench_run"
        ? (field("command") === "run-tests"
            ? `run-tests ${field("module") || field("doctype") || field("app")}`.trim()
            : (field("command") || permission.toolName))
        : permission.toolName === "fcode_studio"
          ? `${field("action")} ${field("app") || field("page")}`.trim()
          : (field("method") || permission.toolName);
    const consequence =
      permission.toolName === "fcode_bench_run"
        ? (rawCommand === "migrate"
            ? "alters the database schema"
            : field("command") === "run-tests"
              ? "runs the test suite, which writes test records to the site database"
              : "alters bench state")
        : permission.toolName === "fcode_studio"
          ? "changes Studio's published pages or where its source of truth lives"
          : "modifies the database";
    return (
      <DestructiveActionDialog
        site={site}
        command={rawCommand}
        consequence={consequence}
        onConfirm={() => { restoreComposerFocus(); void resolve("allow-once"); }}
        onCancel={() => { restoreComposerFocus(); void resolve("deny"); }}
      />
    );
  }

  const totalSeconds = PERMISSION_TIMEOUT_MS / 1000;
  const pct = (secondsLeft / totalSeconds) * 100;
  return (
    <section
      className={`permission-card risk-${risk}`}
      role="region"
      aria-label={t("permission.title")}
    >
      <div
        className="permission-card-timer-bar"
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      />
      <div className="permission-card-header">
        <span className="permission-card-title" role="status" aria-live="polite">
          {t("permission.title")}
        </span>
        {queued > 0 ? (
          <span className="permission-card-queued">
            {t("permission.queued", { count: queued })}
          </span>
        ) : null}
        <span className={`permission-risk risk-${risk}`}>
          {t(`permission.risk.${risk}`)}
        </span>
      </div>
      {permission.agentName ? (
        <div className="permission-card-agent">
          {t("permission.fromSubagent", { agent: permission.agentName })}
        </div>
      ) : null}
      <div className="permission-card-prompt">
        <Trans
          i18nKey="permission.allowPrompt"
          values={{ tool: permission.toolName }}
          components={{ highlight: <span className="text-text-primary" /> }}
        />
      </div>
      {permission.reason ? (
        <div className="permission-card-reason">{permission.reason}</div>
      ) : null}
      {argBlocks.length > 0 ? (
        <div className="permission-card-args">
          <ToolDetailBlocks blocks={argBlocks} />
        </div>
      ) : null}
      <div className="permission-card-meta">
        <span title={workspace}>
          {t("permission.workspace", {
            workspace: workspace || t("permission.temporarySession"),
          })}
        </span>
        <span role="timer">
          {t("permission.countdown", { seconds: secondsLeft })}
        </span>
      </div>
      <div className="permission-card-actions">
        <div className="permission-action-item">
          <Button
            variant="primary"
            disabled={resolving}
            onClick={() => void resolve("allow-once")}
          >
            {t("permission.allowOnce")}
          </Button>
          <span className="permission-action-hint">{t("permission.allowOnceHint")}</span>
        </div>
        <div className="permission-action-item">
          <Button
            variant="secondary"
            disabled={resolving}
            onClick={() => void resolve("allow-session")}
          >
            {t("permission.allowSession")}
          </Button>
          <span className="permission-action-hint">{t("permission.allowSessionHint")}</span>
        </div>
        <div className="permission-action-item">
          <Button
            variant="ghost"
            className="permission-deny-btn"
            disabled={resolving}
            onClick={() => void resolve("deny")}
          >
            {t("permission.deny")}
          </Button>
          <span className="permission-action-hint">{t("permission.denyHint")}</span>
        </div>
      </div>
    </section>
  );
}
