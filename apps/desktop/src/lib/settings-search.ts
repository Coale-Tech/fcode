/**
 * Data-only index of the settings IA, shared by the settings page nav and
 * the global search dialog. Keyword keys are the i18n keys of the rows
 * rendered inside each tab; search matches their translations, so a query
 * like "主题" or "theme" can surface the tab that owns the row.
 */

export type SettingsTabId =
  | "general"
  | "ai"
  | "shortcuts"
  | "instructions"
  | "agent"
  | "memory"
  | "import"
  | "projects"
  | "sync"
  | "remoteHosts"
  | "kanban"
  | "about";

export type SettingsNavGroupId =
  | "preferences"
  | "agent"
  | "workspace"
  | "system";

export const SETTINGS_NAV_GROUP_LABELS: Record<SettingsNavGroupId, string> = {
  preferences: "settings.groupPreferences",
  agent: "settings.groupAgent",
  workspace: "settings.groupWorkspace",
  system: "settings.groupSystem",
};

export type SettingsNavEntry = {
  id: SettingsTabId;
  /** Short label used by the rail and settings search results. */
  labelKey: string;
  /** Descriptive title used at the top of the selected settings page. */
  titleKey: string;
  /** Visual-only rail grouping; search remains a flat destination index. */
  group: SettingsNavGroupId;
  /** i18n keys of the rows inside the tab; search matches their translations. */
  keywordKeys: string[];
  /**
   * Destination only exists while `AppSettings.developerMode` is on; the
   * rail, the page, and settings search drop it together.
   */
  developerOnly?: true;
  /** Localized Experimental badge shown beside the rail row and page title. */
  experimentalBadgeKey?: string;
};

export const SETTINGS_NAV: SettingsNavEntry[] = [
  {
    id: "general",
    labelKey: "settings.nav.general",
    titleKey: "settings.general",
    group: "preferences",
    keywordKeys: [
      "settings.appearance",
      "settings.theme",
      "settings.language",
      "settings.languageAuto",
      "settings.font",
      "settings.fontSize",
      "settings.closeBehaviorTitle",
      "settings.closeBehaviorTray",
      "settings.closeBehaviorQuit",
      "settings.power",
      "settings.keepAwakeWhileRunning",
      "settings.keepAwakeWhileRunningDesc",
      "settings.network",
      "settings.proxy",
      "settings.proxySystem",
      "settings.proxyDirect",
      "settings.proxyCustom",
      "settings.proxyUrl",
      "settings.networkRelaxedMode",
      "settings.networkRelaxedModeDesc",
      "settings.networkRelaxedModeStrictDesc",
      "settings.preventScreenSleep",
      "settings.preventScreenSleepDesc",
    ],
  },
  {
    id: "ai",
    labelKey: "settings.nav.ai",
    titleKey: "settings.ai",
    group: "preferences",
    keywordKeys: [
      "settings.permissions",
      "settings.permissionMode",
      "settings.permissionModeAsk",
      "settings.permissionModeAcceptEdits",
      "settings.permissionModeAuto",
      "settings.toolApprovalMode",
      "settings.toolApprovalModeAlwaysAsk",
      "settings.toolApprovalModeWrite",
      "settings.toolApprovalModeYolo",
      "settings.defaultsTitle",
      "settings.imageModel",
      "settings.mode",
      "settings.commandShell",
      "settings.linkOpenTarget",
      "settings.enterToSend",
      "settings.infiniteProviderRetry",
      "settings.infiniteProviderRetryDesc",
      "settings.smoothStreaming",
      "settings.smoothStreamingDesc",
      "settings.thinkingDisplayMode",
      "settings.thinkingDisplayDetailed",
      "settings.thinkingDisplayCompact",
      "settings.contextUsageDisplay",
      "settings.contextUsageDisplayRemaining",
      "settings.contextUsageDisplayUsed",
      "settings.promptEnhancementTitle",
      "settings.promptEnhancementDesc",
      "settings.promptEnhancementCustomTemplate",
      "settings.promptEnhancementEdit",
      "settings.promptEnhancementUserTemplate",
      "settings.promptEnhancementModelTitle",
      "settings.promptEnhancementModel",
      "settings.promptEnhancementModelFollow",
      "settings.promptEnhancementThinking",
      "settings.largePasteThreshold",
      "settings.ompTaskGroup",
      "settings.ompTaskIsolation",
      "settings.ompIsolationBackend",
      "settings.ompWorktreeClone",
      "settings.ompTaskMaxConcurrency",
      "settings.ompTaskMaxRecursionDepth",
      "settings.ompEvalGroup",
      "settings.ompEvalPy",
      "settings.ompEvalJs",
      "settings.ompEvalTools",
      "settings.ompPythonKernelMode",
      "settings.ompPythonInterpreter",
      "settings.ompBrowserGroup",
      "settings.ompBrowserEnabled",
      "settings.ompBrowserHeadless",
      "settings.ompBrowserCdpUrl",
      "settings.ompBrowserRelay",
      "settings.ompBrowserRelayUrl",
      "settings.ompCollabGroup",
      "settings.ompCollabRelayUrl",
      "settings.ompCollabWebUrl",
      "settings.ompCollabDisplayName",
      "settings.ompCollabAutoStart",
      // Queue Modes
      "settings.ompQueueModesGroup",
      "settings.ompSteeringMode",
      "settings.ompFollowUpMode",
      "settings.ompInterruptMode",
      "settings.ompLoopMode",
      "settings.ompQueueModeAll",
      "settings.ompQueueModeOneAtATime",
      // LSP
      "settings.ompLspGroup",
      "settings.ompLspEnabled",
      "settings.ompLspFormatOnWrite",
      "settings.ompLspDiagnosticsOnWrite",
      "settings.ompLspDiagnosticsOnEdit",
      // IDA Pro
      "settings.ompIdaGroup",
      "settings.ompIdaEnabled",
      "settings.ompIdaPython",
      "settings.ompIdaInstallDir",
      // MCP
      "settings.ompMcpGroup",
      "settings.ompMcpEnableProjectConfig",
      "settings.ompMcpRenderMarkdownResults",
      "settings.ompMcpNotifications",
      // Skills & Commands
      "settings.ompExtensibilityGroup",
      "settings.ompSkillsEnabled",
      "settings.ompSkillsRegistryUrl",
      "settings.ompSkillsCustomDirectories",
      "settings.ompCommandsEnableClaudeUser",
      "settings.ompCommandsEnableClaudeProject",
      // Hindsight Behavior
      "settings.ompHindsightGroup",
      "settings.ompHindsightAutoRecall",
      "settings.ompHindsightAutoRetain",
      "settings.ompHindsightRetainMode",
      "settings.ompHindsightMentalModelsEnabled",
      "settings.ompHindsightMentalModelAutoSeed",
      // HTML Export Theme
      "settings.ompThemeGroup",
      "settings.ompThemeDark",
      "settings.ompThemeLight",
      // Agent Model Overrides
      "settings.ompAgentModelOverridesDesc",
      "settings.ompAgentModelOverridesDefault",
      // Extensions / Skills / Worktrees (installed)
      "settings.ompExtGroup",
      "settings.ompExtInstall",
      "settings.ompExtUninstall",
      "settings.ompSkillsGroup",
      "settings.ompWorktreesGroup",
    ],
  },
  {
    id: "voice",
    labelKey: "settings.nav.voice",
    titleKey: "settings.voice",
    group: "preferences",
    developerOnly: true,
    experimentalBadgeKey: "settings.voiceExperimental",
    keywordKeys: [
      "settings.voiceEnable",
      "settings.voiceMicrophone",
      "settings.voiceLanguages",
      "settings.voiceChineseVariant",
      "settings.voiceModel",
      "settings.voiceLocalModels",
    ],
  },
  {
    id: "shortcuts",
    labelKey: "settings.nav.shortcuts",
    titleKey: "settings.shortcuts",
    group: "preferences",
    keywordKeys: [
      "settings.keyboard",
      "settings.shortcutAction.openSearch",
      "settings.shortcutAction.openCommandPalette",
      "settings.shortcutAction.toggleSidebar",
      "settings.shortcutAction.openWorkPanel",
    ],
  },
  {
    id: "instructions",
    labelKey: "settings.nav.instructions",
    titleKey: "settings.instructions",
    group: "agent",
    keywordKeys: [
      "settings.instructionsGlobal",
      "settings.instructionsPath",
    ],
  },
  {
    id: "agent",
    labelKey: "settings.nav.models",
    titleKey: "settings.configuration",
    group: "agent",
    keywordKeys: [
      "settings.providers",
      "settings.models",
      "settings.defaultModel",
      "settings.apiKey",
      "settings.baseUrl",
      "settings.apiStyle",
    ],
  },
  {
    id: "memory",
    labelKey: "settings.nav.memory",
    titleKey: "settings.memoryTitle",
    group: "agent",
    keywordKeys: [
      "settings.memoryTitle",
      "settings.memoryBackend",
      "settings.memoryHindsightUrl",
      "settings.memoryHindsightToken",
    ],
  },
  {
    id: "import",
    labelKey: "settings.nav.import",
    titleKey: "settings.import",
    group: "workspace",
    keywordKeys: [
      "settings.importTitle",
      "settings.importModelsTitle",
      "settings.importSourceClaudeCode",
      "settings.importSourceOpenCode",
      "settings.importSourceCodex",
      "settings.importSourcePi",
      "settings.importSourceCcSwitch",
    ],
  },
  {
    id: "projects",
    labelKey: "settings.nav.projects",
    titleKey: "settings.projectArchive",
    group: "workspace",
    keywordKeys: [
      "project.title",
      "project.searchPlaceholder",
      "project.archive",
      "project.restore",
      "project.delete",
    ],
  },
  {
    id: "sync",
    labelKey: "settings.nav.sync",
    titleKey: "settings.configSync.title",
    group: "system",
    developerOnly: true,
    experimentalBadgeKey: "settings.configSync.experimental",
    keywordKeys: [
      "settings.configSync.connectionTitle",
      "settings.configSync.endpoint",
      "settings.configSync.statusTitle",
      "settings.configSync.categoriesTitle",
      "settings.configSync.approvalsTitle",
      "settings.configSync.syncNow",
    ],
  },
  {
    id: "remoteHosts",
    labelKey: "settings.nav.remoteHosts",
    titleKey: "settings.remoteHosts.title",
    group: "system",
    developerOnly: true,
    experimentalBadgeKey: "settings.remoteHosts.experimental",
    keywordKeys: [
      "settings.remoteHosts.title",
      "settings.remoteHosts.addTitle",
      "settings.remoteHosts.addSsh",
      "settings.remoteHosts.addPair",
      "settings.remoteHosts.pair",
      "settings.remoteHosts.fieldUrl",
      "settings.remoteHosts.fieldPairingToken",
      "settings.remoteHosts.sshHost",
      "settings.remoteHosts.sshAuthMode",
      "settings.remoteHosts.sshPassword",
      "settings.remoteHosts.statusOnline",
      "settings.remoteHosts.statusOffline",
      "settings.remoteHosts.experimental",
    ],
  },
  {
    id: "kanban",
    labelKey: "settings.nav.kanban",
    titleKey: "kanban.settings.title",
    group: "agent",
    keywordKeys: [
      "kanban.settings.enabled",
      "kanban.settings.maxInProgress",
      "kanban.settings.maxRuntimeSeconds",
      "kanban.settings.maxAgentCardsPerSession",
      "kanban.settings.maxDailySpawns",
      "kanban.dispatcher.pause",
      "kanban.dispatcher.resume",
    ],
  },
  {
    id: "about",
    labelKey: "settings.nav.info",
    titleKey: "settings.about",
    group: "system",
    keywordKeys: [
      "settings.application",
      "settings.logs",
      "settings.feedback",
      "updates.title",
      "settings.developer",
      "settings.developerMode",
      "settings.devTools",
    ],
  },
];

/**
 * Destinations the current mode offers, in rail order. `developerMode` comes
 * from `AppSettings.developerMode`; when it is off the developer-only rows are
 * absent rather than disabled.
 */
export function visibleSettingsNav(developerMode: boolean): SettingsNavEntry[] {
  return SETTINGS_NAV.filter((entry) => entry.developerOnly !== true || developerMode);
}

/**
 * True when `tab` is a destination the current mode hides, so a caller holding
 * a stale selection can fall back instead of rendering a page the rail no
 * longer offers.
 */
export function isSettingsDestinationHidden(
  tab: SettingsTabId,
  developerMode: boolean,
): boolean {
  const entry = SETTINGS_NAV.find((candidate) => candidate.id === tab);
  return entry?.developerOnly === true && !developerMode;
}

export type SettingsSearchHit = {
  tab: SettingsTabId;
  tabLabelKey: string;
  /** Matched row key; null when the tab label itself matched. */
  rowKey: string | null;
};

export type SettingsSearchOptions = {
  limit?: number;
  /** Search mirrors the rail, so developer-only tabs stay out of the results. */
  developerMode?: boolean;
};

export function searchSettings(
  query: string,
  t: (key: string) => string,
  { limit = 8, developerMode = false }: SettingsSearchOptions = {},
): SettingsSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SettingsSearchHit[] = [];
  for (const entry of visibleSettingsNav(developerMode)) {
    if (t(entry.labelKey).toLowerCase().includes(q)) {
      hits.push({ tab: entry.id, tabLabelKey: entry.labelKey, rowKey: null });
    }
    for (const key of entry.keywordKeys) {
      if (t(key).toLowerCase().includes(q)) {
        hits.push({ tab: entry.id, tabLabelKey: entry.labelKey, rowKey: key });
      }
    }
  }
  return hits.slice(0, limit);
}
