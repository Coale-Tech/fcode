/**
 * Bench page: tabs + switcher (61 benches don't fit a sidebar list).
 *
 * Layout (Espresso E frame): one island. Tab strip = "All benches" (filterable
 * table, unreadable discovery roots as failed entries) + one closable tab per
 * opened bench. A bench tab has a header switcher, Start/Stop, sites/processes/
 * one-shot commands on top and the log console below.
 *
 * BenchSupervisor is single-bench: while another bench runs, every Start is
 * disabled with a "Stop X first" cue (lib/bench-view startBlockedBy).
 *
 * T16 — the tab panel cross-fades on tab change at
 *         --motion-duration-fast / --motion-ease-out.
 *
 * DX12 — zero-bench empty state with copy-paste bench init commands and a
 *         Frappe install docs link.
 *
 * Accessibility (design-phase D32):
 *   - <main> landmark with aria-label="Bench".
 *   - Tab strip is a tablist with roving tabindex; switcher is a combobox.
 *   - Log viewer gains role="log" aria-live (inside LogView).
 *   - Focus returned to the trigger on dialog close.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorCodes, IPC, type Result } from "@pi-desktop/shared";
import { useAppStore } from "../stores/app-store";
import { LogView } from "../components/bench/LogView";
import { AllBenches } from "../components/bench/AllBenches";
import { StatusBadge, StatusDot } from "../components/bench/BenchBadges";
import { BenchSwitcher } from "../components/bench/BenchSwitcher";
import { DestructiveActionDialog } from "../components/DestructiveActionDialog";
import { IconClose, IconPlay, IconSquare } from "../components/icons";
import { api } from "../lib/api";
import {
  baseName,
  benchStatusFor,
  oneshotKey,
  startBlockedBy,
  startBlockedCue,
  type BenchSite,
  type BenchStatus,
  type BenchSummary,
} from "../lib/bench-view";
import { DocTypeTree } from "../components/code/DocTypeTree";
import { preferredFileWorkPanelTab } from "../lib/work-panel-tabs";
import { useTranslation } from "react-i18next";

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
  // Tabs: "all" (the All benches table) or a bench id; openIds are the bench tabs in open order.
  const [tab, setTab] = useState<string>("all");
  const [openIds, setOpenIds] = useState<string[]>([]);
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

  // Bench whose log is in logLines (the supervisor streams one bench's log at a time).
  const [logOwner, setLogOwner] = useState<string | null>(null);

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
      // Drop tabs for benches that no longer exist.
      const ids = discovered.map((b) => b.id);
      setOpenIds((prev) => prev.filter((id) => ids.includes(id)));
      setTab((prev) => (prev === "all" || ids.includes(prev) ? prev : "all"));
    } catch {
      // discovery error: show empty state
    } finally {
      setLoading(false);
    }
  }, []);

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


  // ── Tabs ──────────────────────────────────────────────────────────────────

  const openBench = useCallback((id: string) => {
    setOpenIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    setTab(id);
    setDetailKey((k) => k + 1); // triggers T16 cross-fade
  }, []);

  const showAll = useCallback(() => {
    setTab("all");
    setDetailKey((k) => k + 1);
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      const i = openIds.indexOf(id);
      setOpenIds(openIds.filter((x) => x !== id));
      if (tab === id) setTab(openIds[i - 1] ?? "all");
    },
    [openIds, tab],
  );

  const selectedBench = tab === "all" ? null : (benches.find((b) => b.id === tab) ?? null);
  const openBenches = openIds
    .map((id) => benches.find((b) => b.id === id))
    .filter((b): b is BenchSummary => b !== undefined);

  // A new bench taking over the supervisor owns the log from here on.
  useEffect(() => {
    if (activeBenchPath !== null && activeBenchPath !== logOwner) {
      setLogOwner(activeBenchPath);
      setLogLines([]);
    }
  }, [activeBenchPath, logOwner]);

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

  // BenchSupervisor runs one bench at a time: while a different bench runs,
  // Start is disabled (it would be rejected with CONFLICT) and cues which
  // bench to stop first. Same rule drives the All benches table.
  const blocker = startBlockedBy(status, activeBenchPath, selectedBench?.path ?? null);
  const tableBlocker = startBlockedBy(status, activeBenchPath, null);
  const statusOf = useCallback(
    (b: BenchSummary) => benchStatusFor(b.path, status, activeBenchPath),
    [status, activeBenchPath],
  );

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

  // ── Tab keyboard (roving tabindex) ────────────────────────────────────────

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const order = ["all", ...openBenches.map((b) => b.id)];
      const idx = order.indexOf(tab);
      let next: number;
      if (e.key === "ArrowRight") next = Math.min(idx + 1, order.length - 1);
      else if (e.key === "ArrowLeft") next = Math.max(idx - 1, 0);
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = order.length - 1;
      else return;
      e.preventDefault();
      setTab(order[next]);
      setDetailKey((k) => k + 1);
      document.getElementById(`bench-tab-${order[next]}`)?.focus();
    },
    [openBenches, tab],
  );

  // ── Start / stop ──────────────────────────────────────────────────────────

  const handleStart = useCallback(
    async (bench: BenchSummary) => {
      // The control is disabled while another bench runs; this covers a click
      // that raced the status poll.
      if (startBlockedBy(status, activeBenchPath, bench.path)) return;
      // Gap 1 / T6: clear previous failure; Gap 5: clear warnings; Gap 3: start timer
      setStartFailure(null);
      setWarnings([]);
      setLogLines([]);
      startMsRef.current = Date.now();
      try {
        await invoke(IPC.invoke.benchStart, { benchPath: bench.path });
        setStatus("starting");
        setActiveBenchPath(bench.path);
      } catch (err) {
        startMsRef.current = null;
        const errorCode = err instanceof Error ? (err as Error & { errorCode?: string }).errorCode : undefined;
        if (errorCode === ErrorCodes.CONFLICT) {
          setStartFailure({
            benchPath: bench.path,
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
    },
    [status, activeBenchPath],
  );

  const handleStop = useCallback(async (bench: BenchSummary) => {
    try {
      await invoke(IPC.invoke.benchStop, { benchPath: bench.path });
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
  }, []);

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
      // Keyed by bench path: results belong to the bench they ran on, so
      // switching tabs mid-run never shows or blocks another bench's verb.
      const key = oneshotKey(selectedBench.path, verb);
      const setEntry = (entry: OneshotEntry) =>
        setOneshotState((prev) => new Map(prev).set(key, entry));
      setEntry({ status: "running" });
      try {
        const result = await invoke<{ exitCode: number; output: string }>(IPC.invoke.benchRun, {
          benchPath: selectedBench.path,
          site,
          verb,
        });
        const elapsed = `${((Date.now() - t0) / 1000).toFixed(1)}s`;
        if (result.exitCode === 0) {
          setEntry({ status: "ok", elapsed });
        } else {
          const tail = result.output.split("\n").slice(-20).join("\n");
          setEntry({ status: "error", elapsed, output: tail });
        }
      } catch (err) {
        const elapsed = `${((Date.now() - t0) / 1000).toFixed(1)}s`;
        setEntry({ status: "error", elapsed, output: String(err) });
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
      <section className="island" aria-label="Benches">
        <div className="wb-btabs" role="tablist" aria-label="Bench tabs" onKeyDown={handleTabKeyDown}>
          <button
            type="button"
            role="tab"
            id="bench-tab-all"
            aria-selected={tab === "all"}
            aria-controls="bench-panel"
            tabIndex={tab === "all" ? 0 : -1}
            className={`wb-btab${tab === "all" ? " is-active" : ""}`}
            onClick={showAll}
          >
            All benches
            {!loading && <span className="wb-badge wb-badge-gray">{benches.length}</span>}
          </button>
          {openBenches.map((b) => {
            const name = baseName(b.path);
            return (
              <div key={b.id} className={`wb-btab-wrap${tab === b.id ? " is-active" : ""}`}>
                <button
                  type="button"
                  role="tab"
                  id={`bench-tab-${b.id}`}
                  aria-selected={tab === b.id}
                  aria-controls="bench-panel"
                  tabIndex={tab === b.id ? 0 : -1}
                  className="wb-btab"
                  title={b.path}
                  onClick={() => openBench(b.id)}
                >
                  <StatusDot status={statusOf(b)} />
                  <span className="wb-truncate">{name}</span>
                </button>
                <button
                  type="button"
                  className="wb-btab-close"
                  aria-label={`Close ${name}`}
                  onClick={() => closeTab(b.id)}
                >
                  <IconClose size={12} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>

        {/* T16: keyed so the fade-in replays on tab change */}
        <div
          key={detailKey}
          id="bench-panel"
          role="tabpanel"
          aria-labelledby={`bench-tab-${selectedBench ? selectedBench.id : "all"}`}
          className="wb-tabpanel wb-fade-in"
        >
          {selectedBench ? (
            <BenchDetail
              bench={selectedBench}
              benches={benches}
              statusOf={statusOf}
              onPick={(b) => openBench(b.id)}
              onShowAll={showAll}
              status={displayStatus}
              blocker={blocker}
              logLines={logOwner === selectedBench.path ? logLines : []}
              followTail={followTail}
              onFollowTailChange={setFollowTail}
              onStart={() => void handleStart(selectedBench)}
              onStop={() => void handleStop(selectedBench)}
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
          ) : loading ? (
            <BenchListSkeleton />
          ) : benches.length === 0 && failedRoots.length === 0 ? (
            <ZeroBenchState />
          ) : (
            <>
              {benches.length > 0 && (
                <AllBenches
                  benches={benches}
                  statusOf={statusOf}
                  blocker={tableBlocker}
                  onOpen={(b) => openBench(b.id)}
                  onStart={(b) => void handleStart(b)}
                  onStop={(b) => void handleStop(b)}
                />
              )}
              {/* Gap 4 / T6: discovery roots that could not be read, as failed entries */}
              {failedRoots.length > 0 && (
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
            </>
          )}
        </div>
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
  benches,
  statusOf,
  onPick,
  onShowAll,
  status,
  blocker,
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
  benches: BenchSummary[];
  statusOf: (bench: BenchSummary) => BenchStatus;
  onPick: (bench: BenchSummary) => void;
  onShowAll: () => void;
  status: BenchStatus;
  /** Path of the bench that blocks Start for this one, or null. */
  blocker: string | null;
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
  const canStart = status === "stopped" || status === "failed";
  // Nothing streams for a bench that is not running: collapse the empty log.
  const logCollapsed = logLines.length === 0 && (status === "stopped" || status === "failed");
  return (
    <>
      {/* Header: switcher, path, primary Start/Stop */}
      <header className="wb-island-hd">
        <BenchSwitcher current={bench} benches={benches} statusOf={statusOf} onPick={onPick} onShowAll={onShowAll} />
        <span className="wb-path wb-truncate" title={bench.path}>{bench.path}</span>
        {canStart && blocker && <span className="wb-muted wb-cue">{startBlockedCue(blocker)}</span>}
        {canStart ? (
          <button
            type="button"
            className="wb-btn wb-btn-solid"
            onClick={onStart}
            disabled={blocker !== null}
            title={blocker ? startBlockedCue(blocker) : undefined}
          >
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
      </header>

      {/* Top of the console split: sites, processes, one-shot commands */}
      <div className="wb-detail-body">
        <div className="wb-panels">
          <SiteList sites={bench.sites} />
          <ProcessPanel
            status={status}
            blocker={blocker}
            onStart={onStart}
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
            const vs = oneshotState.get(oneshotKey(bench.path, verb));
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
      {logCollapsed ? (
        <div className="wb-log-collapsed">
          <span className="wb-log-title">Log</span>
          <span className="wb-muted">Starts when the bench starts</span>
        </div>
      ) : (
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
      )}
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
  blocker,
  onStart,
  elapsedLabel,
  startFailure,
  warnings,
}: {
  status: BenchStatus;
  /** Path of the bench that blocks Retry, or null. */
  blocker: string | null;
  onStart: () => void;
  elapsedLabel: string;
  startFailure: StartFailureState | null;
  warnings: string[];
}) {
  return (
    <div className="wb-panel">
      <div className="wb-sec-lbl">Processes</div>
      {/* Gap 3 / T6: status + elapsed (Start/Stop live in the header) */}
      <div className="wb-status-line">
        <StatusBadge status={status} />
        {elapsedLabel && <span className="wb-muted">{elapsedLabel}</span>}
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
            <button
              type="button"
              className="wb-btn wb-btn-solid wb-btn-sm"
              onClick={onStart}
              disabled={blocker !== null}
              title={blocker ? startBlockedCue(blocker) : undefined}
            >
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

