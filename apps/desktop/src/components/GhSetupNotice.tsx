import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PullsErrorKind } from "@pi-desktop/shared";
import { api } from "../lib/api";
import { Button } from "./ui";
import { IconCopy, IconExternal, IconRefresh, IconTriangleAlert } from "./icons";

const INSTALL_GUIDE = "https://cli.github.com";
const INSTALL_COMMAND: Record<string, string> = {
  darwin: "brew install gh",
  win32: "winget install --id GitHub.cli",
};
const NOTICE_KEY = {
  GH_NOT_INSTALLED: "notInstalled",
  GH_NOT_AUTHENTICATED: "notAuthenticated",
  NOT_GITHUB_REPO: "notGithubRepo",
} as const;

/** Loud, actionable callout for the `gh` problems the user can fix without leaving the app's flow. */
export function GhSetupNotice({
  kind,
  checking,
  onRecheck,
}: {
  kind: PullsErrorKind;
  checking: boolean;
  onRecheck: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const key = NOTICE_KEY[kind];
  const command =
    kind === "GH_NOT_INSTALLED"
      ? INSTALL_COMMAND[window.piDesktop?.platform ?? "darwin"]
      : kind === "GH_NOT_AUTHENTICATED"
        ? "gh auth login"
        : undefined;
  return (
    <div className="pr-setup" role="alert">
      <span className="pr-setup-icon" aria-hidden>
        <IconTriangleAlert size={18} />
      </span>
      <div className="pr-setup-main">
        <div className="pr-setup-title">{t(`pulls.setup.${key}.title`)}</div>
        <div className="pr-setup-text">{t(`pulls.setup.${key}.body`)}</div>
        {command && (
          <div className="pr-setup-cmd">
            <code>{command}</code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(command);
                setCopied(true);
              }}
            >
              <IconCopy size={11} aria-hidden />
              {t(copied ? "pulls.setup.copied" : "pulls.setup.copy")}
            </Button>
          </div>
        )}
        <div className="pr-setup-actions">
          {kind === "GH_NOT_INSTALLED" && (
            <Button size="sm" variant="secondary" onClick={() => void api.browserOpenExternal(INSTALL_GUIDE)}>
              <IconExternal size={11} aria-hidden />
              {t("pulls.setup.installGuide")}
            </Button>
          )}
          <Button size="sm" variant="primary" disabled={checking} onClick={onRecheck}>
            <IconRefresh size={11} aria-hidden />
            {t("pulls.setup.recheck")}
          </Button>
        </div>
      </div>
    </div>
  );
}
