/**
 * Capture-rig fixtures for the screenshot suite (electron/main, driven by
 * `PI_DESKTOP_CAPTURE=1`). Nothing here ships on the production code path:
 * `renderer-api.ts` only `import()`s this module the first time a fixture
 * method is called while `window.__PI_CAPTURE__` is set.
 *
 * Every method still checks `__PI_CAPTURE__` itself because several seed
 * fixtures are destructive (they replace transcript, sessions, or
 * monkey-patch `api.*` list calls) and must never run from a stray call.
 */
import type {
  AppNotificationKind,
  CommandItem,
  KanbanBoard,
  KanbanTask,
  McpServerRecord,
  McpServerStatus,
  OmpAgentEntry,
  OmpModelsListResult,
  OmpSettingDescriptor,
  OmpWorktreeEntry,
  OnboardingState,
  PluginSummary,
  PluginTheme,
  ProjectRecord,
  PullRequestCheck,
  PullRequestSummary,
  ScheduledTask,
  ScheduledTaskRun,
  SessionSummary,
  UiMessage,
  UserSkillRecord,
} from "@pi-desktop/shared";
import { useAppStore } from "../stores/app-store";
import { api } from "../lib/api";
import { browserPluginTab, toolWorkPanelTab, ACTIVITY_TAB } from "../lib/work-panel-tabs";
import type { PendingPermission } from "../lib/pending-permissions";
import { enqueuePermission } from "../lib/pending-permissions";

export type CaptureRigMethods = {
  openWorkPanelArtifact: (
    kind: "review" | "browser" | "file",
    resource?: string,
  ) => void;
  collapseWorkPanel: () => void;
  openWorkPanel: () => void;
  openNewWorkPanelTab: () => void;
  setWorkPanelWidth: (width: number) => void;
  seedTranscript: (count?: number) => void;
  seedReviewChanges: (count?: number) => void;
  seedRunRows: (count?: number) => void;
  seedDelegationRows: (count?: number) => void;
  seedPlugins: (count?: number) => void;
  seedExtensions: (count?: number) => void;
  seedPluginThemes: (count?: number) => void;
  seedNotifications: (count?: number) => void;
  seedKanbanBoard: (count?: number) => void;
  seedScheduledTasks: (count?: number) => void;
  seedPullRequests: (count?: number) => void;
  seedSidebarStatuses: () => {
    selected: string;
    running: string;
    completed: string;
    failed: string;
  } | null;
  ensureVisualFixtures: () => Promise<void>;
  seedOmpSettings: () => void;
  /** Seed a fake running bench in the status bar and navbar bench chip.
   *  benchPath defaults to coale_v16 path, siteCount to 3, site to "coale.frappe.cloud". */
  seedBenchStatus: (opts?: { benchPath?: string; siteCount?: number; site?: string }) => void;
  seedApprovalCard: () => void;
  clearPendingPermissions: () => void;
  seedEmptyHome: () => void;
  seedOnboardingChecklist: () => void;
  /** Seed capture-only extras for the command palette: FILES, BENCHES and COMMANDS sections. */
  seedCommandPaletteExtras: () => void;
  /** Patch settings.largePasteThreshold to 200 directly in the Zustand store. */
  seedLargePasteThreshold: () => void;
  /** Intercept window.piDesktop.invoke for bench IPC channels so BenchPage shows
   *  seeded data (5 specific benches, coale_v16 running) without needing a host binary. */
  seedBenchList: () => void;
  /** Remove the pinned flag from all sessions so no PINNED section shows in the sidebar. */
  clearPinnedSessions: () => void;
  /** Seed Raven as connected (enabled=true, URL set, ravenConnected event fired).
   *  The WebContentsView content is still not capturable by CDP. */
  seedRavenConnected: () => void;
  /** Seed FileBird as running (mock fileBirdSetVisible → {ok:true} so failed=false). */
  seedFileBirdConnected: () => void;
};

export type CaptureRig = CaptureRigMethods & {
  /** Restores every store action and `api.*` call the fixtures replaced. */
  dispose: () => void;
};

export function installCaptureRig(): CaptureRig {
  const originalRefreshNotifications =
    useAppStore.getState().refreshNotifications;
  const originalRefreshPlugins = useAppStore.getState().refreshPlugins;
  const originalListPluginServices = api.listPluginServices;
  const originalMarketSearch = api.marketSearch;
  const originalMarketDetail = api.marketGetDetail;
  const originalListMcpServers = api.listMcpServers;
  const originalListUserSkills = api.listUserSkills;
  const originalListProjects = api.listProjects;
  const originalKanbanList = api.kanbanList;
  const originalListScheduled = api.listScheduled;
  const originalListScheduledRuns = api.listScheduledRuns;
  const originalListPullRequests = api.listPullRequests;
  const originalOmpModelsList = api.ompModelsList;
  const originalOmpWorktreeList = api.ompWorktreeList;
  const originalOmpSettingsGet  = api.ompSettingsGet;
  const originalOmpAgentList    = api.ompAgentList;
  const methods: CaptureRigMethods = {
    openWorkPanelArtifact: (
      kind: "review" | "browser" | "file",
      resource?: string,
    ) => {
      if (!window.__PI_CAPTURE__) return;
      if (kind === "file" && resource) {
        useAppStore.getState().openFileInWorkPanel(resource);
        return;
      }
      if (kind === "browser") {
        useAppStore.getState().openWorkPanelTab(browserPluginTab(resource));
        return;
      }
      if (kind === "review") {
        useAppStore.getState().openWorkPanelTab(toolWorkPanelTab("review"));
      }
    },
    collapseWorkPanel: () => {
      if (!window.__PI_CAPTURE__) return;
      useAppStore.getState().collapseWorkPanel();
    },
    /**
     * Reveals the panel with whatever tabs the session already has — none, in
     * the capture suite, which is the point: this is how the no-resource
     * empty body is photographed. Production reaches it via `Cmd/Ctrl+J`.
     */
    openWorkPanel: () => {
      if (!window.__PI_CAPTURE__) return;
      useAppStore.getState().openWorkPanel();
    },
    openNewWorkPanelTab: () => {
      if (!window.__PI_CAPTURE__) return;
      useAppStore.getState().openNewWorkPanelTab();
    },
    setWorkPanelWidth: (width) => {
      if (!window.__PI_CAPTURE__) return;
      useAppStore.getState().setWorkPanelWidth(width);
    },
    seedTranscript: (count = 12) => {
      // Capture-only transcript fixture (conversation minimap scenes);
      // count 0 restores the empty transcript for later scenes.
      if (!window.__PI_CAPTURE__) return;
      if (count <= 0) {
        useAppStore.setState({ messages: [] });
        return;
      }
      const base = Date.parse("2026-07-20T09:00:00Z");
      const samples: [role: "user" | "assistant", content: string][] = [
        ["user", "帮我配置一下这个项目并启动"],
        [
          "assistant",
          "好的。先安装依赖并生成本地配置：\n\n1. `pnpm install`\n2. 复制 `.env.example` 为 `.env`\n3. `pnpm dev` 启动开发服务\n\n启动后默认监听 5173 端口。",
        ],
        ["user", "启动报错了，说找不到 host 二进制"],
        [
          "assistant",
          "这是因为 Rust 侧还没编译。运行 `cargo build -p pi-desktop-host-core`，产物会出现在 `target/debug/` 下，Electron 主进程会自动拾取。",
        ],
        ["user", "编译通过了，界面也起来了"],
        [
          "assistant",
          "很好。接下来可以在设置里添加模型提供方并保存 API 密钥，然后打开一个项目文件夹就能开始对话了。",
        ],
        ["user", "顺便把侧边栏最近会话按项目分组"],
        [
          "assistant",
          "已按项目路径分组：每组显示项目名与最近活动时间，未关联项目的会话归入“临时会话”。分组逻辑在 `sidebar-session-groups.ts`。",
        ],
        ["user", "分组标题的字号再小一点"],
        [
          "assistant",
          "已把分组标题从 `--text-sm` 调整为 `--text-2xs`，同时收紧了上下间距，现在与 PI-Desktop 的密度一致。",
        ],
        ["user", "最后跑一遍检查"],
        [
          "assistant",
          "`pnpm typecheck` 与样式令牌检查均通过，无回归。",
        ],
      ];
      const messages = Array.from(
        { length: Math.min(count, samples.length) },
        (_, i) => ({
          id: `capture-msg-${i}`,
          role: samples[i][0],
          content: samples[i][1],
          createdAt: new Date(base + i * 60_000).toISOString(),
          status: "complete" as const,
        }),
      );
      useAppStore.setState({ messages });
    },
    seedReviewChanges: (count = 4) => {
      // Capture-only review fixture (inline change rows + Review tab scenes).
      // The Review tab reads the session transcript, so the fixture is a set
      // of successful workspace Write/Edit tool messages carrying
      // `details.review`; count 0 restores the empty transcript.
      if (!window.__PI_CAPTURE__) return;
      if (count <= 0) {
        useAppStore.setState({ messages: [] });
        return;
      }
      const base = Date.parse("2026-08-14T09:00:00Z");
      const samples = [
        {
          tool: "Edit",
          path: "apps/desktop/src/components/workpanel/ReviewTab.tsx",
          operation: "edit",
          status: "modified",
          state: "active",
          additions: 4,
          deletions: 6,
          hunks: [
            {
              header: "@@ -25,9 +25,7 @@",
              lines: [
                { type: "context", text: '    <div className="review-toolbar">' },
                { type: "del", text: '      <span className="review-toolbar-icon">' },
                { type: "del", text: "        <IconDiff size={14} />" },
                { type: "del", text: "      </span>" },
                { type: "add", text: '      <span className="review-summary">' },
              ],
            },
          ],
        },
        {
          tool: "Write",
          path: "apps/desktop/src/lib/review-row-metrics.ts",
          operation: "write",
          status: "added",
          state: "active",
          additions: 12,
          deletions: 0,
          hunks: [
            {
              header: "@@ -0,0 +1,12 @@",
              lines: [
                { type: "add", text: "export const REVIEW_ROW_HEIGHT = 24;" },
                { type: "add", text: "export const REVIEW_MARK_WIDTH = 10;" },
              ],
            },
          ],
        },
        {
          tool: "Edit",
          path: "apps/desktop/src/styles/work-panel.css",
          operation: "edit",
          status: "deleted",
          state: "active",
          additions: 0,
          deletions: 9,
          hunks: [
            {
              header: "@@ -528,9 +528,0 @@",
              lines: [
                { type: "del", text: ".diff-file {" },
                { type: "del", text: "  border: 1px solid var(--ds-border-subtle);" },
                { type: "del", text: "}" },
              ],
            },
          ],
        },
        {
          tool: "Edit",
          path: "apps/desktop/src/styles/messages.css",
          operation: "edit",
          status: "modified",
          state: "rolledBack",
          additions: 3,
          deletions: 2,
          hunks: [
            {
              header: "@@ -269,4 +269,5 @@",
              lines: [
                { type: "context", text: ".review-change-card {" },
                { type: "del", text: "  border-radius: var(--radius-md);" },
                { type: "add", text: "  margin: 0 0 2px 24px;" },
              ],
            },
          ],
        },
      ];
      const messages = samples.slice(0, Math.min(count, samples.length)).flatMap(
        (sample, i) => [
          {
            id: `capture-review-user-${i}`,
            role: "user" as const,
            content:
              i === 0 ? "把审阅面板里每条改动的样式简化一下" : `继续第 ${i + 1} 处`,
            createdAt: new Date(base + i * 120_000).toISOString(),
            status: "complete" as const,
          },
          {
            id: `capture-review-${i}`,
            role: "tool" as const,
            content: "",
            createdAt: new Date(base + i * 120_000 + 30_000).toISOString(),
            toolName: sample.tool,
            toolStatus: "success" as const,
            toolArgs: { path: sample.path },
            toolResult: {
              details: {
                root: "workspace",
                review: {
                  version: 1,
                  snapshotId: `capture-snapshot-${i}`,
                  messageId: `capture-review-${i}`,
                  path: sample.path,
                  operation: sample.operation,
                  status: sample.status,
                  state: sample.state,
                  additions: sample.additions,
                  deletions: sample.deletions,
                  hunks: sample.hunks,
                  reversible: true,
                },
              },
            },
          },
        ],
      );
      useAppStore.setState({ messages: messages as any });
    },
    seedRunRows: (count = 3) => {
      // Capture-only run-row fixture (D226/D227 head scenes). A Bash tool
      // message per state: a command that exits 1 while its call reports
      // success — the case the head must not read as done (D227) — a success
      // with output, and one still running; count 0 restores the empty
      // transcript.
      if (!window.__PI_CAPTURE__) return;
      if (count <= 0) {
        useAppStore.setState({ messages: [] });
        return;
      }
      const base = Date.parse("2026-08-14T09:00:00Z");
      const samples = [
        {
          command: "pnpm test",
          status: "success" as const,
          details: {
            exitCode: 1,
            stdout: "desktop test 648 tests\n",
            stderr: "1 failing: run head keeps its caret\n",
          },
        },
        {
          command: "git log --oneline -6",
          status: "success" as const,
          details: {
            exitCode: 0,
            stdout: [
              "78cc1f3 test(desktop): photograph the panel's empty state",
              "df88040 docs(spec): record the no-resource empty state",
              "f81fb94 fix(desktop): give the work panel a real empty state",
              "6c8b2f0 feat(work-panel): toggle work panel visibility",
              "8f09cf9 refactor(desktop): flatten review change rows",
              "e408d88 fix(desktop): keep macOS in the Dock and Cmd+Tab",
            ].join("\n"),
            stderr: "",
          },
        },
        {
          command: "pnpm --filter @pi-desktop/desktop build",
          status: "running" as const,
          details: undefined,
        },
      ];
      const messages = samples.slice(0, Math.min(count, samples.length)).flatMap(
        (sample, i) => [
          {
            id: `capture-run-user-${i}`,
            role: "user" as const,
            content: i === 0 ? "跑一下测试" : `再跑 ${sample.command}`,
            createdAt: new Date(base + i * 120_000).toISOString(),
            status: "complete" as const,
          },
          {
            id: `capture-run-${i}`,
            role: "tool" as const,
            content: "",
            createdAt: new Date(base + i * 120_000 + 30_000).toISOString(),
            toolName: "Bash",
            toolStatus: sample.status,
            toolArgs: { command: sample.command },
            ...(sample.details ? { toolResult: { details: sample.details } } : {}),
          },
        ],
      );
      useAppStore.setState({ messages: messages as any });
    },
    seedDelegationRows: (count = 3) => {
      // Capture-only delegation fixture. One `Task` and a two-`Task` fan-out
      // in the same transcript, so the scene shows that a lone delegation now
      // gets the same card as a fan-out; count 0 restores the empty
      // transcript.
      if (!window.__PI_CAPTURE__) return;
      if (count <= 0) {
        useAppStore.setState({ messages: [] });
        return;
      }
      const base = Date.parse("2026-08-14T09:00:00Z");
      const delegation = (
        index: number,
        agent: string,
        description: string,
        status: string,
        runtimeMs: number,
      ) => ({
        id: `capture-task-${index}`,
        role: "tool" as const,
        content: "",
        createdAt: new Date(base + index * 60_000).toISOString(),
        toolName: "Task",
        toolCallId: `capture-call-${index}`,
        toolStatus: status === "running" ? "running" : "success",
        toolArgs: { agent, description, task: description },
        toolResult: {
          details: {
            delegationId: `capture-delegation-${index}`,
            status,
            // A running node ticks from `startedAt`, so a fixed fixture start
            // would render the days since the fixture date. Settled nodes take
            // their runtime from the pair.
            ...(status === "running"
              ? {}
              : {
                  startedAt: base + index * 60_000,
                  completedAt: base + index * 60_000 + runtimeMs,
                }),
            turns: 4,
            toolCalls: 9,
          },
        },
      });
      const delegateRow = (index: number, agent: string, path: string) => ({
        id: `capture-task-${index}-step`,
        role: "tool" as const,
        content: "",
        createdAt: new Date(base + index * 60_000 + 5_000).toISOString(),
        toolName: "Read",
        toolCallId: `capture-call-${index}-step`,
        toolStatus: "success" as const,
        toolArgs: { file_path: path },
        parentToolCallId: `capture-call-${index}`,
        agentName: agent,
      });
      const messages = [
        {
          id: "capture-task-user-0",
          role: "user" as const,
          content: "帮我审一下 store 的改动",
          createdAt: new Date(base - 30_000).toISOString(),
          status: "complete" as const,
        },
        delegation(0, "code-reviewer", "check the store diff", "completed", 32_000),
        delegateRow(0, "code-reviewer", "apps/desktop/src/stores/app-store.ts"),
        {
          id: "capture-task-answer-0",
          role: "assistant" as const,
          content: "审阅完成：队列按 id 丢弃请求，没有发现回归。",
          createdAt: new Date(base + 40_000).toISOString(),
          status: "complete" as const,
        },
        {
          id: "capture-task-user-1",
          role: "user" as const,
          content: "再并行看下 runtime 和 shared",
          createdAt: new Date(base + 55_000).toISOString(),
          status: "complete" as const,
        },
        delegation(1, "code-reviewer", "audit agent-runtime", "completed", 48_000),
        delegateRow(1, "code-reviewer", "packages/agent-runtime/src/runtime.ts"),
        delegation(2, "explorer", "map the shared protocol", "running", 0),
      ];
      useAppStore.setState({ messages: messages as any });
    },
    seedPlugins: (count = 5) => {
      // Capture-only plugins fixture (plugins index scenes); count 0 clears.
      // The set mirrors pages-d/plugins/fragment.html: one plugin per row group
      // (attention, update, active ×2, turned off) and a 24-entry catalog.
      if (!window.__PI_CAPTURE__) return;
      if (count <= 0) {
        useAppStore.setState({ plugins: [], refreshPlugins: originalRefreshPlugins });
        (api as any).listPluginServices = originalListPluginServices;
        (api as any).marketSearch = originalMarketSearch;
        (api as any).marketGetDetail = originalMarketDetail;
        return;
      }
      (api as any).marketGetDetail = async (id: string) => ({
        plugin: {
          id,
          name: "Git Insights",
          description: "Summarizes repository activity into a review panel.",
          author: "Pi Labs",
          latestVersion: "1.5.0",
          downloads: 12840,
          updatedAt: "2026-08-21T09:00:00.000Z",
          categories: ["productivity"],
          permissionSummary: ["fs.read", "fs.write", "ui.panel", "notify"],
          permissions: ["fs.read", "fs.write", "ui.panel", "notify"],
          verified: true,
          trust: "verified",
          installed: true,
          installedVersion: "1.4.2",
          updateAvailable: true,
          installable: true,
          homepage: "https://example.invalid/git-insights",
          repository: "https://github.com/example/git-insights",
          safetyNotes: "Writes only under docs/ and Markdown files in the workspace.",
          readmeMarkdown: "# Git Insights\n\nA review panel for repository activity.",
          versions: [
            {
              version: "1.5.0",
              publishedAt: "2026-08-21T09:00:00.000Z",
              changelog: "Adds a per-author heatmap.",
              shasum: "capture",
              url: "https://example.invalid/git-insights-1.5.0.piplug",
              size: 48210,
            },
            {
              version: "1.4.2",
              publishedAt: "2026-07-02T09:00:00.000Z",
              changelog: "Fixes a stale cache after branch switches.",
              shasum: "capture",
              url: "https://example.invalid/git-insights-1.4.2.piplug",
              size: 47100,
            },
          ],
        },
      });
      // The marketplace tab searches the catalog over IPC, which is offline
      // in the capture rig; stand in with the catalog from fragment-market.html.
      const catalog: Array<[string, string, string, string]> = [
        ["frappe-erpnext-connector", "CoaleTech", "Bridge Frappe DocTypes to Claude Code tools — read, create, and submit documents via natural language.", "database"],
        ["server-postgres", "@modelcontextprotocol", "Run SQL queries and inspect database schemas directly in Claude conversations.", "database"],
        ["server-filesystem", "@modelcontextprotocol", "Secure file read/write with configurable root paths. Supports recursive listing.", "files"],
        ["server-brave-search", "@modelcontextprotocol", "Web and local search using the Brave Search API. Privacy-preserving results.", "web"],
        ["server-github", "@modelcontextprotocol", "Manage repos, issues, PRs, and code search on GitHub.", "dev-tools"],
        ["server-memory", "@modelcontextprotocol", "Knowledge graph for persisting entities and relations across conversations.", "database"],
        ["server-puppeteer", "@modelcontextprotocol", "Browser automation and web scraping with Puppeteer.", "web"],
        ["server-sqlite", "@modelcontextprotocol", "SQLite database operations — query, insert, and schema inspection.", "database"],
        ["etims-mcp-server", "KRA Kenya", "eTIMS compliance tools — submit receipts, check OSCU status, and validate VAT invoices.", "security"],
        ["server-slack", "@modelcontextprotocol", "Read channels and post messages to a Slack workspace.", "communication"],
        ["server-gitlab", "@modelcontextprotocol", "Projects, merge requests and pipelines on GitLab.", "dev-tools"],
        ["server-google-drive", "@modelcontextprotocol", "Search and read files from Google Drive.", "files"],
        ["server-fetch", "@modelcontextprotocol", "Fetch web pages and convert them to Markdown for the model.", "web"],
        ["server-time", "@modelcontextprotocol", "Time and timezone conversion helpers.", "utilities"],
        ["server-sentry", "@modelcontextprotocol", "Inspect Sentry issues and stack traces.", "dev-tools"],
        ["server-redis", "@modelcontextprotocol", "Read and write Redis keys and inspect streams.", "database"],
        ["server-everything", "@modelcontextprotocol", "Reference server exercising every MCP feature.", "dev-tools"],
        ["server-sequential-thinking", "@modelcontextprotocol", "Structured step-by-step reasoning tool.", "utilities"],
        ["mpesa-daraja-mcp", "CoaleTech", "M-Pesa Daraja STK push, C2B and transaction status lookups.", "finance"],
        ["frappe-print-designer", "CoaleTech", "Design and preview Frappe print formats from chat.", "productivity"],
        ["git-commit-helper", "CoaleTech", "Drafts conventional commit messages from the staged diff.", "dev-tools"],
        ["csv-importer", "CoaleTech", "Maps CSV columns to DocType fields and runs Data Import.", "data"],
        ["slack-notify", "CoaleTech", "Posts session summaries to a Slack channel.", "communication"],
        ["kra-pin-checker", "KRA Kenya", "Validates KRA PINs against the iTax lookup service.", "security"],
      ];
      api.marketSearch = async () => ({
        plugins: catalog.map(([name, author, description, category], index) => ({
          id: `market.${name}`,
          name,
          description,
          author,
          latestVersion: "1.0.0",
          downloads: 24_000 - index * 830,
          updatedAt: "2026-10-01T09:00:00.000Z",
          categories: [category],
          permissionSummary: ["net.fetch"],
          trust: author === "@modelcontextprotocol" ? "verified" : "community",
          verified: author === "@modelcontextprotocol",
          installed: index === 0,
          installedVersion: index === 0 ? "1.8.2" : undefined,
          installable: true,
        })),
        providerId: "npm",
        sourceUrl: "",
      });
      // The rows read service state straight from IPC, which reports nothing
      // for a fixture plugin; stand in for the supervisor here.
      api.listPluginServices = async () => [
        {
          pluginId: "ke.kra.etims-reporter",
          serviceId: "etims-sync",
          label: "etims-sync",
          state: "running",
          restarts: 0,
          updatedAt: Date.now(),
        },
      ];
      const npm = { providerId: "npm" };
      const samples: PluginSummary[] = [
        {
          id: "frappe.erpnext-connector",
          name: "frappe-erpnext-connector",
          version: "1.8.2",
          enabled: true,
          source: "marketplace",
          marketplace: npm,
          status: "load_error",
          errorMessage:
            "Permission denied\n`exec_shell` permission was denied. Update to v2.0.0+ or remove the grant in **Settings › Extensions › Permission Grants**.",
          permissions: ["exec_shell", "net.fetch"],
          capabilities: ["tools", "mcp"],
          author: "CoaleTech",
          description: "Bridge Frappe DocTypes to Claude Code tools.",
        },
        {
          id: "com.coaletech.git-commit",
          name: "git-commit-helper",
          version: "1.2.0",
          enabled: true,
          source: "marketplace",
          marketplace: npm,
          status: "ready",
          permissions: ["fs.read"],
          capabilities: ["commands"],
          author: "CoaleTech",
          description: "Drafts conventional commit messages from the staged diff.",
          updateAvailable: {
            version: "1.3.1",
            shasum: "capture",
            url: "https://example.invalid/git-commit-helper-1.3.1.tgz",
            permissionDiff: ["fs.write", "process.spawn", "notify"],
          },
        },
        {
          id: "ke.kra.etims-reporter",
          name: "kra-etims-reporter",
          version: "2.1.0",
          enabled: true,
          source: "builtin",
          bundled: true,
          status: "ready",
          permissions: ["net:outbound", "fs:read", "exec_process", "ui.panel", "notify"],
          fs: { read: { scope: ["~/ERPNext/coale_v16/sites/"] } },
          capabilities: ["tools", "services"],
          author: "CoaleTech",
          description: "Files eTIMS sales reports with KRA from the bench.",
        },
        {
          id: "com.coaletech.csv-importer",
          name: "csv-importer",
          version: "1.0.4",
          enabled: true,
          source: "marketplace",
          marketplace: npm,
          status: "ready",
          permissions: ["fs.read"],
          capabilities: ["commands"],
          author: "CoaleTech",
          description: "Maps CSV columns to DocType fields and runs Data Import.",
        },
        {
          id: "com.coaletech.slack-notify",
          name: "slack-notify",
          version: "0.9.1",
          enabled: false,
          source: "marketplace",
          marketplace: npm,
          status: "disabled",
          permissions: ["net.fetch"],
          author: "CoaleTech",
          description: "Posts session summaries to a Slack channel.",
        },
      ];
      // The page refreshes the installed list on mount; keep the fixture in place.
      useAppStore.setState({ plugins: samples.slice(0, count), refreshPlugins: async () => undefined });
    },
    seedExtensions: (count = 3) => {
      // Capture-only fixture for the Settings > Agent capability pages. Those
      // pages read
      // straight from IPC into local state rather than the store, so the rig
      // has to stand in for the host rather than seed a slice; count 0 puts
      // the real calls back.
      if (!window.__PI_CAPTURE__) return;
      if (count <= 0) {
        (api as any).listMcpServers = originalListMcpServers;
        (api as any).listUserSkills = originalListUserSkills;
        (api as any).listProjects = originalListProjects;
        return;
      }
      const projects: ProjectRecord[] = [
        {
          id: 1,
          path: "/Users/pi/work/api",
          name: "api",
          pinned: true,
          createdAt: 0,
          lastOpenedAt: 0,
        },
        {
          id: 2,
          path: "/Users/pi/work/web",
          name: "web",
          pinned: false,
          createdAt: 0,
          lastOpenedAt: 0,
        },
        {
          id: 3,
          path: "/Users/pi/personal/site",
          name: "site",
          pinned: false,
          createdAt: 0,
          lastOpenedAt: 0,
        },
      ];
      // One server per connection state, so the row glyph's whole colour range
      // is exercised, and one per activation state.
      const stamp = "2026-08-04T09:00:00.000Z";
      const servers: McpServerRecord[] = (
        [
        {
          id: "context7",
          label: "Context7",
          level: "global",
          description: "Up-to-date library documentation.",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@upstash/context7-mcp"],
          env: {},
          enabled: true,
          scope: { mode: "global", projects: [] },
        },
        {
          id: "linear",
          label: "Linear",
          level: "global",
          description: "Issues and cycles for the work tracker.",
          transport: "http",
          url: "https://mcp.linear.app/sse",
          headers: { Authorization: "Bearer •••" },
          enabled: true,
          scope: { mode: "projects", projects: ["/Users/pi/work/api"] },
        },
        {
          id: "postgres",
          label: "Postgres",
          level: "project",
          projectPath: "/Users/pi/work/api",
          description: "Runs read-only queries against the dev database.",
          transport: "stdio",
          command: "mcp-server-postgres",
          args: ["postgresql://localhost/dev"],
          env: {},
          enabled: true,
          scope: { mode: "projects", projects: [] },
        },
        {
          id: "figma",
          label: "Figma",
          level: "project",
          projectPath: "/Users/pi/work/api",
          description: "Reads frames and design tokens from a file.",
          transport: "stdio",
          command: "figma-mcp",
          args: [],
          env: {},
          enabled: false,
          scope: { mode: "global", projects: [] },
        },
        ] as Array<Omit<McpServerRecord, "createdAt" | "updatedAt">>
      ).map((server) => ({ ...server, createdAt: stamp, updatedAt: stamp }));
      const statuses: McpServerStatus[] = [
        {
          serverId: "context7",
          state: "ready",
          toolCount: 2,
          toolNames: ["resolve-library-id", "get-library-docs"],
          updatedAt: 0,
        },
        { serverId: "linear", state: "connecting", toolCount: 0, updatedAt: 0 },
        {
          serverId: "postgres",
          state: "failed",
          toolCount: 0,
          message: "spawn mcp-server-postgres ENOENT",
          updatedAt: 0,
        },
        { serverId: "figma", state: "idle", toolCount: 0, updatedAt: 0 },
      ];
      const skills: UserSkillRecord[] = [
        {
          id: "release-notes",
          name: "Release Notes",
          level: "global",
          description:
            "Turn a range of commits into release notes grouped by user-visible change.",
          enabled: true,
          scope: { mode: "global", projects: [] },
          source: "created",
          path: "/Users/pi/.agents/skills/release-notes/SKILL.md",
          sizeBytes: 2_412,
          createdAt: "2026-07-30T10:00:00.000Z",
          updatedAt: "2026-08-04T09:12:00.000Z",
        },
        {
          id: "api-review",
          name: "API Review",
          level: "project",
          projectPath: "/Users/pi/work/api",
          description:
            "Check a handler against the house rules for pagination, errors, and auth.",
          enabled: true,
          scope: { mode: "projects", projects: ["/Users/pi/work/api"] },
          source: "created",
          path: "/Users/pi/.agents/skills/api-review/SKILL.md",
          sizeBytes: 7_940,
          createdAt: "2026-07-12T10:00:00.000Z",
          updatedAt: "2026-08-01T16:30:00.000Z",
        },
        {
          id: "incident-writeup",
          name: "Incident Writeup",
          level: "global",
          description: "Draft a blameless postmortem from a timeline of events.",
          enabled: false,
          scope: { mode: "global", projects: [] },
          source: "imported",
          path: "/Users/pi/.agents/skills/incident-writeup/SKILL.md",
          sizeBytes: 118_400,
          createdAt: "2026-06-02T10:00:00.000Z",
          updatedAt: "2026-06-02T10:00:00.000Z",
        },
      ];
      const rowsForQuery = <T extends { level?: string; projectPath?: string }>(
        rows: readonly T[],
        query: { level?: string; projectPath?: string } = {},
      ) =>
        rows.filter(
          (row) =>
            (!query.level || row.level === query.level) &&
            (!query.projectPath || !row.projectPath || row.projectPath === query.projectPath),
        );
      (api as any).listProjects = async () => ({ projects });
      (api as any).listMcpServers = async (query: { level?: string; projectPath?: string } = {}) => {
        const filtered = rowsForQuery(servers, query);
        return {
          servers: filtered,
          statuses: statuses.filter((status) => filtered.some((server) => server.id === status.serverId)),
        };
      };
      (api as any).listUserSkills = async (query: { level?: string; projectPath?: string } = {}) => ({
        skills: rowsForQuery(skills, query).slice(0, count),
      });
    },
    seedPluginThemes: (count = 2) => {
      // Capture-only theme fixture: plugin themes share the built-in grid on
      // the general settings page, so the rig needs some to render.
      if (!window.__PI_CAPTURE__) return;
      if (count <= 0) {
        useAppStore.setState({ pluginThemes: [] });
        return;
      }
      const samples: PluginTheme[] = [
        {
          id: "plugin:pi.markdown-tools:midnight",
          pluginId: "pi.markdown-tools",
          themeId: "midnight",
          label: "Midnight",
          base: "dark",
          css: "",
        },
        {
          id: "plugin:pi.markdown-tools:parchment",
          pluginId: "pi.markdown-tools",
          themeId: "parchment",
          label: "Parchment",
          base: "light",
          css: "",
        },
      ];
      useAppStore.setState({ pluginThemes: samples.slice(0, count) });
    },
    seedNotifications: (count = 105) => {
      // Capture-only notification fixture; count 0 restores an empty inbox.
      if (!window.__PI_CAPTURE__) return;
      if (count <= 0) {
        useAppStore.setState({
          notifications: [],
          unreadNotificationCount: 0,
          refreshNotifications: originalRefreshNotifications,
        });
        return;
      }
      const now = Date.now();
      const yesterdayAt = (hours: number, minutes: number) => {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        d.setHours(hours, minutes, 0, 0);
        return d.toISOString();
      };
      // Reference design: 7 notifications (5 today, 2 yesterday); 3 unread (indices 0,1,2).
      const entries = [
        { kind: "task.completed" as AppNotificationKind, sessionTitle: "Daily ERPNext Digest",
          body: "Session finished in 12 s · coale_v16 bench",
          createdAt: new Date(now - 10_000).toISOString(), readAt: null },
        { kind: "task.failed" as AppNotificationKind, sessionTitle: "Stock Reconciliation Snapshot",
          body: "Error: EACCES permission denied at /tmp/stock-snapshot · exit code 1",
          createdAt: new Date(now - 120_000).toISOString(), readAt: null },
        { kind: "task.completed" as AppNotificationKind, sessionTitle: "Hourly CI Health Check",
          body: "All test suites passing · frappe, erpnext, hrms, raven",
          createdAt: new Date(now - 3_480_000).toISOString(), readAt: null },
        { kind: "task.completed" as AppNotificationKind, sessionTitle: "Hourly CI Health Check",
          body: "All test suites passing",
          createdAt: new Date(now - 7_200_000).toISOString(), readAt: new Date(now - 3_600_000).toISOString() },
        { kind: "task.completed" as AppNotificationKind, sessionTitle: "Daily ERPNext Digest",
          body: "Session finished in 9 s · coale_v16 bench",
          createdAt: new Date(now - 28_800_000).toISOString(), readAt: new Date(now - 7_200_000).toISOString() },
        { kind: "task.failed" as AppNotificationKind, sessionTitle: "Weekly HRMS Payroll Review",
          body: "Error: Connection refused to hrms-bench MySQL · timeout after 30 s",
          createdAt: yesterdayAt(7, 30), readAt: new Date(now - 3_600_000).toISOString() },
        { kind: "task.completed" as AppNotificationKind, sessionTitle: "Daily ERPNext Digest",
          body: "Session finished in 14 s · coale_v16 bench",
          createdAt: yesterdayAt(8, 0), readAt: new Date(now - 3_600_000).toISOString() },
      ];
      const notifications = entries.slice(0, Math.min(count, 7)).map((e, i) => ({
        id: `capture-notification-${i}`,
        kind: e.kind,
        sessionId: `capture-session-${i}`,
        sessionTitle: e.sessionTitle,
        turnId: `capture-turn-${i}`,
        body: e.body,
        createdAt: e.createdAt,
        readAt: e.readAt,
      }));
      useAppStore.setState({
        notifications,
        unreadNotificationCount: notifications.filter((n) => !n.readAt).length,
        refreshNotifications: async () => undefined,
      });
    },
    seedKanbanBoard: (count = 1) => {
      if (!window.__PI_CAPTURE__) return;
      const approvalSession = "capture-kanban-e5a7";
      const withoutApproval = () => {
        const { [approvalSession]: _seeded, ...rest } = useAppStore.getState().pendingPermissions;
        return rest;
      };
      if (count <= 0) {
        api.kanbanList = originalKanbanList;
        useAppStore.setState({ pendingPermissions: withoutApproval() });
        return;
      }
      // pages-d/kanban/fragment.html board; count=2 adds the drawer's T_7E42 → T_3D5E link
      // (fragment-drawer.html), which the board fragment does not draw as a progress chip.
      const now = Date.now();
      const m = 60_000;
      const h = 60 * m;
      const d = 24 * h;
      const id = (hex: string) => `${hex}e0a1-7c2b-4d10-9a00-${hex}0000000`;
      const root = "/Users/mac/ERPNext/coale_v16";
      const app = (name: string) => `${root}/apps/${name}`;
      const task = (hex: string, over: Partial<KanbanTask> & Pick<KanbanTask, "title" | "status" | "createdAt">): KanbanTask => ({
        id: id(hex), body: "", priority: 0, createdBy: "user", projectPath: root,
        archived: false, consecutiveFailures: 0, ...over,
      });
      const tasks: KanbanTask[] = [
        task("2a1f", { title: "Implement purchase order auto-approval workflow", status: "triage", createdAt: now - 2 * h - 5 * m }),
        task("8c3d", { title: "Fix payroll slips missing employee cost center", status: "triage", priority: 1, createdBy: "agent", projectPath: app("hrms"), createdAt: now - 5 * h - 5 * m }),
        task("f01b", { title: "Review custom DocType print format template", status: "triage", projectPath: app("frappe"), createdAt: now - d - 2 * h }),
        task("9e7c", { title: "Add custom fields to Sales Invoice for KRA tax breakdown", status: "todo", priority: 2, projectPath: app("erpnext"), createdAt: now - 3 * h - 5 * m }),
        task("3d5e", { title: "Migrate customer records to new account structure", status: "todo", createdAt: now - 6 * h - 5 * m }),
        task("a4b1", { title: "Configure leave policy for operations department", status: "todo", projectPath: app("hrms"), createdAt: now - d - 3 * h }),
        task("c7d2", { title: "Set up Raven channel for finance team notifications", status: "todo", projectPath: app("raven"), createdAt: now - 2 * d - 2 * h }),
        task("b2e9", { title: "Write test suite for Stock Reconciliation controller", status: "ready", priority: 1, projectPath: app("erpnext"), createdAt: now - h - 5 * m }),
        task("d8f3", { title: "Refactor purchase requisition approval hooks", status: "ready", createdAt: now - 4 * h - 5 * m }),
        task("e5a7", { title: "Generate payroll for April 2026 — all employees", status: "running", createdBy: "agent", projectPath: app("hrms"), sessionId: approvalSession, createdAt: now - 12 * m - 20_000, startedAt: now - 10 * m }),
        task("f9b4", { title: "Add KRA eTIMS integration for stock entries", status: "running", priority: 1, sessionId: "capture-kanban-f9b4", createdAt: now - 38 * m - 20_000, startedAt: now - 30 * m }),
        task("1c6d", { title: "Fix warehouse bin valuation on negative stock", status: "blocked", createdBy: "agent", projectPath: app("erpnext"), blockKind: "gave_up", blockReason: "Gave up after 3 failed runs.", consecutiveFailures: 3, createdAt: now - 2 * h - 5 * m }),
        task("7e42", {
          title: "Fix Customer Ledger Summary report date filter",
          status: "done",
          sessionId: "capture-kanban-7e42",
          body: "The date filter on the **Customer Ledger Summary** report was ignoring the `from_date` parameter when the posting date field was null. Added a `COALESCE` fallback in the report query.\n\nAll test records verified in coale_v16 bench.",
          result: "Report now correctly filters entries by date range. Verified against 2025 Q4 ledger data — 847 rows returned (was 0 with date filter applied).",
          createdAt: now - 3 * h - 5 * m,
          startedAt: now - 3 * h - 4 * m,
          completedAt: now - 3 * h,
        }),
        task("0a3b", { title: "Install HRMS attendance integration hooks", status: "done", projectPath: app("hrms"), createdAt: now - d - 4 * h, completedAt: now - d }),
        task("5f2c", { title: "Patch stock ledger entry for backdated corrections", status: "done", createdBy: "agent", projectPath: app("erpnext"), createdAt: now - 2 * d - 3 * h, completedAt: now - 2 * d }),
        task("6b10", { title: "Map attendance device IDs to employees", status: "done", projectPath: app("hrms"), createdAt: now - 3 * d, completedAt: now - 3 * d + h }),
        task("6b11", { title: "Add shift-type check-in grace window", status: "done", projectPath: app("hrms"), createdAt: now - 3 * d - h, completedAt: now - 3 * d + 2 * h }),
        task("6b12", { title: "Sync biometric logs every 15 minutes", status: "done", createdBy: "agent", projectPath: app("hrms"), createdAt: now - 3 * d - 2 * h, completedAt: now - 3 * d + 3 * h }),
        task("6b13", { title: "Backfill attendance for March", status: "done", projectPath: app("hrms"), createdAt: now - 3 * d - 3 * h, completedAt: now - 3 * d + 4 * h }),
        task("4c20", { title: "Split customer master by territory", status: "done", createdAt: now - 4 * d, completedAt: now - 4 * d + h }),
      ];
      const link = (parent: string, child: string) => ({ parentId: id(parent), childId: id(child) });
      const links = [
        link("0a3b", "6b10"), link("0a3b", "6b11"), link("0a3b", "6b12"), link("0a3b", "6b13"),
        link("3d5e", "4c20"), link("3d5e", "5f2c"), link("3d5e", "a4b1"), link("3d5e", "c7d2"),
        ...(count >= 2 ? [link("7e42", "3d5e")] : []),
      ];
      const comment = (hex: string, n: number, author: string, body: string, ago: number) => ({
        id: `kc-${hex}-${n}`, taskId: id(hex), author, body, createdAt: now - ago,
      });
      const board: KanbanBoard = {
        tasks,
        links,
        comments: [
          comment("3d5e", 1, "mac", "Old account heads exported to CSV.", 5 * h),
          comment("3d5e", 2, "agent", "Territory split is done; mapping party accounts next.", 4 * h),
          comment("3d5e", 3, "mac", "Keep the legacy heads disabled, not deleted.", 2 * h),
          comment("1c6d", 1, "agent", "Valuation goes negative before the repost job runs.", 2 * h),
        ],
        runs: [
          { id: "kr-7e42-0", taskId: id("7e42"), sessionId: "capture-kanban-7e42-0", status: "crashed", error: "Worker exited before claiming the card.", startedAt: now - 5 * h, endedAt: now - 5 * h + 20_000, nudgeCount: 0 },
          { id: "kr-7e42-1", taskId: id("7e42"), sessionId: "capture-kanban-7e42-a", status: "done", summary: "Initial investigation — reproduced the filter bug.", startedAt: now - 4 * h - m, endedAt: now - 4 * h, nudgeCount: 0 },
          { id: "kr-7e42-2", taskId: id("7e42"), sessionId: "capture-kanban-7e42", status: "done", summary: "Added COALESCE fallback; updated report query; committed changes.", startedAt: now - 3 * h - 4 * m, endedAt: now - 3 * h, nudgeCount: 0 },
          { id: "kr-e5a7-1", taskId: id("e5a7"), sessionId: approvalSession, status: "running", startedAt: now - 10 * m, nudgeCount: 0 },
          { id: "kr-f9b4-1", taskId: id("f9b4"), sessionId: "capture-kanban-f9b4", status: "running", startedAt: now - 30 * m, nudgeCount: 0 },
        ],
        events: [
          { id: "ke-7e42-1", taskId: id("7e42"), kind: "moved", payload: { from: "ready", to: "running" }, ts: now - 4 * h - 2 * m },
          { id: "ke-7e42-2", taskId: id("7e42"), kind: "claimed", ts: now - 3 * h - 4 * m },
          { id: "ke-7e42-3", taskId: id("7e42"), kind: "moved", payload: { from: "running", to: "done" }, ts: now - 3 * h },
        ],
        dailyStats: [{ date: new Date(now).toISOString().slice(0, 10), spawned: 2 }],
      };
      api.kanbanList = async () => ({ board, paused: false });
      // The running payroll card waits on a tool approval (fragment.html:365).
      useAppStore.setState({
        pendingPermissions: {
          ...withoutApproval(),
          [approvalSession]: [{
            requestId: "capture-kanban-perm-1",
            sessionId: approvalSession,
            toolCallId: "capture-kanban-tool-1",
            toolName: "bash",
            argsPreview: { command: "bench --site coale_v16 execute hrms.payroll.run" },
            risk: "high",
            reason: "Runs payroll for every employee.",
            receivedAt: now - 2 * m,
          }],
        },
      });
    },
    seedScheduledTasks: (count = 1) => {
      if (!window.__PI_CAPTURE__) return;
      if (count <= 0) {
        api.listScheduled = originalListScheduled;
        api.listScheduledRuns = originalListScheduledRuns;
        return;
      }
      const now = new Date().toISOString();
      /** Local wall-clock time `dayOffset` days from today. */
      const at = (dayOffset: number, hour: number, minute: number) => {
        const d = new Date();
        d.setDate(d.getDate() + dayOffset);
        d.setHours(hour, minute, 0, 0);
        return d;
      };
      const next = (hour: number, minute: number) => {
        const today = at(0, hour, minute);
        return (today.getTime() > Date.now() ? today : at(1, hour, minute)).toISOString();
      };
      const nextHour = new Date();
      nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
      const daysToMonday = ((7 - ((new Date().getDay() + 6) % 7)) % 7) || 7;
      const bench = "/Users/mac/ERPNext/frappe-bench";
      const tasks: ScheduledTask[] = [
        { id: "st-1", title: "Daily ERPNext Digest", prompt: "Summarise all outstanding Sales Orders, Purchase Orders, and Stock movements from the last 24 h. List top 5 overdue items.", cadence: "daily", mode: "agent", enabled: true, createdAt: now, updatedAt: now, schedule: { hour: 8, minute: 0, weekday: 0, weekdays: [0, 1, 2, 3, 4] }, nextRunAt: next(8, 0), workspacePath: bench, modelId: "claude-sonnet-4-6" },
        { id: "st-2", title: "Hourly CI Health Check", prompt: "Check frappe-bench CI status across all apps. Alert if any test suite has been failing for 2+ runs.", cadence: "hourly", mode: "agent", enabled: true, createdAt: now, updatedAt: now, schedule: { hour: 0, minute: 0, weekday: 0 }, nextRunAt: nextHour.toISOString(), workspacePath: bench, modelId: "claude-sonnet-4-6" },
        { id: "st-3", title: "Weekly HRMS Payroll Review", prompt: "Review pending payroll entries in HRMS. Flag employees with missing attendance or salary revision approvals.", cadence: "weekly", mode: "agent", enabled: true, createdAt: now, updatedAt: now, schedule: { hour: 7, minute: 30, weekday: 0, weekdays: [0] }, nextRunAt: at(daysToMonday, 7, 30).toISOString(), workspacePath: "/Users/mac/ERPNext/hrms-bench", modelId: "claude-sonnet-4-6" },
        { id: "st-4", title: "Stock Reconciliation Snapshot", prompt: "Take a full stock reconciliation snapshot across all warehouses and export as CSV to /tmp/stock-snapshot.", cadence: "cron", mode: "agent", enabled: true, createdAt: now, updatedAt: now, schedule: { hour: 2, minute: 0, weekday: 0 }, nextRunAt: at(1, 2, 0).toISOString(), workspacePath: bench, modelId: "claude-sonnet-4-6" },
        { id: "st-5", title: "Monthly Accounts Ageing", prompt: "Generate accounts receivable ageing report for month-end and post summary to Raven #finance channel.", cadence: "monthly", mode: "agent", enabled: false, createdAt: now, updatedAt: now, schedule: { hour: 9, minute: 0, weekday: 0 }, workspacePath: bench, modelId: "claude-sonnet-4-6" },
      ];
      // health is computed at call-time (not seed-time) so lastTickAt stays within 90s window
      const run = (id: string, taskId: string, start: Date, seconds: number | null, status: ScheduledTaskRun["status"] = "completed"): ScheduledTaskRun => ({
        id, taskId, sessionId: `sess-${id}`, status, errorCode: status === "error" ? "PROVIDER_TIMEOUT" : null,
        startedAt: start.toISOString(),
        endedAt: seconds === null ? null : new Date(start.getTime() + seconds * 1000).toISOString(),
      });
      // 24 runs: the live digest, three finished digests, the failed snapshot,
      // one payroll review and an hourly CI history filling the rest.
      const runs: ScheduledTaskRun[] = [
        run("sr-live", "st-1", new Date(Date.now() - 120_000), null, "running"),
        run("sr-d1", "st-1", at(0, 8, 0), 12),
        run("sr-d2", "st-1", at(-1, 8, 0), 9),
        run("sr-d3", "st-1", at(-3, 8, 0), 14),
        run("sr-s1", "st-4", at(-1, 2, 0), 20, "error"),
        run("sr-p1", "st-3", at(-((new Date().getDay() + 6) % 7) || -7, 7, 30), 41),
        ...Array.from({ length: 18 }, (_, i) => run(`sr-ci${i + 1}`, "st-2", new Date(nextHour.getTime() - (i + 1) * 3_600_000), 30 + (i % 5) * 7, i === 4 ? "aborted" : "completed")),
      ].sort((a, b) => (b.startedAt > a.startedAt ? 1 : -1));
      api.listScheduled = async () => ({ tasks, health: { lastTickAt: Date.now() - 28_000, lastError: undefined, hostAvailable: true } });
      api.listScheduledRuns = async () => ({ runs });
    },
    seedPullRequests: (count = 1) => {
      if (!window.__PI_CAPTURE__) return;
      if (count <= 0) {
        api.listPullRequests = originalListPullRequests;
        return;
      }
      // Always set workspace so PR page shows "CoaleTech/frappe-agent" in header.
      // The path's last 2 components are displayed: slice(-2) → "CoaleTech/frappe-agent".
      useAppStore.setState({
        workspace: { path: "/Users/mac/CoaleTech/frappe-agent", name: "frappe-agent", branch: "main" },
      });
      const p247checks: PullRequestCheck[] = [
        { name: "frappe-tests", state: "success", durationSeconds: 82, details: "142 passed" },
        { name: "type-check",   state: "success", durationSeconds: 48 },
        { name: "lint",         state: "success", durationSeconds: 14 },
      ];
      const p243checks: PullRequestCheck[] = [
        { name: "frappe-tests", state: "success", durationSeconds: 74 },
        { name: "type-check",   state: "pending" },
        { name: "lint",         state: "success", durationSeconds: 11 },
      ];
      const p239checks: PullRequestCheck[] = [
        { name: "frappe-tests", state: "success", durationSeconds: 68 },
        { name: "type-check",   state: "success", durationSeconds: 39 },
        { name: "lint",         state: "success", durationSeconds: 9  },
        { name: "audit",        state: "success", durationSeconds: 5  },
      ];
      const pulls: PullRequestSummary[] = [
        {
          number: 247,
          title: "eTIMS VSCU",
          url: "https://github.com/Coale-Tech/frappe-agent/pull/247",
          author: "wanjiru@coaletech.com",
          headRefName: "feature/etims-vscu", baseRefName: "main",
          openedAt: new Date(Date.now() - 172_800_000).toISOString(),
          updatedAt: new Date(Date.now() - 900_000).toISOString(),
          isDraft: false,
          body: "Implements KRA eTIMS receipt signing via the `vscu` device. Adds `etims_sign_receipt()` to `TaxReceiptController`. Includes sandbox test coverage and XML schema validation.",
          changedFiles: 12, additions: 382, deletions: 28,
          checks: p247checks,
        },
        {
          number: 243,
          title: "fix: Resolve duplicate Payment Entry on multi-currency reconciliation",
          url: "https://github.com/Coale-Tech/frappe-agent/pull/243",
          author: "moha@coaletech.com",
          headRefName: "fix/multi-currency-rec", baseRefName: "main",
          openedAt: new Date(Date.now() - 259_200_000).toISOString(),
          updatedAt: new Date(Date.now() - 7_200_000).toISOString(),
          isDraft: false,
          body: "Fixes stale exchange rates in multi-currency Journal Entries. Adds a 1-hour TTL cache keyed by currency pair and date.",
          changedFiles: 5, additions: 67, deletions: 14,
          checks: p243checks,
        },
        {
          number: 239,
          title: "chore: Bump frappe to v16.3.2 and erpnext to v16.2.8",
          url: "https://github.com/Coale-Tech/frappe-agent/pull/239",
          author: "mac@coaletech.com",
          headRefName: "chore/deps-bump", baseRefName: "main",
          openedAt: new Date(Date.now() - 86_400_000).toISOString(),
          updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
          isDraft: false,
          body: "Bumps pnpm lockfile to resolve 2 moderate audit findings in transitive deps.",
          changedFiles: 2, additions: 18, deletions: 18,
          checks: p239checks,
        },
        {
          number: 237, title: "feat(hrms): payroll summary PDF export",
          url: "https://github.com/Coale-Tech/frappe-agent/pull/237",
          author: "agent@coaletech.com", headRefName: "feat/payroll-pdf", baseRefName: "main",
          updatedAt: new Date(Date.now() - 172_800_000).toISOString(), isDraft: true,
          body: "Adds PDF export for monthly payroll summaries using WeasyPrint.",
          changedFiles: 8, additions: 211, deletions: 4,
        },
        {
          number: 231, title: "docs: update AGENTS.md with new directives",
          url: "https://github.com/Coale-Tech/frappe-agent/pull/231",
          author: "mac@coaletech.com", headRefName: "docs/agents-md", baseRefName: "main",
          updatedAt: new Date(Date.now() - 259_200_000).toISOString(), isDraft: true,
          body: "Updates AGENTS.md with the new frappe-bench-ops and raven-pm agent specifications.",
          changedFiles: 1, additions: 43, deletions: 7,
        },
      ];
      api.listPullRequests = async () => ({ pulls });
      // Pre-select PR #247 (the top row) for the capture detail-panel screenshot.
      window.__PI_CAPTURE_PR_SELECTED__ = 247;
    },
    seedSidebarStatuses: () => {
      if (!window.__PI_CAPTURE__) return null;
      const sessions = useAppStore.getState().sessions.slice(0, 4);
      if (sessions.length < 4) return null;
      const [selected, running, completed, failed] = sessions;
      useAppStore.setState({
        page: "chat",
        activeSessionId: selected.id,
        isRunning: false,
        runningSessions: { [running.id]: true },
        sessionOutcomes: {
          [completed.id]: "completed",
          [failed.id]: "failed",
        },
      });
      return {
        selected: selected.id,
        running: running.id,
        completed: completed.id,
        failed: failed.id,
      };
    },
    seedOmpSettings: () => {
      if (!window.__PI_CAPTURE__) return;
      // Mock all three calls that OmpSettingsSections awaits so it reaches "ready" state
      // without a live omp sidecar. All three must resolve for loadState to become "ready".
      const fakeModels: OmpModelsListResult = {
        models: [
          { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: { id: "anthropic", name: "Anthropic" } },
          { id: "claude-opus-4-5",   name: "Claude Opus 4.5",   provider: { id: "anthropic", name: "Anthropic" } },
          { id: "gpt-4.1",           name: "GPT-4.1",           provider: { id: "openai",    name: "OpenAI"    } },
        ],
      };
      api.ompModelsList = async () => fakeModels;
      // ompSettingsGet: return empty defaults — OmpSettingsSections only reads known keys.
      api.ompSettingsGet = async () => ({});
      // ompAgentList: 4 agents matching the reference design (frappe-dev, frappe-reviewer,
      // frappe-scout, sonic) shown in AGENT MODEL OVERRIDES section.
      const fakeAgents: OmpAgentEntry[] = [
        { name: "frappe-dev",      description: "Frappe/ERPNext implementation · 21 tools", tools: [], source: "omp" },
        { name: "frappe-reviewer", description: "Code review specialist · read-only",       tools: [], source: "omp" },
        { name: "frappe-scout",    description: "Read-only codebase scout · fast queries",  tools: [], source: "omp" },
        { name: "sonic",           description: "Low-reasoning agent · mechanical tasks",   tools: [], source: "omp" },
      ];
      api.ompAgentList = async () => ({ agents: fakeAgents });
      // Mock ompWorktreeList with 3 realistic entries (badge count = 3).
      const fakeWorktrees: OmpWorktreeEntry[] = [
        { path: "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-feat-etims",      kind: "pr-checkout",    branch: "feat/etims-vscu",    parentRepo: "/Users/mac/ERPNext/frappe_agent/PI-Desktop" },
        { path: "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-fix-currency",    kind: "pr-checkout",    branch: "fix/multi-currency", parentRepo: "/Users/mac/ERPNext/frappe_agent/PI-Desktop" },
        { path: "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-task-iso-abc123", kind: "task-isolation",                               parentRepo: "/Users/mac/ERPNext/frappe_agent/PI-Desktop" },
      ];
      api.ompWorktreeList = async () => ({ worktrees: fakeWorktrees });
      // Mock ompSettingsManifest so Advanced omp page shows reference tabs/sections:
      // general (Core / Startup & Lifecycle / Storage / Network) | tools | agents | memory | features
      const fakeManifest: OmpSettingDescriptor[] = [
        // ── general / Core ────────────────────────────────────────────────
        { id: "debug.enabled",       tab: "general", group: "Core",                type: "boolean", label: "debug.enabled",          description: "Enable verbose debug output in the sidecar log", default: false },
        { id: "log.level",           tab: "general", group: "Core",                type: "enum",    label: "log.level",              description: "Minimum log severity written to disk",            default: "info", values: ["debug","info","warn","error"] },
        { id: "telemetry.enabled",   tab: "general", group: "Core",                type: "boolean", label: "telemetry.enabled",      description: "Send anonymous usage metrics to improve omp",    default: false },
        { id: "locale.override",     tab: "general", group: "Core",                type: "string",  label: "locale.override",        description: "Force a specific locale (empty = system default)" },
        // ── general / Startup & Lifecycle ─────────────────────────────────
        { id: "startup.watchdog",    tab: "general", group: "Startup & Lifecycle", type: "boolean", label: "startup.watchdog",       description: "Restart sidecar automatically if it crashes",     default: true },
        { id: "startup.timeout",     tab: "general", group: "Startup & Lifecycle", type: "number",  label: "startup.timeout",        description: "Seconds to wait for sidecar ready before failing", default: 30, min: 5, max: 300 },
        { id: "startup.env.passthrough", tab: "general", group: "Startup & Lifecycle", type: "string", label: "startup.env.passthrough", description: "Extra environment variables forwarded to sidecar" },
        // ── general / Storage ─────────────────────────────────────────────
        { id: "storage.maxSessions", tab: "general", group: "Storage",             type: "number",  label: "storage.maxSessions",    description: "Maximum stored sessions before pruning oldest",  default: 1000, min: 10, max: 10000 },
        { id: "storage.pruneOnLow",  tab: "general", group: "Storage",             type: "boolean", label: "storage.pruneOnLow",     description: "Auto-prune when disk space falls below 500 MB",   default: true },
        { id: "storage.cacheDir",    tab: "general", group: "Storage",             type: "string",  label: "storage.cacheDir",       description: "Directory for transient tool output cache",       default: "~/.omp/cache" },
        // ── general / Network ─────────────────────────────────────────────
        { id: "network.relaxed",     tab: "general", group: "Network",             type: "boolean", label: "network.relaxed",        description: "Disable strict host validation for local development", default: false },
        { id: "network.proxy",       tab: "general", group: "Network",             type: "string",  label: "network.proxy",          description: "HTTP/HTTPS proxy URL (e.g. http://proxy:8080)" },
        // ── tools ─────────────────────────────────────────────────────────
        { id: "tools.timeout",       tab: "tools",   group: "Execution",           type: "number",  label: "tools.timeout",          description: "Maximum seconds a single tool call may run",     default: 60, min: 5, max: 600 },
        { id: "tools.maxOutput",     tab: "tools",   group: "Execution",           type: "number",  label: "tools.maxOutput",        description: "Maximum bytes of tool output kept in context",   default: 200000 },
        // ── agents ────────────────────────────────────────────────────────
        { id: "agents.spawn.timeout",tab: "agents",  group: "Spawning",            type: "number",  label: "agents.spawn.timeout",   description: "Seconds to wait for a subagent to start",        default: 30 },
        // ── memory ────────────────────────────────────────────────────────
        { id: "memory.maxTokens",    tab: "memory",  group: "Context",             type: "number",  label: "memory.maxTokens",       description: "Maximum tokens retained in memory context",      default: 50000 },
        // ── features ──────────────────────────────────────────────────────
        { id: "features.experiments",tab: "features",group: "Beta",                type: "boolean", label: "features.experiments",   description: "Enable experimental features (may be unstable)",  default: false },
      ];
      api.ompSettingsManifest = async () => fakeManifest;
      // Also update the Zustand store settings directly so FontFamilyRow shows
      // "InterVariable" instead of "System default" in the screenshot.
      // ensureVisualFixtures already sets fontFamily via IPC (updates the settings file),
      // but the store state needs a direct patch so the UI re-renders with the new value.
      const storeSettings = useAppStore.getState().settings;
      if (storeSettings) {
        useAppStore.setState({ settings: { ...storeSettings, fontFamily: "InterVariable" } });
      }
    },
    ensureVisualFixtures: async () => {
      if (!window.__PI_CAPTURE__) return;
      // Suppress backend-down banner: no host binary runs during captures.
      if (!document.getElementById("pi-capture-overrides")) {
        const style = document.createElement("style");
        style.id = "pi-capture-overrides";
        style.textContent = ".backend-banner { display: none !important; }";
        document.head.appendChild(style);
      }
      const ws = useAppStore.getState().workspace;
      if (ws?.path) {
        const base = (ws.name || ws.path.split(/[/]/).filter(Boolean).pop() || "").trim();
        if (base.length > 0 && base.length < 12) {
          useAppStore.setState({ workspace: { ...ws, name: "PI-Desktop" } });
        }
      }
      // Seed user initials for avatar (matches reference "JK").
      // Also store displayName so the useEffect in useAppShellRuntime derives "JK".
      useAppStore.setState({ userInitials: "JK" });
      // Mock getUserInfo so the avatar always shows "JK" (not the OS login name).
      api.getUserInfo = async () => ({ fullName: "Josh Kim" });
      // NOTE: Use seedBenchList() to intercept window.piDesktop.invoke for bench IPC channels.
      // Enable kanban and raven so rail + sidebar show all feature items.
      // Patch the IPC fetch so NavRail's useEffect cannot overwrite the enabled state.
      useAppStore.setState({ kanbanEnabled: true, ravenEnabled: true });
      api.kanbanSettingsGet = async () => ({ settings: { enabled: true, maxInProgress: 3, maxRuntimeSeconds: 3600, maxAgentCardsPerSession: 10, maxDailySpawns: 20 } });
      api.ravenSettingsGet = async () => ({ settings: { enabled: true, url: "https://coale.frappe.cloud/raven" } });
      // Seed 3 notifications for bell badge.
      methods.seedNotifications(3);
      // Seed English session titles matching the reference design (variant-D1/D2/D3).
      try {
        await useAppStore.getState().refreshSessions();
        // Remove legacy/noise fixture titles. Record<string, true> for static lookup.
        const legacyNoise: Record<string, true> = {
          "同步代码": true, "你好": true, "终止进程里面有一个注册机的": true, "加一下": true,
          "帮我彻底卸载比特浏览器": true, "帮我配置一下这个项目并启动": true,
          "重新设计设置页面插件板块手机端ui布局": true, "制作台的布局重新设计，需要现代化简": true,
          "Review open pull requests": true, "Tighten composer elevation": true,
          "Dark theme night plate": true, "Sidebar recents density": true,
          "Settings appearance polish": true, "Plugins empty state": true,
          "Fix TypeScript build errors": true, "Exploring repository structure": true,
        };
        for (const s of useAppStore.getState().sessions || []) {
          if (legacyNoise[(s.title || "").trim()]) {
            try { await api.deleteSession(s.id); } catch { /* ignore */ }
          }
        }
        await useAppStore.getState().refreshSessions();
        // Dynamic membership tracking for dedup during session creation.
        const existing = new Set(
          (useAppStore.getState().sessions || []).map((s) => (s.title || "").trim()),
        );
        // Pinned page sessions (sidebar PINNED section).
        const pinnedTitles = [
          "Kanban · coale_v16",
          "Raven · #general",
          "FileBird workspace",
        ];
        // Main session titles matching variant-D1/D2/D3 reference.
        const regularTitles = [
          // Created oldest-first so most-recently-created = Sync ERPNext (appears at TOP
          // of the session list sorted by createdAt DESC).
          // Matches reference exactly: 8 sessions across THIS WEEK / YESTERDAY / TODAY.
          "Debug slow stock valuation query",   // THIS WEEK
          "Set up coale_v16 from scratch",      // THIS WEEK
          "ERPNext payroll period config",      // YESTERDAY
          "Review PR #224 leave approvals",     // YESTERDAY
          "Migrate Raven to frappe-ui v2",      // YESTERDAY
          "Fix duplicate bench start bug",      // TODAY
          "Redesign settings plugin section",   // TODAY
          "Sync ERPNext code module",           // TODAY — selected (created LAST = most recent)
        ];
        // Delete sessions NOT in the expected keep set to remove stale/dup entries
        // from previous runs (prevents "Review PR #224" appearing twice, etc.).
        const keepTitles = new Set([...pinnedTitles, ...regularTitles]);
        for (const s of useAppStore.getState().sessions || []) {
          const t = (s.title || "").trim();
          if (!keepTitles.has(t)) {
            try { await api.deleteSession(s.id); } catch { /* ignore */ }
          }
        }
        // Dedup: keep only the first occurrence per title (delete extras).
        const seenTitles = new Set<string>();
        for (const s of [...(useAppStore.getState().sessions || [])]) {
          const t = (s.title || "").trim();
          if (seenTitles.has(t)) {
            try { await api.deleteSession(s.id); } catch { /* ignore */ }
          } else {
            seenTitles.add(t);
          }
        }
        await useAppStore.getState().refreshSessions();
        // Recreate any missing sessions.
        const existing2 = new Set(
          (useAppStore.getState().sessions || []).map((s) => (s.title || "").trim()),
        );
        for (const title of [...pinnedTitles, ...regularTitles]) {
          if (existing2.has(title)) continue;
          if ((useAppStore.getState().sessions?.length ?? 0) >= 16) break;
          await api.createSession({ title });
          existing2.add(title);
        }
        await useAppStore.getState().refreshSessions();
        // Backdate session updatedAt to produce correct TODAY/YESTERDAY/THIS WEEK groups
        // using midnight-relative anchors so groups are stable regardless of capture time.
        const now = Date.now();
        const M = 60_000, H = 3_600_000, D = 86_400_000;
        const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
        const S = startOfToday.getTime(); // midnight start of current calendar day
        // todayTs: ensure session is within today's calendar window; clamped to S+slot if
        // the rolling-offset would cross midnight (e.g. when capturing just after midnight).
        const todayTs = (offset: number, slotMin: number): number =>
          Math.max(S + slotMin * M, now - offset);
        const sessionAges: Record<string, number> = {
          // TODAY — slots 1/2/3 min past midnight as fallbacks at very early captures
          "Sync ERPNext code module":          todayTs(2 * M, 3),
          "Redesign settings plugin section":  todayTs(47 * M, 2),
          "Fix duplicate bench start bug":     todayTs(2 * H, 1),
          // YESTERDAY — anchored within yesterday's calendar window (10:00–14:00 yesterday)
          "Migrate Raven to frappe-ui v2":     S - D + 14 * H,
          "Review PR #224 leave approvals":    S - D + 12 * H,
          "ERPNext payroll period config":     S - D + 10 * H,
          // THIS WEEK
          "Debug slow stock valuation query":  S - 3 * D,
          "Set up coale_v16 from scratch":     S - 4 * D,
        };
        const backdated = (useAppStore.getState().sessions ?? []).map((s) => {
          const ts = sessionAges[(s.title || "").trim()];
          return ts ? { ...s, updatedAt: new Date(ts).toISOString(), createdAt: new Date(ts).toISOString() } : s;
        });
        useAppStore.setState({ sessions: backdated });
        // Pin the pinned-page sessions in localStorage.
        const allSessions = useAppStore.getState().sessions ?? [];
        try {
          const raw = localStorage.getItem("pi.desktop.pinnedSessions");
          const parsed = raw ? JSON.parse(raw) : [];
          const pins: string[] = Array.isArray(parsed)
            ? parsed.filter((x) => typeof x === "string")
            : [];
          for (const pt of pinnedTitles) {
            const s = allSessions.find((s2) => (s2.title || "").trim() === pt);
            if (s && !pins.includes(s.id)) pins.unshift(s.id);
          }
          localStorage.setItem("pi.desktop.pinnedSessions", JSON.stringify(pins.slice(0, 40)));
        } catch { /* ignore */ }
        // Select "Sync ERPNext code module" as the active session.
        const preferred = allSessions.find(
          (s) => (s.title || "").trim() === "Sync ERPNext code module",
        );
        if (preferred) {
          await useAppStore.getState().selectSession(preferred.id);
          // Patch the selected session's modelId so WorkspaceBar shows 'claude-sonnet-5'
          // (the backend mock returns 'mock-1'; settings.defaultModelId is only the fallback).
          useAppStore.setState({
            sessions: useAppStore.getState().sessions.map((s) =>
              s.id === preferred.id ? { ...s, modelId: "claude-sonnet-5" } : s,
            ),
          });
        }
        // Seed fontFamily: InterVariable to match reference font-family dropdown.
        try {
          const currentSettings = await window.piDesktop?.invoke("pi-desktop/settings/get");
          if (currentSettings && typeof currentSettings === "object") {
            await window.piDesktop?.invoke("pi-desktop/settings/set", {
              ...currentSettings,
              fontFamily: "InterVariable",
              displayName: "Josh Kim",
            });
          }
        } catch { /* non-fatal if settings IPC unavailable */ }
      // Remove the PROJECTS section from the D3 sidebar: the open workspace path
      // causes an "apps" project group to appear. Hide it in capture mode.
      useAppStore.setState({ openProjectPaths: [], workspace: null });
      } catch { /* optional capture-only fixture */ }
    },
    seedApprovalCard: () => {
      // Seeds transcript with Bash/Read/Edit tool rows and a ToolPermissionRequest
      // so the inline "Approve file edit" card renders above the composer.
      // Matches variant-D1/D2/D3 reference exactly.
      if (!window.__PI_CAPTURE__) return;
      const state0 = useAppStore.getState();
      let sessionId = state0.retainedSessionIds[0] ?? state0.activeSessionId;
      if (!sessionId && state0.sessions.length > 0) {
        sessionId = state0.sessions[0].id;
        useAppStore.setState({
          activeSessionId: sessionId,
          retainedSessionIds: [sessionId],
          retainedTranscripts: { [sessionId]: [] },
          page: "chat",
        });
      }
      if (!sessionId) return;
      const activeSessionId = sessionId;
      const base = Date.now() - 5 * 60_000; // 5 min ago → realistic "5m" elapsed time
      const messages: UiMessage[] = [
        {
          id: "cap-perm-user-0",
          role: "user",
          content:
            "Can you sync the `erpnext.accounts.doctype.payment_entry` module from the coale_v16 bench into a local dev copy? Use `bench get-app` logic and then verify the module loads correctly.",
          createdAt: new Date(base).toISOString(),
          status: "complete",
        },
        {
          id: "cap-perm-asst-0",
          role: "assistant",
          content:
            "I'll sync the `payment_entry` module from coale_v16. Starting by reading the bench config and module state.",
          createdAt: new Date(base + 30_000).toISOString(),
          status: "complete",
        },
        {
          id: "cap-perm-tool-bash",
          role: "tool",
          content: "",
          createdAt: new Date(base + 60_000).toISOString(),
          toolName: "Bash",
          toolStatus: "success",
          toolArgs: { command: "bench --site coale_v16.localhost list-apps" },
          toolResult: {
            details: {
              exitCode: 0,
              stdout:
                "Apps installed on coale_v16.localhost:\n  frappe          15.42.1\n  erpnext         15.32.0 ✓\n  hrms            2.4.1\n  raven           2.1.0\n\nModule payment_entry: 847 lines · last modified 2026-10-09",
              stderr: "",
            },
          },
        },
        {
          id: "cap-perm-tool-read",
          role: "tool",
          content: "",
          createdAt: new Date(base + 90_000).toISOString(),
          toolName: "Read",
          toolStatus: "success",
          toolArgs: {
            path: "apps/erpnext/erpnext/accounts/doctype/payment_entry/__init__.py",
          },
          toolResult: { details: { exitCode: 0, stdout: "" } },
        },
        {
          id: "cap-perm-tool-edit",
          role: "tool",
          content: "",
          createdAt: new Date(base + 120_000).toISOString(),
          toolName: "Edit",
          toolStatus: "running",
          toolArgs: {
            path: "apps/erpnext/erpnext/accounts/doctype/payment_entry/payment_entry.py",
          },
        },
      ];
      useAppStore.setState({ messages, runningSessions: { [activeSessionId]: true } });
      const permRequest: PendingPermission = {
        requestId: "cap-perm-req-0",
        sessionId: activeSessionId,
        toolCallId: "cap-perm-tool-edit",
        toolName: "Edit",
        argsPreview: {
          path: "apps/erpnext/erpnext/accounts/doctype/payment_entry/payment_entry.py",
        },
        risk: "medium",
        reason:
          "Claude wants to write 12 lines to payment_entry.py — adding a sync helper that calls frappe.get_doc on the remote bench socket. Review the diff before allowing.",
        receivedAt: Date.now() + 3_600_000, // 1h in future — prevents auto-deny timer during capture
      };
      // Open Activity tab so the right panel shows Pending approval box.
      useAppStore.setState({
        workPanelContexts: {
          ...useAppStore.getState().workPanelContexts,
          [activeSessionId]: {
            open: true,
            tabs: [ACTIVITY_TAB],
            activeTabId: ACTIVITY_TAB.id,
            fileRequest: null,
          },
        },
        workPanelOpen: true,
        workPanelTabs: [ACTIVITY_TAB],
        activeWorkPanelTabId: ACTIVITY_TAB.id,
        workPanelFileRequest: null,
      });
      // Seed todo phases for the Activity panel OPEN TODOS list (ref D1/D2/D3).
      const fakeTodoPhases = [
        {
          id: "cap-phase-0",
          name: "Payment entry sync",
          tasks: [
            {
              id: "cap-todo-0",
              content: "Verify payment_entry module loads after sync",
              status: "completed" as const,
            },
            {
              id: "cap-todo-1",
              content: "Run bench migrate on coale_v16 after changes",
              status: "pending" as const,
            },
          ],
        },
      ];
      useAppStore.setState({
        pendingPermissions: enqueuePermission({}, permRequest),
        sessionTodoPhases: {
          ...useAppStore.getState().sessionTodoPhases,
          [activeSessionId]: fakeTodoPhases,
        },
      });
    },
    clearPendingPermissions: () => {
      if (!window.__PI_CAPTURE__) return;
      useAppStore.setState({ pendingPermissions: {} });
    },
    seedEmptyHome: () => {
      // Clears active session so emptyTitle shows; forces onboarding checklist visible.
      if (!window.__PI_CAPTURE__) return;
      useAppStore.setState({
        messages: [],
        sessions: [],
        activeSessionId: undefined,
        retainedSessionIds: [],
        retainedTranscripts: {},
        pendingPermissions: {},
        runningSessions: {},
        workPanelOpen: false,
        openProjectPaths: [],
        page: "chat",
      });
      const curOnb = useAppStore.getState().onboarding;
      useAppStore.setState({
        onboarding: { showChecklist: true, steps: [], ...(curOnb ?? {}) },
      });
    },
    seedOnboardingChecklist: () => {
      // Force onboarding checklist visible regardless of backend state.
      if (!window.__PI_CAPTURE__) return;
      const cur = useAppStore.getState().onboarding;
      const steps = cur?.steps ?? [
        { id: "connect-provider", title: "Connect provider", done: false },
        { id: "pick-a-bench", title: "Pick a bench", done: false },
        { id: "permissions-mode", title: "Permissions mode", done: false },
        { id: "youre-ready", title: "You're ready", done: false },
      ];
      useAppStore.setState({ onboarding: { ...(cur ?? {}), showChecklist: true, steps } as OnboardingState });
    },
    seedCommandPaletteExtras: () => {
      // Seed capture-only FILES, BENCHES and COMMANDS data for command palette shots.
      if (!window.__PI_CAPTURE__) return;
      window.__PI_PALETTE_FILES__ = [
        { path: "patches/migrate_payment_entry_v15_to_v16.py", appRoot: "apps/erpnext" },
        { path: "migrate_leave_allocation.py", appRoot: "apps/hrms" },
      ];
      window.__PI_PALETTE_BENCHES__ = [
        { id: "coale_v16", path: "/Users/mac/ERPNext/coale_v16", status: "running" },
        { id: "frappe-bench", path: "/Users/mac/ERPNext/frappe-bench", status: "stopped" },
      ];
      window.__PI_PALETTE_COMMANDS__ = [
        { id: "bench-migrate-run", title: "Run bench migrate", source: "builtin" as const },
        { id: "bench-migrate-skip", title: "bench migrate --skip-failing", source: "builtin" as const },
      ] satisfies CommandItem[];
      // Seed sessions matching "migrate" for the palette SESSIONS section.
      const now = Date.now();
      const D = 86_400_000;
      window.__PI_PALETTE_SESSIONS__ = [
        { id: "fixture-s4", title: "Migrate Raven to frappe-ui v2",    updatedAt: new Date(now - D + 14 * 3600000).toISOString() },
        { id: "fixture-s9", title: "ERPNext payroll migrate planning",  updatedAt: new Date(now - D + 8 * 3600000).toISOString() },
      ];
    },
    seedBenchStatus: (opts) => {
      if (!window.__PI_CAPTURE__) return;
      const benchPath = opts?.benchPath ?? "/Users/mac/ERPNext/frappe_agent/coale_v16";
      const siteCount = opts?.siteCount ?? 3;
      const site = opts?.site ?? "coale.frappe.cloud";
      // Inject the override read by use-bench-context so the bench chip + status bar show running state.
      // startedAtMs is 2m47s ago so the BenchPage elapsed timer (startMsRef) shows "02:47".
      const startedAtMs = Date.now() - 2 * 60_000 - 47_000;
      window.__PI_BENCH_OVERRIDE__ = { status: "running", benchPath, site, siteCount, startedAtMs };
      document.dispatchEvent(new Event("pi:bench-update"));
      // Also seed viewedBenchSiteCount so WorkspaceBar shows "N sites", and the
      // design's default model so the status bar's right side matches the references.
      const settings = useAppStore.getState().settings;
      useAppStore.setState({
        viewedBenchPath: benchPath,
        viewedBenchSiteCount: siteCount,
        ...(settings ? { settings: { ...settings, defaultModelId: "claude-sonnet-5" } } : {}),
      });
    },
    seedBenchList: () => {
      if (!window.__PI_CAPTURE__) return;
      const COALE_PATH = "/Users/mac/ERPNext/frappe_agent/coale_v16";
      // Reference bench data (pages-d/bench/variant-D1.png): 5 primary benches, coale_v16 running.
      // Total = 61 (5 primary + 56 archived/remote) to match reference footer "Showing 5 of 61".
      // BenchPage.tsx reads window.__PI_CAPTURE_BENCH_LIST__ in loadBenches() when in
      // capture mode — avoids requiring contextBridge interception.
      const primaryBenches = [
        { id: "cap-bench-coale-v16", path: COALE_PATH,
          version: 16,
          startedAtMs: Date.now() - 167_000,           // 2m47s ago → "02:47" elapsed
          sites: [{ name: "coale.frappe.cloud", isDefault: true },
                  { name: "demo.frappe.cloud", isDefault: false }],
          apps: ["frappe", "erpnext", "hrms", "raven"] },
        { id: "cap-bench-dev",     path: "/Users/mac/ERPNext/dev_bench",
          version: 16, sites: [{ name: "dev.localhost", isDefault: true }],
          apps: ["frappe", "erpnext"] },
        { id: "cap-bench-v15",     path: "/Users/mac/ERPNext/v15-bench",
          version: 15, sites: [{ name: "v15.localhost", isDefault: true }],
          apps: ["frappe", "hrms"] },
        { id: "cap-bench-staging", path: "/Users/mac/ERPNext/staging_v16",
          version: 16,
          sites: [{ name: "staging-1.frappe.cloud", isDefault: true },
                  { name: "staging-2.frappe.cloud", isDefault: false },
                  { name: "staging-3.frappe.cloud", isDefault: false }],
          apps: ["frappe", "erpnext", "hrms"] },
        { id: "cap-bench-test",    path: "/Users/mac/ERPNext/test_v16",
          version: 16, sites: [{ name: "test.localhost", isDefault: true }],
          apps: ["frappe"] },
      ];
      // 56 archived benches so totalCount = 61 (matches reference "Showing 5 of 61 benches")
      const archivedBenches = Array.from({ length: 56 }, (_, i) => ({
        id: `cap-bench-archive-${i}`,
        path: `/Users/mac/ERPNext/archived/bench-${String(i + 1).padStart(3, "0")}`,
        version: 15 + (i % 2),
        sites: [{ name: `archive-${i + 1}.localhost`, isDefault: true }],
        apps: ["frappe"],
      }));
      const benches = [...primaryBenches, ...archivedBenches];
      window.__PI_CAPTURE_BENCH_LIST__ = { benches, failedRoots: [], roots: ["/Users/mac/ERPNext"] };
      // Pre-open coale_v16 and dev_bench as tab strip tabs (matches reference design)
      window.__PI_CAPTURE_BENCH_OPEN_IDS__ = ["cap-bench-coale-v16", "cap-bench-dev"];
    },
    seedRavenConnected: () => {
      if (!window.__PI_CAPTURE__) return;
      // Set the capture flag so RavenPage's useEffect immediately marks connected=true.
      // WebContentsView content is NOT capturable by CDP screenshot; only the chrome
      // bar (green "Connected" pill) and empty hole div will appear in the shot.
      window.__PI_CAPTURE_RAVEN_CONNECTED__ = true;
      // Ensure ravenEnabled and settings match (ravenSettingsGet already mocked in seedOmpSettings)
      useAppStore.setState({ ravenEnabled: true });
      api.ravenSetVisible = async () => {};
      api.ravenSetBounds = async () => {};
      api.ravenReload = async () => ({ ok: true });
    },
    seedFileBirdConnected: () => {
      if (!window.__PI_CAPTURE__) return;
      // Set the capture flag so FileBirdPage skips the fileBirdSetVisible IPC call
      // that would mark failed=true. Shows chrome bar + WebContentsView hole (empty in CDP).
      window.__PI_CAPTURE_FILEBIRD_VISIBLE__ = true;
      api.fileBirdSetVisible = async () => ({ ok: true });
      api.fileBirdSetBounds = async () => {};
      api.fileBirdReload = async () => ({ ok: true });
      api.fileBirdOpenWindow = async () => ({ ok: true });
    },
    seedLargePasteThreshold: () => {
      if (!window.__PI_CAPTURE__) return;
      const storeSettings = useAppStore.getState().settings;
      if (storeSettings) {
        useAppStore.setState({ settings: { ...storeSettings, largePasteThreshold: 200 } });
      }
    },
    clearPinnedSessions: () => {
      if (!window.__PI_CAPTURE__) return;
      // Clear pinned flag from session objects (seedVisualState sets session.pinned=true).
      const sessions = (useAppStore.getState().sessions ?? []).map((s) =>
        (s as typeof s & { pinned?: boolean }).pinned
          ? { ...s, pinned: false }
          : s
      );
      // Also clear from sessionMeta in case it's set there.
      const meta = { ...useAppStore.getState().sessionMeta };
      let metaChanged = false;
      for (const id of Object.keys(meta)) {
        if (meta[id]?.pinned) {
          meta[id] = { ...meta[id], pinned: false };
          metaChanged = true;
        }
      }
      useAppStore.setState({
        sessions: sessions as unknown as SessionSummary[],
        ...(metaChanged ? { sessionMeta: meta } : {}),
      });
    },
  };
  return {
    ...methods,
    dispose: () => {
      useAppStore.setState({
        refreshNotifications: originalRefreshNotifications,
        refreshPlugins: originalRefreshPlugins,
      });
      api.listPluginServices = originalListPluginServices;
      api.marketSearch = originalMarketSearch;
      api.marketGetDetail = originalMarketDetail;
      api.listMcpServers = originalListMcpServers;
      api.listUserSkills = originalListUserSkills;
      api.listProjects = originalListProjects;
      api.kanbanList = originalKanbanList;
      api.listScheduled = originalListScheduled;
      api.listScheduledRuns = originalListScheduledRuns;
      api.listPullRequests = originalListPullRequests;
      api.ompModelsList = originalOmpModelsList;
      api.ompWorktreeList = originalOmpWorktreeList;
      api.ompSettingsGet  = originalOmpSettingsGet;
      api.ompAgentList    = originalOmpAgentList;
    },
  };
}
