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
./node_modules/.bin/tsc --noEmit -p . 2>&1 | grep -c "error TS"          # expect 3
node --test test/*.test.mjs 2>&1 | grep -E "^# (pass|fail)"               # expect fail 1 (hindsight fast-exit)
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

