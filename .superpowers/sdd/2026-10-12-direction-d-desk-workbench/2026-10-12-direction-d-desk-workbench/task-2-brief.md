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
- [ ] **Step 5: `tsc`** — still exactly the 3 baseline errors.
- [ ] **Step 6: Commit** `feat(settings): navLayout preference + resolver`

---

