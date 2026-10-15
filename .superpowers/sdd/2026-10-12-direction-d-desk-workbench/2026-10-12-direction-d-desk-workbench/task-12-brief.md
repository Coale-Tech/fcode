### Task 12: Kanban, Scheduled, Pull requests, Notifications, Plugins, Projects

**Files:** `pages/{KanbanPage,ScheduledPage,PullRequestsPage,PluginsPage,ProjectsPage}.tsx`, `components/NotificationCenter.tsx`; styles `kanban.css`, `destinations.css`, `projects.css`, `plugins.css`, `extensions.css`, `workbench.css`.
**Test:** `kanban-*.test.mjs`, `plugins-page-style.test.mjs`, `project-*.test.mjs`.

Concrete deltas (from `pages-d/*/notes.md`):

| Page | Delta |
|---|---|
| List pages (Scheduled/Pulls/Projects/Plugins) | page head `--d-ph-h`; rows `--d-row-h`; group label 11px uppercase `--ds-text-tertiary`; status pills 12px with tone colours; Scheduled detail panel 340px `--d-r` |
| Kanban | columns 210px; header 32px; card radius `--d-r-ctrl`, 1px border; chips 12px; running card 2px top border `--ds-success` + pulsing dot; blocked 2px `--ds-error` + "Needs approval" badge (`--ds-warning`); priority chip uses `--ds-accent` tint; the board scrolls horizontally in island layout |
| Notifications | popover 12px radius, rows 30px |

- [ ] **Step 1:** For each file read the owning partial range, apply the table with tokens only.
- [ ] **Step 2: Verify** `node --test test/kanban-*.test.mjs test/plugins-page-style.test.mjs test/project-*.test.mjs` (baseline); capture each page in all three layouts, light + dark, against the matching `pages-d/<page>/variant-D*.png`.
- [ ] **Step 3: Commit** `style(pages): direction D list, kanban and plugin pages`

---

