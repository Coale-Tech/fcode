import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { IPC } from "@pi-desktop/shared";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { IconClose, IconPlus } from "./icons";

/** Report drawn output in chunks below FileBird's resume mark, or a paused flood never resumes. */
const ACK_EVERY_CHARS = 5_000;

/** ANSI palette for shell output, FileBird's (apps/filebird TerminalView); the panel chrome uses tokens. */
const THEME = {
  background: "#0b0d12",
  foreground: "#e4e4e7",
  cursor: "#38bdf8",
  cursorAccent: "#0b0d12",
  selectionBackground: "rgba(56, 189, 248, 0.32)",
  black: "#11141b",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#fbbf24",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#e4e4e7",
  brightBlack: "#52525b",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fcd34d",
  brightBlue: "#93c5fd",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#fafafa",
};

type Tab = { key: number; cwd?: string };

/** FileBird's IPC errors carry a JSON `{code, message}` payload in the message. */
function errorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  try {
    const payload: unknown = JSON.parse(message.slice(message.indexOf("{")));
    if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") {
      return payload.message;
    }
  } catch {
    // Not FileBird's payload: show the raw message.
  }
  return message;
}

// Unchecked: both events come from FileBird's TerminalService in Fcode's own main process.
type DataEvent = { id: string; data: Uint8Array };
type ExitEvent = { id: string; code: number | null; signal: string | null };

/** One shell: xterm here, the PTY in the main process (FileBird's TerminalService). */
function TerminalInstance({ cwd, visible }: { cwd?: string; visible: boolean }) {
  const holder = useRef<HTMLDivElement>(null);
  const refit = useRef<() => void>(() => undefined);

  useEffect(() => {
    const container = holder.current;
    const bridge = window.piDesktop;
    if (!container || !bridge) return;
    const terminal = new Terminal({
      windowOptions: {},
      scrollback: 5_000,
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.15,
      theme: THEME,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    let disposed = false;
    let id: string | null = null;
    let sinceAck = 0;
    const fitToBox = () => {
      // A hidden box has no size to fit to; it is fitted again when shown.
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      try {
        fit.fit();
      } catch {
        // Fitting a terminal that is going away is not worth reporting.
      }
    };
    refit.current = () => {
      fitToBox();
      terminal.focus();
    };
    fitToBox();

    const stopData = bridge.on(IPC.event.terminalData, (payload) => {
      const event = payload as DataEvent;
      if (event.id !== id) return;
      terminal.write(event.data, () => {
        sinceAck += event.data.length;
        if (sinceAck < ACK_EVERY_CHARS || id === null) return;
        void api.terminalAck(id, sinceAck);
        sinceAck = 0;
      });
    });
    const stopExit = bridge.on(IPC.event.terminalExit, (payload) => {
      const event = payload as ExitEvent;
      if (event.id !== id) return;
      id = null;
      const how = event.signal ?? (event.code !== null ? `status ${event.code}` : "closed");
      terminal.write(`\r\n\x1b[38;5;245m[session ended: ${how}]\x1b[0m\r\n`);
    });
    const typed = terminal.onData((data) => {
      if (id !== null) void api.terminalWrite(id, new TextEncoder().encode(data));
    });
    const typedBinary = terminal.onBinary((data) => {
      if (id !== null) void api.terminalWrite(id, Uint8Array.from(data, (char) => char.charCodeAt(0) & 0xff));
    });
    const resized = terminal.onResize(({ cols, rows }) => {
      if (id !== null) void api.terminalResize(id, cols, rows);
    });
    const observer = new ResizeObserver(fitToBox);
    observer.observe(container);

    // A native dialog blurs the window; when it closes, give the keys back to
    // the terminal if it had them, or they land on <body>.
    let terminalWasActive = false;
    const onWindowBlur = () => {
      terminalWasActive = id !== null && container.contains(document.activeElement);
    };
    const onWindowFocus = () => {
      if (terminalWasActive) terminal.focus();
    };
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);

    void api
      .terminalOpen({ side: "local", ...(cwd ? { cwd } : {}), cols: terminal.cols, rows: terminal.rows })
      .then((opened) => {
        if (disposed) return void api.terminalClose(opened.id);
        id = opened.id;
        fitToBox();
        terminal.focus();
      })
      .catch((cause: unknown) => {
        if (!disposed) terminal.write(`\x1b[31m${errorMessage(cause)}\x1b[0m\r\n`);
      });

    return () => {
      disposed = true;
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      observer.disconnect();
      stopData();
      stopExit();
      typed.dispose();
      typedBinary.dispose();
      resized.dispose();
      if (id !== null) void api.terminalClose(id);
      terminal.dispose();
    };
  }, [cwd]);

  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => refit.current());
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  return <div ref={holder} className="terminal-panel-screen" hidden={!visible} style={{ background: THEME.background }} />;
}

/**
 * Integrated terminal under chat (ADR 0309): tabs of local shells started in the
 * active session's workspace. Mounted for the app's lifetime and only hidden,
 * so shells survive navigation and toggling; closing a tab kills its shell.
 */
export function TerminalPanel({ visible }: { visible: boolean }) {
  const { t } = useTranslation();
  const open = useAppStore((s) => s.terminalOpen);
  const toggleTerminal = useAppStore((s) => s.toggleTerminal);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState(0);
  const nextKey = useRef(1);

  const addTab = () => {
    const state = useAppStore.getState();
    const session = state.sessions.find((s) => s.id === state.activeSessionId);
    const cwd = state.workspace?.path || session?.projectPath?.trim() || undefined;
    const key = nextKey.current++;
    setTabs((current) => [...current, { key, cwd }]);
    setActive(key);
  };

  const closeTab = (key: number) => {
    const rest = tabs.filter((tab) => tab.key !== key);
    setTabs(rest);
    if (active === key) setActive(rest.at(-1)?.key ?? 0);
    if (rest.length === 0) toggleTerminal();
  };

  // Opening an empty panel starts a shell, like VS Code.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the open transition matters
  useEffect(() => {
    if (open && tabs.length === 0) addTab();
  }, [open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.metaKey || event.altKey || event.code !== "Backquote") return;
      event.preventDefault();
      const state = useAppStore.getState();
      if (state.page !== "chat") {
        state.setPage("chat");
        if (state.terminalOpen) return;
      }
      state.toggleTerminal();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const shown = visible && open;
  return (
    <div className="terminal-panel" hidden={!shown} data-terminal-panel>
      <div className="terminal-panel-tabs no-drag" role="tablist" aria-label={t("terminal.title")}>
        {tabs.map((tab, index) => (
          <div key={tab.key} className="terminal-panel-tab" data-active={tab.key === active || undefined}>
            <button type="button" role="tab" aria-selected={tab.key === active} onClick={() => setActive(tab.key)}>
              {t("terminal.tab", { index: index + 1 })}
            </button>
            <button type="button" aria-label={t("terminal.closeTab")} onClick={() => closeTab(tab.key)}>
              <IconClose size={12} aria-hidden />
            </button>
          </div>
        ))}
        <button type="button" className="terminal-panel-action" aria-label={t("terminal.newTab")} onClick={addTab}>
          <IconPlus size={14} aria-hidden />
        </button>
        <span className="terminal-panel-spacer" />
        <button type="button" className="terminal-panel-action" aria-label={t("terminal.hide")} onClick={toggleTerminal}>
          <IconClose size={14} aria-hidden />
        </button>
      </div>
      {tabs.map((tab) => (
        <TerminalInstance key={tab.key} cwd={tab.cwd} visible={shown && tab.key === active} />
      ))}
    </div>
  );
}
