import { IPC } from "@pi-desktop/shared";
import type { KanbanBoard } from "./kanban-core";
import { createKanbanRunner } from "./kanban-runner";
import { readKanbanSettings } from "./kanban-settings";
import { loadBoard, saveBoard } from "./kanban-store";

type KanbanLabels = {
  kanban: { notify: { blocked: string; done: string; dailyCap: string } };
};

type HostCaller = {
  call<T = unknown>(method: string, params: unknown): Promise<T>;
};

export function createKanbanWiring(deps: {
  dataDir: string;
  getHost: () => HostCaller | null | undefined;
  sendToRenderer: (channel: string, payload: unknown) => void;
  getLabels: () => KanbanLabels;
  logError: (error: unknown) => void;
}) {
  const { dataDir, getHost, sendToRenderer, getLabels, logError } = deps;

  const emitKanbanMutation = (prev: KanbanBoard, next: KanbanBoard) => {
    const labels = getLabels();
    for (const task of next.tasks) {
      const old = prev.tasks.find((t) => t.id === task.id);
      if (!old || old.status === task.status) continue;
      if (task.status === "blocked" || task.status === "done") {
        const template =
          task.status === "blocked" ? labels.kanban.notify.blocked : labels.kanban.notify.done;
        sendToRenderer(IPC.event.toast, { message: template.replace("{title}", task.title) });
        const notification = {
          id: crypto.randomUUID(),
          kind: task.status === "done" ? "task.completed" : "task.failed",
          sessionId: task.sessionId ?? task.id,
          sessionTitle: task.title,
          turnId: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          readAt: null,
        } as const;
        sendToRenderer(IPC.event.notificationChanged, { notification });
      }
    }
  };

  // Bound by registerIpc: workers must go through the real agentPrompt handler
  // (sidecar launch params, durable turn). The host has no `agent.prompt`.
  let invokeIpc: ((channel: string, args: readonly unknown[]) => Promise<unknown>) | null = null;
  const bindInvoke = (fn: typeof invokeIpc) => {
    invokeIpc = fn;
  };

  // Bound once the sidecar runtime exists (it is built after this wiring).
  // omp's working directory is fixed at process spawn, so every worker gets its
  // own omp process started in its card's folder; that is also what lets
  // several workers run at once.
  type WorkerProcesses = {
    start: (sessionId: string, cwd: string) => Promise<void>;
    release: (sessionId: string) => Promise<void>;
  };
  let workers: WorkerProcesses | null = null;
  const bindWorkers = (w: WorkerProcesses) => {
    workers = w;
  };
  const workerFolders = new Map<string, string>();
  const ensureWorker = async (sessionId: string) => {
    const cwd = workerFolders.get(sessionId);
    if (!workers || !cwd) throw new Error("worker processes unavailable");
    await workers.start(sessionId, cwd);
  };

  const requireHost = () => {
    const h = getHost();
    if (!h) throw new Error("host unavailable");
    return h;
  };

  const kanbanRunner = createKanbanRunner({
    getSettings: () => readKanbanSettings(dataDir),
    getBoard: () => loadBoard(dataDir),
    saveBoard: (board) => {
      void saveBoard(dataDir, board);
    },
    createSession: async (input) => {
      const res = await requireHost().call<{ session?: { id?: string } | null }>("session.create", {
        title: input.title,
        projectPath: input.projectPath,
        mode: "agent",
      });
      const sessionId = res.session?.id;
      if (!sessionId) throw new Error("session.create returned no id");
      workerFolders.set(sessionId, input.projectPath);
      try {
        await ensureWorker(sessionId);
      } catch (error) {
        workerFolders.delete(sessionId);
        throw error;
      }
      return sessionId;
    },
    prompt: async (sessionId, content) => {
      if (!invokeIpc) throw new Error("agent prompt handler unavailable");
      // A worker whose process died is brought back before it is re-prompted.
      await ensureWorker(sessionId);
      await invokeIpc(IPC.invoke.agentPrompt, [{ sessionId, content }]);
    },
    releaseWorker: (sessionId) => {
      workerFolders.delete(sessionId);
      void workers?.release(sessionId).catch(logError);
    },
    notifyDailyCap: (maxSpawns) => {
      sendToRenderer(IPC.event.toast, {
        message: getLabels().kanban.notify.dailyCap.replace("{count}", String(maxSpawns)),
      });
    },
    sendChanged: () => sendToRenderer(IPC.event.kanbanChanged, {}),
    report: logError,
    onBoardMutation: emitKanbanMutation,
  });

  return { kanbanRunner, emitKanbanMutation, bindInvoke, bindWorkers };
}
