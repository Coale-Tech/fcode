# Direction D "Desk Workbench" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the whole Fcode renderer to the approved Direction D (Frappe Desk 16 × Espresso Workbench, FileBird-blue accent, black primary button) and add a user-selectable navigation layout (`navLayout`: tabs / rail / island) that switches instantly and persists per user.

**Architecture:** One token layer (`styles/d-tokens.css`) re-points the existing `--ds-*` ladder to D values, so the ~240 `--ds-accent` call sites and every primitive pick the new look without renaming classes. A new `ShellNavbar` (48px, awesomebar) sits above the existing `.app-chat-shell` body in every layout. The layout is one root attribute, `data-nav-layout`, derived from `AppSettings.navLayout` by a pure resolver (`lib/nav-layout.ts`); CSS and three small React variants (`NavRail` rail/island, `NavTabs`) key off it. Pages are restyled in place by editing the partials that own them; no class renames, no parallel `d-*` class family in the app.

**Tech Stack:** Electron 3-process app, React 19 + Zustand, plain CSS partials sequenced by `src/styles/globals.css`, `node --test` (`apps/desktop/test/*.test.mjs`, TS via `helpers/ts-import-hooks.mjs`), vitest for `@pi-desktop/i18n`, capture rig (`PI_DESKTOP_CAPTURE=1`) for screenshots.

**Spec:** `~/.gstack/projects/Coale-Tech-fcode/designs/all-pages-20261012/kit-d/D-SPEC.md` (tokens, density, three navs). Per-page references: `…/all-pages-20261012/pages-d/<page>/{fragment*.html,variant-D1|D2|D3[-dark|-state].png,notes.md}`. Gallery: `…/all-pages-20261012/gallery-d.html`. Approved decisions: `…/designs/approved.json`. FileBird source UI: `/Users/mac/ERPNext/frappe_agent/filebird/screenshots/*.png`.

## Global Constraints

- Renderer rules from `apps/desktop/src/AGENTS.md` bind every task: use `components/ui.tsx` primitives (Button, Input, Field, SettingsToggle, SegmentedControl, Checkbox, Select, Badge, Panel, TooltipButton, HelpIcon) and `features/settings/primitives.tsx` (SettingsCard, SettingsRow). Settings pages use `SettingsMenuSelect`, never `<select>`. No inline reimplementation of a primitive. A new shared primitive needs ≥3 call sites and a §11 entry in `docs/spec/04-ux/07-ui-design-system.md`.
- Clean cutover: when a rule is superseded (46px toolbar, traffic-light lead inset, 76px chrome), delete the old rule and migrate every caller. No dual-support classes, no `d-` aliases of existing classes.
- No hardcoded colours/sizes in component CSS: use `--ds-*` / `--d-*` tokens. Hex literals live only in `tokens.css` and `d-tokens.css`.
- Every new user-visible string goes through `t()` and exists in all 9 locales (`en, zh-CN, zh-TW, de, es, fr, ko, tr, pt-BR`).
- Source edits use the `edit` tool, not sed/perl/python. omp/hashline tools take absolute paths.
- Do not push, tag or release. Do not touch `CHANGELOG.md` (integrator-owned). Do not edit design artifacts under `~/.gstack`.
- **Exact-zero tsc baseline** (authoritative; supersedes any "3 pre-existing errors" wording below): `cd apps/desktop && ./node_modules/.bin/tsc --noEmit -p .` must produce exactly 0 errors. Any error is a regression. Full `node --test` failures tolerated ONLY for known load-flaky tests: npm-executable, remote-host-ssh-password, remote-host-ssh-transport, codesign x2, hindsight fast-exit.
- Frappe reference is the installed `coale_v16` source (frappe 16.35.0). The user said 16.5.1; no such bench exists. This plan touches no Frappe code.
- Accessibility: all text/interactive colour pairs introduced here must meet 4.5:1 (text) or 3:1 (non-text). The design's light accent `#2E8AC2` is 3.8:1 with white, so Task 1 uses the next step darker; this is a deliberate deviation from the mockups.

## Review Focus

1. **Embedded-view bounds.** Raven, FileBird and the Build canvas are native `WebContentsView`s positioned from `getBoundingClientRect()` via ResizeObserver (`api.ravenSetBounds`, `api.fileBirdSetBounds`, `IPC.invoke.buildCanvasSetBounds`). Switching `navLayout` or toggling the sidebar must re-report bounds; a stale rect leaves the view over the navbar or detached from its frame. Check in all 3 layouts × 3 pages.
2. **Column budget.** `SHELL_CHROME_WIDTH` (76) becomes `shellChromeWidth(layout)`. The 450px main-pane floor, work-panel auto-collapse and sidebar max must use it, including after a live layout switch.
3. **Window chrome.** macOS traffic lights (`MAC_TRAFFIC_LIGHT_POSITION`, y:16) vs the 48px navbar; Windows/Linux `WindowControls` must stay the rightmost, clickable (`no-drag`) element and the tabs layout must not run under them. Deleting the old `--ds-window-lead-inset` / `.ct-collapsed` lead-inset logic must not leave a double inset.
4. **Settings-mode `inert` shell.** `page==='settings'` renders the shell `hidden`/`inert`; the new navbar must either be outside that subtree (and stay usable) or be inert with it. Pick one and test keyboard focus.
5. **Invalid persisted value.** A saved `navLayout` of `"dock"`/`null`/number resolves to `rail`, never to a broken shell, and a write of an invalid value is rejected (`INVALID_PARAMS`).
6. **Themes.** Light, dark and every `plugin:*` theme (`data-plugin-theme`): the accent override must not defeat a plugin theme's own `--ds-accent`. Order: `d-tokens.css` before `theme-overrides.css`.
7. **i18n overflow.** Tab pills / rail labels with de/fr/pt-BR/tr strings; truncate with ellipsis + `title`, never wrap or push the awesomebar off-centre.
8. **Instant switch.** Changing the layout must not unmount `ChatSurface` (draft text, scroll position, running turn). The layout switch is an attribute + conditional nav chrome only.
9. **Primary-button contrast / focus ring** after the accent change (focus ring = `--ds-accent`, 240 call sites).

## Open decisions (defaults chosen; change before Task 1 if you disagree)

| # | Decision | Default in this plan |
|---|----------|----------------------|
| 1 | Default `navLayout` for new and existing users | `rail` (D2) |
| 2 | Island layout: global Sessions sidebar on Bench/Build pages (they own a context sidebar) | Hidden on Bench/Build (as today); shown on every other page |
| 3 | Settings keeps instant per-field save; the mockup's dirty-state Save/Discard header is **not** built | Not built |
| 4 | Onboarding steps 2 (bench picker) and 3 (permissions) have no approved mockup | Restyled by tokens/primitives only; flagged for design review |
| 5 | Right dock | The existing WorkPanel is the "Activity column" (Activity tab default, 300px); no second column is built |
| 6 | Light accent fill `#2578AB` instead of the mockup's `#2E8AC2` (AA contrast) | Deviate |

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/desktop/src/styles/d-tokens.css` (new) | `--d-*` dimension/type tokens; re-points `--ds-accent*`, toolbar, button radius |
| `apps/desktop/src/styles/d-shell.css` (new) | Navbar, awesomebar, rail/tabs/island layout rules, canvas island, status bar |
| `apps/desktop/src/lib/nav-layout.ts` (new) | `NavLayout`, `resolveNavLayout`, `shellChromeWidth` (pure) |
| `apps/desktop/src/components/ShellNavbar.tsx` (new) | 48px navbar: lead slot, tabs/breadcrumb, awesomebar, actions |
| `apps/desktop/src/components/NavTabs.tsx` (new) | Pill tabs for the `tabs` layout |
| `apps/desktop/src/components/nav-items.ts` (new) | One list of destinations consumed by NavRail and NavTabs |
| `apps/desktop/src/components/settings/NavLayoutRow.tsx` (new) | Card picker row in Appearance |
| `packages/shared/src/types/settings.ts` | `navLayout?` field |
| `apps/desktop/src/lib/api.ts` | `validateSettingsWrite` accepts/rejects `navLayout` |
| `apps/desktop/test/{d-accent-contrast,nav-layout}.test.mjs` (new) | Token contrast; resolver/validator/budget |

---

### Task 1: Accent + density tokens (`d-tokens.css`)

**Files:**
- Create: `apps/desktop/src/styles/d-tokens.css`
- Modify: `apps/desktop/src/styles/globals.css` (insert one `@import` after line 17 `./tokens.css`)
- Modify: `apps/desktop/src/styles/tokens.css:128-131` (light accent), and the `:root[data-theme="dark"]` block at `:201` (dark accent)
- Test: `apps/desktop/test/d-accent-contrast.test.mjs` (new)

**Interfaces:**
- Consumes: `loadStyles`, `resolveThemeToken` from `test/helpers/styles.mjs` (follows `var()` chains; theme block beats `:root`).
- Produces: tokens `--d-navbar-h --d-ph-h --d-mini-h --d-status-h --d-rail-w --d-rail-island --d-gap --d-ctrl --d-ctrl-lg --d-row-h --d-r --d-r-ctrl --d-r-sm --d-text --d-text-sm --d-text-xs --d-text-chat`, and new values for `--ds-accent`, `--ds-accent-hover`, `--ds-accent-soft`, `--ds-accent-foreground` (dark), `--ds-toolbar-height`, `--ds-btn-radius`, `--ds-btn-radius-sm`.

Contrast reference (computed, WCAG 2.x): `#2578AB`/white 4.82, `#42A2D9` on dark bg 6.38, `#0A1F2E` on `#42A2D9` 5.93.

- [ ] **Step 1: Record the baseline** (no edits)

```bash
cd /Users/mac/ERPNext/frappe_agent/PI-Desktop/apps/desktop
./node_modules/.bin/tsc --noEmit -p . 2>&1 | grep -c "error TS"          # expect 0
node --test test/*.test.mjs 2>&1 | grep -E "^# (pass|fail)"               # expect fail 0 (flaky: npm-executable, remote-host-ssh-password, remote-host-ssh-transport, codesign x2, hindsight fast-exit)
```
Write both numbers in the Task 1 commit message body.

- [ ] **Step 2: Write the failing test**

```js
// apps/desktop/test/d-accent-contrast.test.mjs
/**
 * Direction D accent: the FileBird blue must stay legible as (a) text/focus
 * ring on the page background and (b) a button fill carrying its label.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { loadStyles, resolveThemeToken } from "./helpers/styles.mjs";

const styles = await loadStyles();
const lum = (hex) =>
  [0, 2, 4]
    .map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

for (const theme of ["light", "dark"]) {
  const tok = (n) => resolveThemeToken(styles, theme, n);
  test(`D accent: ${theme} accent is text-legible on the page background`, () => {
    assert.ok(ratio(tok("--ds-accent"), tok("--ds-bg-primary")) >= 4.5);
  });
  test(`D accent: ${theme} accent fill carries its foreground label`, () => {
    assert.ok(ratio(tok("--ds-accent"), tok("--ds-accent-foreground")) >= 4.5);
  });
  test(`D accent: ${theme} hover keeps the label legible`, () => {
    assert.ok(ratio(tok("--ds-accent-hover"), tok("--ds-accent-foreground")) >= 4.5);
  });
}
```

- [ ] **Step 3: Run it — expect FAIL**

`node --test test/d-accent-contrast.test.mjs` → the light/dark "hover" cases fail (`#0ea5e9` vs white = 2.8; dark accent fill vs white label < 4.5).

- [ ] **Step 4: Minimal implementation**

`tokens.css` lines 127-131 become:

```css
  /* Accent = FileBird blue (Direction D). Light fill is the mockup's hover step
     (#2578AB): the mockup's #2E8AC2 is 3.8:1 with a white label. */
  --ds-accent:           #2578ab;
  --ds-accent-hover:     #1f6fa3;
  --ds-accent-soft:      #4f9ccb;
  --ds-accent-blue:      var(--ds-accent);
```

Inside `:root[data-theme="dark"] { … }` (starts `tokens.css:201`) add:

```css
  /* Accent = FileBird's exact dark blues; dark label because white is 2.8:1 here. */
  --ds-accent:            #42a2d9;
  --ds-accent-hover:      #56b9f2;
  --ds-accent-soft:       #92d2f8;
  --ds-accent-foreground: #0a1f2e;
```

`d-tokens.css`:

```css
/* Direction D — dimensions, type scale and the re-pointing of the existing ladder.
   Values come from design kit-d/D-SPEC.md. Loaded right after tokens.css so
   theme-overrides.css (plugin themes) still wins. */
:root {
  --d-navbar-h: 48px;
  --d-ph-h: 48px;
  --d-mini-h: 32px;
  --d-status-h: 28px;
  --d-rail-w: 50px;
  --d-rail-island: 60px;
  --d-gap: 12px;
  --d-ctrl: 28px;
  --d-ctrl-lg: 32px;
  --d-row-h: 30px;
  --d-r: 12px;
  --d-r-ctrl: 8px;
  --d-r-sm: 4px;
  --d-text: 13px;
  --d-text-sm: 12px;
  --d-text-xs: 11px;
  --d-text-chat: 14px;

  --ds-toolbar-height: var(--d-navbar-h);
  --ds-btn-radius: var(--d-r-ctrl);
  --ds-btn-radius-sm: 6px;
}
```

`globals.css`: add `@import "./d-tokens.css";` on the line after `@import "./tokens.css";` (the test helper only inlines lines matching `@import "./x.css";`).

- [ ] **Step 5: Run — expect PASS**, plus `node --test test/t13-status-token-contrast.test.mjs test/plugins-page-style.test.mjs` (no regressions).

- [ ] **Step 6: Smoke the look.** Capture rig, light + dark, record screenshots (`/tmp/codex-screens/`); confirm buttons are 8px-radius and links/focus ring are the new blue.

```bash
cd apps/desktop && PI_DESKTOP_CAPTURE=1 PI_DESKTOP_DATA_DIR=$(mktemp -d) ELECTRON_RENDERER_URL= ./node_modules/.bin/electron .
```

- [ ] **Step 7: Commit** `feat(renderer): direction D accent + density tokens`

---

### Task 2: `navLayout` setting — type, resolver, write validation

**Files:**
- Create: `apps/desktop/src/lib/nav-layout.ts`
- Modify: `packages/shared/src/types/settings.ts:89-90` (add the field after `thinkingDisplayMode`)
- Modify: `apps/desktop/src/lib/api.ts:452-461` (`validateSettingsWrite`)
- Test: `apps/desktop/test/nav-layout.test.mjs` (new)

**Interfaces:**
- Produces: `type NavLayout = "tabs"|"rail"|"island"`; `NAV_LAYOUTS: readonly NavLayout[]`; `DEFAULT_NAV_LAYOUT = "rail"`; `isNavLayout(v): v is NavLayout`; `resolveNavLayout(v: unknown): NavLayout`; `shellChromeWidth(l: NavLayout): number`. `AppSettings.navLayout?: NavLayout`.
- Persistence: electron main has no field whitelist (`grep -rn "thinkingDisplayMode\|fontScale" apps/desktop/electron` → 0 hits, so optional fields pass through the store untouched); no main-process change.

- [ ] **Step 1: Write the failing test**

```js
// apps/desktop/test/nav-layout.test.mjs
import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { NAV_LAYOUTS, DEFAULT_NAV_LAYOUT, resolveNavLayout, shellChromeWidth } =
  await import("../src/lib/nav-layout.ts");

test("an absent or corrupt saved layout resolves to the default, never a broken shell", () => {
  for (const v of [undefined, null, "", "dock", 2, {}, "TABS"]) {
    assert.equal(resolveNavLayout(v), DEFAULT_NAV_LAYOUT);
  }
  assert.equal(DEFAULT_NAV_LAYOUT, "rail");
  for (const v of NAV_LAYOUTS) assert.equal(resolveNavLayout(v), v);
});

test("column budget reserves the layout's rail plus the 12px canvas gap on both sides", () => {
  assert.equal(shellChromeWidth("tabs"), 24);
  assert.equal(shellChromeWidth("rail"), 74);
  assert.equal(shellChromeWidth("island"), 84);
});

test("settings writes reject an unknown navLayout and keep other preferences", async () => {
  const { validateSettingsWrite } = await import("../src/lib/api.ts");
  const base = { defaultMode: "agent", theme: "dark", enterToSend: true, onboardingDismissed: false };
  for (const navLayout of NAV_LAYOUTS) {
    const next = { ...base, navLayout };
    assert.equal(validateSettingsWrite(next), next);
  }
  assert.equal(validateSettingsWrite(base), base);
  assert.throws(() => validateSettingsWrite({ ...base, navLayout: "dock" }), /navLayout is invalid/);
});
```
- [ ] **Step 2: Run — expect FAIL** (`nav-layout.ts` missing).

- [ ] **Step 3: Implement**

```ts
// apps/desktop/src/lib/nav-layout.ts
import type { AppSettings } from "@pi-desktop/shared";

export type NavLayout = NonNullable<AppSettings["navLayout"]>;
export const NAV_LAYOUTS: readonly NavLayout[] = ["tabs", "rail", "island"];
export const DEFAULT_NAV_LAYOUT: NavLayout = "rail";

export function isNavLayout(value: unknown): value is NavLayout {
  return typeof value === "string" && (NAV_LAYOUTS as readonly string[]).includes(value);
}

export function resolveNavLayout(value: unknown): NavLayout {
  return isNavLayout(value) ? value : DEFAULT_NAV_LAYOUT;
}

/** Keep in sync with `--d-rail-w`, `--d-rail-island`, `--d-gap` in styles/d-tokens.css. */
const RAIL_WIDTH: Record<NavLayout, number> = { tabs: 0, rail: 50, island: 60 };
const CANVAS_GAP = 12;

/** Horizontal space the shell chrome takes before the sidebar/main/work-panel columns. */
export function shellChromeWidth(layout: NavLayout): number {
  return RAIL_WIDTH[layout] + CANVAS_GAP * 2;
}
```

`settings.ts` after line 90:

```ts
  /** Window navigation shell: top tabs, icon rail, or labelled rail + sessions island. Absent means "rail". */
  navLayout?: "tabs" | "rail" | "island";
```

`api.ts` — import `isNavLayout` from `./nav-layout` and add after the `thinkingDisplayMode` block (line 461):

```ts
  if (settings.navLayout !== undefined && !isNavLayout(settings.navLayout)) {
    throw Object.assign(new Error("navLayout is invalid"), {
      errorCode: "INVALID_PARAMS",
    });
  }
```

- [ ] **Step 4: Run — expect PASS** (`node --test test/nav-layout.test.mjs test/turn-process.test.mjs`).
- [ ] **Step 5: `tsc`** — exactly 0 errors.
- [ ] **Step 6: Commit** `feat(settings): navLayout preference + resolver`

---

### Task 3: Apply `data-nav-layout`, nav-aware column budget, capture hook

**Files:**
- Modify: `apps/desktop/src/features/app/useAppShellRuntime.tsx:45` (delete `SHELL_CHROME_WIDTH`), `:102-116` (budget + observer deps), add effect near `:525`
- Modify: `apps/desktop/src/main.tsx:14-15` (initial attribute)
- Modify: `apps/desktop/src/capture/renderer-api.ts:29` and `:100-102` (`setNavLayout`)
- Test: none new (pure logic covered in Task 2). Smoke by capture.

**Interfaces:**
- Consumes: `resolveNavLayout`, `shellChromeWidth` (Task 2); `settings` store selector at `useAppShellRuntime.tsx:61`.
- Produces: `document.documentElement.dataset.navLayout` ∈ `tabs|rail|island`; capture API `setNavLayout(layout)`.

- [ ] **Step 1:** In `useAppShellRuntime.tsx` replace the const at line 44-45 with an import and compute:

```ts
import { resolveNavLayout, shellChromeWidth } from "../../lib/nav-layout";
```
```ts
  const navLayout = resolveNavLayout(settings?.navLayout);
  const navLayoutRef = useRef(navLayout);
  navLayoutRef.current = navLayout;
```
and in `columnsWidth`:

```ts
  const columnsWidth = (shell: HTMLElement) =>
    Math.max(0, Math.round(shell.clientWidth) - shellChromeWidth(navLayoutRef.current));
```
Change the `useLayoutEffect(..., [])` at 104-116 to depend on `[navLayout]` so a live switch re-measures.

- [ ] **Step 2:** Add the attribute effect (separate from the theme effect so a plugin-theme change cannot skip it):

```ts
  useEffect(() => {
    document.documentElement.dataset.navLayout = navLayout;
  }, [navLayout]);
```

- [ ] **Step 3:** `main.tsx` beside `dataset.theme = 'dark'` add `document.documentElement.dataset.navLayout = DEFAULT_NAV_LAYOUT;` (import from `./lib/nav-layout`) so first paint has a valid layout.

- [ ] **Step 4:** `renderer-api.ts`: add `setNavLayout: (layout: NavLayout) => void;` to the type next to `setThemeAttr` and

```ts
    setNavLayout: (layout) => {
      document.documentElement.dataset.navLayout = layout;
    },
```
If `CaptureRigStubs` requires an entry, mirror `setThemeAttr` there.

- [ ] **Step 5:** `tsc` (exactly 0 errors). Run capture rig, then in DevTools console `document.documentElement.dataset.navLayout` is `rail`; set `navLayout:"island"` via Settings IPC later in Task 4 and confirm the shell width budget changes (the work-panel auto-collapse threshold moves by 10px: 74→84).
- [ ] **Step 6: Commit** `feat(renderer): apply navLayout attribute and layout-aware column budget`

---

### Task 4: Settings → Appearance layout picker (UI + i18n + search)

**Files:**
- Create: `apps/desktop/src/components/settings/NavLayoutRow.tsx`
- Modify: `apps/desktop/src/features/settings/SettingsPage.tsx:51-52` (import), `:435-439` (render after `FontSizeRow`)
- Modify: `apps/desktop/src/styles/settings.css` (append `.nav-layout-*` rules)
- Modify: `apps/desktop/src/lib/settings-search.ts` (general tab, after `"settings.fontSize"` at ~line 73)
- Modify: all 9 `packages/i18n/src/locales/*/index.ts` (settings block, after `thinkingDisplayCompact`)
- Test: `pnpm --filter @pi-desktop/i18n test` (`catalogs`, `renderer-keys`, `user-facing-copy`)

**Interfaces:**
- Consumes: `SettingsRow` (`features/settings/primitives.tsx`), `NAV_LAYOUTS`/`resolveNavLayout`, `saveSettings(patch)` (instant save → `api.setSettings`).
- Produces: `<NavLayoutRow settings saveSettings />`; i18n keys `settings.navLayout`, `settings.navLayoutDesc`, `settings.navLayoutTabs`, `settings.navLayoutRail`, `settings.navLayoutIsland`.

- [ ] **Step 1: Add keys to `en` only; run i18n tests — expect FAIL** (catalog parity: 8 locales missing the keys).

```ts
    navLayout: "Navigation layout",
    navLayoutDesc: "Where the main destinations live. Applies instantly and is saved for your account.",
    navLayoutTabs: "Tabs",
    navLayoutRail: "Icon rail",
    navLayoutIsland: "Sidebar",
```

- [ ] **Step 2: Add the same keys to the other 8 locales** (match each file's key quoting — de/es/fr quote keys, the others do not):

| locale | navLayout | navLayoutDesc | Tabs | Rail | Island |
|---|---|---|---|---|---|
| zh-CN | 导航布局 | 主要入口的位置。立即生效，并保存到你的账户。 | 标签页 | 图标栏 | 侧边栏 |
| zh-TW | 導覽版面 | 主要入口的位置。立即生效，並儲存到你的帳戶。 | 分頁 | 圖示列 | 側邊欄 |
| de | Navigationslayout | Wo die Hauptziele liegen. Wirkt sofort und wird für dein Konto gespeichert. | Tabs | Symbolleiste | Seitenleiste |
| es | Diseño de navegación | Dónde están los destinos principales. Se aplica al instante y se guarda en tu cuenta. | Pestañas | Barra de iconos | Barra lateral |
| fr | Disposition de navigation | Où se trouvent les destinations principales. S'applique immédiatement et est enregistré pour votre compte. | Onglets | Barre d'icônes | Barre latérale |
| ko | 내비게이션 레이아웃 | 주요 이동 항목의 위치입니다. 즉시 적용되며 계정에 저장됩니다. | 탭 | 아이콘 레일 | 사이드바 |
| tr | Gezinme düzeni | Ana hedeflerin nerede durduğunu belirler. Anında uygulanır ve hesabınız için kaydedilir. | Sekmeler | Simge çubuğu | Kenar çubuğu |
| pt-BR | Layout de navegação | Onde ficam os destinos principais. Aplica na hora e é salvo na sua conta. | Abas | Barra de ícones | Barra lateral |

- [ ] **Step 3: Write the component**

```tsx
// apps/desktop/src/components/settings/NavLayoutRow.tsx
import { useTranslation } from "react-i18next";
import type { AppSettings } from "@pi-desktop/shared";
import { SettingsRow } from "../../features/settings/primitives";
import { NAV_LAYOUTS, resolveNavLayout, type NavLayout } from "../../lib/nav-layout";
import { cx } from "../ui";

const LABEL = {
  tabs: "settings.navLayoutTabs",
  rail: "settings.navLayoutRail",
  island: "settings.navLayoutIsland",
} as const satisfies Record<NavLayout, string>;

/** 64×44 wireframe: navbar band, then the layout's nav chrome, then the canvas. */
function Thumb({ layout }: { layout: NavLayout }) {
  return (
    <svg className="nav-layout-thumb" viewBox="0 0 64 44" aria-hidden>
      <rect x=".5" y=".5" width="63" height="43" rx="5" fill="none" stroke="currentColor" opacity=".35" />
      <rect x="1" y="1" width="62" height="7" fill="currentColor" opacity=".12" />
      {layout === "tabs" && (
        <>
          <rect x="6" y="3" width="9" height="3" rx="1.5" fill="currentColor" />
          <rect x="17" y="3" width="9" height="3" rx="1.5" fill="currentColor" opacity=".4" />
          <rect x="28" y="3" width="9" height="3" rx="1.5" fill="currentColor" opacity=".4" />
        </>
      )}
      {layout === "rail" && <rect x="1" y="8" width="7" height="35" fill="currentColor" opacity=".12" />}
      {layout === "island" && (
        <>
          <rect x="1" y="8" width="10" height="35" fill="currentColor" opacity=".12" />
          <rect x="12" y="8" width="14" height="35" fill="currentColor" opacity=".08" />
        </>
      )}
      <rect
        x={layout === "tabs" ? 4 : layout === "rail" ? 11 : 29}
        y="11"
        width={layout === "tabs" ? 56 : layout === "rail" ? 49 : 31}
        height="29"
        rx="3"
        fill="currentColor"
        opacity=".18"
      />
    </svg>
  );
}

export function NavLayoutRow({
  settings,
  saveSettings,
}: {
  settings: AppSettings;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const current = resolveNavLayout(settings.navLayout);
  return (
    <SettingsRow title={t("settings.navLayout")} description={t("settings.navLayoutDesc")}>
      <div className="nav-layout-picker" role="radiogroup" aria-label={t("settings.navLayout")}>
        {NAV_LAYOUTS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={current === id}
            data-nav-layout-option={id}
            className={cx("nav-layout-card", current === id && "is-selected")}
            onClick={() => void saveSettings({ navLayout: id })}
          >
            <Thumb layout={id} />
            <span className="nav-layout-card-label">{t(LABEL[id])}</span>
          </button>
        ))}
      </div>
    </SettingsRow>
  );
}
```

- [ ] **Step 4:** `SettingsPage.tsx`: `import { NavLayoutRow } from "../../components/settings/NavLayoutRow";` and add `<NavLayoutRow settings={settings} saveSettings={saveSettings} />` after `<FontSizeRow … />` (line 439).

- [ ] **Step 5:** CSS appended to `settings.css`:

```css
.nav-layout-picker { display: flex; gap: 8px; }
.nav-layout-card {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 8px; min-width: 88px;
  color: var(--ds-text-secondary);
  background: var(--ds-bg-primary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--d-r-ctrl);
  cursor: pointer;
}
.nav-layout-card:hover { border-color: var(--ds-text-tertiary); }
.nav-layout-card:focus-visible { outline: var(--focus-outline-default); outline-offset: 2px; }
.nav-layout-card.is-selected {
  color: var(--ds-accent);
  border-color: var(--ds-accent);
  box-shadow: 0 0 0 1px var(--ds-accent);
}
.nav-layout-thumb { width: 64px; height: 44px; }
.nav-layout-card-label { font-size: var(--d-text-sm); color: var(--ds-text-primary); }
```
(Verify `--ds-text-secondary`, `--ds-bg-primary`, `--ds-border-default` exist: `grep -n` them in `tokens.css`; they are used by the existing settings rows. If a name is absent use the nearest existing token from `settings.css`'s `.settings-segment` rule.)

- [ ] **Step 6:** Search index: add `"settings.navLayout", "settings.navLayoutDesc", "settings.navLayoutTabs", "settings.navLayoutRail", "settings.navLayoutIsland",` after `"settings.fontSize",` in the `general` entry.

- [ ] **Step 7:** `pnpm --filter @pi-desktop/i18n test` → PASS. `tsc` exactly 0 errors. Capture rig → Settings → General → Appearance; click each card; confirm `document.documentElement.dataset.navLayout` changes and survives `Cmd+R`.
- [ ] **Step 8: Commit** `feat(settings): navigation layout picker`

---

### Task 5: Primitive restyle (Button, fields, segmented, badge, checkbox, panel, toggle, settings rows)

**Files:**
- Modify: `apps/desktop/src/styles/ui-kit.css:125-191` (`.btn*`), `:372-409` (`.ds-checkbox`), `.field-input|select|textarea`, `.panel-card`, badge rules
- Modify: `apps/desktop/src/styles/providers.css:203-229` (`.settings-segment`)
- Modify: `apps/desktop/src/styles/settings.css:388-1000` (`.settings-card-block`, `.settings-row`), `:1229-1305` (`.settings-toggle`)
- Test: existing `test/{fixed-dropdown-surfaces,topbar-consistency,plugins-page-style,t13-status-token-contrast}.test.mjs` + capture screenshots

**Interfaces:** Consumes `--d-*` (Task 1). Produces no new API; `components/ui.tsx` is **not** edited (class names stay), per the AGENTS rule that primitives stay the single implementation.

Spec deltas (from `kit-d/D-SPEC.md` §buttons/inputs/segmented/toggle/rows):

| Primitive | Today | Direction D |
|---|---|---|
| `.btn` | 28px, radius 20px | height `--d-ctrl`, radius `--d-r-ctrl`, 13px, weight 500 |
| `.btn-primary` | accent fill | **black** fill (`--ds-text-primary` on `--ds-bg-primary` label, inverted per theme); accent only for the composer Send button and selected state |
| `.btn-secondary` | filled grey | transparent, 1px `--ds-border-default`, hover `--ds-bg-hover` |
| `.btn-ghost` / `.btn-sm` | — | ghost: no border; sm: 24px, 12px text |
| `.field-input/select/textarea` | min-height ≈36px | height `--d-ctrl` (textarea min 64px), radius `--d-r-ctrl`, border `--ds-border-default`, focus ring `--ds-accent` 2px |
| `.settings-segment` | pill, tall | track `--ds-bg-hover`, items height 24px inside a 28px track, selected = white/elevated + accent text |
| `.settings-toggle` | existing | 28×16 track, 12px knob, on = `--ds-accent` |
| `.ds-checkbox` | existing | 14px, radius `--d-r-sm`, checked = accent |
| `.panel-card` | 16px radius | radius `--d-r`, 1px border, no heavy shadow |
| `.settings-row` | existing | min-height `--d-row-h`+10px, title 13px / desc 12px muted |

- [ ] **Step 1: Baseline screenshots** of Settings → General, Plugins and a dialog (light + dark) for before/after.
- [ ] **Step 2:** For each row above: `read` the owning rule range, then edit the declarations to the Direction D value using only tokens (`height: var(--d-ctrl)`, `border-radius: var(--d-r-ctrl)`, …). `.btn-primary` colours:

```css
.btn-primary {
  background: var(--ds-text-primary);
  color: var(--ds-bg-primary);
  border-color: transparent;
}
.btn-primary:hover:not(:disabled) { background: color-mix(in oklab, var(--ds-text-primary) 85%, var(--ds-bg-primary)); }
```
- [ ] **Step 3:** `grep -rn "btn-primary" apps/desktop/src --include=*.tsx | wc -l` — list call sites; any place that relied on the blue primary to signal "the" action (composer Send, onboarding Continue, update banner) gets an explicit accent modifier **in its own partial**, not by reverting the primitive: composer `.composer-send` already has its own rule — confirm it uses `--ds-accent`; if it inherited `.btn-primary`, add `background: var(--ds-accent); color: var(--ds-accent-foreground)` to it.
- [ ] **Step 4: Run** `node --test test/*.test.mjs` → only flaky-list tests (npm-executable, remote-host-ssh-*, codesign x2, hindsight fast-exit) failing; `tsc --noEmit` must be 0 errors.
- [ ] **Step 5: Visual smoke.** Capture Settings/Plugins/dialog light+dark; compare to `pages-d/settings-general-appearance/variant-D2*.png` and `D-components.html` (kit-d). Controls are 28px, segmented fits, no overflow with `de` locale.
- [ ] **Step 6: Commit** `style(renderer): direction D primitives`

---

### Task 6: Shell frame — `ShellNavbar`, awesomebar, drag/traffic-light/window-controls, status bar

**Files:**
- Create: `apps/desktop/src/components/ShellNavbar.tsx`, `apps/desktop/src/styles/d-shell.css` (add `@import "./d-shell.css";` after `./chrome.css` in `globals.css`)
- Modify: `apps/desktop/src/features/app/AppShell.tsx:143-149` (render navbar above `.app-chat-shell`; shell root becomes a column), `:360-368` (WindowControls placement)
- Modify: `apps/desktop/src/styles/chrome.css:706-736` (delete the traffic-light lead-inset reserve that the navbar now owns), `:1237-1273` (`.main-titlebar` height → `--d-ph-h`)
- Modify: `packages/shared/src/window-chrome.ts:18` only if Step 5 shows the lights are off-centre (y 16→18)
- Modify: `apps/desktop/src/styles/workbench.css` or `chat-shell.css` (`WorkspaceBar` height → `--d-status-h`)
- Test: `test/topbar-consistency.test.mjs`, `test/app-store-sidebar.test.mjs`, capture + e2e

**Interfaces:**
- Consumes: `useAppStore` `page`/`settings`, `setSearchOpen` (AppShell prop), `resolveNavLayout`, `WindowControls`.
- Produces: `<ShellNavbar onOpenSearch />`; `.shell-navbar[data-nav-layout]`; `<NavTabs/>` slot (Task 8) and a breadcrumb for rail/island.

Structure after this task:

```
.app-shell                         (flex column)
  <ShellNavbar/>                   48px, drag region
  .app-chat-shell                  (flex row, flex:1, min-height:0)   ← existing body
```

- [ ] **Step 1: Pre-read** `AppShell.tsx:360-401` (WindowControls/Toasts) and `chrome.css:700-760,1230-1280` to list every rule that reads `--ds-window-lead-inset`, `--ds-pane-lead-inset`, `--ct-lead-inset`, `.window-chrome-row`. Output of `grep -rn "lead-inset\|window-chrome-row" apps/desktop/src` goes in the commit body.
- [ ] **Step 2: Component** (breadcrumb/tab slot filled in Task 8):

```tsx
// apps/desktop/src/components/ShellNavbar.tsx
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import { resolveNavLayout } from "../lib/nav-layout";
import { IconSearch } from "./icons";
import { NavTabs } from "./NavTabs";

export function ShellNavbar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { t } = useTranslation();
  const layout = resolveNavLayout(useAppStore((s) => s.settings?.navLayout));
  const isMac = (window.piDesktop?.platform ?? "darwin") === "darwin";
  return (
    <header className="shell-navbar drag" data-nav-layout={layout}>
      <div className="shell-navbar-lead" aria-hidden />
      <div className="shell-navbar-start no-drag">
        {layout === "tabs" ? <NavTabs /> : <span className="shell-navbar-brand">{t("app.shellName")}</span>}
      </div>
      <button
        type="button"
        className="shell-awesomebar no-drag"
        data-nav="awesomebar"
        aria-label={t("nav.search")}
        onClick={onOpenSearch}
      >
        <IconSearch size={14} aria-hidden />
        <span className="shell-awesomebar-label">{t("nav.search")}</span>
        <kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      <div className="shell-navbar-end" aria-hidden />
    </header>
  );
}
```
(A stub `NavTabs` that returns `null` is created in this task so it compiles; Task 8 gives it content. It is not shipped half-done: the `tabs` layout is only selectable via the picker, and Task 8 lands before the release branch merge — the Task 6 commit message says so.)

- [ ] **Step 3: CSS** `d-shell.css`:

```css
.app-shell { display: flex; flex-direction: column; }
.shell-navbar {
  display: grid; grid-template-columns: 1fr minmax(240px, 480px) 1fr; align-items: center;
  height: var(--d-navbar-h); flex: 0 0 var(--d-navbar-h);
  padding: 0 var(--d-gap); gap: 8px;
  background: var(--surface-elevation-1);
  border-bottom: 1px solid var(--d-border, var(--ds-border-default));
  position: relative; z-index: 30;
}
:root[data-platform="darwin"] .shell-navbar { padding-left: 78px; }           /* traffic lights */
:root[data-platform="darwin"][data-fullscreen="true"] .shell-navbar { padding-left: var(--d-gap); }
:root:not([data-platform="darwin"]) .shell-navbar { padding-right: 124px; }    /* WindowControls */
.shell-navbar-start { display: flex; align-items: center; gap: 6px; min-width: 0; }
.shell-navbar-brand { font-weight: 600; font-size: var(--d-text); }
.shell-awesomebar {
  display: flex; align-items: center; gap: 8px;
  height: var(--d-ctrl-lg); padding: 0 10px;
  color: var(--ds-text-tertiary); background: var(--ds-bg-hover);
  border: 1px solid var(--ds-border-default); border-radius: var(--d-r-ctrl);
  font-size: var(--d-text); text-align: left; min-width: 0;
}
.shell-awesomebar:hover { border-color: var(--ds-text-tertiary); }
.shell-awesomebar:focus-visible { outline: var(--focus-outline-default); outline-offset: 2px; }
.shell-awesomebar-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.shell-awesomebar kbd { font: inherit; font-size: var(--d-text-xs); color: var(--ds-text-tertiary); }
```
(`--surface-elevation-1`, `--ds-bg-hover` etc. are looked up with `grep` first; substitute the nearest existing token.)

- [ ] **Step 4: AppShell.** Render `<ShellNavbar onOpenSearch={() => setSearchOpen(true)} />` as the first child of `.app-shell` content, outside `PortalVisibilityProvider`'s `hidden`/`inert` wrapper (Review Focus 4: the navbar stays usable in settings so the user can leave it by Cmd-K and can see the window controls). Verify `.app-chat-shell` gets `flex: 1; min-height: 0`.
- [ ] **Step 5: Delete the lead-inset logic** found in Step 1 (clean cutover). `.conversation-topbar` and `.main-titlebar` keep their 48px (`--ds-toolbar-height` already 48 via Task 1) but no longer reserve traffic-light space.
- [ ] **Step 6: Verify (macOS, real window).** Launch non-capture: traffic lights centred in the 48px band, drag works on empty navbar, awesomebar click opens `SearchDialog`, Cmd-K still works. Capture-rig all pages: no page content under the navbar. If lights are off-centre, set `MAC_TRAFFIC_LIGHT_POSITION.y` to 18 and re-check. Windows/Linux: not runnable here — **report as unverified**; CSS reserves 124px.
- [ ] **Step 7:** `node --test test/*.test.mjs` (baseline) + `pnpm test:e2e` (28/28).
- [ ] **Step 8: Commit** `feat(shell): direction D navbar + awesomebar`

---

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

### Task 8: `tabs` layout (D1)

**Files:**
- Create: `apps/desktop/src/components/NavTabs.tsx` (replaces the Task 6 stub)
- Modify: `apps/desktop/src/features/app/AppShell.tsx:149` (render `<NavRail/>` only when layout ≠ `tabs`)
- Modify: `apps/desktop/src/styles/d-shell.css` (tab pills, hide rail under `data-nav-layout="tabs"`)
- Test: `test/nav-items.test.mjs` (extend), capture, e2e

**Interfaces:** Consumes `navItems`, `useAppStore` `page`/`setPage`/`navBack`, `NotificationCenter`, Settings button. Produces `<NavTabs/>` with `role="tablist"`.

- [ ] **Step 1: Extend the test** — add a settings-keeps-working assertion is UI-only, so instead assert the shared list has no duplicate `page`:

```js
test("each destination maps to a distinct page", () => {
  const pages = navItems({ kanban: true, raven: true }).map((i) => i.page);
  assert.equal(new Set(pages).size, pages.length);
});
```
Run (PASS already; it pins the list the tabs depend on).
- [ ] **Step 2: Implement**

```tsx
// apps/desktop/src/components/NavTabs.tsx
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import { navItems } from "./nav-items";
import { NAV_ICONS } from "./NavRail";
import { cx } from "./ui";

export function NavTabs() {
  const { t } = useTranslation();
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const kanban = useAppStore((s) => s.kanbanEnabled);
  const raven = useAppStore((s) => s.ravenEnabled);
  return (
    <nav className="nav-tabs" role="tablist" aria-label="Primary">
      {navItems({ kanban, raven }).map((item) => {
        const Icon = NAV_ICONS[item.id];
        const label = t(item.labelKey);
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={page === item.page}
            data-nav={item.dataNav}
            title={label}
            className={cx("nav-tab", page === item.page && "active")}
            onClick={() => setPage(item.page)}
          >
            <Icon size={14} aria-hidden />
            <span className="nav-tab-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
```
Export `NAV_ICONS` from `NavRail.tsx` (Task 7 defined it local). Notifications and Settings are rendered at the right end of the navbar by `ShellNavbar` in `tabs` layout (`<NotificationCenter/>` + Settings `TooltipButton`, same props as in NavRail) — add them to `ShellNavbar`'s `.shell-navbar-end` when `layout === "tabs"` (in other layouts they live in the rail footer).
- [ ] **Step 3: CSS**

```css
.nav-tabs { display: flex; gap: 2px; min-width: 0; overflow: hidden; }
.nav-tab {
  display: inline-flex; align-items: center; gap: 6px; height: var(--d-ctrl);
  padding: 0 10px; border-radius: var(--d-r-ctrl);
  color: var(--ds-text-secondary); font-size: var(--d-text); white-space: nowrap;
}
.nav-tab:hover { background: var(--ds-bg-hover); }
.nav-tab.active { background: color-mix(in oklab, var(--ds-accent) 14%, transparent); color: var(--ds-accent); }
.nav-tab-label { overflow: hidden; text-overflow: ellipsis; max-width: 12ch; }
:root[data-nav-layout="tabs"] .app-chat-shell > .nav-rail { display: none; }
@media (max-width: 1100px) { .nav-tab-label { display: none; } }
```
- [ ] **Step 4: Verify** with `de`/`tr` locales (Review Focus 7): no wrap, awesomebar stays centred. Switch layouts live from Settings while a chat has draft text and a streaming turn: draft and scroll preserved (Review Focus 8). e2e 28/28.
- [ ] **Step 5: Commit** `feat(shell): tabs layout`

---

### Task 9: `island` layout (D3) — labelled rail + global sessions island

**Files:**
- Modify: none in `AppShell.tsx` (see Step 1)
- Modify: `apps/desktop/src/styles/d-shell.css`, `sidebar-threads.css` (island sidebar surface)
- Test: capture, e2e (rule-level behaviour is covered by `shellChromeWidth` in `test/nav-layout.test.mjs`)

**Interfaces:** Consumes `Sidebar` props unchanged and `shellChromeWidth("island") = 84` (Task 3).

- [ ] **Step 1:** No `AppShell.tsx` sidebar change: the existing `!workbench && (!sidebarCollapsed || sidebarExiting)` condition already matches decision 2 (global sessions sidebar everywhere except Bench/Build). The island layout only re-skins it.
- [ ] **Step 2: CSS (island only)**

```css
:root[data-nav-layout="island"] .nav-rail { width: var(--d-rail-island); }
:root[data-nav-layout="island"] .nav-rail-label { display: block; font-size: var(--d-text-xs); }
:root[data-nav-layout="island"] .sidebar {
  margin: 0 0 var(--d-gap) 0; border-radius: var(--d-r);
  background: var(--ds-bg-primary); border: 1px solid var(--ds-border-default);
}
```
(Selector `.sidebar` is the real root of `Sidebar.tsx` — confirm with `grep -n "className=" apps/desktop/src/components/Sidebar.tsx | head`; use the actual root class.)
- [ ] **Step 3: Verify** `sidebarCollapsed` toggle + auto-collapse when the work panel would breach the 450px floor (open WorkPanel at 1280px window in `island`; sidebar collapses, main ≥ 450). Kanban board scrolls horizontally at the narrower canvas width (design note). Build/Bench show no global sidebar (decision 2).
- [ ] **Step 4:** Commit `feat(shell): island layout`

---

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

### Task 11: WorkPanel, Build and Bench

**Files:** `features/work-panel/*`, `pages/BuildPage.tsx`, `pages/BenchPage.tsx`; styles `work-panel.css`, `workbench.css`.
**Test:** `bench-page-*.test.mjs`, `t10-build-precondition.test.mjs`, `canvas-ownership.test.mjs`, capture.

- [ ] **Step 1:** WorkPanel: panel surface = canvas island (`--d-r`, 1px border); tab strip 32px (`--d-mini-h`); width 300–340 (Task 10 default).
- [ ] **Step 2:** Bench: three columns 224px | flex | 252px inside one canvas; panels `--d-r`; list rows `--d-row-h`; mini-headers `--d-mini-h`; status strip `--d-status-h` / `--d-text-xs`. Build: left app list + status inside `.context-sidebar`, canvas gap `--d-gap`; **the Build canvas `WebContentsView` host `div` keeps its rect reporting untouched.** Spec: `pages-d/{bench,build}/notes.md`.
- [ ] **Step 3: Verify** bounds in all layouts: open Build, switch layout, resize window and toggle the work panel; the native view tracks its host div (log `view.getBounds()` vs host rect, tolerance 1px).
- [ ] **Step 4: Commit** `style(workbench): direction D work panel, build, bench`

---

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

### Task 13: Settings workbench, Raven/FileBird frame, command palette, onboarding

**Files:** `features/settings/SettingsPage.tsx` + `settings.css`; `pages/{RavenPage,FileBirdPage}.tsx` chrome only; `components/SearchDialog.tsx` + `session-search.css`; onboarding (`grep -rln "onboarding" apps/desktop/src/components apps/desktop/src/features | head`) + its partial.
**Test:** `settings-*.test.mjs`, `fixed-dropdown-surfaces.test.mjs`, capture.

- [ ] **Step 1: Settings.** Two-panel workbench: nav rail panel 240px (`--d-r`, group labels 11px uppercase, items `--d-row-h` with 14px icon, active = accent tint), content panel with cards `--d-r`. **Keep instant per-field save** (decision 3); do not add a Save/Discard bar. Palette from `pages-d/settings-*/notes.md`.
- [ ] **Step 2: Raven/FileBird.** Only the thin Fcode frame (page head `--d-ph-h` with title + reload/open-external buttons) changes. Embedded view content is untouched. In all 3 layouts the host div fills the canvas minus the head; re-report bounds on layout change (Review Focus 1).
- [ ] **Step 3: Command palette** (`SearchDialog`): 13px items, 11px uppercase group labels with dashed separators, matched text in `--ds-accent`, focused row `--d-r-ctrl` + accent tint + 2px offset focus outline.
- [ ] **Step 4: Onboarding.** Step 1 follows `pages-d/onboarding/`. Steps 2 and 3 have **no approved mockup** (decision 4): restyle by primitives/tokens only and list them in the PR as needing design review.
- [ ] **Step 5: Verify** settings search (Cmd-K → "layout" finds Settings → General), plugin themes (`plugin:*`) still win over the D accent (Review Focus 6), capture the 17 reference pages.
- [ ] **Step 6: Commit** `style(settings,palette,onboarding): direction D`

---

### Task 14: Cross-layout verification matrix and docs

**Files:**
- Modify: `apps/desktop/src/capture/capture-rig.ts` (loop pages × `setNavLayout` × `setThemeAttr`; read the file first and follow its existing shot helper)
- Modify: `docs/spec/04-ux/07-ui-design-system.md` (Direction D tokens, navLayout, accent deviation; if §11 gained a primitive in Task 5–13, document it)
- Create: `docs/adr/` entry only if the repo's ADR convention requires one for a user-visible setting (check `ls docs/adr | tail -3`)
- Test: full suites

- [ ] **Step 1:** Extend the rig to produce `/tmp/codex-screens/<page>-<layout>-<theme>.png` for: chat, chat+WorkPanel, build, bench, kanban, scheduled, pulls, notifications, plugins, settings (3 tabs), raven, filebird, palette = 13 shots × 3 layouts × 2 themes = 78+ images.
- [ ] **Step 2:** Review them side by side against `pages-d/` (open both folders; 17 page references). Record deltas, fix, re-run. Specifically check: no page content under the navbar; no horizontal overflow at 1280×800; no clipped labels in `de`.
- [ ] **Step 3:** Native-view bounds check for Raven, FileBird, Build under each layout and under a live layout switch (Review Focus 1) — log numbers in the PR description.
- [ ] **Step 4:** Run everything and compare with the Task 1 baseline:

```bash
cd /Users/mac/ERPNext/frappe_agent/PI-Desktop
pnpm --filter @pi-desktop/i18n test
pnpm --filter @pi-desktop/desktop test            # only flaky list (npm-executable, remote-host-ssh-*, codesign x2, hindsight fast-exit) failing
(cd apps/desktop && ./node_modules/.bin/tsc --noEmit -p . 2>&1 | grep -c "error TS")   # must be 0
pnpm test:e2e                                      # 28/28
```
- [ ] **Step 5:** Docs updated as listed; remove any scratch files in the repo. `git status` shows no `CHANGELOG.md` change.
- [ ] **Step 6: Commit** `docs(ui): direction D design system + capture matrix`

---

## Self-review

**Spec coverage (D-SPEC.md → tasks):** tokens/density/accent → T1; 3 navs + user selection + persistence → T2, T3, T4, T6–T9; primitives → T5; chat 3-panel/Activity/composer/tool timeline → T10 (via WorkPanel, decision 5); WorkPanel/Build/Bench → T11; Kanban/Scheduled/Pulls/Notifications/Plugins/Projects → T12; Settings/Raven/FileBird/palette/onboarding → T13; verification + docs → T14. FileBird keeps its UI (T13 step 2). Raven-island nav (D3) → T9. Accent = FileBird blue → T1.

**Placeholder scan:** none left as "TBD". Two honest limits: (a) T10–T13 specify page CSS as token-valued deltas against real, named partials rather than literal CSS, because the owning selectors are only knowable by reading each partial, and each step says to read it first; (b) the T6 `NavTabs` stub compiles but is unfinished until T8 — do not merge/release between T6 and T8.

**Type consistency:** `NavLayout`, `resolveNavLayout`, `shellChromeWidth` (T2) are the only layout names used in T3/T4/T6. `navItems`/`NavItem`/`NAV_ICONS` (T7) used by T8. `data-nav-layout` attribute is set once (T3) and read by T6–T9 CSS. There is no `navLayoutSaved` key (instant save is silent).

**Review Focus coverage:** 1 → T7/T11/T13/T14; 2 → T3/T9; 3 → T6; 4 → T6 step 4; 5 → T2 test; 6 → T1 ordering + T13; 7 → T8; 8 → T8 step 4; 9 → T1 test + T5.

**Not verified here (state at execution):** Windows/Linux window controls cannot be run on this macOS host; onboarding steps 2–3 have no mockup.
