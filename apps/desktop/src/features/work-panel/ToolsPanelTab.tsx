/**
 * Tools panel tab — work-panel host for browser/eval/computer/IDA inspectors.
 *
 * One "Tools" tab with four sub-tabs; all data comes from tool_start +
 * tool_end agentMessage events via the existing IPC channel.  No new RPC.
 *
 * Collab participant view omitted: omp never forwards participant data via IPC.
 * Evidence: bridge.ts forwards no collab participant fields as agent events.
 */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { IPC } from "@pi-desktop/shared";
import {
  EMPTY_TOOLS_STATE,
  toolsPanelReducer,
  parseBrowserToolStart,
  parseBrowserToolEnd,
  parseEvalToolEnd,
  parseComputerToolStart,
  parseComputerToolEnd,
  parseIdaToolEnd,
  type BrowserStep,
  type BrowserScreenshot,
  type EvalCell,
  type ComputerAction,
  type ComputerScreenshot,
  type IdaResult,
} from "../../lib/tools-panel";
import { useReferencedImageDataUrl } from "../../lib/use-referenced-image-data-url";
import { useAppStore } from "../../stores/app-store";

// ─── types ─────────────────────────────────────────────────────────────────────

type SubTab = "browser" | "eval" | "computer" | "ida";

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtMs(ms: number | undefined): string {
  if (ms === undefined) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

// ─── sub-components ───────────────────────────────────────────────────────────

/** One file-path screenshot loaded via IPC (browser or computer). */
const FileShot = memo(function FileShot({
  path,
  mimeType,
  alt,
}: {
  path: string;
  mimeType?: string;
  alt: string;
}) {
  const dataUrl = useReferencedImageDataUrl(path, mimeType);
  if (!dataUrl) return null;
  return (
    <div className="tp-screenshot">
      <img
        src={dataUrl}
        alt={alt}
        className="tp-screenshot-img"
        loading="lazy"
      />
    </div>
  );
});

// ─── Browser sub-panel ─────────────────────────────────────────────────────────

const BrowserPanel = memo(function BrowserPanel({
  url,
  title,
  screenshots,
  steps,
}: {
  url?: string;
  title?: string;
  screenshots: readonly BrowserScreenshot[];
  steps: readonly BrowserStep[];
}) {
  const { t } = useTranslation();
  const latest = screenshots.at(-1);
  return (
    <div className="tp-sub-panel">
      {/* latest screenshot */}
      {latest ? (
        <div className="tp-section">
          <FileShot
            path={latest.dest}
            mimeType={latest.mimeType}
            alt={t("chat.toolScreenshot")}
          />
        </div>
      ) : null}
      {/* URL / title */}
      {(url || title) && (
        <div className="tp-meta-row">
          {title ? <span className="tp-meta-title">{title}</span> : null}
          {url ? (
            <span className="tp-meta-url" title={url}>
              {url}
            </span>
          ) : null}
        </div>
      )}
      {/* step history */}
      {steps.length > 0 ? (
        <div className="tp-section">
          <div className="tp-section-label">{t("tools.browserSteps")}</div>
          <div className="tp-step-list">
            {[...steps].reverse().map((s) => (
              <div
                key={s.index}
                className={`tp-step${s.isError ? " tp-step--error" : ""}`}
              >
                <span className="tp-step-action">{s.action}</span>
                {s.url ? (
                  <span className="tp-step-url" title={s.url}>
                    {s.url}
                  </span>
                ) : null}
                <span className="tp-step-time">{fmtTime(s.ts)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {steps.length === 0 && !latest && (
        <div className="tp-empty">{t("tools.noData")}</div>
      )}
    </div>
  );
});

// ─── Eval sub-panel ────────────────────────────────────────────────────────────

const EvalCellRow = memo(function EvalCellRow({ cell }: { cell: EvalCell }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  return (
    <div className={`tp-eval-cell${cell.isError ? " tp-eval-cell--error" : ""}`}>
      <button className="tp-eval-header" onClick={toggle} aria-expanded={open}>
        <span className="tp-eval-lang">
          {cell.language === "python" ? "py" : cell.language === "js" ? "js" : cell.language ?? "?"}
        </span>
        <span className="tp-eval-title">
          {cell.title || t("tools.evalCell", { index: cell.index + 1 })}
        </span>
        {cell.durationMs !== undefined ? (
          <span className="tp-eval-dur">{fmtMs(cell.durationMs)}</span>
        ) : null}
        <span className={`tp-eval-status tp-eval-status--${cell.status}`}>
          {cell.status}
        </span>
        <span className="tp-eval-chevron">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="tp-eval-body">
          <pre className="tp-eval-code">{cell.code}</pre>
          {cell.output ? (
            <pre
              className={`tp-eval-output${cell.isError ? " tp-eval-output--error" : ""}`}
            >
              {cell.output}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

const EvalPanel = memo(function EvalPanel({
  cells,
}: {
  cells: readonly EvalCell[];
}) {
  const { t } = useTranslation();
  if (cells.length === 0) return <div className="tp-empty">{t("tools.noData")}</div>;
  return (
    <div className="tp-sub-panel">
      {[...cells].reverse().map((c) => (
        <EvalCellRow key={c.index} cell={c} />
      ))}
    </div>
  );
});

// ─── Computer sub-panel ────────────────────────────────────────────────────────

const ComputerPanel = memo(function ComputerPanel({
  screenshots,
  actions,
}: {
  screenshots: readonly ComputerScreenshot[];
  actions: readonly ComputerAction[];
}) {
  const { t } = useTranslation();
  const latest = screenshots.at(-1);
  const lastAction = actions.at(-1);
  return (
    <div className="tp-sub-panel">
      {/* latest screenshot */}
      {latest ? (
        <div className="tp-section tp-section--screenshot">
          <FileShot path={latest.path} alt={t("chat.toolScreenshot")} />
          {/* action overlay: show last action kind/chain */}
          {lastAction ? (
            <div className="tp-computer-overlay">
              <span className="tp-computer-action">{lastAction.kind}</span>
              {lastAction.chain ? (
                <span className="tp-computer-chain">{lastAction.chain}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {/* action history */}
      {actions.length > 0 ? (
        <div className="tp-section">
          <div className="tp-section-label">{t("tools.computerActions")}</div>
          <div className="tp-step-list">
            {[...actions].reverse().map((a) => (
              <div
                key={a.index}
                className={`tp-step${a.isError ? " tp-step--error" : ""}`}
              >
                <span className="tp-step-action">{a.kind}</span>
                {a.chain ? (
                  <span className="tp-step-url">{a.chain}</span>
                ) : null}
                <span className="tp-step-time">{fmtTime(a.ts)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {actions.length === 0 && !latest && (
        <div className="tp-empty">{t("tools.noData")}</div>
      )}
    </div>
  );
});

// ─── IDA sub-panel ─────────────────────────────────────────────────────────────

const IdaResultRow = memo(function IdaResultRow({ result }: { result: IdaResult }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  return (
    <div className={`tp-ida-row${result.isError ? " tp-ida-row--error" : ""}`}>
      <button className="tp-eval-header" onClick={toggle} aria-expanded={open}>
        <span className="tp-eval-lang">{result.action}</span>
        {result.db ? <span className="tp-eval-title">{result.db}</span> : null}
        <span className="tp-step-time">{fmtTime(result.ts)}</span>
        {result.output ? (
          <span className="tp-eval-chevron">{open ? "▾" : "▸"}</span>
        ) : null}
      </button>
      {open && result.output ? (
        <div className="tp-eval-body">
          <pre className="tp-eval-output">{result.output}</pre>
        </div>
      ) : null}
    </div>
  );
});

const IdaPanel = memo(function IdaPanel({ results }: { results: readonly IdaResult[] }) {
  const { t } = useTranslation();
  if (results.length === 0) return <div className="tp-empty">{t("tools.noData")}</div>;
  return (
    <div className="tp-sub-panel">
      {[...results].reverse().map((r) => (
        <IdaResultRow key={r.index} result={r} />
      ))}
    </div>
  );
});

// ─── main tab ─────────────────────────────────────────────────────────────────

export const ToolsPanelTab = memo(function ToolsPanelTab({
  sessionId,
}: {
  sessionId: string | undefined;
}) {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(toolsPanelReducer, EMPTY_TOOLS_STATE);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("browser");

  // Per-tool monotone counters — refs so closures in the listener always read
  // the latest value without needing to be recreated on every event.
  const browserStep = useRef({ current: 0 });
  const evalCell = useRef({ current: 0 });
  const computerAction = useRef({ current: 0 });
  const idaIdx = useRef({ current: 0 });

  // Reset state and counters when session changes.
  useEffect(() => {
    dispatch({ type: "clear" });
    browserStep.current = { current: 0 };
    evalCell.current = { current: 0 };
    computerAction.current = { current: 0 };
    idaIdx.current = { current: 0 };
  }, [sessionId]);

  // Subscribe to agentMessage events.
  useEffect(() => {
    const bridge = window.piDesktop;
    if (!bridge?.on) return;

    return bridge.on(IPC.event.agentMessage, (raw: unknown) => {
      if (!raw || typeof raw !== "object") return;
      if (!("sessionId" in raw) || raw.sessionId !== sessionId) return;
      if (!("event" in raw)) return;

      const event: unknown = raw.event;
      if (!event || typeof event !== "object") return;
      if (!("type" in event)) return;
      // Narrow to Record after guards.
      const e = event as Record<string, unknown>;

      if (e.type === "tool_start") {
        const ba = parseBrowserToolStart(e, browserStep.current);
        if (ba) { dispatch(ba); return; }
        const ca = parseComputerToolStart(e, computerAction.current);
        if (ca) dispatch(ca);
        return;
      }

      if (e.type !== "tool_end") return;

      const bd = parseBrowserToolEnd(e, browserStep.current);
      if (bd) { dispatch(bd); return; }
      const ed = parseEvalToolEnd(e, evalCell.current);
      if (ed) { dispatch(ed); return; }
      const cd = parseComputerToolEnd(e, computerAction.current);
      if (cd) { dispatch(cd); return; }
      const id = parseIdaToolEnd(e, idaIdx.current);
      if (id) dispatch(id);
    });
  }, [sessionId]);

  // Badge counts for sub-tab labels.
  const browserCount = state.browser.steps.length;
  const evalCount = state.eval.cells.length;
  const computerCount = state.computer.actions.length;
  const idaCount = state.ida.results.length;

  const subTabs: { id: SubTab; label: string; count: number }[] = useMemo(
    () => [
      { id: "browser", label: t("tools.tabs.browser"), count: browserCount },
      { id: "eval",    label: t("tools.tabs.eval"),    count: evalCount },
      { id: "computer",label: t("tools.tabs.computer"),count: computerCount },
      { id: "ida",     label: t("tools.tabs.ida"),     count: idaCount },
    ],
    [t, browserCount, evalCount, computerCount, idaCount],
  );

  return (
    <div className="tp-root">
      {/* sub-tab strip */}
      <div className="tp-subtab-strip" role="tablist" aria-label={t("tools.title")}>
        {subTabs.map(({ id, label, count }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeSubTab === id}
            className={`tp-subtab${activeSubTab === id ? " tp-subtab--active" : ""}`}
            onClick={() => setActiveSubTab(id)}
          >
            {label}
            {count > 0 ? (
              <span className="tp-subtab-count">{count}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* active sub-panel */}
      <div className="tp-content" role="tabpanel">
        {activeSubTab === "browser" && (
          <BrowserPanel
            url={state.browser.url}
            title={state.browser.title}
            screenshots={state.browser.screenshots}
            steps={state.browser.steps}
          />
        )}
        {activeSubTab === "eval" && <EvalPanel cells={state.eval.cells} />}
        {activeSubTab === "computer" && (
          <ComputerPanel
            screenshots={state.computer.screenshots}
            actions={state.computer.actions}
          />
        )}
        {activeSubTab === "ida" && <IdaPanel results={state.ida.results} />}
      </div>
    </div>
  );
});
