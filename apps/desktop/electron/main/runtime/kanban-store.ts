/**
 * Kanban board persistence — atomic temp+rename write, no PersistenceOutbox.
 * ponytail: single JSON document; move to SQLite if it outgrows a few thousand cards.
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { emptyBoard, type KanbanBoard } from "./kanban-core";

export const BOARD_FILE = "kanban-board.json";

export function loadBoard(dataDir: string): KanbanBoard {
  const file = join(dataDir, BOARD_FILE);
  try {
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<KanbanBoard>;
    // Merge with empty board so new fields have defaults
    return {
      tasks: parsed.tasks ?? [],
      links: parsed.links ?? [],
      comments: parsed.comments ?? [],
      runs: parsed.runs ?? [],
      events: parsed.events ?? [],
      dailyStats: parsed.dailyStats ?? [],
    };
  } catch {
    return emptyBoard();
  }
}

export function saveBoard(dataDir: string, board: KanbanBoard): void {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, BOARD_FILE);
  const tmp = join(dirname(file), `.kanban-tmp-${randomUUID()}.json`);
  writeFileSync(tmp, JSON.stringify(board, null, 2), "utf8");
  renameSync(tmp, file);
}
