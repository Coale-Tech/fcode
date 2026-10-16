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
  KanbanBoard,
  McpServerRecord,
  McpServerStatus,
  OmpAgentEntry,
  OmpModelsListResult,
  OmpWorktreeEntry,
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
  seedApprovalCard: () => void;
  clearPendingPermissions: () => void;
  seedEmptyHome: () => void;
  seedOnboardingChecklist: () => void;
  seedBenchStatus: (benchName?: string) => void;
};

export type CaptureRig = CaptureRigMethods & {
  /** Restores every store action and `api.*` call the fixtures replaced. */
  dispose: () => void;
};

export function installCaptureRig(): CaptureRig {
  const originalRefreshNotifications =
    useAppStore.getState().refreshNotifications;
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
    seedPlugins: (count = 4) => {
      // Capture-only plugins fixture (plugins index scenes); count 0 clears.
      // One sample per row group so the D169 bands are all exercised, and one
      // sample per new contribution kind so the capability/service chips do.
      if (!window.__PI_CAPTURE__) return;
      if (count <= 0) {
        useAppStore.setState({ plugins: [] });
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
      // in the capture rig; stand in with a card per trust tier and state.
      (api as any).marketSearch = async () => ({
        plugins: [
          {
            id: "pi.git-insights",
            name: "Git Insights",
            description: "Summarizes repository activity into a review panel.",
            author: "Pi Labs",
            latestVersion: "1.5.0",
            downloads: 12840,
            updatedAt: "2026-08-21T09:00:00.000Z",
            categories: ["productivity"],
            permissionSummary: ["fs.read", "fs.write", "ui.panel"],
            verified: true,
            trust: "verified",
            installed: true,
            installedVersion: "1.4.2",
            updateAvailable: true,
            installable: true,
          },
          {
            id: "pi.markdown-tools",
            name: "Markdown Tools",
            description: "Formats tables and normalizes headings on demand.",
            author: "Community",
            latestVersion: "0.9.0",
            downloads: 3210,
            updatedAt: "2026-07-30T09:00:00.000Z",
            categories: ["editing"],
            permissionSummary: ["clipboard.read", "clipboard.write"],
            trust: "community",
            installed: true,
            installedVersion: "0.9.0",
            installable: true,
          },
          {
            id: "pi.deploy-preview",
            name: "Deploy Preview",
            description:
              "Builds a preview deployment for the current branch and links it in the transcript.",
            author: "Pi Labs",
            latestVersion: "0.4.1",
            downloads: 980,
            updatedAt: "2026-08-02T09:00:00.000Z",
            categories: ["productivity"],
            permissionSummary: ["net.fetch", "ui.panel"],
            verified: true,
            trust: "verified",
            installable: true,
          },
          {
            id: "pi.sql-explorer",
            name: "SQL Explorer",
            description: "Browse local databases and paste query results into chat.",
            author: "Data Tools",
            latestVersion: "2.1.0",
            downloads: 5602,
            updatedAt: "2026-08-15T09:00:00.000Z",
            categories: ["data"],
            permissionSummary: ["fs.read", "process.spawn"],
            trust: "community",
            installable: false,
          },
        ],
      });
      // The rows read service state straight from IPC, which reports nothing
      // for a fixture plugin; stand in for the supervisor here.
      (api as any).listPluginServices = async () => [
        {
          pluginId: "pi.git-insights",
          serviceId: "indexer",
          label: "Repository indexer",
          state: "running",
          restarts: 0,
        },
        {
          pluginId: "pi.markdown-tools",
          serviceId: "watcher",
          label: "Document watcher",
          state: "failed",
          restarts: 3,
          message: "start() threw: ENOENT",
        },
      ];
      const samples: PluginSummary[] = [
        {
          id: "pi.deploy-preview",
          name: "Deploy Preview",
          version: "0.4.1",
          enabled: true,
          source: "installed",
          status: "load_error",
          errorMessage: "Manifest declares net.fetch but the grant is missing.",
          permissions: ["net.fetch", "ui.panel"],
          capabilities: ["panel", "tools", "mcp"],
          author: "Pi Labs",
          description: "Builds a preview deployment for the current branch.",
        },
        {
          id: "pi.git-insights",
          name: "Git Insights",
          version: "1.4.2",
          enabled: true,
          source: "marketplace",
          status: "ready",
          permissions: ["fs.read", "fs.write", "ui.panel", "notify"],
          fs: {
            read: { root: "workspace", scope: ["**/*"] },
            write: { root: "workspace", scope: ["docs/**", "*.md"] },
          },
          capabilities: ["panel", "commands", "skills", "services", "bus"],
          author: "Pi Labs",
          description: "Summarizes repository activity into a review panel.",
          updateAvailable: {
            version: "1.5.0",
            shasum: "capture",
            url: "https://example.invalid/git-insights-1.5.0.piplug",
          },
        },
        {
          id: "pi.markdown-tools",
          name: "Markdown Tools",
          version: "0.9.0",
          enabled: true,
          source: "marketplace",
          status: "ready",
          permissions: ["clipboard.read", "clipboard.write", "ui.panel"],
          capabilities: ["commands", "themes", "services"],
          author: "Community",
          description: "Formats tables and normalizes headings on demand.",
          autoUpdate: true,
        },
        {
          id: "pi.scratchpad",
          name: "Scratchpad",
          version: "dev",
          enabled: false,
          source: "dev",
          status: "disabled",
          permissions: ["ui.panel"],
          author: "Local build",
          description: "A local panel for quick notes beside the transcript.",
        },
      ];
      useAppStore.setState({ plugins: samples.slice(0, count) });
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
      const completedTitles = [
        "重新设计设置页面插件板块手机端 UI 布局并验证所有断点",
        "同步代码",
        "Weekly HRMS payroll report generation",
      ];
      const failedTitles = [
        "修复 host-core 启动失败并补充错误恢复测试",
        "eTIMS VSCU integration — submit receipt batch",
      ];
      // Mix completed and failed so the inbox shows kind-aware rendering.
      const notifications = Array.from({ length: Math.min(count, 7) }, (_, index) => {
        const isFailed = index === 1 || index === 3;
        return {
          id: `capture-notification-${index}`,
          kind: (isFailed ? "task.failed" : "task.completed") as AppNotificationKind,
          sessionId: `capture-session-${index}`,
          sessionTitle: isFailed
            ? failedTitles[index % failedTitles.length]
            : completedTitles[index % completedTitles.length],
          turnId: `capture-turn-${index}`,
          ...(isFailed && index % 2 === 1 ? { errorCode: "MODEL_REQUEST_TIMEOUT" } : {}),
          createdAt: new Date(now - (index + 1) * 3_600_000).toISOString(),
          readAt: index >= 3 ? new Date(now - (index - 2) * 1_800_000).toISOString() : null,
        };
      });
      useAppStore.setState({
        notifications,
        unreadNotificationCount: notifications.reduce(
          (total, notification) => total + (notification.readAt ? 0 : 1),
          0,
        ),
        refreshNotifications: async () => undefined,
      });
    },
    seedKanbanBoard: (count = 1) => {
      if (!window.__PI_CAPTURE__) return;
      const now = Date.now();
      if (count <= 0) {
        api.kanbanList = originalKanbanList;
        return;
      }
      const board: KanbanBoard = {
        tasks: [
          { id: "kt-1", title: "eTIMS VSCU: receipt submit batch", body: "Submit daily receipt batch to KRA eTIMS sandbox.", status: "triage", priority: 3, createdBy: "agent", projectPath: "/apps", sessionId: undefined, archived: false, consecutiveFailures: 0, createdAt: now - 7_200_000 },
          { id: "kt-2", title: "Fix multi-currency exchange rate caching", body: "Cache is stale after currency update.", status: "todo", priority: 2, createdBy: "user", projectPath: "/apps", archived: false, consecutiveFailures: 0, createdAt: now - 5_400_000 },
          { id: "kt-3", title: "Generate weekly HRMS payroll report", body: "Produce PDF report for HR review.", status: "ready", priority: 1, createdBy: "agent", projectPath: "/apps", archived: false, consecutiveFailures: 0, createdAt: now - 3_600_000 },
          { id: "kt-4", title: "Sync frappe-agent dependencies", body: "npm audit fix + upgrade pinned packages.", status: "running", priority: 2, createdBy: "agent", projectPath: "/apps", sessionId: "sess-capture-1", archived: false, consecutiveFailures: 0, createdAt: now - 1_800_000, startedAt: now - 900_000 },
          { id: "kt-5", title: "Stock reconciliation snapshot", body: "Snapshot stock levels before month-end close.", status: "blocked", priority: 2, createdBy: "user", projectPath: "/apps", blockKind: "gave_up", blockReason: "Provider timed out after 3 retries.", archived: false, consecutiveFailures: 3, createdAt: now - 86_400_000 },
          { id: "kt-6", title: "Update ERPNext branch to v16.35", body: "Merge upstream v16.35 hotfixes.", status: "done", priority: 1, createdBy: "user", projectPath: "/apps", archived: false, consecutiveFailures: 0, createdAt: now - 172_800_000, completedAt: now - 43_200_000 },
          { id: "kt-7", title: "Add BOM cost rollup validation", body: "Validate BOM before production order creation.", status: "done", priority: 2, createdBy: "agent", projectPath: "/apps", archived: false, consecutiveFailures: 0, createdAt: now - 259_200_000, completedAt: now - 86_400_000 },
        ],
        links: [{ parentId: "kt-2", childId: "kt-3" }],
        comments: [
          { id: "kc-1", taskId: "kt-4", author: "mac", body: "Checking pnpm audit output.", createdAt: now - 600_000 },
          { id: "kc-2", taskId: "kt-4", author: "agent", body: "Found 3 moderate vulnerabilities.", createdAt: now - 300_000 },
        ],
        runs: [
          { id: "kr-1", taskId: "kt-4", sessionId: "sess-capture-1", status: "running", startedAt: now - 900_000, nudgeCount: 0 },
          { id: "kr-2", taskId: "kt-6", sessionId: "sess-old-1", status: "done", summary: "Merged 12 commits.", startedAt: now - 46_800_000, endedAt: now - 43_200_000, nudgeCount: 1 },
        ],
        events: [],
        dailyStats: [
          { date: new Date(now - 172_800_000).toISOString().slice(0, 10), spawned: 3 },
          { date: new Date(now - 86_400_000).toISOString().slice(0, 10), spawned: 2 },
          { date: new Date(now).toISOString().slice(0, 10), spawned: 1 },
        ],
      };
      api.kanbanList = async () => ({ board, paused: false });
    },
    seedScheduledTasks: (count = 1) => {
      if (!window.__PI_CAPTURE__) return;
      if (count <= 0) {
        api.listScheduled = originalListScheduled;
        api.listScheduledRuns = originalListScheduledRuns;
        return;
      }
      const now = new Date().toISOString();
      const tasks: ScheduledTask[] = [
        { id: "st-1", title: "Daily ERPNext Digest", prompt: "Summarise ERPNext activity from the last 24 h and post to Raven.", cadence: "daily", mode: "agent", enabled: true, createdAt: now, updatedAt: now, lastRunAt: new Date(Date.now() - 3_600_000).toISOString(), workspacePath: "/apps" },
        { id: "st-2", title: "Hourly CI Health Check", prompt: "Run pnpm test and report failures.", cadence: "hourly", mode: "agent", enabled: true, createdAt: now, updatedAt: now, lastRunAt: new Date(Date.now() - 600_000).toISOString(), workspacePath: "/apps" },
        { id: "st-3", title: "Weekly HRMS Payroll Review", prompt: "Generate payroll summary for HR.", cadence: "weekly", mode: "agent", enabled: true, createdAt: now, updatedAt: now, workspacePath: "/apps" },
        { id: "st-4", title: "Stock Reconciliation Snapshot", prompt: "Snapshot stock levels before month-end.", cadence: "monthly", mode: "agent", enabled: true, createdAt: now, updatedAt: now, lastRunAt: new Date(Date.now() - 86_400_000).toISOString(), workspacePath: "/apps" },
        { id: "st-5", title: "Monthly Accounts Ageing", prompt: "Run accounts ageing report and email finance team.", cadence: "monthly", mode: "agent", enabled: false, createdAt: now, updatedAt: now, workspacePath: "/apps" },
      ];
      const health = { lastTickAt: Date.now() - 30_000, lastError: undefined, hostAvailable: true };
      const runs: ScheduledTaskRun[] = [
        { id: "sr-1", taskId: "st-1", sessionId: "sess-c-1", status: "completed", errorCode: null, startedAt: new Date(Date.now() - 3_600_000).toISOString(), endedAt: new Date(Date.now() - 3_540_000).toISOString() },
        { id: "sr-2", taskId: "st-2", sessionId: "sess-c-2", status: "completed", errorCode: null, startedAt: new Date(Date.now() - 600_000).toISOString(), endedAt: new Date(Date.now() - 570_000).toISOString() },
        { id: "sr-3", taskId: "st-4", sessionId: null, status: "error", errorCode: "PROVIDER_TIMEOUT", startedAt: new Date(Date.now() - 86_400_000).toISOString(), endedAt: new Date(Date.now() - 86_380_000).toISOString() },
        { id: "sr-4", taskId: "st-1", sessionId: "sess-c-3", status: "completed", errorCode: null, startedAt: new Date(Date.now() - 90_000_000).toISOString(), endedAt: new Date(Date.now() - 89_940_000).toISOString() },
        { id: "sr-5", taskId: "st-2", sessionId: "sess-c-4", status: "aborted", errorCode: null, startedAt: new Date(Date.now() - 7_800_000).toISOString(), endedAt: new Date(Date.now() - 7_740_000).toISOString() },
        { id: "sr-6", taskId: "st-1", sessionId: "sess-c-run", status: "running", errorCode: null, startedAt: new Date(Date.now() - 120_000).toISOString(), endedAt: null },
      ];
      api.listScheduled = async () => ({ tasks, health });
      api.listScheduledRuns = async () => ({ runs });
    },
    seedPullRequests: (count = 1) => {
      if (!window.__PI_CAPTURE__) return;
      if (count <= 0) {
        api.listPullRequests = originalListPullRequests;
        return;
      }
      const p247checks: PullRequestCheck[] = [
        { name: "frappe-tests", state: "success", durationSeconds: 82 },
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
          number: 247, title: "feat(etims): VSCU receipt batch submission",
          url: "https://github.com/Coale-Tech/frappe-agent/pull/247",
          author: "mac", headRefName: "feat/etims-vscu", baseRefName: "main",
          updatedAt: new Date(Date.now() - 900_000).toISOString(), isDraft: false,
          body: "Implements KRA eTIMS receipt signing via the `vscu` device. Adds `etims_sign_receipt()` to `TaxReceiptController`. Includes sandbox test coverage and XML schema validation.",
          changedFiles: 12, additions: 382, deletions: 28,
          checks: p247checks,
        },
        {
          number: 243, title: "fix(accounting): multi-currency exchange rate caching",
          url: "https://github.com/Coale-Tech/frappe-agent/pull/243",
          author: "agent", headRefName: "fix/multi-currency", baseRefName: "main",
          updatedAt: new Date(Date.now() - 7_200_000).toISOString(), isDraft: false,
          body: "Fixes stale exchange rates in multi-currency Journal Entries. Adds a 1-hour TTL cache keyed by currency pair and date.",
          changedFiles: 5, additions: 67, deletions: 14,
          checks: p243checks,
        },
        {
          number: 239, title: "chore: bump dependencies (pnpm audit fix)",
          url: "https://github.com/Coale-Tech/frappe-agent/pull/239",
          author: "mac", headRefName: "chore/deps-bump", baseRefName: "main",
          updatedAt: new Date(Date.now() - 86_400_000).toISOString(), isDraft: false,
          body: "Bumps pnpm lockfile to resolve 2 moderate audit findings in transitive deps.",
          changedFiles: 2, additions: 18, deletions: 18,
          checks: p239checks,
        },
        {
          number: 237, title: "feat(hrms): payroll summary PDF export",
          url: "https://github.com/Coale-Tech/frappe-agent/pull/237",
          author: "agent", headRefName: "feat/payroll-pdf", baseRefName: "main",
          updatedAt: new Date(Date.now() - 172_800_000).toISOString(), isDraft: true,
          body: "Adds PDF export for monthly payroll summaries using WeasyPrint.",
          changedFiles: 8, additions: 211, deletions: 4,
        },
        {
          number: 231, title: "docs: update AGENTS.md with new directives",
          url: "https://github.com/Coale-Tech/frappe-agent/pull/231",
          author: "mac", headRefName: "docs/agents-md", baseRefName: "main",
          updatedAt: new Date(Date.now() - 259_200_000).toISOString(), isDraft: true,
          body: "Updates AGENTS.md with the new frappe-bench-ops and raven-pm agent specifications.",
          changedFiles: 1, additions: 43, deletions: 7,
        },
      ];
      api.listPullRequests = async () => ({ pulls });
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
      // Mock ompModelsList — the only sidecar-gated call in OmpSettingsSections.
      // ompSettingsGet reads disk (works without sidecar); ompAgentList reads agent dirs.
      const fakeModels: OmpModelsListResult = {
        models: [
          { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: { id: "anthropic", name: "Anthropic" } },
          { id: "claude-opus-4-5",   name: "Claude Opus 4.5",   provider: { id: "anthropic", name: "Anthropic" } },
          { id: "gpt-4.1",           name: "GPT-4.1",           provider: { id: "openai",    name: "OpenAI"    } },
        ],
      };
      api.ompModelsList = async () => fakeModels;
      // Mock ompWorktreeList with 3 realistic entries (badge count = 3).
      const fakeWorktrees: OmpWorktreeEntry[] = [
        { path: "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-feat-etims", kind: "pr-checkout", branch: "feat/etims-vscu", parentRepo: "/Users/mac/ERPNext/frappe_agent/PI-Desktop" },
        { path: "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-fix-currency", kind: "pr-checkout", branch: "fix/multi-currency", parentRepo: "/Users/mac/ERPNext/frappe_agent/PI-Desktop" },
        { path: "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-task-iso-abc123", kind: "task-isolation", parentRepo: "/Users/mac/ERPNext/frappe_agent/PI-Desktop" },
      ];
      api.ompWorktreeList = async () => ({ worktrees: fakeWorktrees });
    },
    ensureVisualFixtures: async () => {
      if (!window.__PI_CAPTURE__) return;
      // Workspace name fix
      const ws = useAppStore.getState().workspace;
      if (ws?.path) {
        const base = (ws.name || ws.path.split(/[/]/).filter(Boolean).pop() || "").trim();
        if (base.length > 0 && base.length < 12) {
          useAppStore.setState({ workspace: { ...ws, name: "PI-Desktop" } });
        }
      }
      // Try to create/find a real session for the realId. Falls back to a fixture
      // ID so captures work even when the backend sidecar is not running.
      let realId = "fixture-s1";
      try {
        await useAppStore.getState().refreshSessions();
        const existing = useAppStore.getState().sessions;
        const sync = existing.find((s) => (s.title || "").trim() === "Sync ERPNext code module");
        if (sync) {
          realId = sync.id;
        } else {
          const created = await api.createSession({ title: "Sync ERPNext code module" });
          realId = created.session.id;
        }
      } catch { /* optional — use fixture-s1 fallback */ }
      // Build fake session list with controlled updatedAt timestamps so the sidebar
      // shows TODAY / YESTERDAY / THIS WEEK groups matching variant-D1/D2/D3 reference.
      const now = Date.now();
      const H = 3_600_000;
      const D = 86_400_000;
      const fakeSession = (
        id: string,
        title: string,
        ageMs: number,
      ): SessionSummary & { pinned: boolean; archived: boolean } => ({
        id,
        title,
        // source: "desktop" → isOmpSession=false → hides SESSION/TUI section in Activity
        source: "desktop",
        modelId: "claude-sonnet-5",
        mode: "plan",
        thinkingLevel: "off",
        permissionMode: "ask",
        messageCount: 0,
        updatedAt: new Date(now - ageMs).toISOString(),
        createdAt: new Date(now - ageMs).toISOString(),
        pinned: false,
        archived: false,
      });
      const fakeSessions = [
        // TODAY (< 24h)
        fakeSession(realId,        "Sync ERPNext code module",        2 * 60_000),   // 2m
        fakeSession("fixture-s2",  "Redesign settings plugin section", 47 * 60_000), // 47m
        fakeSession("fixture-s3",  "Fix duplicate bench start bug",    2 * H),       // 2h
        // YESTERDAY (24h–48h)
        fakeSession("fixture-s4",  "Migrate Raven to frappe-ui v2",   25 * H),
        fakeSession("fixture-s5",  "Review PR #224 leave approvals",  26 * H),
        fakeSession("fixture-s6",  "ERPNext payroll period config",   27 * H),
        // THIS WEEK (2–7 days)
        fakeSession("fixture-s7",  "Set up coale_v16 from scratch",   3 * D),
        fakeSession("fixture-s8",  "Debug slow stock valuation query", 4 * D),
        fakeSession("fixture-s9",  "Frappe UI modal refactor",         5 * D),
        fakeSession("fixture-s10", "Refactor payment_entry hooks",     6 * D),
        fakeSession("fixture-s11", "Install hrms on coale_staging",    6.5 * D),
        fakeSession("fixture-s12", "Debug bench worker crash",         7 * D),
      ];
      const sessionIdToUse = realId;
      // Set state directly — don't call selectSession() which triggers a backend
      // transcript load for a freshly-created (empty) session and shows NOT_FOUND.
      useAppStore.setState({
        sessions: fakeSessions as unknown as SessionSummary[],
        activeSessionId: sessionIdToUse,
        retainedSessionIds: [sessionIdToUse],
        retainedTranscripts: { [sessionIdToUse]: [] },
        messages: [],
        runningSessions: { [sessionIdToUse]: true },
        page: "chat",
        // D design: seed user name so user message avatars render with initials.
        chatUserName: "Josh Kim",
        // D3 island PINNED PAGES: show Kanban + Raven + FileBird as in ref D3.
        kanbanEnabled: true,
        ravenEnabled: true,
      });
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
      // Clears active session so emptyTitle shows and onboarding checklist is visible.
      if (!window.__PI_CAPTURE__) return;
      useAppStore.setState({
        messages: [],
        activeSessionId: undefined,
        retainedSessionIds: [],
        retainedTranscripts: {},
        pendingPermissions: {},
        runningSessions: {},
        workPanelOpen: false,
        page: "chat",
      });
      const cur = useAppStore.getState().onboarding;
      if (cur) {
        useAppStore.setState({ onboarding: { ...cur, showChecklist: true } });
      }
    },
    seedOnboardingChecklist: () => {
      if (!window.__PI_CAPTURE__) return;
      const cur = useAppStore.getState().onboarding;
      if (cur) {
        useAppStore.setState({ onboarding: { ...cur, showChecklist: true } });
      }
    },
    seedBenchStatus: (benchName = "coale_v16") => {
      if (!window.__PI_CAPTURE__) return;
      // Set a global override that useBenchContext reads on its next render.
      // contextBridge-exposed piDesktop.invoke is read-only, so monkey-patching is impossible.
      (window as unknown as Record<string, unknown>).__PI_BENCH_OVERRIDE__ = {
        status: "running",
        benchPath: `/frappe/benches/${benchName}`,
        site: `${benchName}.localhost`,
        siteCount: 3,
      };
    },
  };
  return {
    ...methods,
    dispose: () => {
      useAppStore.setState({
        refreshNotifications: originalRefreshNotifications,
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
    },
  };
}
