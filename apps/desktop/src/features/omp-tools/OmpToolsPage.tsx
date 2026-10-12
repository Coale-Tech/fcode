/**
 * omp CLI Tools page (slice F).
 *
 * Runs allowlisted omp CLI subcommands through the main-process runner.
 * Each command is described by an OmpCliSpec imported from omp-cli.ts;
 * no command ids are hardcoded here.  Output streams in via IPC events.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OmpCliDoneEvent, OmpCliOutputEvent, OmpCliSubcommand } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Button, cx } from "../../components/ui";
import { SettingsCard } from "../settings/primitives";

// Command metadata (labels/descriptions in English per plan §B1).
// Kept in a static record to avoid network/IPC just to list commands.
const COMMANDS: {
  subcommand: OmpCliSubcommand;
  label: string;
  description: string;
  fields: FieldSpec[];
  buildArgs: (values: Record<string, string | boolean>) => string[];
}[] = [
  {
    subcommand: "stats",
    label: "Usage Statistics",
    description: "View AI usage statistics: requests, tokens, cost, error rate.",
    fields: [{ id: "format", label: "Output format", type: "select" as const, options: ["summary", "json"], defaultValue: "summary" }],
    buildArgs: (v) => (v.format === "json" ? ["--json"] : ["--summary"]),
  },
  {
    subcommand: "usage",
    label: "Provider Usage",
    description: "Show provider usage limits for every authenticated account.",
    fields: [{ id: "provider", label: "Provider (optional, e.g. anthropic)", type: "text" as const, defaultValue: "", placeholder: "anthropic" }],
    buildArgs: (v) => (String(v.provider ?? "").trim() ? [`--provider=${String(v.provider).trim()}`] : []),
  },
  {
    subcommand: "gc",
    label: "Storage Cleanup",
    description: "Run on-disk maintenance: sweep blobs, archive cold sessions (dry-run by default).",
    fields: [{ id: "apply", label: "Apply changes (default: dry-run preview)", type: "checkbox" as const, defaultValue: false }],
    buildArgs: (v) => (v.apply ? ["--apply"] : []),
  },
  {
    subcommand: "models",
    label: "Available Models",
    description: "List, find, or refresh available AI models from the catalog.",
    fields: [
      { id: "action", label: "Action", type: "select" as const, options: ["ls", "find", "refresh"], defaultValue: "ls" },
      { id: "kind", label: "Kind", type: "select" as const, options: ["chat", "all", "embedding"], defaultValue: "chat" },
    ],
    buildArgs: (v) => {
      const args: string[] = [];
      if (v.action && v.action !== "ls") args.push(String(v.action));
      if (v.kind && v.kind !== "chat") args.push(`--kind=${v.kind}`);
      return args;
    },
  },
  {
    subcommand: "ps",
    label: "Process List",
    description: "Inspect omp daemon-broker supervised processes.",
    fields: [{ id: "all", label: "Show all project and global scopes", type: "checkbox" as const, defaultValue: false }],
    buildArgs: (v) => (v.all ? ["--all"] : []),
  },
  {
    subcommand: "worktree",
    label: "Worktrees",
    description: "List or clear agent-managed git worktrees under ~/.omp/wt.",
    fields: [
      { id: "action", label: "Action", type: "select" as const, options: ["list", "clear"], defaultValue: "list" },
      { id: "dryRun", label: "Dry-run (preview, no changes)", type: "checkbox" as const, defaultValue: true },
    ],
    buildArgs: (v) => {
      const args: string[] = [];
      if (v.action && v.action !== "list") args.push(String(v.action));
      if (v.dryRun) args.push("--dry-run");
      return args;
    },
  },
  {
    subcommand: "tiny-models",
    label: "Tiny Models",
    description: "Download and list bundled offline tokenizer models.",
    fields: [
      { id: "action", label: "Action", type: "select" as const, options: ["list", "download"], defaultValue: "list" },
      { id: "model", label: "Model key (or 'all')", type: "text" as const, defaultValue: "", placeholder: "lfm2.5-230m" },
    ],
    buildArgs: (v) => {
      const args: string[] = [];
      if (v.action) args.push(String(v.action));
      const m = String(v.model ?? "").trim();
      if (m) args.push(m);
      return args;
    },
  },
  {
    subcommand: "toks",
    label: "Token Count",
    description: "Count a file or text through every embedded offline tokenizer.",
    fields: [{ id: "input", label: "File path or text", type: "text" as const, defaultValue: "", placeholder: "/path/to/file.txt or paste text…" }],
    buildArgs: (v) => {
      const input = String(v.input ?? "").trim();
      return input ? [input] : [];
    },
  },
  {
    subcommand: "config",
    label: "Config",
    description: "Read omp configuration settings (read-only: list or get a key).",
    fields: [
      { id: "action", label: "Action", type: "select" as const, options: ["list", "get"], defaultValue: "list" },
      { id: "key", label: "Config key (for 'get')", type: "text" as const, defaultValue: "", placeholder: "retry.maxRetries" },
    ],
    buildArgs: (v) => {
      const args: string[] = [];
      if (v.action) args.push(String(v.action));
      const key = String(v.key ?? "").trim();
      if (key && v.action === "get") args.push(key);
      return args;
    },
  },
  {
    subcommand: "web-search",
    label: "Web Search",
    description: "Run a query through the configured omp web search provider.",
    fields: [{ id: "query", label: "Search query", type: "text" as const, defaultValue: "", placeholder: "TypeScript async generators…" }],
    buildArgs: (v) => {
      const q = String(v.query ?? "").trim();
      return q ? q.split(/\s+/) : [];
    },
  },
];

type FieldSpec = {
  id: string;
  label: string;
  type: "text" | "checkbox" | "select";
  options?: string[];
  defaultValue: string | boolean;
  placeholder?: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function OmpToolsPage() {
  const { t } = useTranslation();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>({});
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [output, setOutput] = useState("");
  const [exitCode, setExitCode] = useState<number | null | undefined>(undefined);
  const outputRef = useRef<HTMLPreElement>(null);

  const cmd = COMMANDS[selectedIdx];

  // Reset form values when command changes.
  useEffect(() => {
    const defaults: Record<string, string | boolean> = {};
    for (const f of cmd.fields) defaults[f.id] = f.defaultValue;
    setFieldValues(defaults);
    setOutput("");
    setExitCode(undefined);
  }, [selectedIdx, cmd]);

  // Auto-scroll output pane.
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  // Subscribe to streaming events.
  useEffect(() => {
    if (!runId) return;
    const off1 = api.onOmpCliOutput((ev: OmpCliOutputEvent) => {
      if (ev.runId !== runId) return;
      setOutput((prev) => prev + ev.chunk);
    });
    const off2 = api.onOmpCliDone((ev: OmpCliDoneEvent) => {
      if (ev.runId !== runId) return;
      setRunning(false);
      setExitCode(ev.exitCode);
      setRunId(null);
    });
    return () => { off1(); off2(); };
  }, [runId]);

  const handleRun = async () => {
    setOutput("");
    setExitCode(undefined);
    setRunning(true);
    try {
      const args = cmd.buildArgs(fieldValues);
      const result = await api.ompCliRun(cmd.subcommand, args);
      setRunId(result.runId);
    } catch (err) {
      setOutput(`Error: ${err instanceof Error ? err.message : String(err)}`);
      setRunning(false);
    }
  };

  const handleCancel = () => {
    if (runId) {
      void api.ompCliCancel(runId).catch(() => undefined);
      setRunId(null);
    }
    setRunning(false);
  };

  const setField = (id: string, value: string | boolean) =>
    setFieldValues((prev) => ({ ...prev, [id]: value }));

  return (
    <div className="settings-stack">
      <SettingsCard>
        {/* Command selector */}
        <div className="omp-tools-selector settings-row">
          <label className="settings-row-title" htmlFor="omp-tools-cmd-select">
            {t("ompTools.command")}
          </label>
          <select
            id="omp-tools-cmd-select"
            className="settings-select"
            value={selectedIdx}
            onChange={(e) => {
              setSelectedIdx(Number(e.target.value));
              setRunning(false);
              if (runId) void api.ompCliCancel(runId).catch(() => undefined);
              setRunId(null);
            }}
          >
            {COMMANDS.map((c, i) => (
              <option key={c.subcommand} value={i}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Description */}
        <p className="omp-tools-desc settings-row-desc">{cmd.description}</p>

        {/* Fields */}
        <div className="omp-tools-fields">
          {cmd.fields.map((field) => (
            <div key={field.id} className="omp-tools-field settings-row">
              <label className="settings-row-title" htmlFor={`omp-field-${field.id}`}>
                {field.label}
              </label>
              {field.type === "checkbox" ? (
                <input
                  id={`omp-field-${field.id}`}
                  type="checkbox"
                  checked={fieldValues[field.id] === true}
                  onChange={(e) => setField(field.id, e.target.checked)}
                />
              ) : field.type === "select" ? (
                <select
                  id={`omp-field-${field.id}`}
                  className="settings-select"
                  value={String(fieldValues[field.id] ?? field.defaultValue)}
                  onChange={(e) => setField(field.id, e.target.value)}
                >
                  {(field.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={`omp-field-${field.id}`}
                  type="text"
                  className="settings-input"
                  value={String(fieldValues[field.id] ?? "")}
                  placeholder={field.placeholder}
                  onChange={(e) => setField(field.id, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="omp-tools-actions">
          <Button
            variant="primary"
            disabled={running}
            onClick={() => void handleRun()}
          >
            {t("ompTools.run")}
          </Button>
          {running && (
            <Button variant="secondary" onClick={handleCancel}>
              {t("common.cancel")}
            </Button>
          )}
          {output && !running && (
            <Button variant="secondary" onClick={() => { setOutput(""); setExitCode(undefined); }}>
              {t("ompTools.clear")}
            </Button>
          )}
          {running && (
            <span className="omp-tools-status">
              <span className="route-pending-indicator" aria-hidden />
              {t("ompTools.running")}
            </span>
          )}
          {exitCode !== undefined && !running && (
            <span className={cx("omp-tools-exit", exitCode === 0 ? "omp-tools-exit-ok" : "omp-tools-exit-err")}>
              {t("ompTools.exitCode")}: {exitCode ?? "—"}
            </span>
          )}
        </div>
      </SettingsCard>

      {/* Output pane */}
      {(output || running) && (
        <SettingsCard title={t("ompTools.output")}>
          <pre
            ref={outputRef}
            className="omp-tools-output"
            aria-live="polite"
            aria-label={t("ompTools.output")}
          >
            {output || t("ompTools.noOutput")}
          </pre>
        </SettingsCard>
      )}
    </div>
  );
}
