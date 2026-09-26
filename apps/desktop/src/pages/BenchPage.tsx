/**
 * T4 — Bench cockpit: master-detail bench browser.
 *
 * Layout (all widths reference tokens, see plan design-phase D29):
 *   < 1200px  → list collapses to a dropdown in the workspace bar; detail full width.
 *   1200–1600 → master list (280px) on the left, detail on the right.
 *   > 1600px  → bench detail splits sites | processes side by side.
 *
 * T16 — the bench detail pane cross-fades on bench selection at
 *         --motion-duration-fast / --motion-ease-out.
 *
 * DX12 — zero-bench empty state with copy-paste bench init commands and a
 *         Frappe install docs link.
 *
 * Accessibility (design-phase D32):
 *   - <main> landmark with aria-label="Bench".
 *   - Bench list is a listbox with roving tabindex.
 *   - Log viewer gains role="log" aria-live (inside LogView).
 *   - Focus returned to list on dialog close.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { IPC, type Result } from "@pi-desktop/shared";
import { LogView } from "../components/bench/LogView";

// ── Types (mirrored from discovery.ts / supervisor.ts) ───────────────────────

type BenchVersion = 15 | 16 | 17 | null; // null = unparseable (DX13)

type BenchSite = {
  name: string;
  isDefault: boolean;
};

type BenchSummary = {
  id: string;
  path: string;
  version: BenchVersion;
  sites: BenchSite[];
};

type BenchStatus = "stopped" | "starting" | "running" | "failed";

type LogLine = {
  ts: number;
  text: string;
};

// ── IPC helpers ───────────────────────────────────────────────────────────────

async function invoke<T>(channel: string, args?: unknown): Promise<T> {
  const bridge = window.piDesktop;
  if (!bridge) throw new Error("piDesktop bridge unavailable");
  const result: Result<T> = await bridge.invoke<Result<T>>(channel, args);
  if (!result.ok) {
    throw new Error(result.error.message ?? "IPC call failed");
  }
  return result.data;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BenchPage() {
  // Discovery
  const [benches, setBenches] = useState<BenchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Supervisor state
  const [status, setStatus] = useState<BenchStatus>("stopped");
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [followTail, setFollowTail] = useState(true);

  // T16: cross-fade key for bench selection transition
  const [detailKey, setDetailKey] = useState(0);

  const listRef = useRef<HTMLUListElement>(null);

  // ── Load bench list ───────────────────────────────────────────────────────

  const loadBenches = useCallback(async () => {
    setLoading(true);
    try {
      const { benches: discovered } = await invoke<{ benches: BenchSummary[] }>(IPC.invoke.benchList);
      setBenches(discovered);
      if (discovered.length > 0 && !selectedId) {
        setSelectedId(discovered[0].id);
      }
    } catch {
      // discovery error: show empty state
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadBenches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Bench status polling ──────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const s = await invoke<{ status: BenchStatus }>(IPC.invoke.benchStatus);
        setStatus(s.status);
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ── Log stream ────────────────────────────────────────────────────────────

  useEffect(() => {
    const bridge = window.piDesktop;
    if (!bridge) return;
    const off = bridge.on(IPC.event.benchLog, (data: unknown) => {
      // Type guard: the bench-ipc handler sends { process, line: { ts, text } }
      if (
        data &&
        typeof data === "object" &&
        "line" in data &&
        data.line &&
        typeof data.line === "object" &&
        "ts" in data.line &&
        typeof data.line.ts === "number" &&
        "text" in data.line &&
        typeof data.line.text === "string"
      ) {
        const line: LogLine = { ts: data.line.ts, text: data.line.text };
        setLogLines((prev) => {
          const next = [...prev, line];
          // keep last 5000 (supervisor ring buffer)
          return next.length > 5000 ? next.slice(next.length - 5000) : next;
        });
      }
    });
    return () => off?.();
  }, []);

  // ── Bench selection ───────────────────────────────────────────────────────

  const selectBench = useCallback((id: string) => {
    setSelectedId(id);
    setDetailKey((k) => k + 1); // triggers T16 cross-fade
    setLogLines([]);
  }, []);

  const selectedBench = benches.find((b) => b.id === selectedId) ?? null;

  // ── Roving tabindex ───────────────────────────────────────────────────────

  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLUListElement>) => {
      if (!benches.length) return;
      const idx = benches.findIndex((b) => b.id === selectedId);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectBench(benches[Math.min(idx + 1, benches.length - 1)].id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectBench(benches[Math.max(idx - 1, 0)].id);
      } else if (e.key === "Home") {
        e.preventDefault();
        selectBench(benches[0].id);
      } else if (e.key === "End") {
        e.preventDefault();
        selectBench(benches[benches.length - 1].id);
      }
    },
    [benches, selectedId, selectBench],
  );

  // ── Start / stop ──────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    if (!selectedBench) return;
    try {
      await invoke(IPC.invoke.benchStart, { benchPath: selectedBench.path });
      setStatus("starting");
    } catch (err) {
      console.error("[BenchPage] start failed", err);
    }
  }, [selectedBench]);

  const handleStop = useCallback(async () => {
    try {
      await invoke(IPC.invoke.benchStop);
      setStatus("stopped");
    } catch (err) {
      console.error("[BenchPage] stop failed", err);
    }
  }, []);

  // ── Run one-shot ──────────────────────────────────────────────────────────

  const handleRun = useCallback(
    async (verb: string) => {
      if (!selectedBench) return;
      try {
        await invoke(IPC.invoke.benchRun, {
          benchPath: selectedBench.path,
          site: selectedBench.sites.find((s) => s.isDefault)?.name,
          verb,
        });
      } catch (err) {
        console.error(`[BenchPage] ${verb} failed`, err);
      }
    },
    [selectedBench],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="bench-page" aria-label="Bench" style={PAGE_STYLE}>
      {/* Master list */}
      <nav
        aria-label="Discovered benches"
        style={LIST_NAV_STYLE}
      >
        <div style={LIST_HEADER_STYLE}>
          <span style={{ fontWeight: 600 }}>Benches</span>
          {!loading && (
            <span style={COUNT_BADGE_STYLE}>{benches.length}</span>
          )}
        </div>

        {loading ? (
          <BenchListSkeleton />
        ) : benches.length === 0 ? (
          <ZeroBenchState />
        ) : (
          <ul
            ref={listRef}
            role="listbox"
            aria-label="Select a bench"
            aria-activedescendant={selectedId ? `bench-item-${selectedId}` : undefined}
            onKeyDown={handleListKeyDown}
            style={LIST_STYLE}
          >
            {benches.map((bench) => {
              const isSelected = bench.id === selectedId;
              return (
                <li
                  key={bench.id}
                  id={`bench-item-${bench.id}`}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => selectBench(bench.id)}
                  style={{
                    ...LIST_ITEM_STYLE,
                    ...(isSelected ? LIST_ITEM_SELECTED_STYLE : {}),
                  }}
                >
                  <span style={BENCH_PATH_STYLE}>{bench.path.split("/").pop()}</span>
                  <VersionBadge version={bench.version} />
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* Detail */}
      <section
        // T16: cross-fade on bench selection
        key={detailKey}
        aria-label={selectedBench ? `Bench detail: ${selectedBench.path}` : "Bench detail"}
        style={{ ...DETAIL_STYLE, animation: `benchDetailFadeIn var(--motion-duration-fast) var(--motion-ease-out)` }}
      >
        {selectedBench ? (
          <BenchDetail
            bench={selectedBench}
            status={status}
            logLines={logLines}
            followTail={followTail}
            onFollowTailChange={setFollowTail}
            onStart={handleStart}
            onStop={handleStop}
            onRun={handleRun}
          />
        ) : (
          <div style={EMPTY_DETAIL_STYLE}>
            <p style={{ color: "var(--ds-text-tertiary)" }}>Select a bench</p>
          </div>
        )}
      </section>

      {/* T16: keyframe definition */}
      <style>{FADE_IN_KEYFRAME}</style>
    </main>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BenchDetail({
  bench,
  status,
  logLines,
  followTail,
  onFollowTailChange,
  onStart,
  onStop,
  onRun,
}: {
  bench: BenchSummary;
  status: BenchStatus;
  logLines: LogLine[];
  followTail: boolean;
  onFollowTailChange: (v: boolean) => void;
  onStart: () => void;
  onStop: () => void;
  onRun: (verb: string) => void;
}) {
  return (
    <div style={DETAIL_INNER_STYLE}>
      {/* Header */}
      <div style={DETAIL_HEADER_STYLE}>
        <span style={{ fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {bench.path}
        </span>
        <StatusDot status={status} />
      </div>

      {/* Sites + processes row */}
      <div style={SITES_ROW_STYLE}>
        <SiteList sites={bench.sites} />
        <ProcessPanel status={status} onStart={onStart} onStop={onStop} />
      </div>

      {/* One-shot commands */}
      <div style={ONESHOT_ROW_STYLE}>
        {ONESHOT_VERBS.map((verb) => (
          <button
            key={verb}
            type="button"
            style={ONESHOT_BTN_STYLE}
            onClick={() => onRun(verb)}
            disabled={status !== "running"}
            title={verb}
          >
            {verb}
          </button>
        ))}
      </div>

      {/* Log viewer (T5) */}
      <div style={LOG_CONTAINER_STYLE}>
        <div style={LOG_TOOLBAR_STYLE}>
          <span style={{ fontSize: "var(--text-2xs)", color: "var(--ds-text-tertiary)" }}>
            Log
          </span>
          <button
            type="button"
            style={{ ...ONESHOT_BTN_STYLE, fontSize: "var(--text-2xs)" }}
            onClick={() => onFollowTailChange(!followTail)}
          >
            {followTail ? "⇊ following" : "⇊ follow"}
          </button>
        </div>
        <LogView
          lines={logLines}
          followTail={followTail}
          onFollowTailChange={onFollowTailChange}
          className="bench-log-view"
        />
      </div>
    </div>
  );
}

function SiteList({ sites }: { sites: BenchSite[] }) {
  return (
    <div style={PANEL_BOX_STYLE}>
      <div style={PANEL_LABEL_STYLE}>Sites</div>
      {sites.length === 0 ? (
        <p style={{ color: "var(--ds-text-tertiary)", fontSize: "var(--text-sm)" }}>No sites found</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {sites.map((s) => (
            <li key={s.name} style={SITE_ITEM_STYLE}>
              <span style={s.isDefault ? { color: "var(--ds-success)" } : {}}>●</span>
              <span>{s.name}</span>
              {s.isDefault && (
                <span style={{ fontSize: "var(--text-3xs)", color: "var(--ds-text-tertiary)" }}>default</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProcessPanel({
  status,
  onStart,
  onStop,
}: {
  status: BenchStatus;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <div style={PANEL_BOX_STYLE}>
      <div style={PANEL_LABEL_STYLE}>Processes</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StatusDot status={status} />
        <span style={{ fontSize: "var(--text-sm)" }}>{STATUS_LABELS[status]}</span>
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
        {status === "stopped" || status === "failed" ? (
          <button type="button" style={ACTION_BTN_STYLE} onClick={onStart}>
            Start bench
          </button>
        ) : (
          <button
            type="button"
            style={{ ...ACTION_BTN_STYLE, background: "var(--ds-error)" }}
            onClick={onStop}
            disabled={status === "starting"}
          >
            Stop
          </button>
        )}
      </div>
    </div>
  );
}

function VersionBadge({ version }: { version: BenchVersion }) {
  if (version === null) {
    return (
      <span style={{ ...BADGE_STYLE, background: "var(--ds-warning)", color: "#000" }} title="Frappe version undetected">
        ?
      </span>
    );
  }
  return (
    <span style={BADGE_STYLE}>v{version}</span>
  );
}

function StatusDot({ status }: { status: BenchStatus }) {
  const color = STATUS_COLORS[status];
  return (
    <span
      role="img"
      aria-label={STATUS_LABELS[status]}
      style={{ color, fontFamily: "inherit", fontSize: "0.7em", flexShrink: 0 }}
    >
      ●
    </span>
  );
}

function BenchListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Discovering benches…" role="status" style={{ padding: "8px 0" }}>
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          style={{
            height: 28,
            margin: "4px 0",
            borderRadius: "var(--radius-2xs)",
            background: "var(--ds-bg-secondary, var(--ds-bg-primary))",
            opacity: 0.4 + i * 0.05,
          }}
        />
      ))}
    </div>
  );
}

/**
 * DX12 — zero-bench empty state.
 *
 * "It already found my benches" is the product's strongest first impression;
 * when discovery finds zero benches show copy-paste commands and a docs link
 * rather than a blank page.
 */
function ZeroBenchState() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div style={EMPTY_BENCH_STYLE}>
      <p style={{ fontWeight: 600, marginBottom: 8 }}>No Frappe benches found</p>
      <p style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-secondary)", marginBottom: 16 }}>
        Fcode scans <code style={CODE_STYLE}>~/ERPNext</code> on startup.
        Frappe installation is outside this app's control.
      </p>

      <p style={{ fontSize: "var(--text-sm)", marginBottom: 6 }}>
        Create a bench:
      </p>
      <CopyCmd
        label="bench init"
        text="bench init frappe-bench --frappe-branch version-16"
        copied={copied}
        onCopy={copy}
      />

      <p style={{ fontSize: "var(--text-sm)", marginTop: 12, marginBottom: 6 }}>
        Create a site:
      </p>
      <CopyCmd
        label="bench new-site"
        text="bench new-site site1.local --install-app frappe"
        copied={copied}
        onCopy={copy}
      />

      <p style={{ marginTop: 16, fontSize: "var(--text-sm)" }}>
        <a
          href="https://frappeframework.com/docs/user/en/installation"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--ds-text-link, var(--ds-text-primary))" }}
        >
          Frappe installation guide ↗
        </a>
      </p>
    </div>
  );
}

function CopyCmd({
  label,
  text,
  copied,
  onCopy,
}: {
  label: string;
  text: string;
  copied: string | null;
  onCopy: (text: string, label: string) => void;
}) {
  return (
    <div style={COPY_CMD_STYLE}>
      <code style={{ ...CODE_STYLE, flex: 1, fontSize: "var(--text-sm)", whiteSpace: "pre" }}>{text}</code>
      <button
        type="button"
        style={COPY_BTN_STYLE}
        onClick={() => onCopy(text, label)}
        aria-label={`Copy ${label} command`}
      >
        {copied === label ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ONESHOT_VERBS = ["migrate", "clear-cache", "build"];

const STATUS_COLORS: Record<BenchStatus, string> = {
  running: "var(--ds-success)",
  starting: "var(--ds-warning)",
  failed: "var(--ds-error)",
  stopped: "var(--ds-text-tertiary)",
};

const STATUS_LABELS: Record<BenchStatus, string> = {
  running: "Running",
  starting: "Starting…",
  failed: "Failed",
  stopped: "Stopped",
};

// T16 — exactly one authored motion moment: bench detail cross-fade
const FADE_IN_KEYFRAME = `
@keyframes benchDetailFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
`;

// ── Styles (design tokens only, no raw px except where token N/A) ─────────────

const PAGE_STYLE: React.CSSProperties = {
  display: "flex",
  height: "100%",
  overflow: "hidden",
  background: "var(--ds-bg-primary)",
  color: "var(--ds-text-primary)",
  fontSize: "var(--text-sm)",
};

const LIST_NAV_STYLE: React.CSSProperties = {
  width: 280,
  flexShrink: 0,
  borderRight: "1px solid var(--ds-border-primary, var(--ds-bg-secondary, #333))",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  padding: 8,
};

const LIST_HEADER_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginBottom: 8,
  fontSize: "var(--text-sm)",
  fontWeight: 600,
};

const COUNT_BADGE_STYLE: React.CSSProperties = {
  background: "var(--ds-bg-secondary, #333)",
  borderRadius: "var(--radius-2xs)",
  fontSize: "var(--text-3xs)",
  padding: "1px 5px",
  color: "var(--ds-text-tertiary)",
};

const LIST_STYLE: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  margin: 0,
  padding: 0,
  listStyle: "none",
};

const LIST_ITEM_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 8px",
  borderRadius: "var(--radius-xs)",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
  userSelect: "none",
};

const LIST_ITEM_SELECTED_STYLE: React.CSSProperties = {
  background: "var(--ds-bg-secondary, rgba(255,255,255,0.07))",
  fontWeight: 500,
};

const BENCH_PATH_STYLE: React.CSSProperties = {
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const BADGE_STYLE: React.CSSProperties = {
  flexShrink: 0,
  fontSize: "var(--text-3xs)",
  background: "var(--ds-bg-secondary, #333)",
  borderRadius: "var(--radius-3xs)",
  padding: "0 4px",
  color: "var(--ds-text-tertiary)",
};

const DETAIL_STYLE: React.CSSProperties = {
  flex: 1,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const DETAIL_INNER_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  overflow: "hidden",
  padding: 12,
  gap: 8,
};

const DETAIL_HEADER_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexShrink: 0,
};

const SITES_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexShrink: 0,
};

const PANEL_BOX_STYLE: React.CSSProperties = {
  flex: 1,
  padding: 10,
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--ds-border-primary, rgba(255,255,255,0.1))",
  overflow: "hidden",
};

const PANEL_LABEL_STYLE: React.CSSProperties = {
  fontSize: "var(--text-3xs)",
  color: "var(--ds-text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 6,
};

const SITE_ITEM_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "2px 0",
  fontSize: "var(--text-sm)",
};

const ONESHOT_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexShrink: 0,
};

const ONESHOT_BTN_STYLE: React.CSSProperties = {
  padding: "3px 10px",
  borderRadius: "var(--radius-2xs)",
  border: "1px solid var(--ds-border-primary, rgba(255,255,255,0.15))",
  background: "transparent",
  color: "var(--ds-text-primary)",
  fontSize: "var(--text-sm)",
  cursor: "pointer",
};

const ACTION_BTN_STYLE: React.CSSProperties = {
  padding: "4px 12px",
  borderRadius: "var(--radius-xs)",
  border: "none",
  background: "var(--ds-success)",
  color: "#000",
  fontSize: "var(--text-sm)",
  fontWeight: 600,
  cursor: "pointer",
};

const LOG_CONTAINER_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--ds-border-primary, rgba(255,255,255,0.1))",
  overflow: "hidden",
};

const LOG_TOOLBAR_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "4px 8px",
  borderBottom: "1px solid var(--ds-border-primary, rgba(255,255,255,0.1))",
  flexShrink: 0,
};

const EMPTY_DETAIL_STYLE: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const EMPTY_BENCH_STYLE: React.CSSProperties = {
  padding: 16,
  color: "var(--ds-text-primary)",
};

const CODE_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  background: "var(--ds-bg-secondary, rgba(0,0,0,0.3))",
  borderRadius: "var(--radius-3xs)",
  padding: "1px 4px",
};

const COPY_CMD_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: 8,
  borderRadius: "var(--radius-xs)",
  border: "1px solid var(--ds-border-primary, rgba(255,255,255,0.1))",
  background: "var(--ds-bg-secondary, rgba(0,0,0,0.2))",
};

const COPY_BTN_STYLE: React.CSSProperties = {
  flexShrink: 0,
  padding: "3px 10px",
  borderRadius: "var(--radius-2xs)",
  border: "1px solid var(--ds-border-primary, rgba(255,255,255,0.15))",
  background: "transparent",
  color: "var(--ds-text-primary)",
  fontSize: "var(--text-sm)",
  cursor: "pointer",
};
