export const PROTOCOL_VERSION = 11 as const;
export const SCHEMA_VERSION = 16 as const;
export const APP_ID = "com.coaletech.fcode";
export const APP_NAME = "Fcode";
export const APP_VERSION = "0.18.4-rc.2";

export const APP_MENU_COMMANDS = [
  "newTask",
  "openProject",
  "openSettings",
  "openSearch",
  "openCommandPalette",
  "toggleSidebar",
  "openHelp",
  "openLogs",
  "checkForUpdates",
] as const;

export type AppMenuCommand = (typeof APP_MENU_COMMANDS)[number];

export const NATIVE_MENU_ACTIONS = [
  "undo",
  "redo",
  "cut",
  "copy",
  "paste",
  "selectAll",
  "reload",
  "zoomIn",
  "zoomOut",
  "resetZoom",
  "toggleFullScreen",
  "minimize",
  "toggleMaximize",
  "close",
  "restoreMainWindow",
  "toggleMainWindow",
] as const;

export type NativeMenuAction = (typeof NATIVE_MENU_ACTIONS)[number];

export const WINDOW_CONTROL_ACTIONS = [
  "getState",
  "minimize",
  "toggleMaximize",
  "close",
] as const;

export type WindowControlAction = (typeof WINDOW_CONTROL_ACTIONS)[number];

export const IPC = {
  invoke: {
    appGetVersion: "pi-desktop/app/getVersion",
    appOpenFeedback: "pi-desktop/app/openFeedback",
    appHealth: "pi-desktop/app/health",
    appGetOnboarding: "pi-desktop/app/getOnboarding",
    appDismissOnboarding: "pi-desktop/app/dismissOnboarding",
    /**
     * Quit the whole application through the ordered shutdown. Exposed for the
     * surfaces that own the window while the shell has no data yet — a stuck
     * startup must always be able to exit the app (issue #831).
     */
    appQuit: "pi-desktop/app/quit",
    /** Installed system font families, resolved by Electron main. */
    systemFontsList: "pi-desktop/app/systemFonts",
    updatesGetState: "pi-desktop/updates/getState",
    updatesCheck: "pi-desktop/updates/check",
    updatesDownload: "pi-desktop/updates/download",
    updatesInstall: "pi-desktop/updates/install",
    updatesOpenReleases: "pi-desktop/updates/openReleases",
    notificationList: "pi-desktop/notification/list",
    notificationMarkRead: "pi-desktop/notification/markRead",
    notificationMarkAllRead: "pi-desktop/notification/markAllRead",
    notificationClear: "pi-desktop/notification/clear",
    notificationShowNative: "pi-desktop/notification/showNative",
    notificationSetViewingSession: "pi-desktop/notification/setViewingSession",
    agentPrompt: "pi-desktop/agent/prompt",
    agentSteer: "pi-desktop/agent/steer",
    promptEnhance: "pi-desktop/prompt/enhance",
    speechTranscribe: "pi-desktop/speech/transcribe",
    speechSynthesize: "pi-desktop/speech/synthesize",
    speechGetStatus: "pi-desktop/speech/getStatus",
    voiceStart: "pi-desktop/voice/start",
    voiceStop: "pi-desktop/voice/stop",
    voiceCancel: "pi-desktop/voice/cancel",
    voiceGetState: "pi-desktop/voice/getState",
    voiceGetDevices: "pi-desktop/voice/getDevices",
    voiceGetModels: "pi-desktop/voice/getModels",
    voiceDownloadModel: "pi-desktop/voice/downloadModel",
    voiceDeleteModel: "pi-desktop/voice/deleteModel",
    voiceUpdateSettings: "pi-desktop/voice/updateSettings",
    voiceCheckPermission: "pi-desktop/voice/checkPermission",
    voiceRequestPermission: "pi-desktop/voice/requestPermission",
    agentCompact: "pi-desktop/agent/compact",
    agentAbort: "pi-desktop/agent/abort",
    agentStop: "pi-desktop/agent/stop",
    agentQueuePush: "pi-desktop/agent/queue/push",
    agentQueueList: "pi-desktop/agent/queue/list",
    agentQueueRemove: "pi-desktop/agent/queue/remove",
    agentQueuePrioritize: "pi-desktop/agent/queue/prioritize",
    agentQueueReorder: "pi-desktop/agent/queue/reorder",
    agentGetStatus: "pi-desktop/agent/getStatus",
    agentInstructionsGet: "pi-desktop/agent/instructions/get",
    agentInstructionsSave: "pi-desktop/agent/instructions/save",
    sessionList: "pi-desktop/session/list",
    sessionCreate: "pi-desktop/session/create",
    sessionFork: "pi-desktop/session/fork",
    sessionMoveProject: "pi-desktop/session/moveProject",
    sessionSearch: "pi-desktop/session/search",
    sessionSearchContext: "pi-desktop/session/searchContext",
    sessionGet: "pi-desktop/session/get",
    sessionCollaboration: "pi-desktop/session/collaboration",
    /** Validate and select a durable session from a reviewed host operation. */
    sessionOpen: "pi-desktop/session/open",
    sessionDelete: "pi-desktop/session/delete",
    sessionRename: "pi-desktop/session/rename",
    sessionSummarizeTitle: "pi-desktop/session/summarizeTitle",
    sessionConfigure: "pi-desktop/session/configure",
    sessionImportScan: "pi-desktop/session/importScan",
    sessionImportRun: "pi-desktop/session/importRun",
    modelConfigImportScan: "pi-desktop/modelConfig/importScan",
    modelConfigImportRun: "pi-desktop/modelConfig/importRun",
    sessionReplaceMessages: "pi-desktop/session/replaceMessages",
    sessionSaveRevision: "pi-desktop/session/saveRevision",
    sessionListRevisions: "pi-desktop/session/listRevisions",
    sessionActivateRevision: "pi-desktop/session/activateRevision",
    sessionGetScratchPath: "pi-desktop/session/getScratchPath",
    sessionOpenScratchPath: "pi-desktop/session/openScratchPath",
    projectOpenFolder: "pi-desktop/project/openFolder",
    settingsGet: "pi-desktop/settings/get",
    settingsSet: "pi-desktop/settings/set",
    configSyncGetState: "pi-desktop/configSync/getState",
    configSyncConfigure: "pi-desktop/configSync/configure",
    configSyncTest: "pi-desktop/configSync/test",
    configSyncSyncNow: "pi-desktop/configSync/syncNow",
    configSyncPause: "pi-desktop/configSync/pause",
    configSyncUnlock: "pi-desktop/configSync/unlock",
    configSyncApprove: "pi-desktop/configSync/approve",
    configSyncReject: "pi-desktop/configSync/reject",
    configSyncMapProject: "pi-desktop/configSync/mapProject",
    configSyncListHistory: "pi-desktop/configSync/listHistory",
    configSyncRestore: "pi-desktop/configSync/restore",
    configSyncChangePassword: "pi-desktop/configSync/changePassword",
    configSyncDisconnect: "pi-desktop/configSync/disconnect",
    networkProxyTest: "pi-desktop/network/testProxy",
    commandShellList: "pi-desktop/commandShell/list",
    secretsSet: "pi-desktop/secrets/set",
    secretsDelete: "pi-desktop/secrets/delete",
    secretsHas: "pi-desktop/secrets/has",
    projectOpen: "pi-desktop/project/open",
    projectPickFolders: "pi-desktop/project/pickFolders",
    projectMemoryGet: "pi-desktop/project/memory/get",
    projectMemorySave: "pi-desktop/project/memory/save",
    projectGroupList: "pi-desktop/project-group/list",
    projectGroupCreate: "pi-desktop/project-group/create",
    projectGroupRename: "pi-desktop/project-group/rename",
    projectGroupUpdate: "pi-desktop/project-group/update",
    projectGroupMemoryGet: "pi-desktop/project-group/memory/get",
    projectGroupMemorySave: "pi-desktop/project-group/memory/save",
    projectGroupInstructionsGet: "pi-desktop/project-group/instructions/get",
    projectGroupInstructionsSave: "pi-desktop/project-group/instructions/save",
    projectClone: "pi-desktop/project/clone",
    projectCloneCheckout: "pi-desktop/project/cloneCheckout",
    projectGet: "pi-desktop/project/get",
    projectList: "pi-desktop/project/list",
    projectSet: "pi-desktop/project/set",
    projectClear: "pi-desktop/project/clear",
    projectRemove: "pi-desktop/project/remove",
    pullsList: "pi-desktop/pulls/list",
    /** Local branch names of the current workspace's repo (read-only `git branch`). */
    gitBranchList: "pi-desktop/git/branchList",
    scheduledList: "pi-desktop/scheduled/list",
    scheduledCreate: "pi-desktop/scheduled/create",
    scheduledUpdate: "pi-desktop/scheduled/update",
    scheduledDelete: "pi-desktop/scheduled/delete",
    scheduledRun: "pi-desktop/scheduled/run",
    scheduledExecute: "pi-desktop/scheduled/execute",
    scheduledListRuns: "pi-desktop/scheduled/listRuns",
    scheduledExport: "pi-desktop/scheduled/export",
    scheduledImport: "pi-desktop/scheduled/import",
    toolResolvePermission: "pi-desktop/tool/resolvePermission",
    askToolResolve: "pi-desktop/agent/askTool/resolve",
    plansPending: "pi-desktop/plans/pending",
    plansResolve: "pi-desktop/plans/resolve",
    /**
     * List every paired remote `pi-host` this desktop knows, redacted so no
     * device token reaches the renderer. See ADR 0286 (R2b pairing UX).
     */
    remoteHostList: "pi-desktop/remoteHost/list",
    /**
     * Pair with a `pi-host` at `url` using a single-use `pairingToken`, mint
     * a device token, persist it encrypted, and open the live connection.
     */
    remoteHostPair: "pi-desktop/remoteHost/pair",
    /** Close the live connection for `hostKey` and drop its persisted record. */
    remoteHostRemove: "pi-desktop/remoteHost/remove",
    /**
     * Install and pair a `pi-host` on a machine the user reaches over SSH:
     * upload the bootstrap script, download and verify the published bundle
     * there, start the host, forward its loopback port, and exchange the
     * pairing token (spec §5.2). Uses the user's own SSH keys; no credential
     * crosses this channel.
     */
    remoteHostBootstrap: "pi-desktop/remoteHost/bootstrap",
    providersList: "pi-desktop/providers/list",
    providersReorder: "pi-desktop/providers/reorder",
    providersCreate: "pi-desktop/providers/create",
    providersUpdate: "pi-desktop/providers/update",
    providersDelete: "pi-desktop/providers/delete",
    /**
     * Set or clear one provider's API key. Separate from `providersUpdate`
     * because a plugin-declared row refuses a generic update while still
     * needing the credential its declaration asks for.
     */
    providersSetSecret: "pi-desktop/providers/setSecret",
    providersTest: "pi-desktop/providers/testConnection",
    providersListModels: "pi-desktop/providers/listModels",
    /**
     * Look one model id up in the local models.dev snapshot.
     *
     * `providersListModels` cannot answer this: it describes a saved or
     * reached provider's catalogue, and a hand-typed custom id exists nowhere
     * yet when the settings picker needs its published limits. This is a
     * snapshot read — no provider network access and no host call — so the
     * picker can seed a custom row without probing an endpoint that does not
     * know the id.
     */
    providersLookupModel: "pi-desktop/providers/lookupModel",
    providersRefreshModelCatalog: "pi-desktop/providers/refreshModelCatalog",
    providersModelCatalogStatus: "pi-desktop/providers/modelCatalogStatus",
    providersOauthVendors: "pi-desktop/providers/oauth/vendors",
    providersOauthStart: "pi-desktop/providers/oauth/start",
    providersOauthRespond: "pi-desktop/providers/oauth/respond",
    providersOauthCancel: "pi-desktop/providers/oauth/cancel",
    providersOauthDelete: "pi-desktop/providers/oauth/delete",
    pluginList: "pi-desktop/plugin/list",
    /** Plugin-contributed agent extensions (D387/D388, ADR 0214). */
    pluginImportExtension: "pi-desktop/plugin/importExtension",
    extensionsCommandRun: "pi-desktop/extensions/commands/run",
    extensionsUiRespond: "pi-desktop/extensions/ui/respond",
    pluginLoadDev: "pi-desktop/plugin/loadDev",
    /**
     * The answer to a development plugin's permission review. Loading a folder
     * is a two-step: `pluginLoadDev` returns the declaration, and this commits
     * the permissions the user accepted.
     */
    pluginLoadDevConfirm: "pi-desktop/plugin/loadDevConfirm",
    pluginReload: "pi-desktop/plugin/reload",
    /** Commits a reviewed widening for an already-loaded development plugin. */
    pluginReloadConfirm: "pi-desktop/plugin/reloadConfirm",
    pluginCreateFromTemplate: "pi-desktop/plugin/createFromTemplate",
    pluginInstallFromPath: "pi-desktop/plugin/installFromPath",
    pluginInstallFromPackage: "pi-desktop/plugin/installFromPackage",
    pluginEnable: "pi-desktop/plugin/enable",
    pluginDisable: "pi-desktop/plugin/disable",
    pluginSetScope: "pi-desktop/plugin/setScope",
    pluginUninstall: "pi-desktop/plugin/uninstall",
    pluginSetAutoUpdate: "pi-desktop/plugin/setAutoUpdate",
    pluginSettingsGet: "pi-desktop/plugin/settings/get",
    pluginSettingsSet: "pi-desktop/plugin/settings/set",
    pluginOpenPanel: "pi-desktop/plugin/openPanel",
    pluginLauncherToggle: "pi-desktop/pluginLauncher/toggle",
    pluginLauncherDismiss: "pi-desktop/pluginLauncher/dismiss",
    pluginThemes: "pi-desktop/plugin/themes",
    pluginScenicThemesDestinations: "pi-desktop/plugin/scenicThemes/destinations",
    pluginScenicThemesSetBlur: "pi-desktop/plugin/scenicThemes/setBlur",
    pluginServices: "pi-desktop/plugin/services",
    pluginViews: "pi-desktop/plugin/views",
    pluginViewOpen: "pi-desktop/plugin/view/open",
    pluginViewClose: "pi-desktop/plugin/view/close",
    pluginViewSetBounds: "pi-desktop/plugin/view/setBounds",
    pluginViewSetVisible: "pi-desktop/plugin/view/setVisible",
    mcpList: "pi-desktop/mcp/list",
    mcpUpsert: "pi-desktop/mcp/upsert",
    mcpRemove: "pi-desktop/mcp/remove",
    mcpSetEnabled: "pi-desktop/mcp/setEnabled",
    mcpSetScope: "pi-desktop/mcp/setScope",
    mcpTransfer: "pi-desktop/mcp/transfer",
    mcpTest: "pi-desktop/mcp/test",
    mcpOauthStart: "pi-desktop/mcp/oauth/start",
    mcpOauthCancel: "pi-desktop/mcp/oauth/cancel",
    mcpImport: "pi-desktop/mcp/import",
    mcpImportScan: "pi-desktop/mcp/importScan",
    mcpImportRun: "pi-desktop/mcp/importRun",
    mcpMarketSearch: "pi-desktop/mcp/market/search",
    skillList: "pi-desktop/skill/list",
    skillCreate: "pi-desktop/skill/create",
    skillImport: "pi-desktop/skill/import",
    skillImportScan: "pi-desktop/skill/importScan",
    skillImportRun: "pi-desktop/skill/importRun",
    skillMarketSearch: "pi-desktop/skill/market/search",
    skillMarketFetch: "pi-desktop/skill/market/fetch",
    skillUpdate: "pi-desktop/skill/update",
    skillRemove: "pi-desktop/skill/remove",
    skillSetEnabled: "pi-desktop/skill/setEnabled",
    skillSetScope: "pi-desktop/skill/setScope",
    skillTransfer: "pi-desktop/skill/transfer",
    skillRead: "pi-desktop/skill/read",
    skillReveal: "pi-desktop/skill/reveal",
    subagentList: "pi-desktop/subagent/list",
    subagentCatalog: "pi-desktop/subagent/catalog",
    subagentCreate: "pi-desktop/subagent/create",
    subagentUpdate: "pi-desktop/subagent/update",
    subagentRead: "pi-desktop/subagent/read",
    subagentRemove: "pi-desktop/subagent/remove",
    subagentSetEnabled: "pi-desktop/subagent/setEnabled",
    subagentSetScope: "pi-desktop/subagent/setScope",
    subagentSetBuiltinEnabled: "pi-desktop/subagent/setBuiltinEnabled",
    subagentReveal: "pi-desktop/subagent/reveal",
    marketRefresh: "pi-desktop/market/refresh",
    marketSearch: "pi-desktop/market/search",
    marketGetDetail: "pi-desktop/market/getDetail",
    marketInstall: "pi-desktop/market/install",
    marketCheckUpdates: "pi-desktop/market/checkUpdates",
    marketApplyUpdates: "pi-desktop/market/applyUpdates",
    marketCancelInstall: "pi-desktop/market/cancelInstall",
    commandPaletteSearch: "pi-desktop/commandPalette/search",
    commandPaletteExecute: "pi-desktop/commandPalette/execute",
    logOpenFolder: "pi-desktop/log/openFolder",
    devtoolsToggle: "pi-desktop/devtools/toggle",
    composerPickFiles: "pi-desktop/composer/pickFiles",
    composerPickPhotos: "pi-desktop/composer/pickPhotos",
    composerImportFiles: "pi-desktop/composer/importFiles",
    composerPasteFiles: "pi-desktop/composer/pasteFiles",
    clipboardRecordPaste: "pi-desktop/clipboard/recordPaste",
    composerCommands: "pi-desktop/composer/commands",
    workspaceDiff: "pi-desktop/workspace/diff",
    workspaceReviewRollback: "pi-desktop/workspace/review/rollback",
    browserNavigate: "pi-desktop/browser/navigate",
    browserAction: "pi-desktop/browser/action",
    browserSetBounds: "pi-desktop/browser/setBounds",
    browserSetVisible: "pi-desktop/browser/setVisible",
    browserOpenExternal: "pi-desktop/browser/openExternal",
    browserGetState: "pi-desktop/browser/getState",
    fsList: "pi-desktop/fs/list",
    fsRead: "pi-desktop/fs/read",
    fsReadImageDataUrl: "pi-desktop/fs/readImageDataUrl",
    statsGetTokenUsageHistory: "pi-desktop/stats/getTokenUsageHistory",
    fsReveal: "pi-desktop/fs/reveal",
    fsOpen: "pi-desktop/fs/open",
    fsIndex: "pi-desktop/fs/index",
    fsResolveRef: "pi-desktop/fs/resolveRef",
    /** Contained write: rejects any path outside the resolved workspace root (E6). */
    fsWrite: "pi-desktop/fs/write",
    windowSetWorkPanelReservation:
      "pi-desktop/window/setWorkPanelReservation",
    windowSetWorkPanelChatWidth: "pi-desktop/window/setWorkPanelChatWidth",
    windowSetBackgroundColor: "pi-desktop/window/setBackgroundColor",
    windowControl: "pi-desktop/window/control",
    closeBehaviorGet: "pi-desktop/window/closeBehavior/get",
    closeBehaviorSet: "pi-desktop/window/closeBehavior/set",
    menuRendererReady: "pi-desktop/menu/rendererReady",
    traySetSessionPreferences: "pi-desktop/tray/setSessionPreferences",
    nativeMenuAction: "pi-desktop/menu/nativeAction",
    /**
     * Ten omp sidecar methods with no prior channel (DX14/X8). Named following
     * the existing pi-desktop/<domain>/<verb> convention, one level deeper for
     * the omp.<resource>.<verb> RPC shape.
     */
    ompModelsList: "pi-desktop/omp/models/list",
    ompModelsSet: "pi-desktop/omp/models/set",
    ompThinkingLevels: "pi-desktop/omp/thinking/levels",
    ompThinkingSet: "pi-desktop/omp/thinking/set",
    ompCommandsList: "pi-desktop/omp/commands/list",
    ompState: "pi-desktop/omp/state",
    ompMemoryStatus: "pi-desktop/omp/memory/status",
    ompAutoCompactionSet: "pi-desktop/omp/auto-compaction/set",
    memoryGetConfig: "pi-desktop/memory/getConfig",
    memorySetConfig: "pi-desktop/memory/setConfig",
    /** List mental-model pages for the active Hindsight bank. */
    hindsightListMentalModels: "pi-desktop/hindsight/mentalModels/list",
    /** Trigger an out-of-band refresh for a single mental-model page. */
    hindsightRefreshMentalModel: "pi-desktop/hindsight/mentalModels/refresh",
    /** Seed the active memory backend with Frappe bench identity facts. */
    benchBootstrapMemory: "pi-desktop/bench/bootstrap/memory",
    /** Write reflect/retain mission text to the active Hindsight bank via PUT. */
    hindsightSetBankMission: "pi-desktop/hindsight/bank/mission",
    ompLoginProviders: "pi-desktop/omp/login/providers",
    ompLoginStart: "pi-desktop/omp/login/start",
    ompSessionBranch: "pi-desktop/omp/session/branch",
    ompSessionRename: "pi-desktop/omp/session/rename",
    /** Tool approval mode (always-ask / write / yolo) persisted host-side. */
    toolApprovalModeGet: "pi-desktop/tool-approval-mode/get",
    toolApprovalModeSet: "pi-desktop/tool-approval-mode/set",
    /** omp settings groups (task/eval/browser/collab) persisted host-side. */
    ompSettingsGet: "pi-desktop/omp-settings/get",
    ompSettingsSet: "pi-desktop/omp-settings/set",
    ompSessionStats: "pi-desktop/omp/session/stats",
    /** List all live subagents in the active omp session. */
    ompSubagentList: "pi-desktop/omp/subagent/list",
    /** Fetch the message history for one subagent by id. */
    ompSubagentMessages: "pi-desktop/omp/subagent/messages",
    /** List omp skillshare packages installed in ~/.omp/agent/ (user-global). */
    ompInstalledSkillsList: "pi-desktop/omp/skills/installed/list",
    /** Historical AI usage stats from omp stats --json (subset of DashboardStats). */
    ompHistoricalStats: "pi-desktop/omp/stats/historical",
    /** List agent-managed git worktrees under ~/.omp/wt/. */
    ompWorktreeList: "pi-desktop/omp/worktrees/list",
    /** Clear a specific agent worktree; refuses dirty tree unless force=true. */
    ompWorktreeClear: "pi-desktop/omp/worktrees/clear",
    /** Prune all orphaned worktrees under ~/.omp/wt/; refuses dirty ones unless force=true. */
    ompWorktreePrune: "pi-desktop/omp/worktrees/prune",
    /** Add a new git worktree under ~/.omp/wt/. */
    ompWorktreeAdd: "pi-desktop/omp/worktrees/add",
    /** Reveal an omp skill store directory in the system file manager. */
    ompSkillReveal: "pi-desktop/omp/skills/reveal",
    /** Queue mode controls (session-scoped RPC; mirrors set_steering/follow_up/interrupt_mode). */
    ompModesSetSteeringMode: "pi-desktop/omp/modes/steering-mode/set",
    ompModesSetFollowUpMode: "pi-desktop/omp/modes/follow-up-mode/set",
    ompModesSetInterruptMode: "pi-desktop/omp/modes/interrupt-mode/set",
    /** Fast-mode toggle (session-scoped RPC; mirrors set_fast_mode). */
    ompFastSet: "pi-desktop/omp/fast/set",
    /** Retry controls (session-scoped RPC; mirrors set_auto_retry / abort_retry). */
    ompRetrySetAutoRetry: "pi-desktop/omp/retry/auto-retry/set",
    ompRetryAbort: "pi-desktop/omp/retry/abort",
    /** Queue while streaming (mirrors follow_up / abort_and_prompt RPC). */
    agentFollowUp: "pi-desktop/agent/follow-up",
    agentAbortAndPrompt: "pi-desktop/agent/abort-and-prompt",
    /** Cycle model / thinking level (mirrors cycle_model / cycle_thinking_level RPC). */
    ompCycleModel: "pi-desktop/omp/models/cycle",
    ompCycleThinkingLevel: "pi-desktop/omp/thinking/cycle",
    /** Bench subsystem (Approach step 6): discovery, supervision, agent access. */
    benchList: "pi-desktop/bench/list",
    benchStart: "pi-desktop/bench/start",
    benchStop: "pi-desktop/bench/stop",
    benchStatus: "pi-desktop/bench/status",
    benchRun: "pi-desktop/bench/run",
    /** Build tab: query installed apps on the active bench/site. */
    buildListApps: "pi-desktop/build/listApps",
    /** Build tab canvas — acquire exclusive ownership of the shared BrowserPane. */
    buildCanvasAcquire: "pi-desktop/build/canvas/acquire",
    /** Build tab canvas — release ownership of the shared BrowserPane. */
    buildCanvasRelease: "pi-desktop/build/canvas/release",
    /** Build tab canvas — navigate to a URL. */
    buildCanvasNavigate: "pi-desktop/build/canvas/navigate",
    /** Build tab canvas — set bounds (window-relative pixels). */
    buildCanvasSetBounds: "pi-desktop/build/canvas/setBounds",
    /** Build tab canvas — show or hide the WebContentsView. */
    buildCanvasSetVisible: "pi-desktop/build/canvas/setVisible",
    /** Build tab canvas — get the current BrowserState. */
    buildCanvasGetState: "pi-desktop/build/canvas/getState",
    /** Build tab canvas — back/forward/reload/stop action. */
    buildCanvasAction: "pi-desktop/build/canvas/action",
    /** Build tab — start the watch-studio watcher for live Studio sync. */
    buildStartWatcher: "pi-desktop/build/watcher/start",
    /** Build tab — stop the watch-studio watcher. */
    buildStopWatcher: "pi-desktop/build/watcher/stop",
    /** Build tab — run the Builder "Sync files → site" one-shot. */
    buildSync: "pi-desktop/build/sync",
    /** Build tab — check whether developer_mode is enabled on a site. */
    buildCheckDeveloperMode: "pi-desktop/build/checkDeveloperMode",
    /** Build tab — check whether the watchdog Python package is installed. */
    buildCheckWatchdog: "pi-desktop/build/checkWatchdog",
    /** Bench tab — scan bench apps for DocType JSON files + git status. */
    gitScanDoctypes: "pi-desktop/git/scanDoctypes",
    /** Managed local Hindsight server: detect available launchers. */
    hindsightLocalDetect: "pi-desktop/hindsight-local/detect",
    /** Managed local Hindsight server: start the supervisor. */
    hindsightLocalStart: "pi-desktop/hindsight-local/start",
    /** Managed local Hindsight server: stop the supervisor. */
    hindsightLocalStop: "pi-desktop/hindsight-local/stop",
    /** Managed local Hindsight server: get current supervisor state. */
    hindsightLocalStatus: "pi-desktop/hindsight-local/status",
    /** Export current omp session transcript as HTML; returns the saved path. */
    ompSessionExportHtml: "pi-desktop/omp/session/exportHtml",
    /** Get the last assistant text from the current omp session. */
    ompSessionLastAssistantText: "pi-desktop/omp/session/lastAssistantText",
    /** Trigger an ai-memory handoff for the current omp session. */
    ompSessionHandoff: "pi-desktop/omp/session/handoff",
    /** Pre-seed the current omp session's todo list. */
    ompSessionSetTodos: "pi-desktop/omp/session/setTodos",
    /** Get the flat history entries for the current omp session. */
    ompSessionEntries: "pi-desktop/omp/session/entries",
    /** Get preview messages for the current branch. */
    ompSessionBranchMessages: "pi-desktop/omp/session/branchMessages",
    /** Trigger /share slash command and return the snapshot URL. */
    ompShare: "pi-desktop/omp/share",
    /** List installed omp extensions (npm + marketplace plugins) via omp plugin list --json. */
    ompExtensionsList: "pi-desktop/omp/extensions/list",
    /** Install an omp extension by npm/git spec via omp plugin install. Validates spec; restarts sidecar. */
    ompExtensionInstall: "pi-desktop/omp/extensions/install",
    /** Uninstall an omp extension by name via omp plugin uninstall. Restarts sidecar. */
    ompExtensionUninstall: "pi-desktop/omp/extensions/uninstall",
    /** Enable or disable an extension by toggling disabledExtensions in omp-settings. Restarts sidecar. */
    ompExtensionSetEnabled: "pi-desktop/omp/extensions/setEnabled",
    /** Run a shell command in omp's session cwd; output emitted as a system transcript block. */
    ompBash: "pi-desktop/omp/bash",
    /** Abort a running bash command started via ompBash. */
    ompAbortBash: "pi-desktop/omp/abort-bash",
    /** Set the omp event filter (null = all events; string[] = allowlist). */
    ompSetEventFilter: "pi-desktop/omp/set-event-filter",
    /** Kanban board: list all tasks, links, comments, runs. */
    kanbanList: "pi-desktop/kanban/list",
    /** Kanban board: create a user card (lands in triage/todo/ready per rules). */
    kanbanCreate: "pi-desktop/kanban/create",
    /** Kanban board: move a card to a different status column (user action). */
    kanbanMove: "pi-desktop/kanban/move",
    /** Kanban board: add a parent→child link. */
    kanbanLink: "pi-desktop/kanban/link",
    /** Kanban board: remove a parent→child link. */
    kanbanUnlink: "pi-desktop/kanban/unlink",
    /** Kanban board: edit a task's title, description or priority. */
    kanbanUpdate: "pi-desktop/kanban/update",
    /** Kanban board: add a comment to a task. */
    kanbanComment: "pi-desktop/kanban/comment",
    /** Kanban board: archive or unarchive a task. */
    kanbanArchive: "pi-desktop/kanban/archive",
    /** Kanban board: list runs for a task. */
    kanbanListRuns: "pi-desktop/kanban/listRuns",
    /** Kanban board: get + set settings (enabled, caps). */
    kanbanSettingsGet: "pi-desktop/kanban/settings/get",
    /** Kanban board: get + set settings. */
    kanbanSettingsSet: "pi-desktop/kanban/settings/set",
    /** Kanban board: pause or resume the dispatcher. */
    kanbanSetPaused: "pi-desktop/kanban/setPaused",
    /** Kanban board: trigger an immediate dispatcher tick. */
    kanbanNudge: "pi-desktop/kanban/nudge",
    /** Read the cross-project user-profile text from ~/.omp/agent/USER.md. */
    ompUserProfileGet: "pi-desktop/omp/user-profile/get",
    /** Write the cross-project user-profile text to ~/.omp/agent/USER.md (cap 1024 chars). */
    ompUserProfileSet: "pi-desktop/omp/user-profile/set",
    /** Raven chat destination: get + set settings (enabled, site URL). */
    ravenSettingsGet: "pi-desktop/raven/settings/get",
    ravenSettingsSet: "pi-desktop/raven/settings/set",
    /** Raven pane: renderer-reported hole rect and visibility (full-width Raven route only). */
    ravenSetBounds: "pi-desktop/raven/setBounds",
    ravenSetVisible: "pi-desktop/raven/setVisible",
    /** FileBird pane: renderer-reported hole rect and visibility (full-width FileBird route only). */
    fileBirdSetBounds: "pi-desktop/filebird/setBounds",
    fileBirdSetVisible: "pi-desktop/filebird/setVisible",
    /**
     * Integrated terminal: FileBird's own terminal channels and handlers
     * (apps/filebird/src/main/ipc/terminal.ipc.ts), which validate every field.
     * Bytes in, `{ id }` out; `terminalAck` reports drawn chars for flow control.
     */
    terminalOpen: "terminal:open",
    terminalWrite: "terminal:write",
    terminalResize: "terminal:resize",
    terminalAck: "terminal:ack",
    terminalClose: "terminal:close",
  },
  event: {
    pluginChanged: "pi-desktop/event/pluginChanged",
    /** Progress of an install or update, while it is still running. */
    pluginInstallProgress: "pi-desktop/plugin/event/installProgress",
    /** Host-originated app settings mutation (e.g. plugin `app.setTheme`). */
    settingsChanged: "pi-desktop/app/event/settingsChanged",
    configSyncChanged: "pi-desktop/configSync/event/changed",
    /** What a running sync is doing, while it is still running. */
    configSyncProgress: "pi-desktop/configSync/event/progress",
    extensionsUiPrompt: "pi-desktop/extensions/event/uiPrompt",
    extensionsStatus: "pi-desktop/extensions/event/status",
    pluginLauncherShown: "pi-desktop/pluginLauncher/event/shown",
    agentMessage: "pi-desktop/agent/event/message",
    agentQueueChanged: "pi-desktop/agent/event/queueChanged",
    hostStatus: "pi-desktop/app/event/hostStatus",
    toast: "pi-desktop/app/event/toast",
    /**
     * The first plaintext hop to an endpoint the user typed, sent once and only
     * until the shell records `networkPolicy.insecureNoticeAcknowledged`. The
     * shell owns the wording, because the address is not a secret and the copy
     * is localized.
     */
    insecureEndpointNotice: "pi-desktop/network/event/insecureEndpointNotice",
    browserState: "pi-desktop/browser/event/state",
    browserPreview: "pi-desktop/browser/event/preview",
    /** Agent tool call took over the shared canvas; owner id, or null when released (E13). */
    browserCanvasOwner: "pi-desktop/browser/event/canvasOwner",
    windowMaximized: "pi-desktop/window/event/maximized",
    windowFullScreen: "pi-desktop/window/event/fullscreen",
    windowWorkPanelResize: "pi-desktop/window/event/workPanelResize",
    menuCommand: "pi-desktop/menu/event/command",
    traySessionActivated: "pi-desktop/tray/event/sessionActivated",
    notificationChanged: "pi-desktop/notification/event/changed",
    sessionsChanged: "pi-desktop/session/event/changed",
    notificationActivated: "pi-desktop/notification/event/activated",
    plansChanged: "pi-desktop/plans/event/changed",
    providersOauth: "pi-desktop/providers/oauth/event",
    mcpOauth: "pi-desktop/mcp/oauth/event",
    updatesState: "pi-desktop/updates/event/state",
    voiceStateChanged: "pi-desktop/voice/event/stateChanged",
    voiceModelProgress: "pi-desktop/voice/event/modelProgress",
    benchLog: "pi-desktop/bench/log",
    /** Emitted when bench start fails (Gap 1 / T6). */
    benchFailure: "pi-desktop/bench/failure",
    /** Emitted on non-fatal port-conflict lines during bench start (Gap 5 / T6). */
    benchWarning: "pi-desktop/bench/warning",
    buildWatcherLog: "pi-desktop/build/watcher/event/log",
    buildWatcherExit: "pi-desktop/build/watcher/event/exit",
    sidecarFatal: "pi-desktop/sidecar/event/fatal",
    /** omp setStatus / setWidget / setTitle forwarded from the omp bridge. */
    sidecarExtUi: "pi-desktop/sidecar/event/extUi",
    /** Managed local Hindsight server state changed. */
    hindsightLocalStatus: "pi-desktop/hindsight-local/event/status",
    /** Kanban board changed (tasks/runs/links updated by dispatcher or user). */
    kanbanChanged: "pi-desktop/kanban/event/changed",
    /** Raven settings changed (nav-rail button visibility, site URL). */
    ravenChanged: "pi-desktop/raven/event/changed",
    /** Output of every terminal session (`{ id, data }`); listeners filter by id. */
    terminalData: "terminal:data",
    terminalExit: "terminal:exit",
  },
} as const;

export const IPC_WHITELIST = new Set<string>([
  ...Object.values(IPC.invoke),
  ...Object.values(IPC.event),
]);
