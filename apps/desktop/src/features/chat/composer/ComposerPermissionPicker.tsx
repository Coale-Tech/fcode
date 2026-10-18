import type { Dispatch, SetStateAction } from "react";
import type { TFunction } from "i18next";
import type { GlobalPermissionMode, Mode } from "@pi-desktop/shared";
import { AnchoredMenu } from "../../../components/settings/AnchoredMenu";
import { TooltipButton } from "../../../components/ui";
import { IconCheck, IconChevronDown, IconShield, IconPencil, IconWrench } from "../../../components/icons";
import { PERMISSION_MODE_I18N_KEYS } from "../../../lib/permission-mode-labels";

/** Controlled permission UI shared by conversations and task drafts. */
export function ComposerPermissionPicker({t, mode, composerPermissionMode,
  permissionOpen, setPermissionOpen, controlsBlocked, onCloseOtherMenus, onSelect,
}: {
  t: TFunction;
  mode: Mode;
  composerPermissionMode: GlobalPermissionMode;
  permissionOpen: boolean;
  setPermissionOpen: Dispatch<SetStateAction<boolean>>;
  controlsBlocked: boolean;
  onCloseOtherMenus: () => void;
  onSelect: (mode: GlobalPermissionMode) => void | Promise<void>;
}) {
  return (
        <AnchoredMenu
          className="composer-permission"
          open={permissionOpen && mode !== "goal"}
          onClose={() => setPermissionOpen(false)}
          menuClassName="composer-permission-menu"
          label={t("chat.permissionMode")}
          role="menu"
          align="start"
          side="top"
          trigger={(ref) => (
            <TooltipButton
              ref={ref}
              type="button"
              className={`icon-btn mode-chip ${permissionOpen ? "active" : ""}`}
              tooltip={
                mode === "goal"
                  ? `${t("chat.permissionMode")} · ${t("goal.autoWarning")}`
                  : mode === "plan" && composerPermissionMode === "auto"
                    ? `${t("chat.permissionMode")} · ${t("plan.autoWarning")}`
                    : t("chat.permissionMode")
              }
              ariaLabel={
                mode === "goal"
                  ? `${t("chat.permissionMode")} · ${t("goal.autoWarning")}`
                  : mode === "plan" && composerPermissionMode === "auto"
                    ? `${t("chat.permissionMode")} · ${t("plan.autoWarning")}`
                    : t("chat.permissionMode")
              }
              aria-haspopup={mode === "goal" ? undefined : "menu"}
              aria-expanded={mode === "goal" ? false : permissionOpen}
              disabled={controlsBlocked || mode === "goal"}
              onClick={() => {
                onCloseOtherMenus();
                setPermissionOpen((open) => !open);
              }}
            >
              <span className="text-sm">
                {t("chat.permissionsLabel", { mode: t(PERMISSION_MODE_I18N_KEYS[composerPermissionMode]) })}
              </span>
              <IconChevronDown size={12} />
            </TooltipButton>
          )}
        >
          {(["ask", "accept-edits", "auto"] as const).map((candidate) => {
            const isActive = composerPermissionMode === candidate;
            /* D: state-perm-menu.html — icon tile, name, description, check */
            const Icon = candidate === "ask" ? IconShield : candidate === "accept-edits" ? IconPencil : IconWrench;
            const descKey =
              candidate === "ask" ? "chat.permissionAskDesc" :
              candidate === "accept-edits" ? "chat.permissionAcceptEditsDesc" :
              "chat.permissionAutoDesc";
            return (
              <button
                key={candidate}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                disabled={controlsBlocked}
                className={`composer-plus-item composer-perm-item${isActive ? " active" : ""}`}
                onClick={async () => {
                  setPermissionOpen(false);
                  await onSelect(candidate);
                }}
              >
                <span className={`composer-perm-icon${isActive ? " is-active" : ""}`} aria-hidden>
                  <Icon size={12} />
                </span>
                <span className="composer-perm-label">
                  <span className="composer-perm-name">{t(PERMISSION_MODE_I18N_KEYS[candidate])}</span>
                  <span className="composer-perm-desc">{t(descKey)}</span>
                </span>
                {isActive ? <IconCheck size={13} className="composer-perm-check" aria-hidden /> : null}
              </button>
            );
          })}
        </AnchoredMenu>
  );
}
