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
import type { AppSettings, NavLayout, SessionSummary } from "@pi-desktop/shared";
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
} & (CaptureRigStubs | CaptureRigMethods);

/** Shape accepted by seedBenchStatus and read by useBenchContext. */
export type BenchStatusOverride = { status: string; benchPath: string | null; site: string | null; siteCount?: number } | null;

declare global {
  interface Window {
    __PI_DESKTOP__?: RendererApi;
    /** Set by the capture suite before it calls any fixture method. */
    __PI_CAPTURE__?: unknown;
    /** Overrides live IPC bench-status polling for capture screenshots. */
    __PI_BENCH_OVERRIDE__?: BenchStatusOverride;
    /** Capture-only seeded bench list; BenchPage.loadBenches reads this instead of IPC. */
    __PI_CAPTURE_BENCH_LIST__?: {
      benches: Array<{ id: string; path: string; version: number | "unknown"; sites: Array<{ name: string; isDefault: boolean }>; apps: string[] }>;
      failedRoots: Array<{ root: string; reason: string }>;
      roots: string[];
    };
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
      const H = 3_600_000;
      const D = 86_400_000;
      const mk = (id: string, title: string, ageMs: number) => ({
        id, title, source: "desktop" as const, modelId: "claude-sonnet-5",
        mode: "plan" as const, thinkingLevel: "off" as const, permissionMode: "ask" as const,
        messageCount: 0,
        updatedAt: new Date(now - ageMs).toISOString(),
        createdAt: new Date(now - ageMs).toISOString(),
        pinned: false, archived: false,
      });
      const sessions = [
        mk("fixture-s1",  "Sync ERPNext code module",           2 * 60_000),
        mk("fixture-s2",  "Redesign settings plugin section",   47 * 60_000),
        mk("fixture-s3",  "Fix duplicate bench start bug",      2 * H),
        mk("fixture-s4",  "Migrate Raven to frappe-ui v2",      25 * H),
        mk("fixture-s5",  "Review PR #224 leave approvals",     26 * H),
        mk("fixture-s6",  "ERPNext payroll period config",      27 * H),
        mk("fixture-s7",  "Set up coale_v16 from scratch",      3 * D),
        mk("fixture-s8",  "Debug slow stock valuation query",   4 * D),
        mk("fixture-s9",  "Frappe UI modal refactor",           5 * D),
        mk("fixture-s10", "Refactor payment_entry hooks",       6 * D),
        mk("fixture-s11", "Install hrms on coale_staging",      6.5 * D),
        mk("fixture-s12", "Debug bench worker crash",           7 * D),
      ] as unknown as SessionSummary[];
      useAppStore.setState({
        sessions,
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
