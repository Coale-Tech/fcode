/**
 * Pure helpers for OmpSessionTreeTab. omp's `branch` RPC only accepts the id of
 * a user-message entry (AgentSession.branch throws otherwise), so user messages
 * are the only branch points shown; every other entry is a pass-through.
 */
import type { OmpSessionEntry } from "@pi-desktop/shared";

export interface SessionTreeNode {
  entry: OmpSessionEntry;
  depth: number;
}

export function isBranchPoint(entry: OmpSessionEntry): boolean {
  return entry.type === "message" && entry.message?.role === "user";
}

/** Depth-first flatten of `get_entries` by parentId; depth counts branch-point ancestors only. */
export function buildFlatTree(entries: OmpSessionEntry[]): SessionTreeNode[] {
  const children = new Map<string | null, OmpSessionEntry[]>();
  for (const entry of entries) {
    const list = children.get(entry.parentId);
    if (list) list.push(entry);
    else children.set(entry.parentId, [entry]);
  }
  const result: SessionTreeNode[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const entry of children.get(parentId) ?? []) {
      if (isBranchPoint(entry)) {
        result.push({ entry, depth });
        walk(entry.id, depth + 1);
      } else {
        walk(entry.id, depth);
      }
    }
  };
  walk(null, 0);
  return result;
}

/** First line of a user message's text (string or text-block content), max 80 chars. */
export function branchPointPreview(entry: OmpSessionEntry): string {
  const content = entry.message?.content;
  let text = "";
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) {
    for (const block of content) {
      if (block && typeof block === "object" && "text" in block && typeof block.text === "string") {
        text = block.text;
        break;
      }
    }
  }
  const line = text.trim().split("\n")[0] ?? "";
  if (!line) return entry.id.slice(0, 8);
  return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}
