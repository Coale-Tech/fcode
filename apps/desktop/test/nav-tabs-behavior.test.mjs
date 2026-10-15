/**
 * nav-tabs-behavior.test.mjs — behavioral tests for the D1 tabs layout (Task 8 F08).
 *
 * Covers:
 *  1. NavTabs source exports the component with role="tablist" and aria-label (nav.tabsLabel)
 *  2. NavTabs renders only primary tabs as pills + a "···" More button
 *  3. Overflow button has aria-haspopup + aria-expanded wiring
 *  4. Long German/Turkish labels cannot force overflow: nav-tab-label uses text-overflow:ellipsis
 *  5. ShellNavbar source: tabs layout mounts NotificationCenter with anchor="below"
 *  6. ShellNavbar source: tabs layout mounts brand + bench chip + avatar
 *  7. NotificationCenter accepts anchor prop and switches positioning logic
 *  8. nav.tabsLabel i18n key exists in all 9 locales
 *  9. nav.userMenu i18n key exists in all 9 locales
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
  en, de, es, fr, ko, ptBR, tr, zhCN, zhTW,
] = await Promise.all([
  read("../src/components/NavTabs.tsx"),
  read("../src/components/ShellNavbar.tsx"),
  read("../src/components/NotificationCenter.tsx"),
  read("../src/styles/d-shell.css"),
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

test("ShellNavbar passes anchor=below to NotificationCenter in tabs layout", () => {
  assert.match(shellNavbarSource, /anchor="below"/);
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

test("NotificationCenter supports anchor prop with above/below positioning", () => {
  assert.match(notifCenterSource, /anchor.*above.*below|above.*below.*anchor/);
  assert.match(notifCenterSource, /anchor === "below"/);
  assert.match(notifCenterSource, /top: rect\.bottom/);
  assert.match(notifCenterSource, /bottom:.*innerHeight.*rect\.top/);
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
