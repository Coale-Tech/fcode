/**
 * OmpWorktreeTab — Work Panel tab for agent-managed git worktree management.
 *
 * The /worktree view from the plan (T7). Renders the OmpWorktreeSection
 * component (single implementation) in the work-panel tabpane context.
 */
import { memo } from "react";
import { OmpWorktreeSection } from "../../components/settings/OmpWorktreeSection";

export const OmpWorktreeTab = memo(function OmpWorktreeTab() {
  return (
    <div className="omp-worktree-tab">
      <OmpWorktreeSection />
    </div>
  );
});
