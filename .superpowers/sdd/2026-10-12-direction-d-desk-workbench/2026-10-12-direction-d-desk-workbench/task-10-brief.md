### Task 10: Chat surface — Activity docked in WorkPanel, composer, transcript

**Files (read first, then modify):**
- `apps/desktop/src/features/chat/ChatSurface.tsx` (341), `SessionPane.tsx` (134) — inline `OmpSubagentsList`, `OmpTodoPanel`, `DapPanel`, `OmpTuiPanel`, `OmpCollabPanel`
- `apps/desktop/src/features/work-panel/OmpActivityTab.tsx` (+ the other WorkPanel tabs)
- `apps/desktop/src/features/chat/transcript/{ChatTranscript,ToolRow}.tsx`, `components/Composer.tsx`, `features/chat/composer/ComposerPermissionPicker.tsx`
- Styles: `chat-shell.css`, `messages.css`, `composer.css`, `composer-menus.css`, `work-panel.css`
- Test: the 20+ `composer-*.test.mjs`, `chat-content-width`, `topbar-consistency`, `app-store-sidebar`, `turn-process`

**Interfaces:** Consumes tokens (T1). Produces no new component API unless Step 2 finds an inline panel with no WorkPanel equivalent.

- [ ] **Step 1: Inventory** (no edits): for each of the 5 inline panels in `SessionPane.tsx`, record whether `OmpActivityTab.tsx` already renders the same information (todo → yes/no, subagents, DAP, TUI, collab). Write the table into the commit body.
- [ ] **Step 2:** For every row with "no", move that panel's JSX into `OmpActivityTab` as a titled section (`.act-sec` heading 11px/600 uppercase `--ds-text-tertiary`), pass the same props from the same store selectors, then delete the inline render from `SessionPane`. Panels that are transient overlays by design (DAP/TUI while a session runs) stay inline — only move the ones the design shows in the Activity column (decision block, todo, tool timeline, changes).
- [ ] **Step 3:** Make the WorkPanel's default tab for chat `Activity` and default width 300px (`work-panel-resize.ts` default constant), without changing the 450px main-pane floor. Existing persisted widths win.
- [ ] **Step 4: Composer** per `pages-d/chat/notes.md` and `fragment.html`: full-width top border; inner `max-width: 700px` centred; input `--d-ctrl-lg`; permission/model chips 26px, radius `--d-r-ctrl`, 12px; menus above composer (`bottom: 44px`), model 280px / permission 230px wide; active item = `color-mix(accent 14%)` bg + accent text + accent check; Send = accent fill with `--ds-accent-foreground` (not the black primary).
- [ ] **Step 5: Transcript/tool rows:** user + assistant text `--d-text-chat` (14px); `ToolRow` timeline node 7px (done `--ds-success`, running `--ds-warning`, failed `--ds-error`), mono path `--d-text-xs`, duration `--d-text-xs`.
- [ ] **Step 6: Verify.** `node --test test/composer-*.test.mjs test/chat-content-width.test.mjs test/topbar-consistency.test.mjs test/app-store-sidebar.test.mjs` → baseline; capture chat (empty, streaming, with tool calls, with WorkPanel open) in all layouts light+dark; compare to `pages-d/chat*/variant-D*.png`. Behavioural smoke: send a message with the real backend; todo/subagent updates still appear (in the Activity tab).
- [ ] **Step 7: Commit** `style(chat): direction D chat, activity dock and composer`

---

