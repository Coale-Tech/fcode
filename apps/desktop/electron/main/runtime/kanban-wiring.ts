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
      return sessionId;
    },
    prompt: async (sessionId, content) => {
      await requireHost().call("agent.prompt", { sessionId, content });
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

  return { kanbanRunner, emitKanbanMutation };
}
