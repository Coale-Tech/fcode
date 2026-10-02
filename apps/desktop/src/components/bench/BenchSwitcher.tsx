/**
 * Header bench switcher: a combobox over all discovered benches, grouped
 * Running / Needs attention / All benches. Picking one opens (or focuses) its
 * tab. Keyboard: ArrowUp/Down move, Enter opens, Escape closes.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  baseName,
  groupForSwitcher,
  type BenchStatus,
  type BenchSummary,
} from "../../lib/bench-view";
import { IconChevronDown, IconSearch } from "../icons";
import { StatusDot, VersionBadge } from "./BenchBadges";

export function BenchSwitcher({
  current,
  benches,
  statusOf,
  onPick,
  onShowAll,
}: {
  current: BenchSummary;
  benches: BenchSummary[];
  statusOf: (bench: BenchSummary) => BenchStatus;
  onPick: (bench: BenchSummary) => void;
  onShowAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => groupForSwitcher(benches, query, statusOf), [benches, query, statusOf]);
  const flat = useMemo(
    () => [...groups.running, ...groups.attention, ...groups.rest],
    [groups],
  );

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => setCursor(0), [query, open]);

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    setQuery("");
    if (restoreFocus) triggerRef.current?.focus();
  };
  const pick = (bench: BenchSummary) => {
    close(true);
    onPick(bench);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && flat[cursor]) {
      e.preventDefault();
      pick(flat[cursor]);
    }
  };

  const optionId = (b: BenchSummary) => `bench-switch-${b.id}`;
  const renderGroup = (label: string, items: BenchSummary[]) =>
    items.length > 0 && (
      <div role="group" aria-label={label}>
        <div className="wb-menu-group" aria-hidden="true">
          {label}
        </div>
        {items.map((b) => (
          <div
            key={b.id}
            id={optionId(b)}
            role="option"
            aria-selected={b.id === current.id}
            className={`wb-menu-item${flat[cursor]?.id === b.id ? " is-cursor" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(b)}
          >
            <StatusDot status={statusOf(b)} />
            <span className="wb-truncate">{baseName(b.path)}</span>
            <VersionBadge version={b.version} />
          </div>
        ))}
      </div>
    );

  return (
    <div
      className="wb-switcher"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="wb-switcher-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Switch bench (current: ${baseName(current.path)})`}
        onClick={() => setOpen((o) => !o)}
      >
        <StatusDot status={statusOf(current)} />
        <span className="wb-island-title wb-truncate">{baseName(current.path)}</span>
        <VersionBadge version={current.version} />
        <IconChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="wb-menu" onKeyDown={onKeyDown}>
          <label className="wb-search wb-menu-search">
            <IconSearch size={14} aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${benches.length} benches`}
              role="combobox"
              aria-expanded="true"
              aria-controls="bench-switch-list"
              aria-activedescendant={flat[cursor] ? optionId(flat[cursor]) : undefined}
              aria-label="Search benches"
            />
          </label>
          <div id="bench-switch-list" role="listbox" aria-label="Benches" className="wb-menu-list">
            {flat.length === 0 && <p className="wb-muted wb-menu-empty">No benches match.</p>}
            {renderGroup("Running", groups.running)}
            {renderGroup("Needs attention", groups.attention)}
            {renderGroup("All benches", groups.rest)}
          </div>
          <div className="wb-menu-foot">
            <span className="wb-muted">↑↓ move · ↵ open</span>
            <button
              type="button"
              className="wb-link-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                close(false);
                onShowAll();
              }}
            >
              All benches tab →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
