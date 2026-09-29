import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadStyles } from "./helpers/styles.mjs";

const sidebarSource = await readFile(
  new URL("../src/components/Sidebar.tsx", import.meta.url),
  "utf8",
);
const railSource = await readFile(
  new URL("../src/components/NavRail.tsx", import.meta.url),
  "utf8",
);
const globalStyles = await loadStyles();
const zhLocale = await readFile(
  new URL("../../../packages/i18n/src/locales/zh-CN/index.ts", import.meta.url),
  "utf8",
);
const enLocale = await readFile(
  new URL("../../../packages/i18n/src/locales/en/index.ts", import.meta.url),
  "utf8",
);

test("the sidebar footer is an action bar, not a fabricated identity", () => {
  // The app has no accounts; an avatar with a name implied one that never existed.
  assert.doesNotMatch(sidebarSource, /footer-profile/);
  assert.doesNotMatch(sidebarSource, /profile-menu/);
  assert.doesNotMatch(sidebarSource, /sidebar-profile-menu/);
  assert.doesNotMatch(sidebarSource, /IconUser/);
  assert.doesNotMatch(globalStyles, /\.footer-profile/);
  assert.doesNotMatch(globalStyles, /\.profile-menu/);
  for (const locale of [zhLocale, enLocale]) {
    assert.doesNotMatch(locale, /localProfile:/);
    assert.doesNotMatch(locale, /openProfileMenu:/);
  }
});

test("the nav rail exposes settings, plugins, scheduled tasks and notifications", () => {
  assert.match(railSource, /data-nav="settings"/);
  assert.match(railSource, /data-nav="plugins"/);
  assert.doesNotMatch(railSource, /data-nav="theme"/);
  assert.match(railSource, /<NotificationCenter \/>/);
  // Logs live in Settings → About; the rail stays down to daily controls.
  assert.doesNotMatch(railSource, /openLogs/);
  // The footer keeps only the build chip; destinations moved to the rail.
  assert.doesNotMatch(sidebarSource, /data-nav="(?:settings|plugins|scheduled|code|bench|build-canvas)"/);
  // Every action is icon-only, so each needs a label for pointer and AT users.
  const actions = railSource.split("<TooltipButton").slice(1);
  assert.equal(actions.length, 7);
  for (const action of actions) {
    const attrs = action.slice(0, action.indexOf(">"));
    assert.match(attrs, /tooltip=/);
    assert.match(attrs, /ariaLabel=/);
  }
  // Plugins toggles back on a second activation instead of re-entering itself.
  assert.match(
    railSource,
    /page === "plugins"\s*\? \(canNavBack\(\) \? navBack\(\) : setPage\("chat"\)\)\s*: setPage\("plugins"\)/,
  );
  // All footer destinations report their active state to assistive tech; the
  // Plugins button also reports the Back toggle a second activation performs.
  const footerAttributes = (marker) => {
    const at = railSource.indexOf(marker);
    if (at < 0) return "";
    return railSource.slice(
      railSource.lastIndexOf("<TooltipButton", at),
      railSource.indexOf("</TooltipButton>", at),
    );
  };
  for (const nav of ["chat", "code", "bench", "settings", "plugins", "scheduled"]) {
    assert.match(footerAttributes(`data-nav="${nav}"`), new RegExp(`aria-pressed=\\{page === "${nav}"\\}`));
  }
  assert.match(footerAttributes('data-nav="build-canvas"'), /aria-pressed=\{page === "build"\}/);
});

test("footer sits on the sidebar content grid without a hairline", () => {
  const block = globalStyles.match(/\.sidebar-footer\s*\{[^}]+\}/)?.[0] ?? "";
  // Zero side padding keeps the chip text and trailing icon aligned with the
  // nav rows that .sidebar-body already insets by 8px. D297: the footer is set
  // apart from the nav by `margin-top: auto` and its own padding, not a rule.
  assert.match(block, /padding:\s*7px 0 2px/);
  assert.doesNotMatch(block, /border-top/);
  assert.match(globalStyles, /\.footer-build\s*\{[^}]*padding:\s*5px 8px/s);
});

test("rail buttons share the notification trigger's hit target", () => {
  const block = globalStyles.match(/\.nav-rail-btn,\s*\.nav-rail \.notification-trigger\s*\{[^}]+\}/)?.[0] ?? "";
  assert.match(block, /width:\s*32px/);
  assert.match(block, /height:\s*32px/);
  assert.match(block, /transition:[^;]*var\(--motion-duration-fast\)/);
});

test("build chip surfaces the version and only dots an actionable update", () => {
  assert.match(sidebarSource, /const update = useUpdateState\(\)/);
  assert.match(
    sidebarSource,
    /update\?\.status === "available" \|\| update\?\.status === "downloaded"/,
  );
  assert.match(sidebarSource, /className="footer-build-dot"/);
  // An actionable update routes to the Settings row that can act on it.
  assert.match(sidebarSource, /setSettingsAnchor\("updates\.title"\)/);
  assert.match(sidebarSource, /setSettingsTab\("about"\)/);
  assert.match(sidebarSource, /api\.updatesCheck\(\)/);
  const dot = globalStyles.match(/\.footer-build-dot\s*\{[^}]+\}/)?.[0] ?? "";
  assert.match(dot, /background:\s*var\(--ds-accent\)/);
});
