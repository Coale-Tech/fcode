/**
 * T5 — LogView: virtualised monospace log viewer for bench output.
 *
 * Design decisions (from the design-phase accepted block):
 *  - Virtualised list for smooth 60fps scroll on 5000-line ring buffers.
 *  - ANSI SGR sequences are stripped (B10c) — no colour rendering, no PTY, no input.
 *  - role="log" + aria-live="polite" ONLY while follow-tail is on and focused.
 *  - Log rows never animate (motion fights a stream).
 *  - --font-mono, --text-2xs for log content.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export type LogLine = {
  ts: number;
  text: string;
};

type Props = {
  lines: LogLine[];
  /** When true the view auto-scrolls to the bottom as new lines arrive. */
  followTail?: boolean;
  onFollowTailChange?: (v: boolean) => void;
  className?: string;
};

const LINE_HEIGHT = 18; // px — fixed for virtualisation arithmetic
const OVERSCAN = 10; // render N extra rows above/below the viewport

export function LogView({ lines, followTail = true, onFollowTailChange, className = "" }: Props) {
  const scrollEl = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(400);

  // Track scroll position to detect manual upward scrolling.
  const lastScrollTop = useRef<number>(0);
  const rafId = useRef<number>(0);

  // ── Viewport height ───────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = scrollEl.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setViewportHeight(entry.contentRect.height);
    });
    ro.observe(el);
    setViewportHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // ── Follow-tail: scroll to bottom when new lines arrive ──────────────────
  useEffect(() => {
    if (!followTail) return;
    const el = scrollEl.current;
    if (!el) return;
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      lastScrollTop.current = el.scrollTop;
    });
  }, [lines, followTail]);

  // ── Detect manual scroll-up to disable follow-tail ────────────────────────
  const handleScroll = useCallback(() => {
    const el = scrollEl.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 2;
    if (!atBottom && lastScrollTop.current > el.scrollTop) {
      // User scrolled up
      onFollowTailChange?.(false);
    } else if (atBottom) {
      onFollowTailChange?.(true);
    }
    lastScrollTop.current = el.scrollTop;
  }, [onFollowTailChange]);

  // ── Virtualisation ────────────────────────────────────────────────────────
  const totalHeight = lines.length * LINE_HEIGHT;

  const visibleLines = useMemo(() => {
    const el = scrollEl.current;
    const scrollTop = el?.scrollTop ?? 0;
    const startIndex = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - OVERSCAN);
    const endIndex = Math.min(
      lines.length - 1,
      Math.ceil((scrollTop + viewportHeight) / LINE_HEIGHT) + OVERSCAN,
    );
    return lines.slice(startIndex, endIndex + 1).map((line, i) => ({
      line,
      index: startIndex + i,
    }));
  }, [lines, viewportHeight]);

  // Re-compute visible lines on scroll without re-renders for each line.
  const [scrollVersion, setScrollVersion] = useState(0);
  const handleScrollWithUpdate = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      handleScroll();
      setScrollVersion((v) => v + 1);
    },
    [handleScroll],
  );

  // Recompute visible range after scroll update
  const el = scrollEl.current;
  const scrollTop = el?.scrollTop ?? 0;
  const startIndex = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    lines.length - 1,
    Math.ceil((scrollTop + viewportHeight) / LINE_HEIGHT) + OVERSCAN,
  );
  const rendered = lines.slice(startIndex, endIndex + 1);

  return (
    // aria-live only while following tail AND focused (design-phase D32)
    <div
      ref={scrollEl}
      role="log"
      aria-label="Bench log output"
      aria-live={followTail && isFocused ? "polite" : "off"}
      className={`bench-log-scroll ${className}`.trim()}
      style={LOG_SCROLL_STYLE}
      onScroll={handleScrollWithUpdate}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      tabIndex={0}
    >
      {/* Total height spacer so the scrollbar reflects all lines */}
      <div style={{ height: totalHeight, position: "relative" }}>
        {rendered.map((line, i) => (
          <div
            key={startIndex + i}
            style={{
              position: "absolute",
              top: (startIndex + i) * LINE_HEIGHT,
              left: 0,
              right: 0,
              height: LINE_HEIGHT,
              ...LOG_LINE_STYLE,
            }}
          >
            <span style={TS_STYLE}>{formatTs(line.ts)}</span>
            {stripAnsi(line.text)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Styles (design tokens via CSS vars) ───────────────────────────────────────

const LOG_SCROLL_STYLE: React.CSSProperties = {
  overflowY: "auto",
  overflowX: "auto",
  flex: 1,
  minHeight: 0,
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-2xs)",
  lineHeight: `${LINE_HEIGHT}px`,
  color: "var(--ds-text-primary)",
  background: "var(--ds-bg-primary)",
  padding: "4px 8px",
  outline: "none",
};

const LOG_LINE_STYLE: React.CSSProperties = {
  whiteSpace: "pre",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const TS_STYLE: React.CSSProperties = {
  /* B10(e): --ds-text-tertiary (#424242 dark) gives 1.78:1 on island (#171717).
     --ink-gray-6 gives 6.29:1 dark (#999999 on #171717) / 7.81:1 light (#525252 on #fff). */
  color: "var(--ink-gray-6)",
  marginRight: 8,
  flexShrink: 0,
  userSelect: "none",
};

function formatTs(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/**
 * Strip SGR (colour/style) escape sequences from a log line.
 * Handles ESC-prefixed form (\x1b[...m) and bare form ([...m) that appears
 * when the ESC byte is dropped during IPC serialisation (B10c).
 */
export function stripAnsi(text: string): string {
  return text.replace(/(?:\x1b\[|\[)[0-9;]*m/g, "");
}
