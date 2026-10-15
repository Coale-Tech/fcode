/**
 * capture-t14-chat.mjs — T14 chat surface capture rig
 *
 * USAGE (from eval cell):
 *   const { run } = await import('.../capture-t14-chat.mjs');
 *   await run({ browser });
 *
 * Captures (rail/island) × (light/dark) × states:
 *   chat-empty, chat-transcript-activity, chat-workpanel-review, chat-perm-menu, chat-model-menu
 */

import { launch } from "./drive.mjs";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const WORKTREE = "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-t14-chat";
const OUT_DIR = `${WORKTREE}/.superpowers/sdd/2026-10-12-direction-d-desk-workbench/shots/T14`;

/** Inject a synthetic "write tool" message into the app store so the Review tab has real content. */
const INJECT_REVIEW_MSG = `
(async () => {
  const store = window.__PI_DESKTOP__;
  if (!store) return false;

  // Use zustand's setState directly via the store devtools hook
  const fakeSessionId = store.getState ? store.getState().activeSessionId : null;
  if (!fakeSessionId) return false;

  const fakeMessage = {
    id: "t14-review-fixture-001",
    role: "tool",
    timestamp: Date.now() - 5000,
    toolName: "Write",
    toolCallId: "t14-call-001",
    toolResult: {
      isError: false,
      details: {
        operation: "edit",
        path: "apps/payment/payment_entry.py",
        status: "modified",
        reversible: true,
        snapshotId: "snap-t14-001",
        additions: 12,
        deletions: 3,
        hunks: [{
          header: "@@ -82,7 +82,16 @@ def validate(self):",
          lines: [
            { type: "context", text: "        frappe.db.commit()" },
            { type: "context", text: "        return self" },
            { type: "del", text: "    def sync(self):" },
            { type: "del", text: "        pass" },
            { type: "del", text: "" },
            { type: "add", text: "    def sync(self):" },
            { type: "add", text: "        bench = frappe.get_site_config().get('bench_name')" },
            { type: "add", text: "        if not bench: return" },
            { type: "add", text: "        from .remote import sync_payment_entry" },
            { type: "add", text: "        sync_payment_entry(self.name, bench=bench)" },
            { type: "add", text: "        # Retry on transient socket errors" },
            { type: "add", text: "        frappe.db.commit()" },
            { type: "add", text: "        self._synced = True" },
            { type: "context", text: "" },
            { type: "context", text: "    def on_submit(self):" },
          ]
        }]
      }
    }
  };

  // Add the message to the active session's messages list
  if (store.setState) {
    store.setState(state => ({
      messages: [...(state.messages || []), fakeMessage]
    }));
    return true;
  }
  return false;
})()
`;

/** Inject fake Activity data (todo phases + timeline events) */
const INJECT_ACTIVITY = `
(async () => {
  const store = window.__PI_DESKTOP__;
  if (!store || !store.getState) return false;
  const sessionId = store.getState().activeSessionId;
  if (!sessionId) return false;

  // Inject todo phases
  if (store.setState) {
    store.setState(state => ({
      sessionTodoPhases: {
        ...state.sessionTodoPhases,
        [sessionId]: [{
          id: "phase-1",
          label: "Implementation",
          tasks: [
            { id: "task-1", content: "Verify payment_entry module loads after sync", status: "completed" },
            { id: "task-2", content: "Run bench migrate on coale_v16 after changes", status: "pending" },
          ]
        }]
      },
      // Inject messages with tool calls for timeline
      messages: [
        {
          id: "msg-bench", role: "tool", toolName: "bash",
          timestamp: Date.now() - 60000,
          toolResult: { isError: false, content: "bench started · coale_v16 · 3 workers" }
        },
        {
          id: "msg-read", role: "tool", toolName: "read",
          timestamp: Date.now() - 50000,
          toolResult: { isError: false, content: "Read payment_entry/__init__.py" }
        },
        {
          id: "msg-write", role: "tool", toolName: "Write",
          timestamp: Date.now() - 30000,
          toolResult: {
            isError: false,
            details: {
              operation: "edit", path: "apps/payment/payment_entry.py",
              status: "modified", reversible: true, snapshotId: "snap-t14-001",
              additions: 12, deletions: 3,
              hunks: [{
                header: "@@ -82,7 +82,16 @@ def validate(self):",
                lines: [
                  { type: "context", text: "        frappe.db.commit()" },
                  { type: "del",     text: "    def sync(self): pass" },
                  { type: "add",     text: "    def sync(self):" },
                  { type: "add",     text: "        sync_payment_entry(self.name)" },
                ]
              }]
            }
          }
        }
      ]
    }));
    return true;
  }
  return false;
})()
`;

async function prov(handle, commit, layout, theme, page, notes) {
  const state = await handle.rootState();
  const savedSettings = await handle.tab.evaluate(
    `(async () => window.piDesktop?.invoke("pi-desktop/settings/get"))()`
  );
  return {
    commit,
    buildTime: new Date().toISOString(),
    viewportCSS: `${Math.round(state.innerWidth / state.devicePixelRatio)}×${Math.round(800)}`,
    DPR: state.devicePixelRatio,
    zoom: 1,
    fontScale: state.fontScale,
    locale: state.lang ?? "en",
    layout,
    theme,
    dataNavLayout: state.dataNavLayout,
    dataTheme: state.dataTheme,
    persistedNavLayout: state.persistedNavLayout,
    savedTheme: savedSettings?.theme ?? null,
    pageId: page,
    notes,
  };
}

async function shot(handle, path, commit, layout, theme, page, notes) {
  await handle.screenshot(path + ".png");
  const p = await prov(handle, commit, layout, theme, page, notes);
  await writeFile(path + ".json", JSON.stringify(p, null, 2));
  return p;
}

export async function run({ browser, commit = "dc33fc5d1-t14" } = {}) {
  await mkdir(OUT_DIR, { recursive: true });

  const h = await launch({ browser, dataDir: undefined, name: "pi-desktop-t14" });

  try {
    // ── helper: set layout + theme via real settings picker
    async function applySettings(layout, theme) {
      await h.setSettings({ navLayout: layout, theme });
      await h.reload();
      // Verify
      const s = await h.rootState();
      if (s.dataNavLayout !== layout) throw new Error(`Layout mismatch: got ${s.dataNavLayout} wanted ${layout}`);
      if (s.dataTheme !== theme) throw new Error(`Theme mismatch: got ${s.dataTheme} wanted ${theme}`);
    }

    // ── helper: open work panel to a specific D-tab
    async function openWorkPanelTab(tabName) {
      await h.tab.evaluate(`
        (() => {
          const store = window.__PI_DESKTOP__;
          if (store && store.getState) {
            const state = store.getState();
            if (state.openWorkPanelTab) {
              state.openWorkPanelTab({ kind: '${tabName}', id: '${tabName}-t14' });
            }
          }
        })()
      `);
      await new Promise(r => setTimeout(r, 400));
    }

    // Navigate to chat first
    await h.goToPage("chat");
    await new Promise(r => setTimeout(r, 500));

    // ═══ 1. Rail Light — Empty chat ═══
    await applySettings("rail", "light");
    await h.goToPage("chat");
    await new Promise(r => setTimeout(r, 400));
    const p1 = await shot(h, `${OUT_DIR}/chat-empty-rail-light`, commit, "rail", "light", "chat-empty", "empty home, no session");
    console.log("1 chat-empty-rail-light", p1.dataNavLayout, p1.dataTheme);

    // ═══ 2. Rail Dark — Empty chat ═══
    await applySettings("rail", "dark");
    await h.goToPage("chat");
    await new Promise(r => setTimeout(r, 400));
    const p2 = await shot(h, `${OUT_DIR}/chat-empty-rail-dark`, commit, "rail", "dark", "chat-empty", "empty home dark");
    console.log("2 chat-empty-rail-dark", p2.dataNavLayout, p2.dataTheme);

    // ═══ 3. Island Light — Empty chat ═══
    await applySettings("island", "light");
    await h.goToPage("chat");
    await new Promise(r => setTimeout(r, 400));
    const p3 = await shot(h, `${OUT_DIR}/chat-empty-island-light`, commit, "island", "light", "chat-empty", "empty home island");
    console.log("3 chat-empty-island-light", p3.dataNavLayout, p3.dataTheme);

    // ═══ 4. Island Dark — Empty chat ═══
    await applySettings("island", "dark");
    await h.goToPage("chat");
    await new Promise(r => setTimeout(r, 400));
    const p4 = await shot(h, `${OUT_DIR}/chat-empty-island-dark`, commit, "island", "dark", "chat-empty", "empty home island dark");
    console.log("4 chat-empty-island-dark", p4.dataNavLayout, p4.dataTheme);

    // ═══ 5-6. Rail Light — Transcript with Activity panel open ═══
    await applySettings("rail", "light");
    await h.goToPage("chat");
    await new Promise(r => setTimeout(r, 400));
    // Inject activity data
    await h.evalPage(INJECT_ACTIVITY);
    await new Promise(r => setTimeout(r, 600));
    // Open work panel to Activity tab — use the OmpActivityTab path
    await h.tab.evaluate(`
      (() => {
        const store = window.__PI_DESKTOP__;
        if (store && store.getState) {
          const state = store.getState();
          if (state.openWorkPanel) state.openWorkPanel();
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 400));
    // Verify work panel is open
    const wpOpen = await h.tab.evaluate(
      `document.querySelector('.work-panel-main') !== null`
    );
    const p5 = await shot(h, `${OUT_DIR}/chat-transcript-activity-rail-light`, commit, "rail", "light", "chat-transcript-activity", `work-panel open=${wpOpen} Activity tab`);
    console.log("5 transcript+activity rail light, wpOpen:", wpOpen);

    // ═══ 6. Rail Dark — Transcript with Activity panel ═══
    await applySettings("rail", "dark");
    await h.goToPage("chat");
    await new Promise(r => setTimeout(r, 400));
    await h.evalPage(INJECT_ACTIVITY);
    await new Promise(r => setTimeout(r, 600));
    await h.tab.evaluate(`
      (() => {
        const store = window.__PI_DESKTOP__;
        if (store && store.getState) { store.getState().openWorkPanel?.(); }
      })()
    `);
    await new Promise(r => setTimeout(r, 400));
    const p6 = await shot(h, `${OUT_DIR}/chat-transcript-activity-rail-dark`, commit, "rail", "dark", "chat-transcript-activity", "work-panel Activity dark");
    console.log("6 transcript+activity rail dark", p6.dataTheme);

    // ═══ 7. Rail Light — Review tab with REAL diff ═══
    await applySettings("rail", "light");
    await h.goToPage("chat");
    await new Promise(r => setTimeout(r, 400));
    await h.evalPage(INJECT_REVIEW_MSG);
    await new Promise(r => setTimeout(r, 500));
    // Set panel width to 340px via store
    await h.tab.evaluate(`
      (() => {
        const store = window.__PI_DESKTOP__;
        if (store && store.setState) {
          store.setState({ workPanelWidth: 340 });
        }
      })()
    `);
    // Open work panel and click Review tab
    await h.tab.evaluate(`
      (() => {
        const store = window.__PI_DESKTOP__;
        if (store && store.getState) {
          const state = store.getState();
          state.openWorkPanel?.();
          // Click the Review tab button
          setTimeout(() => {
            const btn = document.querySelector('#wp-d-tab-review');
            btn?.click();
          }, 200);
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 700));
    // Verify Review tab is active and has content
    const reviewContent = await h.tab.evaluate(
      `document.querySelector('.wp-review-file') !== null || document.querySelector('.review-tab') !== null`
    );
    const p7 = await shot(h, `${OUT_DIR}/chat-review-rail-light`, commit, "rail", "light", "chat-review", `review-content=${reviewContent} 340px panel`);
    console.log("7 review rail light, hasContent:", reviewContent);

    // ═══ 8. Rail Dark — Review tab ═══
    await applySettings("rail", "dark");
    await h.goToPage("chat");
    await new Promise(r => setTimeout(r, 400));
    await h.evalPage(INJECT_REVIEW_MSG);
    await new Promise(r => setTimeout(r, 500));
    await h.tab.evaluate(`
      (() => {
        const store = window.__PI_DESKTOP__;
        if (store && store.getState) {
          store.getState().openWorkPanel?.();
          setTimeout(() => { document.querySelector('#wp-d-tab-review')?.click(); }, 200);
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 700));
    const p8 = await shot(h, `${OUT_DIR}/chat-review-rail-dark`, commit, "rail", "dark", "chat-review", "review dark 340px");
    console.log("8 review rail dark", p8.dataTheme);

    // ═══ 9. Rail Light — Permission menu open ═══
    await applySettings("rail", "light");
    await h.goToPage("chat");
    await new Promise(r => setTimeout(r, 400));
    // Click the permission chip to open the menu
    const permChip = await h.tab.evaluate(`
      (() => {
        const btn = document.querySelector('.mode-chip[aria-expanded], .composer-permission-toggle, [aria-label*="ermission"], [aria-label*="ode chip"]');
        if (btn) { btn.click(); return true; }
        // Try clicking by text content
        const all = Array.from(document.querySelectorAll('button'));
        const perm = all.find(b => b.textContent?.includes('Ask') || b.className?.includes('permission'));
        if (perm) { perm.click(); return 'found:' + perm.className; }
        return false;
      })()
    `);
    await new Promise(r => setTimeout(r, 300));
    const p9 = await shot(h, `${OUT_DIR}/chat-perm-menu-rail-light`, commit, "rail", "light", "chat-perm-menu", `perm-chip-clicked=${permChip}`);
    console.log("9 perm menu rail light, clicked:", permChip);

    // ═══ 10. Rail Light — Island Light summary ═══
    await applySettings("island", "light");
    await h.goToPage("chat");
    await new Promise(r => setTimeout(r, 400));
    await h.evalPage(INJECT_REVIEW_MSG);
    await new Promise(r => setTimeout(r, 500));
    await h.tab.evaluate(`
      (() => {
        const store = window.__PI_DESKTOP__;
        if (store && store.getState) {
          store.getState().openWorkPanel?.();
          setTimeout(() => { document.querySelector('#wp-d-tab-review')?.click(); }, 200);
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 700));
    const p10 = await shot(h, `${OUT_DIR}/chat-review-island-light`, commit, "island", "light", "chat-review", "review island 340px");
    console.log("10 review island light", p10.dataNavLayout);

    // ═══ 11. Island Dark — Review ═══
    await applySettings("island", "dark");
    await h.goToPage("chat");
    await new Promise(r => setTimeout(r, 400));
    await h.evalPage(INJECT_REVIEW_MSG);
    await new Promise(r => setTimeout(r, 500));
    await h.tab.evaluate(`
      (() => {
        const store = window.__PI_DESKTOP__;
        if (store && store.getState) {
          store.getState().openWorkPanel?.();
          setTimeout(() => { document.querySelector('#wp-d-tab-review')?.click(); }, 200);
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 700));
    const p11 = await shot(h, `${OUT_DIR}/chat-review-island-dark`, commit, "island", "dark", "chat-review", "review island dark");
    console.log("11 review island dark", p11.dataTheme);

    console.log("✅ All T14 captures complete →", OUT_DIR);
    return { ok: true, shots: 11 };
  } finally {
    await h.close();
  }
}
