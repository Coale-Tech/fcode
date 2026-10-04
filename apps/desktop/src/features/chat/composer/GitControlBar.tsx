import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AnchoredMenu } from "../../../components/settings/AnchoredMenu";
import { TooltipButton } from "../../../components/ui";
import {
  IconArrowDown,
  IconArrowUp,
  IconBranch,
  IconChevronDown,
  IconPullRequest,
} from "../../../components/icons";
import { api } from "../../../lib/api";
import { useAppStore } from "../../../stores/app-store";

/**
 * Branch chip plus pull / push / open-PR actions above the composer. Every
 * action is a canned prompt into the current session: the agent runs git, so
 * a dirty tree is never mutated behind its back (the OpenHands model). The
 * only direct git call is the read-only branch list, fetched on open.
 */
export function GitControlBar({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const workspace = useAppStore((s) => s.workspace);
  const sendPrompt = useAppStore((s) => s.sendPrompt);
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<string[] | null>(null);
  if (!workspace?.path) return null;

  const send = (prompt: string) => {
    setOpen(false);
    void sendPrompt(prompt);
  };
  const toggle = () => {
    if (!open) {
      void api
        .listGitBranches()
        .then((res) => setBranches(res.branches))
        .catch(() => setBranches([]));
    }
    setOpen((value) => !value);
  };
  const actions = [
    {
      id: "pull",
      icon: <IconArrowDown size={13} />,
      label: t("git.pull"),
      prompt: "Pull the latest changes for the current branch.",
    },
    {
      id: "push",
      icon: <IconArrowUp size={13} />,
      label: t("git.push"),
      prompt: "Push the current branch to its remote, setting upstream if needed.",
    },
    {
      id: "pr",
      icon: <IconPullRequest size={13} />,
      label: t("git.createPr"),
      prompt:
        "Push the current branch and open a pull request against the default branch. Summarise the changes in the description.",
    },
  ];

  return (
    <div className="git-bar">
      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        menuClassName="composer-permission-menu git-bar-menu"
        label={t("git.switchBranch")}
        role="menu"
        align="start"
        side="top"
        trigger={(ref) => (
          <TooltipButton
            ref={ref}
            type="button"
            className={`icon-btn mode-chip ${open ? "active" : ""}`}
            tooltip={t("git.switchBranch")}
            ariaLabel={`${t("git.branch")}: ${workspace.branch ?? "—"}`}
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={disabled}
            onClick={toggle}
          >
            <IconBranch size={13} />
            <span className="text-sm">{workspace.branch ?? t("git.branch")}</span>
            <IconChevronDown size={12} />
          </TooltipButton>
        )}
      >
        {branches?.length === 0 ? (
          <div className="git-bar-empty">{t("git.noBranches")}</div>
        ) : (
          branches?.map((name) => (
            <button
              key={name}
              type="button"
              role="menuitem"
              className={`composer-plus-item ${name === workspace.branch ? "active" : ""}`}
              disabled={name === workspace.branch}
              onClick={() =>
                send(
                  `Switch the repository to branch "${name}". If the working tree is dirty, tell me what is uncommitted and stop instead of discarding anything.`,
                )
              }
            >
              <span className="flex-1 text-left">{name}</span>
            </button>
          ))
        )}
      </AnchoredMenu>
      {actions.map((action) => (
        <TooltipButton
          key={action.id}
          type="button"
          className="icon-btn mode-chip"
          tooltip={action.label}
          ariaLabel={action.label}
          disabled={disabled}
          onClick={() => send(action.prompt)}
        >
          {action.icon}
          <span className="text-sm">{action.label}</span>
        </TooltipButton>
      ))}
    </div>
  );
}
