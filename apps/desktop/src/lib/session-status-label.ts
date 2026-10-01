import type { SidebarSessionStatus } from "./sidebar-session-status";

/**
 * Visible text label for active session states; null for idle/terminal states.
 * Pure decision function — no i18n, no React.
 */
export function sessionStatusLabel(status: SidebarSessionStatus | null): string | null {
  if (status === "running") return "Running";
  if (status === "permission") return "Needs approval";
  return null;
}
