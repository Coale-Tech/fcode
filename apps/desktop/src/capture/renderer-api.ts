/**
 * `window.__PI_DESKTOP__`: the tiny renderer automation surface used by the
 * capture suite (electron/main) and the e2e plan runner (scripts/e2e-plan-ui).
 *
 * Only the navigation/toast shims are installed unconditionally. The
 * screenshot fixtures (seed* methods, `api.*` monkey-patches) live in
 * `capture-rig.ts` and are `import()`ed the first time one of them is called
 * with `window.__PI_CAPTURE__` set, so production bundles never evaluate them.
 * Once the rig has loaded, its methods replace the lazy stubs on the same
 * object, so later capture calls stay synchronous as before.
 */
import { useAppStore, type AppState, type ToastOptions } from "../stores/app-store";
import type { AppSettings, CommandItem, NavLayout, SessionSummary } from "@pi-desktop/shared";
import type { CaptureRig, CaptureRigMethods } from "./capture-rig";

type CaptureRigMethod = keyof CaptureRigMethods;

/** Lazy stubs: resolve with the rig method's result once the rig has loaded. */
type CaptureRigStubs = {
  [K in CaptureRigMethod]: (
    ...args: Parameters<CaptureRigMethods[K]>
  ) => Promise<Awaited<ReturnType<CaptureRigMethods[K]>> | undefined>;
};

export type RendererApi = {
  setPage: (page: AppState["page"]) => void;
  refreshProviders: () => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  setSettingsTab: (tab: AppState["settingsTab"]) => void;
  setThemeAttr: (theme: "light" | "dark") => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setNavLayout: (layout: NavLayout) => void;
  setFontFamily: (family: string) => void;
  setKanbanRaven: (enabled: boolean) => void;
  getSettings: () => AppSettings | null;
  clearProject: () => Promise<void>;
  clearOpenProjects: () => void;
  showToast: (message: string, opts?: ToastOptions) => void;
  enableFeatureFlags: (flags: { kanban?: boolean; raven?: boolean }) => void;
  /** Synchronously seed visual state (sessions + chat page) — call after persistence hydrates. */
  seedVisualState: () => void;
  /** Seed only header cluster (bench chip, initials) without sessions — for onboarding shots. */
  seedHeaderCluster: () => void;
} & (CaptureRigStubs | CaptureRigMethods);

/** Shape accepted by seedBenchStatus and read by useBenchContext. */
export type BenchStatusOverride = { status: string; benchPath: string | null; site: string | null; siteCount?: number; startedAtMs?: number } | null;

declare global {
  interface Window {
    __PI_DESKTOP__?: RendererApi;
    /** Set by the capture suite before it calls any fixture method. */
    __PI_CAPTURE__?: unknown;
    /** Overrides live IPC bench-status polling for capture screenshots. */
    __PI_BENCH_OVERRIDE__?: BenchStatusOverride;
    /** Capture-only: file entries seeded for the command-palette FILES section. */
    __PI_PALETTE_FILES__?: Array<{ path: string; appRoot: string }>;
    /** Capture-only: bench entries seeded for the command-palette BENCHES section. */
    __PI_PALETTE_BENCHES__?: Array<{ id: string; path: string; status: "running" | "stopped" }>;
    /** Capture-only: command entries for the command-palette COMMANDS section. */
    __PI_PALETTE_COMMANDS__?: CommandItem[];
    /** Capture-only: session entries seeded for the command-palette SESSIONS section. */
    __PI_PALETTE_SESSIONS__?: Array<{ id: string; title: string; updatedAt: string }>;
    /** Capture-only seeded bench list; BenchPage.loadBenches reads this instead of IPC. */
    __PI_CAPTURE_BENCH_LIST__?: {
      benches: Array<{ id: string; path: string; version: number | "unknown"; sites: Array<{ name: string; isDefault: boolean }>; apps: string[] }>;
      failedRoots: Array<{ root: string; reason: string }>;
      roots: string[];
    };
    /** Capture-only bench tab IDs to pre-open (coale_v16, dev_bench). */
    __PI_CAPTURE_BENCH_OPEN_IDS__?: string[];
    /** Capture-only bench detail (apps + versions, Procfile workers, port, pids) read via fetchBenchDetail. */
    __PI_CAPTURE_BENCH_DETAIL__?: {
      apps: Array<{ name: string; version: string }>;
      procfileEntries: string[];
      port: number | null;
      mainPid: number | null;
      workerPids: Record<string, number | null>;
    };
    /** Capture-only bench log lines (honcho format) for the bench detail log terminal. */
    __PI_CAPTURE_BENCH_LOGS__?: Array<{ ts: number; text: string }>;
    /** Capture-only finished one-shot command shown under the bench command grid. */
    __PI_CAPTURE_BENCH_ONESHOT__?: { verb: string; output: string; elapsed: string };
    /** Capture-only Studio watcher state for the Build status strip. */
    __PI_CAPTURE_BUILD_WATCHER__?: { lastImport: string };
    /** Capture-only DocType scan result for the bench detail DocTypes tree. */
    __PI_CAPTURE_DOCTYPES__?: Array<{ path: string; app: string; module: string; name: string; dirty: boolean }>;
    /** When set, RavenPage marks itself connected on mount (CDP can't capture WebContentsView). */
    __PI_CAPTURE_RAVEN_CONNECTED__?: boolean;
    /** When set, FileBirdPage skips fileBirdSetVisible IPC call (avoids failed=true). */
    __PI_CAPTURE_FILEBIRD_VISIBLE__?: boolean;
    /** Capture-only: pre-select this PR number when PullRequestsPage loads. */
    __PI_CAPTURE_PR_SELECTED__?: number;
  }
}

const CAPTURE_RIG_METHODS = [
  "openWorkPanelArtifact",
  "collapseWorkPanel",
  "openWorkPanel",
  "openNewWorkPanelTab",
  "setWorkPanelWidth",
  "seedTranscript",
  "seedReviewChanges",
  "seedRunRows",
  "seedDelegationRows",
  "seedPlugins",
  "seedExtensions",
  "seedPluginThemes",
  "seedNotifications",
  "seedKanbanBoard",
  "seedScheduledTasks",
  "seedPullRequests",
  "seedSidebarStatuses",
  "seedOmpSettings",
  "ensureVisualFixtures",
  "seedBenchStatus",
  "seedApprovalCard",
  "clearPendingPermissions",
  "seedEmptyHome",
  "seedOnboardingChecklist",
  "seedCommandPaletteExtras",
  "seedBenchList",
  "seedRavenConnected",
  "seedFileBirdConnected",
  "seedLargePasteThreshold",
  "clearPinnedSessions",
] as const satisfies readonly CaptureRigMethod[];

export function installRendererApi(): () => void {
  let rigLoad: Promise<CaptureRig> | null = null;
  let rig: CaptureRig | null = null;
  let disposed = false;

  const loadRig = (): Promise<CaptureRig> => {
    rigLoad ??= import("./capture-rig").then((module) => {
      const installed = module.installCaptureRig();
      if (disposed) {
        installed.dispose();
        return installed;
      }
      rig = installed;
      if (window.__PI_DESKTOP__ === surface) {
        for (const name of CAPTURE_RIG_METHODS) {
          (surface as Record<string, unknown>)[name] = installed[name];
        }
      }
      return installed;
    });
    return rigLoad;
  };

  const stubs = Object.fromEntries(
    CAPTURE_RIG_METHODS.map((name) => [
      name,
      async (...args: unknown[]) => {
        if (!window.__PI_CAPTURE__) return undefined;
        const loaded = await loadRig();
        const method = loaded[name] as (...params: unknown[]) => unknown;
        return method(...args);
      },
    ]),
  ) as CaptureRigStubs;

  const surface: RendererApi = {
    setPage: (page) => useAppStore.getState().setPage(page),
    refreshProviders: () => useAppStore.getState().refreshProviders(),
    selectSession: (id) => useAppStore.getState().selectSession(id),
    setSettingsTab: (tab) => useAppStore.getState().setSettingsTab(tab),
    setThemeAttr: (theme) => {
      // Sync both DOM attribute and store so Settings page shows correct value.
      document.documentElement.dataset.theme = theme;
      const s = useAppStore.getState().settings;
      // Work even when settings is null/undefined (fresh app, no bench/provider).
      const base = s ?? ({ theme: "system", defaultMode: "plan", enterToSend: true, onboardingDismissed: false } as unknown as NonNullable<typeof s>);
      useAppStore.setState({ settings: { ...base, theme } });
    },
    setTheme: (theme) => {
      const s = useAppStore.getState().settings;
      const base = s ?? ({ theme, defaultMode: "plan", enterToSend: true, onboardingDismissed: false } as unknown as NonNullable<typeof s>);
      useAppStore.setState({ settings: { ...base, theme } });
      if (theme !== "system") document.documentElement.dataset.theme = theme;
    },
    setNavLayout: (layout) => {
      // C02: update the settings store so useAppShellRuntime reads the correct
      // navLayoutRef for column budget (not just the dataset attribute).
      const s = useAppStore.getState().settings;
      const base = s ?? ({ theme: "system", defaultMode: "plan", enterToSend: true, onboardingDismissed: false } as unknown as NonNullable<typeof s>);
      useAppStore.setState({ settings: { ...base, navLayout: layout } });
      document.documentElement.dataset.navLayout = layout;
    },
    setKanbanRaven: (enabled) => {
      useAppStore.setState({ kanbanEnabled: enabled, ravenEnabled: enabled });
    },
    clearProject: () => useAppStore.getState().clearProject(),
    clearOpenProjects: () => useAppStore.setState({ openProjectPaths: [] }),
    getSettings: () => useAppStore.getState().settings ?? null,
    /** Synchronously enable feature flags so nav rail shows Kanban/Raven in capture. */
    enableFeatureFlags: (flags: { kanban?: boolean; raven?: boolean }) => {
      useAppStore.setState({
        ...(flags.kanban !== undefined && { kanbanEnabled: flags.kanban }),
        ...(flags.raven !== undefined && { ravenEnabled: flags.raven }),
      });
    },
    /** Synchronously seed chat visual state (sessions, transcript, page).
     *  Call this AFTER persistence has hydrated (i.e. 2 s+ after app start).
     *  Unlike ensureVisualFixtures this is a direct sync call — no dynamic import needed. */
    seedVisualState: () => {
      const now = Date.now();
      const M = 60_000, H = 3_600_000, D = 86_400_000;
      // Anchor TODAY sessions to the start of the current calendar day so the
      // groupSidebarSessionsByTime calendar-day boundary is always respected,
      // regardless of what time the screenshot is taken.
      const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
      const S = startOfToday.getTime();
      const mk = (id: string, title: string, ts: number) => ({
        id, title, source: "desktop" as const, modelId: "claude-sonnet-5",
        mode: "plan" as const, thinkingLevel: "off" as const, permissionMode: "ask" as const,
        messageCount: 0,
        updatedAt: new Date(ts).toISOString(),
        createdAt: new Date(ts).toISOString(),
        pinned: false, archived: false,
      });
      // 12 reference sessions matching pages-d reference design (variant-D1/D2/D3).
      // TODAY: s1 (2m), s2 (47m), s3 (2h) — all well within today calendar day.
      // YESTERDAY: s4 (anchor=S-12H), s5 (S-14H), s6 (S-16H) — always yesterday.
      // THIS WEEK: s7-s12 anchored at S - 2D..5D so they never fall into "older14d".
      // NOTE: no pinnedSessions array — avoid PINNED section in sidebar (ref has none).
      const sessions = [
        mk("fixture-s1",  "Sync ERPNext code module",           now - 2 * M),
        mk("fixture-s2",  "Redesign settings plugin section",   now - 47 * M),
        mk("fixture-s3",  "Fix duplicate bench start bug",      now - 2 * H),
        mk("fixture-s4",  "Migrate Raven to frappe-ui v2",      S - 12 * H),
        mk("fixture-s5",  "Review PR #224 leave approvals",     S - 14 * H),
        mk("fixture-s6",  "ERPNext payroll period config",      S - 16 * H),
        mk("fixture-s7",  "Set up coale_v16 from scratch",      S - 2 * D),
        mk("fixture-s8",  "Debug slow stock valuation query",   S - 3 * D),
        mk("fixture-s9",  "Frappe UI modal refactor",           S - 4 * D),
        mk("fixture-s10", "Refactor payment_entry hooks",       S - 4 * D + 8 * H),
        mk("fixture-s11", "Install hrms on coale_staging",      S - 5 * D),
        mk("fixture-s12", "Debug bench worker crash",           S - 5 * D + 8 * H),
      ] as unknown as SessionSummary[];
      useAppStore.setState({
        sessions: [...sessions],
        activeSessionId: "fixture-s1",
        retainedSessionIds: ["fixture-s1"],
        retainedTranscripts: { "fixture-s1": [] },
        messages: [],
        runningSessions: { "fixture-s1": true },
        page: "chat",
        chatUserName: "Josh Kim",
        userInitials: "JK",
        kanbanEnabled: true,
        ravenEnabled: true,
        onboarding: undefined,
        openProjectPaths: [],
        workspace: null,
        // Prevent SearchDialog's open-effect refreshSessions() IPC from clearing
        // the seeded sessions. Pattern from seedNotifications' refreshNotifications patch.
        refreshSessions: async () => undefined,
      });
    },
    /** Seed only header cluster (bench chip, initials) without sessions.
     *  Used for first-run onboarding shots: sessions panel shows empty state. */
    seedHeaderCluster: () => {
      const s = useAppStore.getState().settings;
      const base = s ?? ({ theme: "system", defaultMode: "plan", enterToSend: true, onboardingDismissed: false } as unknown as NonNullable<typeof s>);
      useAppStore.setState({
        chatUserName: "Josh Kim",
        userInitials: "JK",
        kanbanEnabled: true,
        ravenEnabled: true,
        onboarding: undefined,
        activeSessionId: undefined,
        sessions: [],
        retainedSessionIds: [],
        retainedTranscripts: {},
        messages: [],
        runningSessions: {},
        workspace: undefined,
        refreshSessions: async () => undefined,
        settings: { ...base, defaultModelId: "claude-sonnet-5" },
      });
    },
    showToast: (message, opts) => useAppStore.getState().showToast(message, opts),
    setFontFamily: (family) => {
      const s = useAppStore.getState().settings;
      const base = s ?? ({ theme: "system", defaultMode: "plan", enterToSend: true, onboardingDismissed: false } as unknown as NonNullable<typeof s>);
      useAppStore.setState({ settings: { ...base, fontFamily: family } });
    },
    ...stubs,
  };
  window.__PI_DESKTOP__ = surface;

  return () => {
    disposed = true;
    rig?.dispose();
    rig = null;
    if (window.__PI_DESKTOP__ === surface) delete window.__PI_DESKTOP__;
  };
}
