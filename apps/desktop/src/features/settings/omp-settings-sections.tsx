/**
 * Settings UI sections for the omp settings groups:
 * Task Subagents / Eval & Python / Browser / Collab /
 * Installed Skills / Usage / Agent Worktrees.
 * Rendered inside the AI settings tab.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OmpSettingsValues } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Input, SettingsToggle } from "../../components/ui";
import { SettingsMenuSelect } from "../../components/settings/SettingsMenuSelect";
import { SettingsCard, SettingsRow } from "./primitives";
import { OmpSkillsSection } from "../../components/settings/OmpSkillsSection";
import { OmpUsageSection } from "../../components/settings/OmpUsageSection";
import { OmpWorktreeSection } from "../../components/settings/OmpWorktreeSection";

export function OmpSettingsSections() {
  const { t } = useTranslation();
  const [omp, setOmp] = useState<OmpSettingsValues>({});

  useEffect(() => {
    void api.ompSettingsGet().then(setOmp).catch(() => undefined);
  }, []);

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

  return (
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

      {/* ── Installed omp Skills ─────────────────────────────────── */}
      <OmpSkillsSection />

      {/* ── Historical Usage ─────────────────────────────────────── */}
      <OmpUsageSection />

      {/* ── Agent Worktrees ──────────────────────────────────────── */}
      <OmpWorktreeSection />
    </>
  );
}
