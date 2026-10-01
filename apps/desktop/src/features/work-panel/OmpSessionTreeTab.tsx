/**
 * OmpSessionTreeTab — read-only session branch-history view (feat/session-data).
 *
 * Fetches `get_entries` on mount, builds a tree from parentId links, and renders
 * it as a flat indented list. Clicking a leaf-like entry calls `switch_session`
 * so the user can navigate to that branch.
 *
 * Only message entries (role = assistant) are shown as branch points; structural
 * entries (model_change, compaction, …) are collapsed so the list stays readable.
 */
import { memo, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import type { OmpSessionEntry } from "@pi-desktop/shared";
import { useAppStore } from "../../stores/app-store";

// ─── tree building ────────────────────────────────────────────────────────────

interface TreeNode {
  entry: OmpSessionEntry;
  depth: number;
  isLeaf: boolean;
  isActive: boolean;
}

function buildFlatTree(entries: OmpSessionEntry[], leafId: string | null): TreeNode[] {
  if (entries.length === 0) return [];

  // Build children map.
  const children = new Map<string | null, OmpSessionEntry[]>();
  for (const entry of entries) {
    const pid = entry.parentId ?? null;
    const list = children.get(pid);
    if (list) list.push(entry);
    else children.set(pid, [entry]);
  }

  // Only show message entries with role === "assistant" or type === "message" without subtype.
  const isVisible = (e: OmpSessionEntry) =>
    e.type === "message" && (e.role === "assistant" || !e.role);

  const visibleIds = new Set(entries.filter(isVisible).map((e) => e.id));

  // Depth-first flatten, tracking depth by visible ancestors only.
  const result: TreeNode[] = [];
  const childIds = new Set(entries.filter((e) => e.parentId !== null).map((e) => e.id));

  const walk = (parentId: string | null, depth: number) => {
    const kids = children.get(parentId) ?? [];
    for (const entry of kids) {
      if (visibleIds.has(entry.id)) {
        const isLeaf = !(children.get(entry.id) ?? []).some((c) => visibleIds.has(c.id));
        result.push({
          entry,
          depth,
          isLeaf,
          isActive: entry.id === leafId,
        });
        walk(entry.id, depth + 1);
      } else {
        // Pass-through: recurse without incrementing depth.
        walk(entry.id, depth);
      }
    }
  };

  walk(null, 0);

  // Fallback: if nothing showed (no assistant messages), show all entries.
  if (result.length === 0) {
    for (const entry of entries) {
      const isLeaf = !childIds.has(entry.id);
      result.push({ entry, depth: 0, isLeaf, isActive: entry.id === leafId });
    }
  }

  return result;
}

// ─── label formatting ─────────────────────────────────────────────────────────

function entryLabel(node: TreeNode): string {
  if (node.entry.label) return node.entry.label;
  const ts = node.entry.timestamp;
  if (ts) {
    const d = new Date(typeof ts === "number" ? ts : ts);
    if (!isNaN(d.getTime())) return d.toLocaleString();
  }
  return node.entry.id.slice(0, 8) + "…";
}

// ─── reducer ──────────────────────────────────────────────────────────────────

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; nodes: TreeNode[]; leafId: string | null }
  | { status: "error"; message: string };

type Action =
  | { type: "load" }
  | { type: "done"; nodes: TreeNode[]; leafId: string | null }
  | { type: "fail"; message: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "load": return { status: "loading" };
    case "done": return { status: "loaded", nodes: action.nodes, leafId: action.leafId };
    case "fail": return { status: "error", message: action.message };
    default: return state;
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export const OmpSessionTreeTab = memo(function OmpSessionTreeTab() {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(reducer, { status: "idle" });
  const [switching, setSwitching] = useState<string | null>(null);
  const showToast = useAppStore((s) => s.showToast);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    dispatch({ type: "load" });
    try {
      const result = await api.ompSessionEntries();
      if (ac.signal.aborted) return;
      const nodes = buildFlatTree(result.entries, result.leafId);
      dispatch({ type: "done", nodes, leafId: result.leafId });
    } catch (e) {
      if (ac.signal.aborted) return;
      dispatch({ type: "fail", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { abortRef.current?.abort(); };
  }, [load]);

  const switchTo = useCallback(async (node: TreeNode) => {
    if (switching) return;
    setSwitching(node.entry.id);
    try {
      // get_entries returns entries with id but not a sessionPath; we need the
      // sessionFile. The entry doesn't carry it directly — use the entry id as
      // the sessionPath hint. In practice omp's switch_session accepts the
      // JSONL session file path; we use the parent session dir + entry id lookup.
      // For now we store the raw entry.id; a future enhancement can resolve to
      // the JSONL path via a separate RPC.
      // ponytail: entry id used as sessionPath; requires omp to resolve by id.
      await api.ompSessionSwitch(node.entry.id);
      showToast(t("chat.ompSessionTreeSwitched"), { variant: "success" });
      void load();
    } catch (e) {
      showToast(
        t("chat.ompSessionTreeSwitchFailed", { error: e instanceof Error ? e.message : String(e) }),
        { variant: "error" },
      );
    } finally {
      setSwitching(null);
    }
  }, [load, showToast, switching, t]);

  const branchMessages = useCallback(async () => {
    try {
      const result = await api.ompSessionBranchMessages();
      if (result.messages.length === 0) {
        showToast(t("chat.ompSessionBranchMessagesEmpty"), { variant: "info" });
        return;
      }
      const text = result.messages.map((m) => m.text).join("\n---\n");
      await navigator.clipboard.writeText(text);
      showToast(t("chat.ompSessionBranchMessagesCopied", { count: result.messages.length }), {
        variant: "success",
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), { variant: "error" });
    }
  }, [showToast, t]);

  return (
    <div className="omp-session-tree-tab">
      <div className="omp-session-tree-header">
        <button
          type="button"
          className="omp-session-tree-refresh"
          onClick={() => void load()}
          disabled={state.status === "loading"}
          aria-label={t("chat.ompSessionTreeRefresh")}
          title={t("chat.ompSessionTreeRefresh")}
        >
          ↻
        </button>
        <button
          type="button"
          className="omp-session-tree-copy-branch"
          onClick={() => void branchMessages()}
          title={t("chat.ompSessionBranchMessagesCopy")}
        >
          {t("chat.ompSessionBranchMessagesCopy")}
        </button>
      </div>

      {state.status === "loading" && (
        <div className="omp-session-tree-loading">{t("chat.ompSessionTreeLoading")}</div>
      )}
      {state.status === "error" && (
        <div className="omp-session-tree-error">{state.message}</div>
      )}
      {state.status === "loaded" && state.nodes.length === 0 && (
        <div className="omp-session-tree-empty">{t("chat.ompSessionTreeEmpty")}</div>
      )}
      {state.status === "loaded" && state.nodes.length > 0 && (
        <ul className="omp-session-tree-list">
          {state.nodes.map((node) => (
            <li
              key={node.entry.id}
              className={[
                "omp-session-tree-node",
                node.isActive ? "is-active" : "",
                node.isLeaf ? "is-leaf" : "",
              ].filter(Boolean).join(" ")}
              style={{ paddingLeft: `${node.depth * 12 + 8}px` }}
            >
              <button
                type="button"
                className="omp-session-tree-node-btn"
                onClick={() => void switchTo(node)}
                disabled={switching !== null || node.isActive}
                aria-pressed={node.isActive}
                title={node.isActive ? t("chat.ompSessionTreeCurrent") : t("chat.ompSessionTreeSwitch")}
              >
                <span className="omp-session-tree-node-icon" aria-hidden>
                  {node.isActive ? "●" : "○"}
                </span>
                <span className="omp-session-tree-node-label">{entryLabel(node)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
