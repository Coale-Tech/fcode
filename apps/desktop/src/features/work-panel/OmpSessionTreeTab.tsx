/**
 * OmpSessionTreeTab — session branch-history view (feat/session-data).
 *
 * Fetches `get_entries`, shows user messages as an indented tree (parentId
 * links), and on click forks the session from that message via omp `branch`,
 * prefilling the returned message text into the Composer.
 */
import { memo, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { branchPointPreview, buildFlatTree, type SessionTreeNode } from "./session-tree";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; nodes: SessionTreeNode[] }
  | { status: "error"; message: string };

type Action =
  | { type: "load" }
  | { type: "done"; nodes: SessionTreeNode[] }
  | { type: "fail"; message: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "load": return { status: "loading" };
    case "done": return { status: "loaded", nodes: action.nodes };
    case "fail": return { status: "error", message: action.message };
    default: return state;
  }
}

export const OmpSessionTreeTab = memo(function OmpSessionTreeTab() {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(reducer, { status: "idle" });
  const [branching, setBranching] = useState<string | null>(null);
  const showToast = useAppStore((s) => s.showToast);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    dispatch({ type: "load" });
    try {
      const result = await api.ompSessionEntries();
      if (ac.signal.aborted) return;
      dispatch({ type: "done", nodes: buildFlatTree(result.entries) });
    } catch (e) {
      if (ac.signal.aborted) return;
      dispatch({ type: "fail", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { abortRef.current?.abort(); };
  }, [load]);

  const branchFrom = useCallback(async (node: SessionTreeNode) => {
    if (branching || !window.confirm(t("chat.ompSessionTreeBranchConfirm"))) return;
    setBranching(node.entry.id);
    try {
      const result = await api.ompSessionBranch(node.entry.id);
      if (result.cancelled) return;
      if (activeSessionId) {
        useAppStore.setState({
          composerPrefill: { sessionId: activeSessionId, text: result.text, fileReferences: [] },
        });
      }
      showToast(t("chat.ompSessionTreeBranched"), { variant: "success" });
      void load();
    } catch (e) {
      showToast(
        t("chat.ompSessionTreeBranchFailed", { error: e instanceof Error ? e.message : String(e) }),
        { variant: "error" },
      );
    } finally {
      setBranching(null);
    }
  }, [activeSessionId, branching, load, showToast, t]);

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
              className="omp-session-tree-node"
              style={{ paddingLeft: `${node.depth * 12 + 8}px` }}
            >
              <button
                type="button"
                className="omp-session-tree-node-btn"
                onClick={() => void branchFrom(node)}
                disabled={branching !== null}
                title={t("chat.ompSessionTreeBranch")}
              >
                <span className="omp-session-tree-node-label">{branchPointPreview(node.entry)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
