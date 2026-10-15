/**
 * nav-tabs-behavior.test.mjs — behavioral tests for the D1 tabs layout (Task 8 F08).
 *
 * Covers:
 *  1. NavTabs source exports the component with role="tablist" and aria-label (nav.tabsLabel)
 *  2. NavTabs renders only primary tabs as pills + a "···" More button
 *  3. Overflow button has aria-haspopup + aria-expanded wiring
 *  4. Long German/Turkish labels cannot force overflow: nav-tab-label uses text-overflow:ellipsis
 *  5. ShellNavbar tabs layout mounts NotificationCenter bell (navigates to page, R11g)
 *  6. ShellNavbar tabs layout mounts brand + bench chip + avatar
 *  7. nav.tabsLabel i18n key exists in all 9 locales
 *  8. nav.userMenu i18n key exists in all 9 locales
 *  9. F08 draft/scroll/layout-switch preservation:
 *     - ChatSurface has no layout-dependent key (no unmount on layout change)
 *     - NavTabs tab clicks only call setPage (no state-clearing side-effect)
 *     - navLayout change goes through settings store → attribute, not page reload
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [
  navTabsSource,
  shellNavbarSource,
  notifCenterSource,
  shellCss,
  appShellSource,
  runtimeSource,
  en, de, es, fr, ko, ptBR, tr, zhCN, zhTW,
] = await Promise.all([
  read("../src/components/NavTabs.tsx"),
  read("../src/components/ShellNavbar.tsx"),
  read("../src/components/NotificationCenter.tsx"),
  read("../src/styles/d-shell.css"),
  read("../src/features/app/AppShell.tsx"),
  read("../src/features/app/useAppShellRuntime.tsx"),
  read("../../../packages/i18n/src/locales/en/index.ts"),
  read("../../../packages/i18n/src/locales/de/index.ts"),
  read("../../../packages/i18n/src/locales/es/index.ts"),
  read("../../../packages/i18n/src/locales/fr/index.ts"),
  read("../../../packages/i18n/src/locales/ko/index.ts"),
  read("../../../packages/i18n/src/locales/pt-BR/index.ts"),
  read("../../../packages/i18n/src/locales/tr/index.ts"),
  read("../../../packages/i18n/src/locales/zh-CN/index.ts"),
  read("../../../packages/i18n/src/locales/zh-TW/index.ts"),
]);

test("NavTabs renders with role=tablist and i18n aria-label", () => {
  assert.match(navTabsSource, /role="tablist"/);
  assert.match(navTabsSource, /t\("nav\.tabsLabel"\)/);
});

test("NavTabs primary pills limited to chat/build/bench — not every destination", () => {
  assert.match(navTabsSource, /PRIMARY_PAGES.*chat.*build.*bench/);
  // overflow filter removes non-primary from pill strip
  assert.match(navTabsSource, /items\.filter.*PRIMARY_PAGES/);
});

test("NavTabs overflow button has aria-haspopup=menu and aria-expanded wiring", () => {
  assert.match(navTabsSource, /aria-haspopup="menu"/);
  assert.match(navTabsSource, /aria-expanded=\{menuOpen\}/);
});

test("NavTabs overflow menu portal closes on Escape and outside click", () => {
  assert.match(navTabsSource, /portalToBody/);
  assert.match(navTabsSource, /Escape/);
  assert.match(navTabsSource, /mousedown.*outside|outside.*mousedown|onMouseDown/);
});

test("NavTabs overflow menu items have role=menuitem", () => {
  assert.match(navTabsSource, /role="menuitem"/);
});

test("nav-tab-label uses ellipsis truncation — long de/tr labels cannot break layout", () => {
  // CSS must have text-overflow:ellipsis and max-width on .nav-tab-label
  assert.match(shellCss, /\.nav-tab-label[^}]*text-overflow:\s*ellipsis/);
  assert.match(shellCss, /\.nav-tab-label[^}]*max-width/);
  // Overflow container must not wrap
  assert.match(shellCss, /\.nav-tab[^-][^}]*white-space:\s*nowrap/);
});

test("ShellNavbar tabs layout mounts NotificationCenter bell", () => {
  // Direction D: NotificationCenter is a bell trigger (no popover, navigates to page)
  assert.match(shellNavbarSource, /NotificationCenter/);
});

test("ShellNavbar tabs layout mounts brand logo", () => {
  assert.match(shellNavbarSource, /shell-navbar-brand/);
  assert.match(shellNavbarSource, /t\("app\.shellName"\)/);
});

test("ShellNavbar tabs layout mounts bench chip", () => {
  assert.match(shellNavbarSource, /shell-navbar-bench-chip/);
  assert.match(shellNavbarSource, /useBenchContext/);
});

test("ShellNavbar tabs layout mounts avatar placeholder", () => {
  assert.match(shellNavbarSource, /shell-navbar-avatar/);
});

test("NotificationCenter bell navigates to notifications page (Direction D R11g)", () => {
  // Architectural: bell is a nav trigger; full inbox is a routed page.
  assert.match(notifCenterSource, /setPage.*notifications|notifications.*setPage/);
  assert.match(notifCenterSource, /inboxUnreadCount|unreadNotificationCount/);
});

test("nav.tabsLabel i18n key exists in all 9 locales", () => {
  for (const [locale, src] of [
    ["en", en], ["de", de], ["es", es], ["fr", fr],
    ["ko", ko], ["pt-BR", ptBR], ["tr", tr], ["zh-CN", zhCN], ["zh-TW", zhTW],
  ]) {
    assert.match(src, /tabsLabel/, `nav.tabsLabel missing in locale: ${locale}`);
  }
});

test("nav.userMenu i18n key exists in all 9 locales", () => {
  for (const [locale, src] of [
    ["en", en], ["de", de], ["es", es], ["fr", fr],
    ["ko", ko], ["pt-BR", ptBR], ["tr", tr], ["zh-CN", zhCN], ["zh-TW", zhTW],
  ]) {
    assert.match(src, /userMenu/, `nav.userMenu missing in locale: ${locale}`);
  }
});

test("nav.more i18n key exists in all 9 locales (regression guard)", () => {
  for (const [locale, src] of [
    ["en", en], ["de", de], ["es", es], ["fr", fr],
    ["ko", ko], ["pt-BR", ptBR], ["tr", tr], ["zh-CN", zhCN], ["zh-TW", zhTW],
  ]) {
    assert.match(src, /["']?more["']?\s*:\s*["']/, `nav.more missing in locale: ${locale}`);
  }
});

// ── F08: draft/scroll/layout-switch preservation ────────────────────────────

test("F08: ChatSurface has no layout-dependent React key — layout change does not unmount chat", () => {
  // ChatSurface must be rendered without a key that includes navLayout.
  // A layout-dependent key would force React to unmount+remount on every layout
  // switch, destroying draft text and scroll position (Review Focus 8).
  // Check: the <ChatSurface .../> JSX line does NOT contain key={...navLayout...}
  const chatSurfaceLine = appShellSource
    .split("\n")
    .find((l) => l.includes("ChatSurface"));
  assert.ok(chatSurfaceLine, "ChatSurface must be rendered in AppShell");
  assert.doesNotMatch(
    chatSurfaceLine,
    /key=\{[^}]*navLayout/,
    "ChatSurface must not have a navLayout-dependent key (would destroy draft/scroll on layout switch)",
  );
});

test("F08: NavTabs tab click calls only setPage — no draft-clearing side effects", () => {
  // Each primary tab onClick calls setPage(item.page) — exactly one store dispatch.
  // Must NOT call clearDraft, clearSession, setNavLayout, or any state reset.
  assert.match(navTabsSource, /onClick=\{.*setPage\(item\.page\)/, "tab onClick calls setPage");
  assert.doesNotMatch(navTabsSource, /clearDraft|clearSession|resetChat|setNavLayout/,
    "NavTabs must not call draft/session clearing or layout-changing actions on tab click");
});

test("F08: navLayout change propagates through settings store to dataset attribute (no page reload)", () => {
  // Layout switch must update document.documentElement.dataset.navLayout via the
  // settings → useAppShellRuntime effect, NOT via window.location.reload or navigation.
  // Source check: useAppShellRuntime uses a useEffect on navLayout to set dataset.
  assert.match(
    runtimeSource,
    /dataset\.navLayout\s*=\s*navLayout/,
    "useAppShellRuntime must update dataset.navLayout via effect (not reload)",
  );
  // Confirm no location.reload in the layout-switching path
  assert.doesNotMatch(
    runtimeSource,
    /location\.reload/,
    "layout switch must not trigger page reload",
  );
});
