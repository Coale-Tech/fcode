/**
 * FanoutTab — run the same prompt in N isolated worktrees concurrently and compare results.
 *
 * Setup view: prompt textarea, 2-5 variant rows (branch, agent, model overrides), Run.
 * Compare view: one column per variant with live session status, diff, Open, Adopt.
 *
 * State is local (no store mutations) since a fan-out run is session-scoped.
 */
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FanoutRun, FanoutVariant, FanoutVariantRun, OmpAgentEntry, WorkspaceDiff } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { Button } from "../../components/ui";
import { ScheduledModelPicker } from "../scheduled/ScheduledModelPicker";
import type { ScheduledModelSelection } from "../scheduled/ScheduledExecutionSettings";

// ── VariantDiff ──────────────────────────────────────────────────────────────

/** Inline WorkspaceDiff renderer (not ReviewChangeCard — different input shape). */
function VariantDiff({ diff }: { diff: WorkspaceDiff | null | "loading" }) {
  const { t } = useTranslation();
  if (diff === "loading") {
    return <div className="fanout-diff-loading">{t("panel.fanout.diff.loading")}</div>;
  }
  if (!diff || diff.clean) {
    return <div className="fanout-diff-empty">{t("panel.fanout.diff.noChanges")}</div>;
  }
  if (!diff.repo) {
    return <div className="fanout-diff-empty">{t("panel.fanout.diff.notRepo")}</div>;
  }
  return (
    <div className="fanout-diff">
      {diff.files.map((file) => (
        <details key={file.path} className="fanout-diff-file" open>
          <summary className="fanout-diff-file-head">
            <span className={`fanout-diff-status fanout-diff-status-${file.status}`}>
              {file.status[0]?.toUpperCase()}
            </span>
            <span className="fanout-diff-path">{file.path}</span>
            <span className="fanout-diff-adds">+{file.additions}</span>
            <span className="fanout-diff-dels">-{file.deletions}</span>
          </summary>
          {file.tooLarge ? (
            <div className="fanout-diff-toolarge">{t("panel.fanout.diff.tooLarge")}</div>
          ) : (
            file.hunks.map((hunk, hi) => (
              <div key={hi} className="fanout-diff-hunk">
                <div className="fanout-diff-hunk-header">{hunk.header}</div>
                {hunk.lines.map((line, li) => (
                  <div
                    key={li}
                    className={`fanout-diff-line fanout-diff-line-${line.type}`}
                  >
                    <span className="fanout-diff-sigil">
                      {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                    </span>
                    <span className="fanout-diff-code">{line.text}</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </details>
      ))}
    </div>
  );
}

// ── VariantColumn ────────────────────────────────────────────────────────────

function VariantColumn({
  variant,
  repoPath,
  onOpen,
}: {
  variant: FanoutVariantRun;
  repoPath: string;
  onOpen: (path: string) => void;
}) {
  const { t } = useTranslation();
  const turnFinished = useAppStore((s) => (variant.sessionId ? s.latestTurnResults[variant.sessionId] != null : false));
  const agentStatuses = useAppStore((s) => s.agentStatuses);
  const showToast = useAppStore((s) => s.showToast);

  // Running until the session reports a finished turn: events for a session nobody is viewing can
  // arrive late, and a turn blocked on a permission prompt has not finished either.
  const isRunning = variant.sessionId != null && !turnFinished;
  const agentStatus = variant.sessionId ? agentStatuses[variant.sessionId] : undefined;

  const [diff, setDiff] = useState<WorkspaceDiff | null | "loading">(null);
  const [adoptError, setAdoptError] = useState<string | null>(null);
  const [adopting, setAdopting] = useState(false);

  // Fetch once, as soon as the variant is finished (also when the tab remounts after it finished).
  const fetchedRef = useRef(false);

  const fetchDiff = useCallback(() => {
    if (!variant.worktreePath) return;
    fetchedRef.current = true;
    setDiff("loading");
    api.workspaceDiff(variant.worktreePath).then(
      (d) => setDiff(d),
      () => setDiff(null),
    );
  }, [variant.worktreePath]);

  useEffect(() => {
    if (isRunning || fetchedRef.current || !variant.worktreePath) return;
    if (variant.status === "failed" && !variant.sessionId) return;
    fetchDiff();
  }, [isRunning, variant.worktreePath, variant.status, variant.sessionId, fetchDiff]);

  const handleAdopt = async () => {
    setAdoptError(null);
    setAdopting(true);
    try {
      const result = await api.fanoutAdopt({ repoPath, branch: variant.branch });
      if (result.merged) {
        showToast(t("panel.fanout.toast.adopted", { branch: variant.branch }), { variant: "success" });
      } else {
        const reason = result.reason ?? t("panel.fanout.toast.adoptFailedDefault");
        setAdoptError(reason);
        showToast(t("panel.fanout.toast.adoptFailed", { reason }), { variant: "error" });
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      setAdoptError(reason);
      showToast(t("panel.fanout.toast.adoptFailed", { reason }), { variant: "error" });
    } finally {
      setAdopting(false);
    }
  };

  const statusLabel =
    variant.status === "failed"
      ? t("panel.fanout.status.failed")
      : isRunning
        ? (agentStatus?.activity?.phase ?? t("panel.fanout.status.running"))
        : t("panel.fanout.status.done");

  return (
    <div className={`fanout-variant-col fanout-variant-col-${variant.status}`}>
      <div className="fanout-variant-head">
        <span className="fanout-variant-label">#{variant.n}</span>
        <span className="fanout-variant-branch" title={variant.branch}>{variant.branch}</span>
        <span className={`fanout-variant-status fanout-variant-status-${isRunning ? "running" : variant.status}`}>
          {statusLabel}
        </span>
      </div>
      <div className="fanout-variant-actions">
        {variant.worktreePath && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpen(variant.worktreePath!)}
          >
            {t("panel.fanout.action.open")}
          </Button>
        )}
        {variant.worktreePath && !isRunning && variant.status !== "failed" && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => { void handleAdopt(); }}
            disabled={adopting}
          >
            {adopting ? t("panel.fanout.action.adopting") : t("panel.fanout.action.adopt")}
          </Button>
        )}
        {variant.worktreePath && (
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchDiff}
            disabled={diff === "loading"}
          >
            {t("panel.fanout.action.refreshDiff")}
          </Button>
        )}
      </div>
      {adoptError && <div className="fanout-adopt-error">{adoptError}</div>}
      {variant.error && <div className="fanout-variant-error">{variant.error}</div>}
      <div className="fanout-variant-diff">
        <VariantDiff diff={diff} />
      </div>
    </div>
  );
}

// ── per-variant override state ────────────────────────────────────────────────

type VariantOverride = {
  branch: string;
  agentId: string;
  modelId: string;
  providerId: string;
};

const BLANK_OVERRIDE: VariantOverride = { branch: "", agentId: "", modelId: "", providerId: "" };

/** The compare view outlives the tab: switching sessions or tabs unmounts it, and a run takes minutes. */
let lastRun: FanoutRun | null = null;

// ── FanoutTab ────────────────────────────────────────────────────────────────

export const FanoutTab = memo(function FanoutTab() {
  const { t } = useTranslation();
  const workspace = useAppStore((s) => s.workspace);
  const activateProject = useAppStore((s) => s.activateProject);

  const [promptText, setPromptText] = useState("");
  const [variantCount, setVariantCount] = useState(2);
  const [overrides, setOverrides] = useState<VariantOverride[]>([BLANK_OVERRIDE, BLANK_OVERRIDE]);
  const [run, setRunState] = useState<FanoutRun | null>(lastRun);
  const setRun = useCallback((next: FanoutRun | null) => {
    lastRun = next;
    setRunState(next);
  }, []);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [agents, setAgents] = useState<OmpAgentEntry[]>([]);

  const repoPath = workspace?.path ?? null;

  // Load agent list for the per-variant agent selector.
  useEffect(() => {
    api.ompAgentList(repoPath ?? undefined).then(
      (r) => setAgents(r.agents),
      () => {},
    );
  }, [repoPath]);

  const setOverrideField = useCallback(
    <K extends keyof VariantOverride>(i: number, key: K, value: string) => {
      setOverrides((prev) => {
        const next = [...prev];
        next[i] = { ...next[i]!, [key]: value };
        return next;
      });
    },
    [],
  );

  const setOverrideModel = useCallback((i: number, sel: ScheduledModelSelection) => {
    setOverrides((prev) => {
      const next = [...prev];
      next[i] = { ...next[i]!, providerId: sel.providerId ?? "", modelId: sel.modelId ?? "" };
      return next;
    });
  }, []);

  const handleVariantCount = useCallback(
    (delta: number) => {
      const next = Math.max(2, Math.min(5, variantCount + delta));
      setVariantCount(next);
      setOverrides((prev) => {
        const arr = [...prev];
        while (arr.length < next) arr.push({ ...BLANK_OVERRIDE });
        return arr.slice(0, next);
      });
    },
    [variantCount],
  );

  const handleRun = async () => {
    if (!repoPath || !promptText.trim()) return;
    setLaunchError(null);
    setLaunching(true);
    const variants: FanoutVariant[] = overrides.slice(0, variantCount).map((ov) => ({
      ...(ov.branch.trim() ? { branch: ov.branch.trim() } : {}),
      ...(ov.agentId.trim() ? { agentId: ov.agentId.trim() } : {}),
      ...(ov.modelId.trim() ? { modelId: ov.modelId.trim() } : {}),
      ...(ov.providerId.trim() ? { providerId: ov.providerId.trim() } : {}),
    }));
    try {
      const result = await api.fanoutStart({ repoPath, prompt: promptText.trim(), variants });
      setRun(result);
    } catch (e) {
      setLaunchError(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunching(false);
    }
  };

  const handleOpen = useCallback(
    (path: string) => { void activateProject(path); },
    [activateProject],
  );

  // ── Compare view ─────────────────────────────────────────────────────────
  if (run) {
    return (
      <div className="fanout-compare">
        <div className="fanout-compare-head">
          <button
            type="button"
            className="fanout-back"
            onClick={() => setRun(null)}
          >
            {t("panel.fanout.action.newRun")}
          </button>
          <span className="fanout-prompt-preview" title={run.prompt}>
            {run.prompt.length > 80 ? `${run.prompt.slice(0, 80)}…` : run.prompt}
          </span>
        </div>
        <div className="fanout-columns">
          {run.variants.map((variant) => (
            <VariantColumn
              key={variant.n}
              variant={variant}
              repoPath={run.repoPath}
              onOpen={handleOpen}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Setup view ───────────────────────────────────────────────────────────
  return (
    <div className="fanout-setup">
      <div className="fanout-setup-section">
        <label className="fanout-label" htmlFor="fanout-prompt">
          {t("panel.fanout.setup.prompt")}
        </label>
        <textarea
          id="fanout-prompt"
          className="fanout-prompt-input"
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          placeholder={t("panel.fanout.setup.promptPlaceholder")}
          rows={5}
        />
      </div>

      <div className="fanout-setup-section">
        <div className="fanout-variants-head">
          <span className="fanout-label">{t("panel.fanout.setup.variants")}</span>
          <div className="fanout-stepper">
            <button
              type="button"
              className="fanout-stepper-btn"
              onClick={() => handleVariantCount(-1)}
              disabled={variantCount <= 2}
              aria-label={t("panel.fanout.setup.removeVariant")}
            >
              −
            </button>
            <span className="fanout-stepper-val">{variantCount}</span>
            <button
              type="button"
              className="fanout-stepper-btn"
              onClick={() => handleVariantCount(1)}
              disabled={variantCount >= 5}
              aria-label={t("panel.fanout.setup.addVariant")}
            >
              +
            </button>
          </div>
        </div>
        <div className="fanout-variant-list">
          {Array.from({ length: variantCount }, (_, i) => (
            <div key={i} className="fanout-variant-row">
              <span className="fanout-variant-n">#{i + 1}</span>
              <input
                type="text"
                className="fanout-branch-input"
                value={overrides[i]?.branch ?? ""}
                onChange={(e) => setOverrideField(i, "branch", e.target.value)}
                placeholder={t("panel.fanout.setup.branchPlaceholder")}
              />
              {agents.length > 0 ? (
                <select
                  className="fanout-agent-select"
                  value={overrides[i]?.agentId ?? ""}
                  onChange={(e) => setOverrideField(i, "agentId", e.target.value)}
                  aria-label={t("panel.fanout.setup.agentPlaceholder")}
                >
                  <option value="">{t("panel.fanout.setup.agentPlaceholder")}</option>
                  {agents.map((a) => (
                    <option key={a.name} value={a.name}>{a.name}</option>
                  ))}
                </select>
              ) : null}
              <ScheduledModelPicker
                value={{ providerId: overrides[i]?.providerId || undefined, modelId: overrides[i]?.modelId || undefined }}
                disabled={launching}
                onChange={(sel) => setOverrideModel(i, sel)}
              />
            </div>
          ))}
        </div>
      </div>

      {!repoPath && (
        <p className="fanout-no-workspace">
          {t("panel.fanout.setup.noWorkspace")}
        </p>
      )}

      {launchError && <div className="fanout-launch-error">{launchError}</div>}

      <Button
        variant="primary"
        disabled={!repoPath || !promptText.trim() || launching}
        onClick={() => { void handleRun(); }}
      >
        {launching ? t("panel.fanout.setup.running") : t("panel.fanout.setup.run")}
      </Button>
    </div>
  );
});
