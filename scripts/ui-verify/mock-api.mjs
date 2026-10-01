/**
 * Mock window.piDesktop for headless UI verification.
 *
 * Injected via playwright addInitScript before the renderer loads.
 * Covers all bootstrap invoke channels with realistic fixture data,
 * and provides no-op stubs for all other channels.
 *
 * Usage: page.addInitScript({ path: 'mock-api.mjs' }) — but since this
 * is injected as a script, the export is not used; just paste the contents.
 */

// ── Fixture data ────────────────────────────────────────────────────────────

const MOCK_SETTINGS = {
  theme: "dark",
  enterToSend: true,
  defaultMode: "auto",
  language: "auto",
  fontScale: 1,
  developerMode: false,
  networkProxy: { mode: "system" },
  networkPolicy: {},
  linkOpenTarget: "workpanel",
  contextUsageDisplay: "remaining",
};

const MOCK_VERSION = {
  name: "Fcode",
  version: "0.16.0",
  protocolVersion: 11,
  hostProtocolVersion: 11,
  hostVersion: "0.16.0",
  platform: "darwin",
  arch: "x64",
};

const MOCK_HEALTH = {
  ok: true,
  protocolVersion: 11,
  version: "0.16.0",
  uptimeMs: 12340,
};

const MOCK_ONBOARDING = {
  showChecklist: false,
  steps: [],
};

const MOCK_SESSION = {
  id: "sess-001",
  title: "Build the dashboard feature",
  createdAt: "2026-09-30T10:00:00Z",
  updatedAt: "2026-09-30T11:30:00Z",
  model: "claude-opus-4-5",
  projectPath: null,
  status: "idle",
  pinned: false,
  archived: false,
  messageCount: 42,
  workspaceOpen: false,
};

const MOCK_SESSION_2 = {
  id: "sess-002",
  title: "Fix authentication flow",
  createdAt: "2026-09-29T14:00:00Z",
  updatedAt: "2026-09-30T09:15:00Z",
  model: "claude-sonnet-4-6",
  projectPath: null,
  status: "idle",
  pinned: false,
  archived: false,
  messageCount: 17,
  workspaceOpen: false,
};

const MOCK_PROVIDER = {
  id: "prov-anthropic",
  name: "Anthropic",
  baseUrl: "https://api.anthropic.com",
  kind: "anthropic",
  enabled: true,
  hasSecret: true,
  secretHint: "sk-ant-...XYZ",
  models: [],
  createdAt: "2026-01-01T00:00:00Z",
};

const MOCK_OMP_MEMORY_STATUS_ACTIVE = {
  backend: "mnemopi",
  active: true,
  writable: true,
  searchable: true,
  scope: "my-project",
  retainBank: "default",
  workingCount: 12,
  episodicCount: 34,
  tripleCount: 0,
  latencyMs: 45,
};

const MOCK_OMP_MEMORY_STATUS_DEGRADED = {
  backend: "mnemopi",
  active: true,
  writable: false,
  searchable: true,
  scope: "my-project",
  workingCount: 12,
  episodicCount: 34,
  latencyMs: 1200,
  error: "Write timeout — retrying",
};

const MOCK_OMP_MEMORY_STATUS_ERROR = {
  backend: "mnemopi",
  active: false,
  writable: false,
  searchable: false,
  latencyMs: 0,
  error: "Connection refused: mnemopi server not reachable",
};

const MOCK_OMP_SETTINGS = {
  "task.isolation.enabled": true,
  "task.maxConcurrency": 4,
  "eval.py": true,
  "eval.js": true,
  "browser.enabled": true,
  "browser.headless": false,
  "collab.autoStart": "off",
  "steeringMode": "all",
  "followUpMode": "one-at-a-time",
  "interruptMode": "immediate",
};

const MOCK_SUBAGENTS = [
  {
    id: "sub-001",
    name: "ResearchAgent",
    status: "running",
    model: "claude-sonnet-4-6",
    turnCount: 5,
    startedAt: "2026-09-30T11:00:00Z",
  },
  {
    id: "sub-002",
    name: "CodeReviewer",
    status: "idle",
    model: "claude-haiku-3-5",
    turnCount: 3,
    startedAt: "2026-09-30T10:45:00Z",
  },
];

const MOCK_OMP_STATE = {
  connected: true,
  sessionId: "omp-session-abc123",
  model: "claude-sonnet-4-6",
  thinkingLevel: "auto",
  fastMode: false,
  autoRetry: false,
  steeringMode: "all",
  followUpMode: "one-at-a-time",
  interruptMode: "immediate",
};

const MOCK_EXTENSIONS = [
  {
    name: "@omp/web-search",
    version: "1.2.0",
    description: "Web search integration",
    enabled: true,
    source: "npm",
  },
  {
    name: "@omp/github",
    version: "0.8.1",
    description: "GitHub pull request and issue tools",
    enabled: true,
    source: "npm",
  },
  {
    name: "@omp/jira",
    version: "0.3.0",
    description: "Jira project management",
    enabled: false,
    source: "npm",
  },
];

const MOCK_SESSION_STATS = {
  userMessages: 14,
  tokens: {
    input: 45231,
    output: 12804,
    cacheRead: 8190,
    cacheWrite: 4096,
    total: 70321,
  },
  cost: 0.23,
};

const MOCK_SESSION_TREE = {
  branches: [
    {
      id: "branch-main",
      label: "main",
      parentId: null,
      messages: 42,
      active: true,
      createdAt: "2026-09-30T10:00:00Z",
    },
    {
      id: "branch-alt",
      label: "alternative approach",
      parentId: "branch-main",
      messages: 8,
      active: false,
      createdAt: "2026-09-30T11:00:00Z",
    },
  ],
};

// ── IPC channel → mock response map ─────────────────────────────────────────

function buildMockHandlers(memoryState) {
  const memStatus =
    memoryState === "active"
      ? MOCK_OMP_MEMORY_STATUS_ACTIVE
      : memoryState === "degraded"
        ? MOCK_OMP_MEMORY_STATUS_DEGRADED
        : MOCK_OMP_MEMORY_STATUS_ERROR;

  return {
    "pi-desktop/settings/get": () => ({ ok: true, value: MOCK_SETTINGS }),
    "pi-desktop/app/getVersion": () => MOCK_VERSION,
    "pi-desktop/app/health": () => MOCK_HEALTH,
    "pi-desktop/app/getOnboarding": () => MOCK_ONBOARDING,
    "pi-desktop/app/dismissOnboarding": () => ({ ok: true }),
    "pi-desktop/session/list": () => ({ sessions: [MOCK_SESSION, MOCK_SESSION_2] }),
    "pi-desktop/providers/list": () => ({ providers: [MOCK_PROVIDER] }),
    "pi-desktop/project/get": () => ({ workspace: null }),
    "pi-desktop/project/list": () => ({ projects: [] }),
    "pi-desktop/plugin/list": () => ({ plugins: [] }),
    "pi-desktop/notification/list": () => ({ notifications: [], unreadCount: 0 }),
    "pi-desktop/plans/pending": () => ({ plans: [], state: null }),
    "pi-desktop/omp/memory/status": () => memStatus,
    "pi-desktop/omp/state": () => MOCK_OMP_STATE,
    "pi-desktop/omp/models/list": () => ({ models: [] }),
    "pi-desktop/omp/thinking/levels": () => ({ levels: ["off", "auto", "hard"] }),
    "pi-desktop/omp/commands/list": () => ({ commands: [] }),
    "pi-desktop/omp/login/providers": () => ({ providers: [] }),
    "pi-desktop/omp/session/stats": () => MOCK_SESSION_STATS,
    "pi-desktop/omp/session/tree": () => MOCK_SESSION_TREE,
    "pi-desktop/omp/session/entries": () => ({ entries: [] }),
    "pi-desktop/omp/session/branchMessages": () => ({ messages: [] }),
    "pi-desktop/omp/session/branch": () => ({ branchId: "branch-main" }),
    "pi-desktop/omp/subagent/list": () => ({ subagents: MOCK_SUBAGENTS }),
    "pi-desktop/omp/subagent/messages": () => ({ messages: [] }),
    "pi-desktop/omp/share": () => ({ url: "https://share.omp.dev/abc123", ok: true }),
    "pi-desktop/omp/skills/installed/list": () => ({ skills: [] }),
    "pi-desktop/omp/stats/historical": () => ({
      days: [],
      totalCost: 4.12,
      totalTokens: 281000,
    }),
    "pi-desktop/omp/worktrees/list": () => ({ worktrees: [] }),
    "pi-desktop/omp/extensions/list": () => ({ extensions: MOCK_EXTENSIONS }),
    "pi-desktop/omp/extensions/install": () => ({ ok: true, output: "" }),
    "pi-desktop/omp/extensions/uninstall": () => ({ ok: true, output: "" }),
    "pi-desktop/omp/extensions/setEnabled": () => ({ ok: true, output: "" }),
    "pi-desktop/omp-settings/get": () => ({ ok: true, value: MOCK_OMP_SETTINGS }),
    "pi-desktop/omp-settings/set": () => ({ ok: true }),
    "pi-desktop/tool-approval-mode/get": () => "always-ask",
    "pi-desktop/tool-approval-mode/set": () => ({ ok: true }),
    "pi-desktop/memory/getConfig": () => ({
      backend: "mnemopi",
      view: { backend: "mnemopi", configured: true },
    }),
    "pi-desktop/memory/setConfig": () => ({ ok: true }),
    "pi-desktop/hindsight/mentalModels/list": () => ({ models: [] }),
    "pi-desktop/hindsight/bank/mission": () => ({ ok: true }),
    "pi-desktop/hindsight-local/detect": () => ({ launchers: [] }),
    "pi-desktop/hindsight-local/status": () => ({
      running: false,
      launchers: [],
    }),
    "pi-desktop/session/get": () => ({ session: MOCK_SESSION }),
    "pi-desktop/session/create": () => ({ session: MOCK_SESSION }),
    "pi-desktop/session/fork": () => ({ session: MOCK_SESSION }),
    "pi-desktop/session/collaboration": () => ({
      shareUrl: null,
      viewers: [],
      editors: [],
    }),
    "pi-desktop/settings/set": () => ({ ok: true }),
    "pi-desktop/configSync/getState": () => ({
      configured: false,
      connected: false,
      pending: [],
    }),
    "pi-desktop/mcp/list": () => ({ servers: [] }),
    "pi-desktop/skill/list": () => ({ skills: [] }),
    "pi-desktop/subagent/list": () => ({ subagents: [] }),
    "pi-desktop/subagent/catalog": () => ({ definitions: [] }),
    "pi-desktop/providers/listModels": () => ({ models: [] }),
    "pi-desktop/providers/modelCatalogStatus": () => ({
      lastUpdated: "2026-09-01T00:00:00Z",
      count: 120,
    }),
    "pi-desktop/providers/oauth/vendors": () => ({ vendors: [] }),
    "pi-desktop/updates/getState": () => ({
      state: "idle",
      version: null,
      error: null,
    }),
    "pi-desktop/window/closeBehavior/get": () => ({ behavior: "ask" }),
    "pi-desktop/menu/rendererReady": () => ({ ok: true }),
    "pi-desktop/app/systemFonts": () => [],
    "pi-desktop/commandShell/list": () => {
      const zsh = { id: "zsh", label: "zsh", dialect: "posix", available: true, isDefault: true };
      return { configuredId: null, effective: zsh, fallback: false, choices: [zsh] };
    },
    "pi-desktop/agent/getStatus": () => ({ status: "idle" }),
    "pi-desktop/agent/instructions/get": () => ({
      global: { scope: "global", path: "~/.omp/AGENTS.md", content: "", exists: false },
    }),
    "pi-desktop/bench/list": () => ({ benches: [] }),
    "pi-desktop/bench/status": () => ({ running: false }),
    "pi-desktop/remoteHost/list": () => ({ hosts: [] }),
    "pi-desktop/project-group/list": () => ({ groups: [] }),
    "pi-desktop/pulls/list": () => ({ pulls: [] }),
    "pi-desktop/scheduled/list": () => ({ tasks: [] }),
    "pi-desktop/market/refresh": () => ({ ok: true }),
    "pi-desktop/stats/getTokenUsageHistory": () => ({ days: [] }),
    "pi-desktop/voice/getState": () => ({ state: "idle" }),
    "pi-desktop/voice/getDevices": () => ({ devices: [] }),
    "pi-desktop/voice/getModels": () => ({ models: [] }),
    "pi-desktop/voice/checkPermission": () => ({ granted: false }),
    "pi-desktop/plugin/themes": () => ([]),
    "pi-desktop/plugin/services": () => ([]),
    "pi-desktop/plugin/views": () => ([]),
    "pi-desktop/plugin/scenicThemes/destinations": () => ({ destinations: [] }),
    "pi-desktop/session/importScan": () => ({ sessions: [], total: 0 }),
    "pi-desktop/modelConfig/importScan": () => ({ providers: [] }),
    "pi-desktop/mcp/importScan": () => ({ candidates: [], sources: [] }),
    "pi-desktop/skill/importScan": () => ({ candidates: [], sources: [] }),
    "pi-desktop/omp/session/exportHtml": () => ({ path: "/tmp/session.html" }),
    "pi-desktop/omp/session/lastAssistantText": () => ({ text: "" }),
    "pi-desktop/omp/session/handoff": () => ({ ok: true }),
    "pi-desktop/omp/session/setTodos": () => ({ ok: true }),
    "pi-desktop/bench/bootstrap/memory": () => ({ ok: true }),
  };
}

// ── Install mock ─────────────────────────────────────────────────────────────

(function installMock() {
  // Read desired memory state from a flag the test script sets
  const memState = window.__MOCK_MEMORY_STATE__ || "active";

  const handlers = buildMockHandlers(memState);

  // IPC channel names object (minimal)
  const channels = {};
  for (const key of Object.keys(handlers)) {
    const parts = key.split("/");
    const name = parts[parts.length - 1];
    channels[name] = key;
  }

  const listeners = new Map(); // channel → Set of listeners

  window.piDesktop = {
    platform: "darwin",
    locale: "en-US",

    channels,

    invoke: async (channel, ...args) => {
      const handler = handlers[channel];
      if (handler) {
        try {
          const result = handler(...args);
          // Real preload envelope is { ok, data } (api.ts invoke reads result.data).
          return { ok: true, data: result && typeof result === "object" && "value" in result ? result.value : result };
        } catch (err) {
          console.warn("[mock] handler error for", channel, err);
          return { ok: false, error: { message: String(err) } };
        }
      }
      // Default no-op stub
      console.debug("[mock] unhandled invoke:", channel, args);
      return { ok: true, data: null };
    },

    on: (channel, listener) => {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel).add(listener);
      return () => listeners.get(channel)?.delete(listener);
    },

    // Helper used internally to fire events from test scripts
    emit: (channel, ...args) => {
      const set = listeners.get(channel);
      if (set) for (const fn of set) fn(...args);
    },

    getDroppedFilePath: () => null,
  };

  // Make emit accessible globally for test scripts
  window.__piEmit = (channel, ...args) => window.piDesktop.emit(channel, ...args);

  console.log("[mock] window.piDesktop installed, memoryState:", memState);
})();
