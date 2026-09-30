/**
 * T4 — Bench cockpit: master-detail bench browser.
 *
 * Layout (Espresso E frame): context sidebar (256px bench list, with
 * unreadable discovery roots as failed entries) + island (selected bench:
 * header, sites/processes/one-shot commands on top, log console below).
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
import { ErrorCodes, IPC, type Result } from "@pi-desktop/shared";
import { useAppStore } from "../stores/app-store";
import { LogView } from "../components/bench/LogView";
import { DestructiveActionDialog } from "../components/DestructiveActionDialog";
import { IconPlay, IconSquare } from "../components/icons";
import { api } from "../lib/api";
import { DocTypeTree } from "../components/code/DocTypeTree";
import { preferredFileWorkPanelTab } from "../lib/work-panel-tabs";
import { useTranslation } from "react-i18next";

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
  benchPath: string;
  failure: { code: string; problem: string; cause: string; fix: string; docsUrl: string };
  exitCode?: number | null;
  logTail?: string;
};

type OneshotEntry = {
  status: "idle" | "running" | "ok" | "error";
  elapsed?: string;
  output?: string;
};

// ── Selectors ─────────────────────────────────────────────────────────────────

// Gap 1 / T6 follow-up: stale failures from a different bench must not
// follow the selection into BenchDetail or Retry's onStart (cross-bench
// start-failure leak). Extracted so the gate has a direct behavioral test
// (AGENTS.md §12) instead of only a regex on the JSX call site.
export function selectVisibleStartFailure(
  startFailure: StartFailureState | null,
  selectedBench: BenchSummary | null,
): StartFailureState | null {
  return startFailure && selectedBench && startFailure.benchPath === selectedBench.path
    ? startFailure
    : null;
}

// ── IPC helpers ───────────────────────────────────────────────────────────────

async function invoke<T>(channel: string, args?: unknown): Promise<T> {
  const bridge = window.piDesktop;
  if (!bridge) throw new Error("piDesktop bridge unavailable");
  const result: Result<T> = await bridge.invoke<T>(channel, args);
  if (!result.ok) {
    throw Object.assign(new Error(result.error.message ?? "IPC call failed"), {
      errorCode: result.error.code,
    });
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
  // Migrate site: null = no valid site (multi-site requires explicit choice; zero sites can't migrate).
  // Single-site bench auto-selects; no preselection for multi-site.
  const [migrateSite, setMigrateSite] = useState<string | null>(null);
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
        const { failure, exitCode, logTail, benchPath } = data as {
          failure: { code: string; problem: string; cause: string; fix: string; docsUrl: string };
          exitCode?: number | null;
          logTail?: string;
          benchPath: string;
        };
        setStartFailure({ failure, exitCode, logTail, benchPath });
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

  useEffect(() => {
    if (!selectedBench) {
      setMigrateSite(null);
      return;
    }
    // Auto-select only when exactly one site exists; require explicit choice for >1
    setMigrateSite(selectedBench.sites.length === 1 ? selectedBench.sites[0].name : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBench?.id]);

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
      const errorCode = err instanceof Error ? (err as Error & { errorCode?: string }).errorCode : undefined;
      if (errorCode === ErrorCodes.CONFLICT) {
        setStartFailure({
          benchPath: selectedBench.path,
          failure: {
            code: ErrorCodes.CONFLICT,
            problem: "Can't start this bench",
            cause: err instanceof Error ? err.message : String(err),
            fix: "Stop the running bench, then retry.",
            docsUrl: "",
          },
        });
      } else {
        console.error("[BenchPage] start failed", err);
      }
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
      const site =
        verb === "migrate"
          ? (migrateSite ?? "")
          : (selectedBench.sites.find((s) => s.isDefault)?.name ?? "");
      // Belt-and-suspenders: migrate with no valid site is a no-op
      if (verb === "migrate" && !migrateSite) return;
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
    [selectedBench, runVerb, migrateSite],
  );

  const pluginViews = useAppStore((s) => s.pluginViews);
  const { t } = useTranslation();
  const handleOpenDocTypeFile = useCallback(
    async (absolutePath: string) => {
      const store = useAppStore.getState();
      // The bench is not necessarily an open project; opening a file outside
      // every open project would render an empty editor, so report instead.
      const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
      const file = norm(absolutePath);
      const inside = (roots: string[]) =>
        roots.some((root) => file === root || file.startsWith(`${root}/`));
      const open = [store.workspace?.path, ...store.openProjects.map((p) => p.path)]
        .filter((p): p is string => Boolean(p))
        .map(norm);
      let allowed = inside(open);
      if (!allowed) {
        // A multi-folder project registers extra roots the store does not
        // carry; the file view accepts any of them, so accept them too.
        try {
          const { groups } = await api.listProjectGroups();
          allowed = inside(
            groups
              .filter((g) => g.roots.some((r) => open.includes(norm(r.path))))
              .flatMap((g) => g.roots.map((r) => norm(r.path))),
          );
        } catch {
          /* fall through to the error toast */
        }
      }
      if (!allowed) {
        store.showToast(t("panel.fileOutsideProject"), { variant: "error" });
        return;
      }
      store.setPage("chat");
      store.requestFileInWorkPanel(preferredFileWorkPanelTab(absolutePath, pluginViews));
    },
    [pluginViews, t],
  );

  // Delegate DocType migrate through handleRun so it uses DestructiveActionDialog,
  // oneshotState output, and the shared migrateSite.
  const handleMigrateDocTypes = useCallback(
    (el: HTMLButtonElement) => {
      handleRun("migrate", el);
    },
    [handleRun],
  );
  const docTypeMigrateAction = migrateSite ? handleMigrateDocTypes : undefined;

  const handleDialogCancel = useCallback(() => {
    setPendingConfirm(null);
    dialogTriggerRef.current?.focus(); // T14: restore focus on cancel
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="wb-page bench-page" aria-label="Bench">
      <aside className="context-sidebar">
        <nav aria-label="Discovered benches" className="wb-sidebar-nav">
          <div className="wb-sidebar-hd">
            <span>Benches</span>
            {!loading && <span className="wb-count">{benches.length}</span>}
          </div>

          {loading ? (
            <BenchListSkeleton />
          ) : (
            benches.length > 0 && (
              <ul
                ref={listRef}
                role="listbox"
                aria-label="Select a bench"
                aria-activedescendant={selectedId ? `bench-item-${selectedId}` : undefined}
                onKeyDown={handleListKeyDown}
                className="wb-list"
              >
                {benches.map((bench) => {
                  const isSelected = bench.id === selectedId;
                  const defaultSite = bench.sites.find((s) => s.isDefault)?.name;
                  return (
                    <li
                      key={bench.id}
                      id={`bench-item-${bench.id}`}
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={isSelected ? 0 : -1}
                      onClick={() => selectBench(bench.id)}
                      className={`wb-row${isSelected ? " is-active" : ""}`}
                    >
                      <div className="wb-row-top">
                        <span className="wb-row-name">{baseName(bench.path)}</span>
                        <StatusBadge status={bench.path === activeBenchPath ? status : "stopped"} />
                      </div>
                      <div className="wb-row-meta">
                        {defaultSite && <span className="wb-truncate">{defaultSite}</span>}
                        <VersionBadge version={bench.version} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          )}

          {/* Gap 4 / T6: discovery roots that could not be read, as failed entries */}
          {!loading && failedRoots.length > 0 && (
            <div className="wb-failed-roots" role="alert">
              <p className="wb-sidebar-note">
                {benches.length > 0
                  ? `${failedRoots.length} root${failedRoots.length > 1 ? "s" : ""} unreadable — fix permissions and refresh.`
                  : "All discovery roots unreadable — fix permissions and refresh."}
              </p>
              {failedRoots.map((fr) => (
                <div key={fr.root} className="wb-row is-static" title={fr.root}>
                  <div className="wb-row-top">
                    <span className="wb-row-name">{baseName(fr.root)}</span>
                    <StatusBadge status="failed" />
                  </div>
                  <div className="wb-row-error">{fr.reason}</div>
                  <code className="wb-row-meta wb-mono wb-truncate">{fr.root}</code>
                </div>
              ))}
            </div>
          )}
        </nav>
      </aside>

      {/* Detail — T16: keyed so the fade-in replays on bench selection */}
      <section
        key={detailKey}
        className="island wb-fade-in"
        aria-label={selectedBench ? `Bench detail: ${selectedBench.path}` : "Bench detail"}
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
            onOpenDocTypeFile={handleOpenDocTypeFile}
            elapsedLabel={elapsedLabel}
            // Stale failures from a different bench must not follow the
            // selection here or into Retry's onStart (cross-bench Start-
            // failure leak) — see selectVisibleStartFailure above.
            startFailure={selectVisibleStartFailure(startFailure, selectedBench)}
            warnings={warnings}
            oneshotState={oneshotState}
            migrateSite={migrateSite}
            onMigrateSiteChange={setMigrateSite}
            onMigrateDocTypes={docTypeMigrateAction}
          />
        ) : loading ? null : benches.length === 0 && failedRoots.length === 0 ? (
          <ZeroBenchState />
        ) : (
          <div className="wb-empty">
            <p className="wb-muted">
              {benches.length === 0 ? "Could not read any bench roots." : "Select a bench"}
            </p>
          </div>
        )}
      </section>

      {/* T8 / T14: DestructiveActionDialog overlay — no auto-deny timer (plan D14/D31) */}
      {pendingConfirm && (
        <div className="wb-dialog-overlay">
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
  onOpenDocTypeFile,
  elapsedLabel,
  startFailure,
  warnings,
  oneshotState,
  migrateSite,
  onMigrateSiteChange,
  onMigrateDocTypes,
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
  onOpenDocTypeFile: (absolutePath: string) => void;
  elapsedLabel: string;
  startFailure: StartFailureState | null;
  warnings: string[];
  oneshotState: Map<string, OneshotEntry>;
  migrateSite: string | null;
  onMigrateSiteChange: (site: string) => void;
  onMigrateDocTypes: ((el: HTMLButtonElement) => void) | undefined;
}) {
  return (
    <>
      {/* Header */}
      <header className="wb-island-hd">
        <span className="wb-island-title">{baseName(bench.path)}</span>
        <VersionBadge version={bench.version} />
        <span className="wb-path wb-truncate" title={bench.path}>{bench.path}</span>
      </header>

      {/* Top of the console split: sites, processes, one-shot commands */}
      <div className="wb-detail-body">
        <div className="wb-panels">
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
        <div className="wb-sec-lbl">One-shot commands</div>
        {bench.sites.length > 1 && (
          <div className="wb-migrate-site">
            <label className="wb-sec-lbl" htmlFor="migrate-site-select">
              Migrate site
            </label>
            <select
              id="migrate-site-select"
              className="wb-select-sm"
              value={migrateSite ?? ""}
              onChange={(e) => onMigrateSiteChange(e.target.value)}
              aria-label="Select site for migrate"
            >
              <option value="">— choose site —</option>
              {bench.sites.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="wb-cmds">
          {ONESHOT_VERBS.map((verb) => {
            const vs = oneshotState.get(verb);
            return (
              <div key={verb} className="wb-cmd">
                <button
                  type="button"
                  className="wb-btn wb-btn-subtle"
                  onClick={(e) => onRun(verb, e.currentTarget)}
                  disabled={status !== "running" || vs?.status === "running" || (verb === "migrate" && !migrateSite)}
                  title={verb}
                >
                  {vs?.status === "running" ? `${verb} …` : vs?.status === "ok" ? `✓ ${verb}` : vs?.status === "error" ? `✗ ${verb}` : verb}
                </button>
                {vs?.status === "ok" && vs.elapsed && (
                  <span className="wb-cmd-ok">{vs.elapsed} · exit 0</span>
                )}
                {vs?.status === "error" && (
                  <div className="wb-error-output">
                    <div className="wb-error-output-hd">
                      <span>exit {vs.elapsed}</span>
                      {vs.output && (
                        <button
                          type="button"
                          className="wb-btn wb-btn-ghost wb-btn-sm"
                          onClick={() => navigator.clipboard.writeText(vs.output ?? "")}
                          title="Copy error output"
                        >
                          Copy
                        </button>
                      )}
                    </div>
                    {vs.output && <pre className="wb-pre">{vs.output}</pre>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom of the console split: log viewer (T5) */}
      <div className="wb-log">
        <div className="wb-island-hd">
          <span className="wb-log-title">Log</span>
          <button
            type="button"
            className="wb-btn wb-btn-ghost wb-btn-sm"
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
      {/* DocTypes panel — browse-only; never mutates on browse */}
      <div className="wb-doctypes">
        <div className="wb-sec-lbl">DocTypes</div>
        <DocTypeTree bench={bench} onOpen={onOpenDocTypeFile} onMigrate={onMigrateDocTypes} />
      </div>
    </>
  );
}

function SiteList({ sites }: { sites: BenchSite[] }) {
  return (
    <div className="wb-panel">
      <div className="wb-sec-lbl">Sites</div>
      {sites.length === 0 ? (
        <p className="wb-muted">No sites found</p>
      ) : (
        <ul className="wb-plain-list">
          {sites.map((s) => (
            <li key={s.name} className="wb-site">
              <span className={`wb-dot ${s.isDefault ? "wb-dot-green" : "wb-dot-gray"}`} aria-hidden="true" />
              <span className="wb-truncate">{s.name}</span>
              {s.isDefault && <span className="wb-badge wb-badge-gray">default</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Exported so the failure banner it renders (role="alert", Retry) can be
// verified as real rendered markup (AGENTS.md §12), not only through the
// selectVisibleStartFailure selector that decides its `startFailure` prop.
export function ProcessPanel({
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
    <div className="wb-panel">
      <div className="wb-sec-lbl">Processes</div>
      {/* Gap 3 / T6: status + elapsed */}
      <div className="wb-status-line">
        <StatusBadge status={status} />
        {elapsedLabel && <span className="wb-muted">{elapsedLabel}</span>}
        <span className="wb-spacer" />
        {status === "stopped" || status === "failed" ? (
          <button type="button" className="wb-btn wb-btn-solid" onClick={onStart} disabled={anotherBenchRunning}>
            <IconPlay size={14} aria-hidden="true" />
            Start bench
          </button>
        ) : (
          <button
            type="button"
            className="wb-btn wb-btn-subtle"
            onClick={onStop}
            disabled={status === "starting"}
          >
            <IconSquare size={14} aria-hidden="true" />
            Stop
          </button>
        )}
      </div>

      {/* Gap 5 / T6: port-conflict warnings */}
      {warnings.length > 0 && (
        <div className="wb-warnings">
          {warnings.map((w, i) => (
            <div key={i} className="wb-warning">
              <span aria-hidden="true">⚠</span> {w}
            </div>
          ))}
        </div>
      )}

      {/* Gap 1 / T6: bench-start failure panel */}
      {startFailure && (
        <div className="wb-failure" role="alert">
          <div className="wb-failure-title">{startFailure.failure.problem}</div>
          <div className="wb-failure-line">
            <span className="wb-muted">Cause:</span> {startFailure.failure.cause}
          </div>
          <div className="wb-failure-line">
            <span className="wb-muted">Fix:</span> {startFailure.failure.fix}
          </div>
          {startFailure.failure.docsUrl && (
            <a
              href={startFailure.failure.docsUrl}
              className="wb-link"
              onClick={(e) => { e.preventDefault(); window.open(startFailure.failure.docsUrl); }}
            >
              Docs ↗
            </a>
          )}
          <div className="wb-actions">
            <button type="button" className="wb-btn wb-btn-solid wb-btn-sm" onClick={onStart} disabled={anotherBenchRunning}>
              Retry
            </button>
            {startFailure.logTail && (
              <button
                type="button"
                className="wb-btn wb-btn-subtle wb-btn-sm"
                onClick={() => navigator.clipboard.writeText(startFailure.logTail ?? "")}
              >
                Copy log
              </button>
            )}
          </div>
          {startFailure.logTail && (
            <details className="wb-details">
              <summary>Last log lines</summary>
              <pre className="wb-pre wb-log-tail">{startFailure.logTail}</pre>
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
      <span className="wb-badge wb-badge-amber" title="Frappe version undetected">
        ?
      </span>
    );
  }
  return <span className="wb-badge wb-badge-gray">v{version}</span>;
}

function StatusBadge({ status }: { status: BenchStatus }) {
  const hue = STATUS_HUES[status];
  return (
    <span className={`wb-badge wb-badge-${hue}`}>
      <span className={`wb-dot wb-dot-${hue}`} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}

function BenchListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Discovering benches…" role="status" className="wb-skeleton-list">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="wb-skeleton" />
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
    <div className="wb-empty">
      <div className="wb-empty-inner">
        <p className="wb-empty-title">No Frappe benches found</p>
        <p className="wb-muted">
          Fcode scans <code className="wb-code">~/ERPNext</code> on startup.
          Frappe installation is outside this app's control.
        </p>

        <p className="wb-empty-step">Create a bench:</p>
        <CopyCmd
          label="bench init"
          text="bench init frappe-bench --frappe-branch version-16"
          copied={copied}
          onCopy={copy}
        />

        <p className="wb-empty-step">Create a site:</p>
        <CopyCmd
          label="bench new-site"
          text="bench new-site site1.local --install-app frappe"
          copied={copied}
          onCopy={copy}
        />

        <p className="wb-empty-step">
          <a
            href="https://frappeframework.com/docs/user/en/installation"
            target="_blank"
            rel="noopener noreferrer"
            className="wb-link"
          >
            Frappe installation guide ↗
          </a>
        </p>
      </div>
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
    <div className="wb-copy-cmd">
      <code className="wb-mono">{text}</code>
      <button
        type="button"
        className="wb-btn wb-btn-subtle wb-btn-sm"
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

// Status hues: Espresso reserves hue for status only (subtle badge + dot).
const STATUS_HUES: Record<BenchStatus, "green" | "amber" | "red" | "gray"> = {
  running: "green",
  starting: "amber",
  failed: "red",
  stopped: "gray",
};

const STATUS_LABELS: Record<BenchStatus, string> = {
  running: "Running",
  starting: "Starting…",
  failed: "Failed",
  stopped: "Stopped",
};

/** Last path segment; discovery roots may be Windows paths. */
function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
