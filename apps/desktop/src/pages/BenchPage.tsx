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
import { useAppStore } from "../stores/app-store";
import { LogView } from "../components/bench/LogView";
import { DestructiveActionDialog } from "../components/DestructiveActionDialog";

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

// ── T6 gap types ─────────────────────────────────────────────────────────────

type StartFailureState = {
  failure: { code: string; problem: string; cause: string; fix: string; docsUrl: string };
  exitCode?: number | null;
  logTail?: string;
};

type OneshotEntry = {
  status: "idle" | "running" | "ok" | "error";
  elapsed?: string;
  output?: string;
};

// ── IPC helpers ───────────────────────────────────────────────────────────────

async function invoke<T>(channel: string, args?: unknown): Promise<T> {
  const bridge = window.piDesktop;
  if (!bridge) throw new Error("piDesktop bridge unavailable");
  const result: Result<T> = await bridge.invoke<T>(channel, args);
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
  // Gap 4 / T6: failed roots surfaced by discovery
  const [failedRoots, setFailedRoots] = useState<Array<{ root: string; reason: string }>>([]);

  // Supervisor state
  const [status, setStatus] = useState<BenchStatus>("stopped");
  const [activeBenchPath, setActiveBenchPath] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  // Bench log follow-tail is shell-global state (toggleFollowLog / Mod+Shift+B
  // must reach it from useAppShellRuntime, outside this component).
  const followTail = useAppStore((s) => s.benchLogFollowTail);
  const setFollowTail = useAppStore((s) => s.setBenchLogFollowTail);

  // Gap 1 / T6: bench-start failure from supervisor
  const [startFailure, setStartFailure] = useState<StartFailureState | null>(null);
  // Gap 5 / T6: port-conflict warnings
  const [warnings, setWarnings] = useState<string[]>([]);
  // Gap 3 / T6: elapsed timer
  const startMsRef = useRef<number | null>(null);
  const [elapsedLabel, setElapsedLabel] = useState("");
  // Gap 2 / T6: per-verb one-shot state (Map — runtime insertion/deletion)
  const [oneshotState, setOneshotState] = useState<Map<string, OneshotEntry>>(new Map());
  // T8 / T14: DestructiveActionDialog — pending confirmation + focus management
  const [pendingConfirm, setPendingConfirm] = useState<{
    verb: string;
    site: string;
    consequence: string;
    onConfirm: () => void;
  } | null>(null);
  // Ref to the trigger button so focus can be restored after dialog closes (T14)
  const dialogTriggerRef = useRef<HTMLButtonElement | null>(null);


  // T16: cross-fade key for bench selection transition
  const [detailKey, setDetailKey] = useState(0);

  const listRef = useRef<HTMLUListElement>(null);

  // ── Load bench list ───────────────────────────────────────────────────────

  const loadBenches = useCallback(async () => {
    setLoading(true);
    try {
      // Gap 4 / T6: discoverBenches now returns { benches, failedRoots }
      const { benches: discovered, failedRoots: failed } = await invoke<{
        benches: BenchSummary[];
        failedRoots: Array<{ root: string; reason: string }>;
      }>(IPC.invoke.benchList);
      setBenches(discovered);
      setFailedRoots(failed ?? []);
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
        const s = await invoke<{ status: BenchStatus; benchPath: string | null }>(IPC.invoke.benchStatus);
        setStatus(s.status);
        setActiveBenchPath(s.benchPath);
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

  // Gap 1 / T6: bench-start failure event from supervisor
  useEffect(() => {
    const bridge = window.piDesktop;
    if (!bridge) return;
    const off = bridge.on(IPC.event.benchFailure, (data: unknown) => {
      if (data && typeof data === "object" && "failure" in data) {
        const { failure, exitCode, logTail } = data as {
          failure: { code: string; problem: string; cause: string; fix: string; docsUrl: string };
          exitCode?: number | null;
          logTail?: string;
        };
        setStartFailure({ failure, exitCode, logTail });
      }
    });
    return () => off?.();
  }, []);

  // Gap 5 / T6: port-conflict warning event
  useEffect(() => {
    const bridge = window.piDesktop;
    if (!bridge) return;
    const off = bridge.on(IPC.event.benchWarning, (data: unknown) => {
      if (data && typeof data === "object" && "message" in data) {
        setWarnings((prev) => [...prev, String((data as { message: string }).message)]);
      }
    });
    return () => off?.();
  }, []);

  // Gap 3 / T6: prime startMs when status becomes starting/running (e.g. after restart)
  useEffect(() => {
    if ((status === "starting" || status === "running") && startMsRef.current === null) {
      startMsRef.current = Date.now();
    } else if (status === "stopped") {
      startMsRef.current = null;
      setElapsedLabel("");
    }
  }, [status]);


  // ── Bench selection ───────────────────────────────────────────────────────

  const selectBench = useCallback((id: string) => {
    setSelectedId(id);
    setDetailKey((k) => k + 1); // triggers T16 cross-fade
    setLogLines([]);
  }, []);

  const selectedBench = benches.find((b) => b.id === selectedId) ?? null;

  // A bench's process status only describes the bench the supervisor is
  // actually running; showing it for any other selected bench would let that
  // bench's Stop button target — and kill — a different bench (cross-bench
  // Stop bug).
  const displayStatus: BenchStatus =
    selectedBench && selectedBench.path === activeBenchPath ? status : "stopped";

  // A different bench is running/starting while this one is selected —
  // Start must be disabled, or clicking it either no-ops or (bench-ipc.ts)
  // throws a CONFLICT the user never asked for (cross-bench Start bug).
  const anotherBenchRunning =
    (status === "running" || status === "starting") &&
    activeBenchPath !== null &&
    (!selectedBench || selectedBench.path !== activeBenchPath);

  // Gap 3 / T6: tick the elapsed timer while the displayed bench is active
  useEffect(() => {
    if (displayStatus !== "starting" && displayStatus !== "running") return;
    const id = setInterval(() => {
      if (startMsRef.current !== null) {
        const secs = Math.floor((Date.now() - startMsRef.current) / 1000);
        const mm = String(Math.floor(secs / 60)).padStart(2, "0");
        const ss = String(secs % 60).padStart(2, "0");
        setElapsedLabel(`${mm}:${ss}`);
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayStatus]);

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
    // Gap 1 / T6: clear previous failure; Gap 5: clear warnings; Gap 3: start timer
    setStartFailure(null);
    setWarnings([]);
    startMsRef.current = Date.now();
    try {
      await invoke(IPC.invoke.benchStart, { benchPath: selectedBench.path });
      setStatus("starting");
      setActiveBenchPath(selectedBench.path);
    } catch (err) {
      startMsRef.current = null;
      console.error("[BenchPage] start failed", err);
    }
  }, [selectedBench]);

  const handleStop = useCallback(async () => {
    if (!selectedBench) return;
    try {
      await invoke(IPC.invoke.benchStop, { benchPath: selectedBench.path });
      setStatus("stopped");
      setActiveBenchPath(null);
      // Gap 3 / T6: clear timer on explicit stop
      startMsRef.current = null;
      setElapsedLabel("");
      // Gap 1 / T6: clear failure on explicit stop
      setStartFailure(null);
    } catch (err) {
      console.error("[BenchPage] stop failed", err);
    }
  }, [selectedBench]);

  // Gap 2 / T6: track per-verb one-shot state (result of runOneShot)
  // Consequences for destructive verbs (T8 — plan D14)
  const DESTRUCTIVE_CONSEQUENCES: Record<string, string> = {
    migrate: "alters the database schema",
    "install-app": "installs a Frappe app and alters the database",
  };

  const runVerb = useCallback(
    async (verb: string, site: string | undefined) => {
      if (!selectedBench) return;
      const t0 = Date.now();
      setOneshotState((prev) => {
        const next = new Map(prev);
        next.set(verb, { status: "running" });
        return next;
      });
      try {
        const result = await invoke<{ exitCode: number; output: string }>(IPC.invoke.benchRun, {
          benchPath: selectedBench.path,
          site,
          verb,
        });
        const elapsed = `${((Date.now() - t0) / 1000).toFixed(1)}s`;
        if (result.exitCode === 0) {
          setOneshotState((prev) => {
            const next = new Map(prev);
            next.set(verb, { status: "ok", elapsed });
            return next;
          });
        } else {
          const tail = result.output.split("\n").slice(-20).join("\n");
          setOneshotState((prev) => {
            const next = new Map(prev);
            next.set(verb, { status: "error", elapsed, output: tail });
            return next;
          });
        }
      } catch (err) {
        const elapsed = `${((Date.now() - t0) / 1000).toFixed(1)}s`;
        setOneshotState((prev) => {
          const next = new Map(prev);
          next.set(verb, { status: "error", elapsed, output: String(err) });
          return next;
        });
      }
    },
    [selectedBench],
  );

  const handleRun = useCallback(
    (verb: string, triggerEl?: HTMLButtonElement | null) => {
      if (!selectedBench) return;
      const site = selectedBench.sites.find((s) => s.isDefault)?.name ?? "";
      const consequence = DESTRUCTIVE_CONSEQUENCES[verb];
      if (consequence) {
        // T8 / T14: gate destructive verbs through dialog; save trigger for focus restore
        if (triggerEl) dialogTriggerRef.current = triggerEl;
        setPendingConfirm({
          verb,
          site,
          consequence,
          onConfirm: () => {
            setPendingConfirm(null);
            dialogTriggerRef.current?.focus(); // T14: restore focus on confirm
            void runVerb(verb, site);
          },
        });
      } else {
        void runVerb(verb, site);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedBench, runVerb],
  );

  const handleDialogCancel = useCallback(() => {
    setPendingConfirm(null);
    dialogTriggerRef.current?.focus(); // T14: restore focus on cancel
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="page-frame bench-page" aria-label="Bench">
      <div style={PAGE_STYLE}>
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

        {/* Gap 4 / T6: banner for partial or total discovery failures */}
        {!loading && failedRoots.length > 0 && (
          <div style={FAILED_ROOTS_BANNER_STYLE} role="alert">
            {benches.length > 0
              ? `${failedRoots.length} root${failedRoots.length > 1 ? "s" : ""} unreadable — fix permissions and refresh.`
              : "All discovery roots unreadable — fix permissions and refresh."}
          </div>
        )}

        {loading ? (
          <BenchListSkeleton />
        ) : benches.length === 0 && failedRoots.length === 0 ? (
          <ZeroBenchState />
        ) : benches.length === 0 ? (
          /* All roots failed */
          <div style={EMPTY_BENCH_STYLE} role="alert">
            <p style={{ fontWeight: 600, color: "var(--ds-error)" }}>
              Could not read any bench roots.
            </p>
            {failedRoots.map((fr) => (
              <div key={fr.root} style={FAILED_ROOT_ROW_STYLE}>
                <code style={CODE_STYLE_INLINE}>{fr.root}</code>: {fr.reason}
              </div>
            ))}
          </div>
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
        key={detailKey}
        aria-label={selectedBench ? `Bench detail: ${selectedBench.path}` : "Bench detail"}
        style={{ ...DETAIL_STYLE, animation: `benchDetailFadeIn var(--motion-duration-fast) var(--motion-ease-out)` }}
      >
        {selectedBench ? (
          <BenchDetail
            bench={selectedBench}
            status={displayStatus}
            anotherBenchRunning={anotherBenchRunning}
            logLines={logLines}
            followTail={followTail}
            onFollowTailChange={setFollowTail}
            onStart={handleStart}
            onStop={handleStop}
            onRun={handleRun}
            elapsedLabel={elapsedLabel}
            startFailure={startFailure}
            warnings={warnings}
            oneshotState={oneshotState}
          />
        ) : (
          <div style={EMPTY_DETAIL_STYLE}>
            <p style={{ color: "var(--ds-text-tertiary)" }}>Select a bench</p>
          </div>
        )}
      </section>

      {/* T16: keyframe definition */}
      <style>{FADE_IN_KEYFRAME}</style>
      </div>

      {/* T8 / T14: DestructiveActionDialog overlay — no auto-deny timer (plan D14/D31) */}
      {pendingConfirm && (
        <div style={DIALOG_OVERLAY_STYLE}>
          <DestructiveActionDialog
            site={pendingConfirm.site}
            command={pendingConfirm.verb}
            consequence={pendingConfirm.consequence}
            onConfirm={pendingConfirm.onConfirm}
            onCancel={handleDialogCancel}
          />
        </div>
      )}
    </main>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BenchDetail({
  bench,
  status,
  anotherBenchRunning,
  logLines,
  followTail,
  onFollowTailChange,
  onStart,
  onStop,
  onRun,
  elapsedLabel,
  startFailure,
  warnings,
  oneshotState,
}: {
  bench: BenchSummary;
  status: BenchStatus;
  anotherBenchRunning: boolean;
  logLines: LogLine[];
  followTail: boolean;
  onFollowTailChange: (v: boolean) => void;
  onStart: () => void;
  onStop: () => void;
  onRun: (verb: string, triggerEl?: HTMLButtonElement | null) => void;
  elapsedLabel: string;
  startFailure: StartFailureState | null;
  warnings: string[];
  oneshotState: Map<string, OneshotEntry>;
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
        <ProcessPanel
          status={status}
          anotherBenchRunning={anotherBenchRunning}
          onStart={onStart}
          onStop={onStop}
          elapsedLabel={elapsedLabel}
          startFailure={startFailure}
          warnings={warnings}
        />
      </div>

      {/* One-shot commands — Gap 2 / T6 */}
      <div style={ONESHOT_ROW_STYLE}>
        {ONESHOT_VERBS.map((verb) => {
          const vs = oneshotState.get(verb);
          return (
            <div key={verb} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <button
                type="button"
                style={{
                  ...ONESHOT_BTN_STYLE,
                  ...(vs?.status === "running" ? { opacity: 0.7 } : {}),
                }}
                onClick={(e) => onRun(verb, e.currentTarget)}
                disabled={status !== "running" || vs?.status === "running"}
                title={verb}
              >
                {vs?.status === "running" ? `${verb} …` : vs?.status === "ok" ? `✓ ${verb}` : vs?.status === "error" ? `✗ ${verb}` : verb}
              </button>
              {vs?.status === "ok" && vs.elapsed && (
                <span style={{ fontSize: "var(--text-3xs)", color: "var(--ds-success)" }}>
                  {vs.elapsed} · exit 0
                </span>
              )}
              {vs?.status === "error" && (
                <div style={ERROR_OUTPUT_STYLE}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: "var(--ds-error)", fontSize: "var(--text-3xs)" }}>
                      exit {vs.elapsed}
                    </span>
                    {vs.output && (
                      <button
                        type="button"
                        style={COPY_BTN_STYLE}
                        onClick={() => navigator.clipboard.writeText(vs.output ?? "")}
                        title="Copy error output"
                      >
                        Copy
                      </button>
                    )}
                  </div>
                  {vs.output && (
                    <pre style={{ margin: 0, fontSize: "var(--text-3xs)", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>
                      {vs.output}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
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
  anotherBenchRunning,
  onStart,
  onStop,
  elapsedLabel,
  startFailure,
  warnings,
}: {
  anotherBenchRunning: boolean;
  status: BenchStatus;
  onStart: () => void;
  onStop: () => void;
  elapsedLabel: string;
  startFailure: StartFailureState | null;
  warnings: string[];
}) {
  return (
    <div style={PANEL_BOX_STYLE}>
      <div style={PANEL_LABEL_STYLE}>Processes</div>
      {/* Gap 3 / T6: status + elapsed */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StatusDot status={status} />
        <span style={{ fontSize: "var(--text-sm)" }}>{STATUS_LABELS[status]}</span>
        {elapsedLabel && (
          <span style={{ fontSize: "var(--text-2xs)", color: "var(--ds-text-tertiary)" }}>
            {elapsedLabel}
          </span>
        )}
      </div>

      {/* Gap 5 / T6: port-conflict warnings */}
      {warnings.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {warnings.map((w, i) => (
            <div key={i} style={WARNING_ROW_STYLE}>
              <span style={{ color: "var(--ds-warning)" }}>⚠</span> {w}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {status === "stopped" || status === "failed" ? (
          <button type="button" style={ACTION_BTN_STYLE} onClick={onStart} disabled={anotherBenchRunning}>
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

      {/* Gap 1 / T6: bench-start failure panel */}
      {startFailure && (
        <div style={FAILURE_PANEL_STYLE} role="alert">
          <div style={{ fontWeight: 600, color: "var(--ds-error)", marginBottom: 4 }}>
            {startFailure.failure.problem}
          </div>
          <div style={{ fontSize: "var(--text-sm)", marginBottom: 4 }}>
            <span style={{ color: "var(--ds-text-secondary)" }}>Cause:</span> {startFailure.failure.cause}
          </div>
          <div style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
            <span style={{ color: "var(--ds-text-secondary)" }}>Fix:</span> {startFailure.failure.fix}
          </div>
          {startFailure.failure.docsUrl && (
            <a
              href={startFailure.failure.docsUrl}
              style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-link)" }}
              onClick={(e) => { e.preventDefault(); window.open(startFailure.failure.docsUrl); }}
            >
              Docs ↗
            </a>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <button type="button" style={ACTION_BTN_STYLE} onClick={onStart} disabled={anotherBenchRunning}>
              Retry
            </button>
            {startFailure.logTail && (
              <button
                type="button"
                style={COPY_BTN_STYLE}
                onClick={() => navigator.clipboard.writeText(startFailure.logTail ?? "")}
              >
                Copy log
              </button>
            )}
          </div>
          {startFailure.logTail && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ fontSize: "var(--text-3xs)", color: "var(--ds-text-tertiary)", cursor: "pointer" }}>
                Last log lines
              </summary>
              <pre style={LOG_TAIL_PRE_STYLE}>{startFailure.logTail}</pre>
            </details>
          )}
        </div>
      )}
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

// ── T6 gap styles ─────────────────────────────────────────────────────────────

const FAILED_ROOTS_BANNER_STYLE: React.CSSProperties = {
  padding: "6px 8px",
  marginBottom: 6,
  borderRadius: "var(--radius-xs)",
  background: "color-mix(in srgb, var(--ds-warning) 15%, transparent)",
  color: "var(--ds-warning)",
  fontSize: "var(--text-2xs)",
};

const FAILED_ROOT_ROW_STYLE: React.CSSProperties = {
  fontSize: "var(--text-2xs)",
  color: "var(--ds-text-secondary)",
  marginBottom: 4,
};

const CODE_STYLE_INLINE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  background: "var(--ds-bg-secondary, rgba(0,0,0,0.3))",
  borderRadius: "var(--radius-3xs)",
  padding: "0 3px",
};

const WARNING_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  gap: 4,
  alignItems: "flex-start",
  fontSize: "var(--text-2xs)",
  color: "var(--ds-text-secondary)",
  padding: "2px 0",
};

const FAILURE_PANEL_STYLE: React.CSSProperties = {
  marginTop: 8,
  padding: 10,
  borderRadius: "var(--radius-xs)",
  border: "1px solid var(--ds-error)",
  background: "color-mix(in srgb, var(--ds-error) 10%, transparent)",
};

const ERROR_OUTPUT_STYLE: React.CSSProperties = {
  marginTop: 4,
  padding: "6px 8px",
  borderRadius: "var(--radius-xs)",
  background: "color-mix(in srgb, var(--ds-error) 10%, transparent)",
  border: "1px solid color-mix(in srgb, var(--ds-error) 30%, transparent)",
};

const LOG_TAIL_PRE_STYLE: React.CSSProperties = {
  margin: 0,
  marginTop: 6,
  fontSize: "var(--text-3xs)",
  fontFamily: "var(--font-mono)",
  whiteSpace: "pre-wrap",
  overflowWrap: "break-word",
  maxHeight: 120,
  overflow: "auto",
  color: "var(--ds-text-secondary)",
};

const DIALOG_OVERLAY_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
};
