/**
 * FileTree — nested collapsible file tree built from a flat FsIndexEntry list.
 *
 * Folders are collapsed by default; clicking a chevron expands/collapses.
 * A filter box narrows paths by substring. Folder state is local React state
 * (no persistence needed — tree resets on workspace change).
 */
import { useState, useMemo } from "react";
import type { FsIndexEntry } from "@pi-desktop/shared";
import { cx } from "../ui";

// ── Tree node types ──────────────────────────────────────────────────────────

type FileNode = {
  kind: "file";
  name: string;
  path: string;
};

type DirNode = {
  kind: "dir";
  name: string;
  path: string;
  children: TreeNode[];
};

type TreeNode = FileNode | DirNode;

// ── Build tree from flat entries ─────────────────────────────────────────────

/**
 * Convert a flat list of workspace-relative paths into a nested tree.
 * Directories appear as parents with children; path separators are "/".
 */
export function buildTree(entries: FsIndexEntry[]): TreeNode[] {
  // Map from dirPath → DirNode, built incrementally.
  const dirMap = new Map<string, DirNode>();
  const roots: TreeNode[] = [];

  function ensureDir(dirPath: string): DirNode {
    if (dirMap.has(dirPath)) return dirMap.get(dirPath)!;
    const parts = dirPath.split("/");
    const name = parts[parts.length - 1];
    const node: DirNode = { kind: "dir", name, path: dirPath, children: [] };
    dirMap.set(dirPath, node);
    if (parts.length === 1) {
      roots.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join("/");
      const parent = ensureDir(parentPath);
      parent.children.push(node);
    }
    return node;
  }

  for (const entry of entries) {
    if (entry.kind === "dir") {
      ensureDir(entry.path);
      continue;
    }
    // File: parse parent dir
    const lastSlash = entry.path.lastIndexOf("/");
    if (lastSlash === -1) {
      // Top-level file
      roots.push({ kind: "file", name: entry.path, path: entry.path });
    } else {
      const dirPath = entry.path.slice(0, lastSlash);
      const name = entry.path.slice(lastSlash + 1);
      const dir = ensureDir(dirPath);
      dir.children.push({ kind: "file", name, path: entry.path });
    }
  }

  return roots;
}

// ── Filter helper ────────────────────────────────────────────────────────────

/** True if the node or any descendant matches the filter substring. */
function nodeMatches(node: TreeNode, filter: string): boolean {
  if (node.kind === "file") return node.path.includes(filter);
  return (
    node.path.includes(filter) ||
    node.children.some((c) => nodeMatches(c, filter))
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function FileRow({
  node,
  activePath,
  onSelect,
}: {
  node: FileNode;
  activePath: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <button
      type="button"
      className={cx("code-tree-file", node.path === activePath && "is-active")}
      onClick={() => onSelect(node.path)}
      title={node.path}
    >
      <span className="code-tree-file-icon" aria-hidden>📄</span>
      {node.name}
    </button>
  );
}

function DirRow({
  node,
  activePath,
  onSelect,
  filter,
  collapsed,
  toggle,
}: {
  node: DirNode;
  activePath: string | null;
  onSelect: (path: string) => void;
  filter: string;
  collapsed: Set<string>;
  toggle: (path: string) => void;
}) {
  const open = !collapsed.has(node.path);
  const visibleChildren = filter
    ? node.children.filter((c) => nodeMatches(c, filter))
    : node.children;

  return (
    <div className="code-tree-dir">
      <button
        type="button"
        className="code-tree-dir-header"
        onClick={() => toggle(node.path)}
        aria-expanded={open}
      >
        <span className={cx("code-tree-chevron", open && "open")} aria-hidden>
          ›
        </span>
        <span className="code-tree-dir-icon" aria-hidden>📁</span>
        {node.name}
      </button>
      {open && visibleChildren.length > 0 && (
        <div className="code-tree-children">
          {visibleChildren.map((child) =>
            child.kind === "dir" ? (
              <DirRow
                key={child.path}
                node={child}
                activePath={activePath}
                onSelect={onSelect}
                filter={filter}
                collapsed={collapsed}
                toggle={toggle}
              />
            ) : (
              <FileRow
                key={child.path}
                node={child}
                activePath={activePath}
                onSelect={onSelect}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function FileTree({
  entries,
  activePath,
  onSelect,
}: {
  entries: FsIndexEntry[];
  activePath: string | null;
  onSelect: (path: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildTree(entries), [entries]);

  const toggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const lowerFilter = filter.toLowerCase();

  const visibleRoots = lowerFilter
    ? tree.filter((n) => nodeMatches(n, lowerFilter))
    : tree;

  return (
    <div className="code-file-tree">
      <div className="code-tree-filter">
        <input
          type="search"
          className="code-tree-filter-input"
          placeholder="Filter files…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter files"
        />
      </div>
      <div className="code-tree-scroll" role="tree" aria-label="Workspace files">
        {visibleRoots.length === 0 ? (
          <p className="code-tree-empty">
            {filter ? "No matches." : "No files in this workspace."}
          </p>
        ) : (
          visibleRoots.map((node) =>
            node.kind === "dir" ? (
              <DirRow
                key={node.path}
                node={node}
                activePath={activePath}
                onSelect={onSelect}
                filter={lowerFilter}
                collapsed={collapsed}
                toggle={toggle}
              />
            ) : (
              <FileRow
                key={node.path}
                node={node}
                activePath={activePath}
                onSelect={onSelect}
              />
            ),
          )
        )}
      </div>
    </div>
  );
}
