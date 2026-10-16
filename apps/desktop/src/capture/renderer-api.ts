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
import type { AppSettings, NavLayout } from "@pi-desktop/shared";
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
