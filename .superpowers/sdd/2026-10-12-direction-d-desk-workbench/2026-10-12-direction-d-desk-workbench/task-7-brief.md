### Task 7: `rail` layout (D2, default)

**Files:**
- Modify: `apps/desktop/src/components/NavRail.tsx` (consume `nav-items.ts`; icon-only in `rail`, labelled in `island`)
- Create: `apps/desktop/src/components/nav-items.ts`
- Modify: `apps/desktop/src/styles/chrome.css:727` (`--nav-rail-width` → remove; use `--d-rail-w`/`--d-rail-island`), rail rules in `chrome.css` / `d-shell.css`
- Modify: `i18n` — add `nav.chat`, `nav.build`, `nav.bench` to all 9 locales (NavRail hard-codes "Chat"/"Build"/"Bench" today, so the shared list and the tabs layout need real keys)
- Test: `test/nav-items.test.mjs` (new), i18n parity, capture

**Interfaces:**
- Produces:

```ts
// apps/desktop/src/components/nav-items.ts
import type { AppState } from "../stores/app-store";
export type NavItemId =
  | "chat" | "build" | "bench" | "scheduled" | "kanban" | "raven" | "filebird" | "plugins";
export type NavItem = {
  id: NavItemId;
  page: AppState["page"];
  dataNav: string;          // existing e2e selectors: "chat", "build-canvas", "bench", …
  labelKey: string;
  group: "primary" | "footer";
};
export function navItems(flags: { kanban: boolean; raven: boolean }): NavItem[];
```
`navItems` returns, in order: primary `chat`(`data-nav="chat"`, `nav.chat`), `build`(`build-canvas`, `nav.build`), `bench`(`bench`, `nav.bench`); footer `scheduled`(`scheduled.title`), `kanban`(if enabled, `kanban.title`), `raven`(if enabled, `raven.title`), `filebird`(`fileBird.title`), `plugins`(`nav.plugins`). Settings and `NotificationCenter` stay hand-rendered in NavRail (they have a memory dot / popover, not a page destination in the tab list).

- [ ] **Step 1: Failing test** (the rule that matters: flag-gated destinations and stable e2e selectors):

```js
// apps/desktop/test/nav-items.test.mjs
import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { navItems } = await import("../src/components/nav-items.ts");

test("Kanban and Raven appear only when enabled", () => {
  const ids = (f) => navItems(f).map((i) => i.id);
  assert.deepEqual(ids({ kanban: false, raven: false }), ["chat", "build", "bench", "scheduled", "filebird", "plugins"]);
  assert.ok(ids({ kanban: true, raven: true }).includes("kanban"));
  assert.ok(ids({ kanban: true, raven: true }).includes("raven"));
});

test("data-nav hooks used by e2e stay stable", () => {
  const byId = Object.fromEntries(navItems({ kanban: true, raven: true }).map((i) => [i.id, i.dataNav]));
  assert.equal(byId.build, "build-canvas");
  assert.equal(byId.chat, "chat");
  assert.equal(byId.filebird, "filebird");
});
```
- [ ] **Step 2:** Run → FAIL. Implement `nav-items.ts` per the contract above. Run → PASS.
- [ ] **Step 3:** Rewrite `NavRail` body to `navItems({ kanban: kanbanEnabled, raven: ravenEnabled })`: primary group → `<button class="nav-rail-btn nav-rail-labeled">` with `t(labelKey)`; footer → existing `TooltipButton`s. Keep the Plugins toggle-back behaviour (`page === "plugins" ? (canNavBack() ? navBack() : setPage("chat")) : setPage("plugins")`), `NotificationCenter`, and the Settings button + memory dot verbatim. Add icon map `{chat: IconChat, build: IconMonitor, bench: IconServer, scheduled: IconClock, kanban: IconKanban, raven: IconRaven, filebird: IconFileBird, plugins: IconPlug}` inside `NavRail.tsx`.
- [ ] **Step 4:** `rail` CSS (`d-shell.css`): width `var(--d-rail-w)`; **all** items icon-only (hide `.nav-rail-label` under `:root[data-nav-layout="rail"]`, showing `tooltip`); canvas island: `.main-pane` margin `0 var(--d-gap) var(--d-gap) 0`, radius `--d-r`, 1px border, `background: var(--ds-bg-primary)`, the body background is the canvas (`--surface-gray-2` light / `--surface-base` dark). Active item: `--ds-accent` tint (`color-mix(in oklab, var(--ds-accent) 14%, transparent)`) + accent icon.
- [ ] **Step 5:** i18n keys `nav.chat/build/bench` for 9 locales: en Chat/Build/Bench; zh-CN 聊天/构建/工作台; zh-TW 聊天/建置/工作台; de Chat/Build/Bench; es Chat/Compilación/Bench; fr Chat/Build/Bench; ko 채팅/빌드/벤치; tr Sohbet/Derleme/Bench; pt-BR Chat/Build/Bench. (Bench and Build are product-area names; keep them untranslated where the existing locale already does — `grep -n "Bench" packages/i18n/src/locales/*/index.ts` first and mirror.)
- [ ] **Step 6: Verify.** `pnpm --filter @pi-desktop/i18n test`; `node --test test/*.test.mjs` (baseline); capture all pages in `rail` light+dark vs `pages-d/*/variant-D2*.png`; Raven/FileBird/Build: confirm view rect equals the canvas rect (Review Focus 1) by comparing `getBoundingClientRect()` of the host `div` against `BrowserWindow`'s `view.getBounds()` log.
- [ ] **Step 7: Commit** `feat(shell): rail layout + shared nav items`

---

