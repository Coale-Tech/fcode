/**
 * Settings UI sections for omp settings groups:
 * Task Subagents / Eval & Python / Browser / Collab /
 * LSP / IDA Pro / MCP / Skills & Commands / Hindsight Behavior /
 * Installed Skills / Usage / Agent Worktrees.
 * Rendered inside the AI settings tab.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OmpModel, OmpSettingsValues } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Button, Input, SettingsToggle } from "../../components/ui";
import { SettingsMenuSelect } from "../../components/settings/SettingsMenuSelect";
import { SettingsCard, SettingsRow } from "./primitives";
import { OmpSkillsSection } from "../../components/settings/OmpSkillsSection";
import { SkillPackSection } from "../../components/settings/SkillPackSection";
import { SkillCuratorSection } from "../../components/settings/SkillCuratorSection";
import { SkillReviewSection } from "../../components/settings/SkillReviewSection";
import { SkillJourneySection } from "../../components/settings/SkillJourneySection";
import { OmpUsageSection } from "../../components/settings/OmpUsageSection";
import { OmpWorktreeSection } from "../../components/settings/OmpWorktreeSection";
import { OmpExtensionsSection } from "../../components/settings/OmpExtensionsSection";

/** Bundled omp agent names (from omp/packages/coding-agent/src/task/agents.ts). */
const BUNDLED_AGENTS = ["task", "sonic", "scout", "reviewer", "security-reviewer"] as const;

export type OmpSettingsPart = "defaults" | "agents" | "tools" | "extensions" | "memory";

/** Renders one slice of omp settings; the Settings rail splits AI into several pages. */
export function OmpSettingsSections({ part }: { part: OmpSettingsPart }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [omp, setOmp] = useState<OmpSettingsValues>({});
  const [ompModels, setOmpModels] = useState<OmpModel[]>([]);

  const load = useCallback(() => {
    setLoadState("loading");
    Promise.all([api.ompSettingsGet(), api.ompModelsList()])
      .then(([settings, models]) => {
        setOmp(settings);
        setOmpModels(models.models);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(
    async (patch: OmpSettingsValues) => {
      const merged = { ...omp, ...patch };
      setOmp(merged);
      try {
        const saved = await api.ompSettingsSet(patch);
        setOmp(saved);
      } catch {
        // Revert optimistic update on error
        setOmp(omp);
      }
    },
    [omp],
  );

  // L6: don't render omp sections when sidecar is not available.
  if (loadState === "loading") {
    return <p className="settings-row-desc">{t("common.loading")}</p>;
  }
  if (loadState === "error") {
    return (
      <div className="settings-row-desc">
        <span>{t("settings.ompSidecarNotRunning")}</span>{" "}
        <Button size="sm" variant="secondary" onClick={load}>
          {t("settings.ompSidecarRetry")}
        </Button>
      </div>
    );
  }

  return (
    <>
      {part === "agents" && (
        <>
        {/* ── Task Subagents ───────────────────────────────────────── */}
        <SettingsCard title={t("settings.ompTaskGroup")}>
          <SettingsRow title={t("settings.ompTaskIsolation")} description={t("settings.ompTaskIsolationDesc")}>
            <SettingsToggle
              checked={omp["task.isolation.enabled"] === true}
              label={t("settings.ompTaskIsolation")}
              onChange={() => void save({ "task.isolation.enabled": !(omp["task.isolation.enabled"] === true) })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompIsolationBackend")} description={t("settings.ompIsolationBackendDesc")}>
            <SettingsMenuSelect
              label={t("settings.ompIsolationBackend")}
              value={omp["isolation.backend"] ?? "auto"}
              onChange={(v) => void save({ "isolation.backend": v as OmpSettingsValues["isolation.backend"] })}
              options={[
                { id: "auto", label: t("settings.ompIsolationBackendAuto") },
                { id: "apfs", label: t("settings.ompIsolationBackendApfs") },
                { id: "btrfs", label: t("settings.ompIsolationBackendBtrfs") },
                { id: "zfs", label: t("settings.ompIsolationBackendZfs") },
                { id: "reflink", label: t("settings.ompIsolationBackendReflink") },
                { id: "overlayfs", label: t("settings.ompIsolationBackendOverlayfs") },
                { id: "projfs", label: t("settings.ompIsolationBackendProjfs") },
                { id: "block-clone", label: t("settings.ompIsolationBackendBlockClone") },
                { id: "rcopy", label: t("settings.ompIsolationBackendRcopy") },
              ]}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompWorktreeClone")} description={t("settings.ompWorktreeCloneDesc")}>
            <SettingsToggle
              checked={omp["worktree.clone"] !== false}
              label={t("settings.ompWorktreeClone")}
              onChange={() => void save({ "worktree.clone": !(omp["worktree.clone"] !== false) })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompTaskMaxConcurrency")} description={t("settings.ompTaskMaxConcurrencyDesc")}>
            <SettingsMenuSelect
              label={t("settings.ompTaskMaxConcurrency")}
              value={String(omp["task.maxConcurrency"] ?? 32)}
              onChange={(v) => void save({ "task.maxConcurrency": Number(v) })}
              options={[
                { id: "0", label: t("settings.ompIsolationBackendAuto").replace("Auto", "Unlimited") },
                { id: "1", label: "1" },
                { id: "2", label: "2" },
                { id: "4", label: "4" },
                { id: "8", label: "8" },
                { id: "16", label: "16" },
                { id: "32", label: "32" },
                { id: "64", label: "64" },
              ]}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompTaskMaxRecursionDepth")} description={t("settings.ompTaskMaxRecursionDepthDesc")}>
            <SettingsMenuSelect
              label={t("settings.ompTaskMaxRecursionDepth")}
              value={String(omp["task.maxRecursionDepth"] ?? 2)}
              onChange={(v) => void save({ "task.maxRecursionDepth": Number(v) })}
              options={[
                { id: "-1", label: "Unlimited" },
                { id: "0", label: "None" },
                { id: "1", label: "1" },
                { id: "2", label: "2" },
                { id: "3", label: "3" },
              ]}
            />
          </SettingsRow>
          {/* ── Agent model overrides ─────────────────────────────── */}
          {BUNDLED_AGENTS.map((agent) => {
            const current = omp["task.agentModelOverrides"]?.[agent] ?? "";
            const modelOptions = [
              { id: "", label: t("settings.ompAgentModelOverridesDefault") },
              ...ompModels.map((m) => {
                const fullId = `${m.provider.id}/${m.id}`;
                const label = fullId.length > 44 ? `${fullId.slice(0, 41)}…` : fullId;
                return { id: fullId, label, title: fullId };
              }),
            ];
            return (
              <SettingsRow
                key={agent}
                title={agent}
                description={t("settings.ompAgentModelOverridesDesc")}
              >
                <SettingsMenuSelect
                  label={agent}
                  value={current}
                  onChange={(v) => {
                    const overrides = { ...(omp["task.agentModelOverrides"] ?? {}) };
                    if (v === "") {
                      delete overrides[agent];
                    } else {
                      overrides[agent] = v;
                    }
                    void save({ "task.agentModelOverrides": overrides });
                  }}
                  options={modelOptions}
                />
              </SettingsRow>
            );
          })}
        </SettingsCard>
        </>
      )}

      {part === "tools" && (
        <>
        {/* ── Approvals ────────────────────────────────────────────── */}
        <SettingsCard title={t("settings.ompApprovalsGroup")}>
          <SettingsRow title={t("settings.ompBashAutoApproveReadOnly")} description={t("settings.ompBashAutoApproveReadOnlyDesc")}>
            <SettingsToggle
              checked={omp["bash.autoApproveReadOnly"] !== false}
              label={t("settings.ompBashAutoApproveReadOnly")}
              onChange={() => void save({ "bash.autoApproveReadOnly": !(omp["bash.autoApproveReadOnly"] !== false) })}
            />
          </SettingsRow>
        </SettingsCard>

        {/* ── Eval & Python ────────────────────────────────────────── */}
        <SettingsCard title={t("settings.ompEvalGroup")}>
          <SettingsRow title={t("settings.ompEvalPy")} description={t("settings.ompEvalPyDesc")}>
            <SettingsToggle
              checked={omp["eval.py"] !== false}
              label={t("settings.ompEvalPy")}
              onChange={() => void save({ "eval.py": !(omp["eval.py"] !== false) })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompEvalJs")} description={t("settings.ompEvalJsDesc")}>
            <SettingsToggle
              checked={omp["eval.js"] !== false}
              label={t("settings.ompEvalJs")}
              onChange={() => void save({ "eval.js": !(omp["eval.js"] !== false) })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompEvalTools")} description={t("settings.ompEvalToolsDesc")}>
            <SettingsToggle
              checked={omp["eval.tools.enabled"] !== false}
              label={t("settings.ompEvalTools")}
              onChange={() => void save({ "eval.tools.enabled": !(omp["eval.tools.enabled"] !== false) })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompPythonKernelMode")} description={t("settings.ompPythonKernelModeDesc")}>
            <SettingsMenuSelect
              label={t("settings.ompPythonKernelMode")}
              value={omp["python.kernelMode"] ?? "session"}
              onChange={(v) => void save({ "python.kernelMode": v as "session" | "per-call" })}
              options={[
                { id: "session", label: t("settings.ompPythonKernelModeSession") },
                { id: "per-call", label: t("settings.ompPythonKernelModePerCall") },
              ]}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompPythonInterpreter")} description={t("settings.ompPythonInterpreterDesc")}>
            <Input
              type="text"
              value={omp["python.interpreter"] ?? ""}
              placeholder={t("settings.ompPythonInterpreterPlaceholder")}
              aria-label={t("settings.ompPythonInterpreter")}
              onChange={(e) => setOmp((prev) => ({ ...prev, "python.interpreter": e.target.value }))}
              onBlur={(e) => void save({ "python.interpreter": e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            />
          </SettingsRow>
        </SettingsCard>
        </>
      )}

      {part === "tools" && (
        <>
        {/* ── Browser ──────────────────────────────────────────────── */}
        <SettingsCard title={t("settings.ompBrowserGroup")}>
          <SettingsRow title={t("settings.ompBrowserEnabled")} description={t("settings.ompBrowserEnabledDesc")}>
            <SettingsToggle
              checked={omp["browser.enabled"] !== false}
              label={t("settings.ompBrowserEnabled")}
              onChange={() => void save({ "browser.enabled": !(omp["browser.enabled"] !== false) })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompBrowserHeadless")} description={t("settings.ompBrowserHeadlessDesc")}>
            <SettingsToggle
              checked={omp["browser.headless"] !== false}
              label={t("settings.ompBrowserHeadless")}
              onChange={() => void save({ "browser.headless": !(omp["browser.headless"] !== false) })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompBrowserCdpUrl")} description={t("settings.ompBrowserCdpUrlDesc")}>
            <Input
              type="text"
              value={omp["browser.cdpUrl"] ?? ""}
              placeholder={t("settings.ompBrowserCdpUrlPlaceholder")}
              aria-label={t("settings.ompBrowserCdpUrl")}
              onChange={(e) => setOmp((prev) => ({ ...prev, "browser.cdpUrl": e.target.value }))}
              onBlur={(e) => void save({ "browser.cdpUrl": e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompBrowserRelay")} description={t("settings.ompBrowserRelayDesc")}>
            <SettingsToggle
              checked={omp["browser.relay"] === true}
              label={t("settings.ompBrowserRelay")}
              onChange={() => void save({ "browser.relay": !(omp["browser.relay"] === true) })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompBrowserRelayUrl")} description={t("settings.ompBrowserRelayUrlDesc")}>
            <Input
              type="text"
              value={omp["browser.relayUrl"] ?? ""}
              placeholder={t("settings.ompBrowserRelayUrlPlaceholder")}
              aria-label={t("settings.ompBrowserRelayUrl")}
              onChange={(e) => setOmp((prev) => ({ ...prev, "browser.relayUrl": e.target.value }))}
              onBlur={(e) => void save({ "browser.relayUrl": e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            />
          </SettingsRow>
        </SettingsCard>
        </>
      )}

      {part === "agents" && (
        <>
        {/* ── Collab ───────────────────────────────────────────────── */}
        <SettingsCard title={t("settings.ompCollabGroup")}>
          <SettingsRow title={t("settings.ompCollabRelayUrl")} description={t("settings.ompCollabRelayUrlDesc")}>
            <Input
              type="text"
              value={omp["collab.relayUrl"] ?? ""}
              placeholder={t("settings.ompCollabRelayUrlPlaceholder")}
              aria-label={t("settings.ompCollabRelayUrl")}
              onChange={(e) => setOmp((prev) => ({ ...prev, "collab.relayUrl": e.target.value }))}
              onBlur={(e) => void save({ "collab.relayUrl": e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompCollabWebUrl")} description={t("settings.ompCollabWebUrlDesc")}>
            <Input
              type="text"
              value={omp["collab.webUrl"] ?? ""}
              placeholder={t("settings.ompCollabWebUrlPlaceholder")}
              aria-label={t("settings.ompCollabWebUrl")}
              onChange={(e) => setOmp((prev) => ({ ...prev, "collab.webUrl": e.target.value }))}
              onBlur={(e) => void save({ "collab.webUrl": e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompCollabDisplayName")} description={t("settings.ompCollabDisplayNameDesc")}>
            <Input
              type="text"
              value={omp["collab.displayName"] ?? ""}
              placeholder={t("settings.ompCollabDisplayName")}
              aria-label={t("settings.ompCollabDisplayName")}
              onChange={(e) => setOmp((prev) => ({ ...prev, "collab.displayName": e.target.value }))}
              onBlur={(e) => void save({ "collab.displayName": e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompCollabAutoStart")} description={t("settings.ompCollabAutoStartDesc")}>
            <SettingsMenuSelect
              label={t("settings.ompCollabAutoStart")}
              value={omp["collab.autoStart"] ?? "off"}
              onChange={(v) => void save({ "collab.autoStart": v as "off" | "view" | "control" })}
              options={[
                { id: "off", label: t("settings.ompCollabAutoStartOff") },
                { id: "view", label: t("settings.ompCollabAutoStartView") },
                { id: "control", label: t("settings.ompCollabAutoStartControl") },
              ]}
            />
          </SettingsRow>
        </SettingsCard>
        </>
      )}

      {part === "agents" && (
        <>
        {/* ── Queue Modes ──────────────────────────────────────────── */}
        <SettingsCard title={t("settings.ompQueueModesGroup")}>
          <SettingsRow title={t("settings.ompSteeringMode")} description={t("settings.ompSteeringModeDesc")}>
            <SettingsMenuSelect
              label={t("settings.ompSteeringMode")}
              value={omp["steeringMode"] ?? "one-at-a-time"}
              onChange={(v) => void save({ steeringMode: v as OmpSettingsValues["steeringMode"] })}
              options={[
                { id: "one-at-a-time", label: t("settings.ompQueueModeOneAtATime") },
                { id: "all", label: t("settings.ompQueueModeAll") },
              ]}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompFollowUpMode")} description={t("settings.ompFollowUpModeDesc")}>
            <SettingsMenuSelect
              label={t("settings.ompFollowUpMode")}
              value={omp["followUpMode"] ?? "one-at-a-time"}
              onChange={(v) => void save({ followUpMode: v as OmpSettingsValues["followUpMode"] })}
              options={[
                { id: "one-at-a-time", label: t("settings.ompQueueModeOneAtATime") },
                { id: "all", label: t("settings.ompQueueModeAll") },
              ]}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompInterruptMode")} description={t("settings.ompInterruptModeDesc")}>
            <SettingsMenuSelect
              label={t("settings.ompInterruptMode")}
              value={omp["interruptMode"] ?? "immediate"}
              onChange={(v) => void save({ interruptMode: v as OmpSettingsValues["interruptMode"] })}
              options={[
                { id: "immediate", label: t("settings.ompInterruptModeImmediate") },
                { id: "wait", label: t("settings.ompInterruptModeWait") },
              ]}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompLoopMode")} description={t("settings.ompLoopModeDesc")}>
            <SettingsMenuSelect
              label={t("settings.ompLoopMode")}
              value={omp["loop.mode"] ?? "prompt"}
              onChange={(v) => void save({ "loop.mode": v as OmpSettingsValues["loop.mode"] })}
              options={[
                { id: "prompt", label: t("settings.ompLoopModePrompt") },
                { id: "compact", label: t("settings.ompLoopModeCompact") },
                { id: "reset", label: t("settings.ompLoopModeReset") },
              ]}
            />
          </SettingsRow>
        </SettingsCard>
        </>
      )}

      {part === "tools" && (
        <>
        {/* ── LSP ──────────────────────────────────────────────────── */}
        <SettingsCard title={t("settings.ompLspGroup")}>
          <SettingsRow title={t("settings.ompLspEnabled")} description={t("settings.ompLspEnabledDesc")}>
            <SettingsToggle
              checked={omp["lsp.enabled"] !== false}
              label={t("settings.ompLspEnabled")}
              onChange={() => void save({ "lsp.enabled": !(omp["lsp.enabled"] !== false) })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompLspFormatOnWrite")} description={t("settings.ompLspFormatOnWriteDesc")}>
            <SettingsToggle
              checked={omp["lsp.formatOnWrite"] === true}
              label={t("settings.ompLspFormatOnWrite")}
              onChange={() => void save({ "lsp.formatOnWrite": !(omp["lsp.formatOnWrite"] === true) })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompLspDiagnosticsOnWrite")} description={t("settings.ompLspDiagnosticsOnWriteDesc")}>
            <SettingsToggle
              checked={omp["lsp.diagnosticsOnWrite"] !== false}
              label={t("settings.ompLspDiagnosticsOnWrite")}
              onChange={() => void save({ "lsp.diagnosticsOnWrite": !(omp["lsp.diagnosticsOnWrite"] !== false) })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompLspDiagnosticsOnEdit")} description={t("settings.ompLspDiagnosticsOnEditDesc")}>
            <SettingsToggle
              checked={omp["lsp.diagnosticsOnEdit"] === true}
              label={t("settings.ompLspDiagnosticsOnEdit")}
              onChange={() => void save({ "lsp.diagnosticsOnEdit": !(omp["lsp.diagnosticsOnEdit"] === true) })}
            />
          </SettingsRow>
        </SettingsCard>
        </>
      )}

      {part === "tools" && (
        <>
        {/* ── IDA Pro ──────────────────────────────────────────────── */}
        <SettingsCard title={t("settings.ompIdaGroup")}>
          <SettingsRow title={t("settings.ompIdaEnabled")} description={t("settings.ompIdaEnabledDesc")}>
            <SettingsToggle
              checked={omp["ida.enabled"] !== false}
              label={t("settings.ompIdaEnabled")}
              onChange={() => void save({ "ida.enabled": !(omp["ida.enabled"] !== false) })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompIdaPython")} description={t("settings.ompIdaPythonDesc")}>
            <div className="flex gap-2">
              <Input
                type="text"
                value={omp["ida.python"] ?? ""}
                placeholder={t("settings.ompIdaPythonPlaceholder")}
                aria-label={t("settings.ompIdaPython")}
                onChange={(e) => setOmp((prev) => ({ ...prev, "ida.python": e.target.value }))}
                onBlur={(e) => void save({ "ida.python": e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              />
              <Button size="sm" onClick={() => void api.pickProjectFolders().then((r) => { if (r.folders[0]) void save({ "ida.python": r.folders[0] }); })}>
                {t("settings.ompPickFolder")}
              </Button>
            </div>
          </SettingsRow>
          <SettingsRow title={t("settings.ompIdaInstallDir")} description={t("settings.ompIdaInstallDirDesc")}>
            <div className="flex gap-2">
              <Input
                type="text"
                value={omp["ida.installDir"] ?? ""}
                placeholder={t("settings.ompIdaInstallDirPlaceholder")}
                aria-label={t("settings.ompIdaInstallDir")}
                onChange={(e) => setOmp((prev) => ({ ...prev, "ida.installDir": e.target.value }))}
                onBlur={(e) => void save({ "ida.installDir": e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              />
              <Button size="sm" onClick={() => void api.pickProjectFolders().then((r) => { if (r.folders[0]) void save({ "ida.installDir": r.folders[0] }); })}>
                {t("settings.ompPickFolder")}
              </Button>
            </div>
          </SettingsRow>
        </SettingsCard>
        </>
      )}

      {part === "tools" && (
        <>
        {/* ── MCP ──────────────────────────────────────────────────── */}
        <SettingsCard title={t("settings.ompMcpGroup")}>
          <SettingsRow title={t("settings.ompMcpEnableProjectConfig")} description={t("settings.ompMcpEnableProjectConfigDesc")}>
            <SettingsToggle
              checked={omp["mcp.enableProjectConfig"] !== false}
              label={t("settings.ompMcpEnableProjectConfig")}
              onChange={() => void save({ "mcp.enableProjectConfig": !(omp["mcp.enableProjectConfig"] !== false) })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompMcpRenderMarkdownResults")} description={t("settings.ompMcpRenderMarkdownResultsDesc")}>
            <SettingsToggle
              checked={omp["mcp.renderMarkdownResults"] !== false}
              label={t("settings.ompMcpRenderMarkdownResults")}
              onChange={() => void save({ "mcp.renderMarkdownResults": !(omp["mcp.renderMarkdownResults"] !== false) })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompMcpNotifications")} description={t("settings.ompMcpNotificationsDesc")}>
            <SettingsToggle
              checked={omp["mcp.notifications"] === true}
              label={t("settings.ompMcpNotifications")}
              onChange={() => void save({ "mcp.notifications": !(omp["mcp.notifications"] === true) })}
            />
          </SettingsRow>
        </SettingsCard>
        </>
      )}

      {part === "extensions" && (
        <>
        {/* ── Skills & Commands ────────────────────────────────────── */}
        <SettingsCard title={t("settings.ompExtensibilityGroup")}>
          <SettingsRow title={t("settings.ompSkillsEnabled")} description={t("settings.ompSkillsEnabledDesc")}>
            <SettingsToggle
              checked={omp["skills.enabled"] !== false}
              label={t("settings.ompSkillsEnabled")}
              onChange={() => void save({ "skills.enabled": !(omp["skills.enabled"] !== false) })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompSkillsClaudeUser")} description={t("settings.ompSkillsClaudeUserDesc")}>
            <SettingsToggle
              checked={omp["skills.enableClaudeUser"] === true}
              label={t("settings.ompSkillsClaudeUser")}
              onChange={() => void save({ "skills.enableClaudeUser": omp["skills.enableClaudeUser"] !== true })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompSkillsCompactList")} description={t("settings.ompSkillsCompactListDesc")}>
            <SettingsToggle
              checked={omp["skills.listMode"] !== "full"}
              label={t("settings.ompSkillsCompactList")}
              onChange={() => void save({ "skills.listMode": omp["skills.listMode"] === "full" ? "compact" : "full" })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompSkillsRegistryUrl")} description={t("settings.ompSkillsRegistryUrlDesc")}>
            <Input
              type="text"
              value={omp["skills.registryUrl"] ?? ""}
              placeholder={t("settings.ompSkillsRegistryUrlPlaceholder")}
              aria-label={t("settings.ompSkillsRegistryUrl")}
              onChange={(e) => setOmp((prev) => ({ ...prev, "skills.registryUrl": e.target.value }))}
              onBlur={(e) => void save({ "skills.registryUrl": e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompSkillsCustomDirectories")} description={t("settings.ompSkillsCustomDirectoriesDesc")}>
            <div className="flex flex-col gap-1.5">
              {(omp["skills.customDirectories"] ?? []).map((dir, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    type="text"
                    value={dir}
                    aria-label={`${t("settings.ompSkillsCustomDirectories")} ${i + 1}`}
                    onChange={(e) => {
                      const dirs = [...(omp["skills.customDirectories"] ?? [])];
                      dirs[i] = e.target.value;
                      setOmp((prev) => ({ ...prev, "skills.customDirectories": dirs }));
                    }}
                    onBlur={(e) => {
                      const dirs = [...(omp["skills.customDirectories"] ?? [])];
                      dirs[i] = e.target.value;
                      void save({ "skills.customDirectories": dirs });
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  />
                  <Button size="sm" onClick={() => {
                    const dirs = (omp["skills.customDirectories"] ?? []).filter((_, j) => j !== i);
                    void save({ "skills.customDirectories": dirs });
                  }}>✕</Button>
                </div>
              ))}
              <Button size="sm" onClick={() => void api.pickProjectFolders().then((r) => {
                if (r.folders.length > 0) {
                  void save({ "skills.customDirectories": [...(omp["skills.customDirectories"] ?? []), ...r.folders] });
                }
              })}>
                {t("settings.ompSkillsAddDirectory")}
              </Button>
            </div>
          </SettingsRow>
          <SettingsRow title={t("settings.ompCommandsEnableClaudeUser")} description={t("settings.ompCommandsEnableClaudeUserDesc")}>
            <SettingsToggle
              checked={omp["commands.enableClaudeUser"] === true}
              label={t("settings.ompCommandsEnableClaudeUser")}
              onChange={() => void save({ "commands.enableClaudeUser": !(omp["commands.enableClaudeUser"] === true) })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompCommandsEnableClaudeProject")} description={t("settings.ompCommandsEnableClaudeProjectDesc")}>
            <SettingsToggle
              checked={omp["commands.enableClaudeProject"] !== false}
              label={t("settings.ompCommandsEnableClaudeProject")}
              onChange={() => void save({ "commands.enableClaudeProject": !(omp["commands.enableClaudeProject"] !== false) })}
            />
          </SettingsRow>
        </SettingsCard>
        </>
      )}

      {part === "memory" && (
        <>
        {/* ── Hindsight Behavior ───────────────────────────────────── */}
        <SettingsCard title={t("settings.ompHindsightGroup")}>
          <SettingsRow title={t("settings.ompHindsightAutoRecall")} description={t("settings.ompHindsightAutoRecallDesc")}>
            <SettingsToggle
              checked={omp["hindsight.autoRecall"] !== false}
              label={t("settings.ompHindsightAutoRecall")}
              onChange={() => void save({ "hindsight.autoRecall": !(omp["hindsight.autoRecall"] !== false) })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompHindsightAutoRetain")} description={t("settings.ompHindsightAutoRetainDesc")}>
            <SettingsToggle
              checked={omp["hindsight.autoRetain"] !== false}
              label={t("settings.ompHindsightAutoRetain")}
              onChange={() => void save({ "hindsight.autoRetain": !(omp["hindsight.autoRetain"] !== false) })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompHindsightRetainMode")} description={t("settings.ompHindsightRetainModeDesc")}>
            <SettingsMenuSelect
              label={t("settings.ompHindsightRetainMode")}
              value={omp["hindsight.retainMode"] ?? "full-session"}
              onChange={(v) => void save({ "hindsight.retainMode": v as "full-session" | "last-turn" })}
              options={[
                { id: "full-session", label: t("settings.ompHindsightRetainModeFullSession") },
                { id: "last-turn", label: t("settings.ompHindsightRetainModeLastTurn") },
              ]}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompHindsightMentalModelsEnabled")} description={t("settings.ompHindsightMentalModelsEnabledDesc")}>
            <SettingsToggle
              checked={omp["hindsight.mentalModelsEnabled"] !== false}
              label={t("settings.ompHindsightMentalModelsEnabled")}
              onChange={() => void save({ "hindsight.mentalModelsEnabled": !(omp["hindsight.mentalModelsEnabled"] !== false) })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompHindsightMentalModelAutoSeed")} description={t("settings.ompHindsightMentalModelAutoSeedDesc")}>
            <SettingsToggle
              checked={omp["hindsight.mentalModelAutoSeed"] !== false}
              label={t("settings.ompHindsightMentalModelAutoSeed")}
              onChange={() => void save({ "hindsight.mentalModelAutoSeed": !(omp["hindsight.mentalModelAutoSeed"] !== false) })}
            />
          </SettingsRow>
        </SettingsCard>
        </>
      )}

      {part === "defaults" && (
        <>
        {/* ── HTML Export Theme ────────────────────────────────────── */}
        <SettingsCard title={t("settings.ompThemeGroup")}>
          <SettingsRow title={t("settings.ompThemeDark")} description={t("settings.ompThemeDarkDesc")}>
            <Input
              value={omp["theme.dark"] ?? ""}
              placeholder="titanium"
              onChange={(e) => void save({ "theme.dark": e.target.value || undefined })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.ompThemeLight")} description={t("settings.ompThemeLightDesc")}>
            <Input
              value={omp["theme.light"] ?? ""}
              placeholder="light"
              onChange={(e) => void save({ "theme.light": e.target.value || undefined })}
            />
          </SettingsRow>
        </SettingsCard>
        </>
      )}

      {part === "extensions" && (
        <>
        {/* ── Installed omp Skills ─────────────────────────────────── */}
        <OmpSkillsSection />
        <SkillPackSection />
        <SkillCuratorSection />
        <SkillReviewSection />
        <SkillJourneySection />
        </>
      )}

      {part === "agents" && (
        <>
        {/* ── Historical Usage ─────────────────────────────────────── */}
        <OmpUsageSection />
        </>
      )}

      {part === "agents" && (
        <>
        {/* ── Agent Worktrees ──────────────────────────────────────── */}
        <OmpWorktreeSection />
        </>
      )}

      {part === "extensions" && (
        <>
        {/* ── Extensions ───────────────────────────────────────────── */}
        <OmpExtensionsSection />
        </>
      )}
    </>
  );
}
