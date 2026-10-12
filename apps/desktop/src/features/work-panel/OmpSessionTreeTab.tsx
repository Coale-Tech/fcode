/**
 * OmpSessionTreeTab — session branch-history and surface view (slice D).
 *
 * Lists branch points (user messages) from get_entries; lets the user:
 *   - branch from a message point (omp `branch` RPC)
 *   - copy branch messages
 *   - start a new session (omp `new_session` RPC)
 *   - page through message history (omp `get_messages_page` RPC)
 *
 * switch_session: available via api.ompSwitchSession(); not exposed in the tree
 * panel directly because it requires a session directory path, which is not
 * present in the flat entry list. Callers that know the path may invoke it via
 * the api.
 */
import { memo, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { branchPointPreview, buildFlatTree, type SessionTreeNode } from "./session-tree";
import { DestructiveActionDialog } from "../../components/DestructiveActionDialog";

type TreeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; nodes: SessionTreeNode[] }
  | { status: "error"; message: string };

type TreeAction =
  | { type: "load" }
  | { type: "done"; nodes: SessionTreeNode[] }
  | { type: "fail"; message: string };

function treeReducer(state: TreeState, action: TreeAction): TreeState {
  switch (action.type) {
    case "load": return { status: "loading" };
    case "done": return { status: "loaded", nodes: action.nodes };
    case "fail": return { status: "error", message: action.message };
    default: return state;
  }
}

/** One page of messages (shape opaque; we only show role + text preview). */
interface MsgPage {
  messages: unknown[];
  nextCursor?: string;
  totalMessages: number;
}

type MsgState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; page: MsgPage; cursor?: string }
  | { status: "error"; message: string };

type MsgAction =
  | { type: "load" }
  | { type: "done"; page: MsgPage; cursor?: string }
  | { type: "fail"; message: string };

function msgReducer(state: MsgState, action: MsgAction): MsgState {
  switch (action.type) {
    case "load": return { status: "loading" };
    case "done": return { status: "loaded", page: action.page, cursor: action.cursor };
    case "fail": return { status: "error", message: action.message };
    default: return state;
  }
}

function msgPreview(msg: unknown): string {
  if (!msg || typeof msg !== "object") return "";
  const m = msg as Record<string, unknown>;
  const role = typeof m.role === "string" ? m.role : "?";
  let text = "";
  if (typeof m.content === "string") text = m.content;
  else if (Array.isArray(m.content)) {
    for (const b of m.content) {
      if (b && typeof b === "object" && "text" in b && typeof (b as Record<string, unknown>).text === "string") {
        text = (b as Record<string, unknown>).text as string;
        break;
      }
    }
  }
  const line = text.trim().split("\n")[0] ?? "";
  return `[${role}] ${line.length > 70 ? `${line.slice(0, 70)}…` : line}`;
}

export const OmpSessionTreeTab = memo(function OmpSessionTreeTab() {
  const { t } = useTranslation();
  const [treeState, treeDispatch] = useReducer(treeReducer, { status: "idle" });
  const [msgState, msgDispatch] = useReducer(msgReducer, { status: "idle" });
  const [tab, setTab] = useState<"tree" | "messages">("tree");
  const [branching, setBranching] = useState<string | null>(null);
  const [startingNew, setStartingNew] = useState(false);
  const [pendingBranch, setPendingBranch] = useState<SessionTreeNode | null>(null);
  const showToast = useAppStore((s) => s.showToast);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const abortRef = useRef<AbortController | null>(null);

  const loadTree = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    treeDispatch({ type: "load" });
    try {
      const result = await api.ompSessionEntries();
      if (ac.signal.aborted) return;
      treeDispatch({ type: "done", nodes: buildFlatTree(result.entries) });
    } catch (e) {
      if (ac.signal.aborted) return;
      treeDispatch({ type: "fail", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  const loadMessages = useCallback(async (cursor?: string) => {
    msgDispatch({ type: "load" });
    try {
      const result = await api.ompSessionGetMessagesPage(cursor ? { cursor } : {});
      msgDispatch({ type: "done", page: result, cursor });
    } catch (e) {
      msgDispatch({ type: "fail", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    void loadTree();
    return () => { abortRef.current?.abort(); };
  }, [loadTree]);

  useEffect(() => {
    if (tab === "messages") void loadMessages();
  }, [tab, loadMessages]);

  const doBranch = useCallback(async (node: SessionTreeNode) => {
    setPendingBranch(null);
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
      void loadTree();
    } catch (e) {
      showToast(
        t("chat.ompSessionTreeBranchFailed", { error: e instanceof Error ? e.message : String(e) }),
        { variant: "error" },
      );
    } finally {
      setBranching(null);
    }
  }, [activeSessionId, loadTree, showToast, t]);

  const branchMessages = useCallback(async () => {
    try {
      const result = await api.ompSessionBranchMessages();
      if (result.messages.length === 0) {
        showToast(t("chat.ompSessionBranchMessagesEmpty"), { variant: "info" });
        return;
      }
      const text = result.messages.map((m: { text: string }) => m.text).join("\n---\n");
      await navigator.clipboard.writeText(text);
      showToast(t("chat.ompSessionBranchMessagesCopied", { count: result.messages.length }), {
        variant: "success",
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), { variant: "error" });
    }
  }, [showToast, t]);

  const doNewSession = useCallback(async () => {
    setStartingNew(true);
    try {
      const result = await api.ompNewSession();
      if (!result.cancelled) {
        showToast(t("chat.ompNewSessionStarted"), { variant: "success" });
        void loadTree();
      }
    } catch (e) {
      showToast(
        t("chat.ompNewSessionFailed", { error: e instanceof Error ? e.message : String(e) }),
        { variant: "error" },
      );
    } finally {
      setStartingNew(false);
    }
  }, [loadTree, showToast, t]);

  return (
    <div className="omp-session-tree-tab">
      {pendingBranch && (
        <DestructiveActionDialog
          site={branchPointPreview(pendingBranch.entry)}
          command={t("chat.ompSessionTreeBranch")}
          consequence={t("chat.ompSessionBranchConsequence")}
          onConfirm={() => void doBranch(pendingBranch)}
          onCancel={() => setPendingBranch(null)}
        />
      )}
      <div className="omp-session-tree-header">
        <button
          type="button"
          className="omp-session-tree-refresh"
          onClick={() => { if (tab === "tree") void loadTree(); else void loadMessages(); }}
          disabled={treeState.status === "loading" || msgState.status === "loading"}
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
        <button
          type="button"
          className="omp-session-tree-new-session"
          onClick={() => void doNewSession()}
          disabled={startingNew}
          title={t("chat.ompNewSession")}
        >
          {t("chat.ompNewSession")}
        </button>
      </div>

      <div className="omp-session-tree-tabs">
        <button
          type="button"
          className={`omp-session-tree-tab-btn${tab === "tree" ? " active" : ""}`}
          onClick={() => setTab("tree")}
        >
          {t("chat.ompSessionTreeTab")}
        </button>
        <button
          type="button"
          className={`omp-session-tree-tab-btn${tab === "messages" ? " active" : ""}`}
          onClick={() => setTab("messages")}
        >
          {t("chat.ompSessionMessagesTab")}
        </button>
      </div>

      {tab === "tree" && (
        <>
          {treeState.status === "loading" && (
            <div className="omp-session-tree-loading">{t("chat.ompSessionTreeLoading")}</div>
          )}
          {treeState.status === "error" && (
            <div className="omp-session-tree-error">{treeState.message}</div>
          )}
          {treeState.status === "loaded" && treeState.nodes.length === 0 && (
            <div className="omp-session-tree-empty">{t("chat.ompSessionTreeEmpty")}</div>
          )}
          {treeState.status === "loaded" && treeState.nodes.length > 0 && (
            <ul className="omp-session-tree-list">
              {treeState.nodes.map((node) => (
                <li
                  key={node.entry.id}
                  className="omp-session-tree-node"
                  style={{ paddingLeft: `${node.depth * 12 + 8}px` }}
                >
                  <button
                    type="button"
                    className="omp-session-tree-node-btn"
                    onClick={() => { if (!branching) setPendingBranch(node); }}
                    disabled={branching !== null}
                    title={t("chat.ompSessionTreeBranch")}
                  >
                    <span className="omp-session-tree-node-label">{branchPointPreview(node.entry)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "messages" && (
        <div className="omp-session-messages-pane">
          {msgState.status === "loading" && (
            <div className="omp-session-tree-loading">{t("chat.ompSessionMessagesLoading")}</div>
          )}
          {msgState.status === "error" && (
            <div className="omp-session-tree-error">{msgState.message}</div>
          )}
          {msgState.status === "loaded" && (
            <>
              <div className="omp-session-messages-count">
                {t("chat.ompSessionMessagesTotal", { count: msgState.page.totalMessages })}
              </div>
              <ul className="omp-session-messages-list">
                {msgState.page.messages.map((msg, i) => (
                  // ponytail: index key is fine here — list is stable within one page
                  // eslint-disable-next-line react/no-array-index-key
                  <li key={i} className="omp-session-message-item">
                    {msgPreview(msg)}
                  </li>
                ))}
              </ul>
              {msgState.page.nextCursor && (
                <button
                  type="button"
                  className="omp-session-messages-next"
                  onClick={() => void loadMessages(msgState.page.nextCursor)}
                >
                  {t("chat.ompSessionMessagesNext")}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});
