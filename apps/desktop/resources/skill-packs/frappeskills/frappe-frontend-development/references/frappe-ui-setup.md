# frappe-ui Project Setup

Adapted in part from frappe/frappe-ui (MIT): `skills/frappe-ui/SETUP.md`, `vite/README.md`.

How to bootstrap and wire a Vue 3 + frappe-ui SPA inside `apps/<app>/frontend`.
Used by
[frontend-vue.md](frontend-vue.md) (entry point),
[frontend-architecture.md](frontend-architecture.md) (app-scale wiring), and
[frontend-portal.md](frontend-portal.md).

**Check `frontend/package.json` first.** This file documents the **v1**
(`1.0.0-beta.x`) API — canonical for new apps. Real installed apps commonly
pin **0.1.x** (0.1.105–0.1.269 observed) instead; differences are called out
inline as `(0.1.x)`. When they disagree with your installed version, follow
whichever line `frontend/package.json` actually pins.

## 1. Scaffold

`npm create vite@latest` currently scaffolds **Vite 8 + Tailwind v4**, both
incompatible with frappe-ui (its vite plugin targets Vite 5's plugin API; its
Tailwind preset is a v3-shaped config — `darkMode`, `plugins`, `content`,
confirmed in `tailwind/preset.js`). Scaffold plain, then fix versions:

```bash
cd apps/<app>
npm create vite@latest frontend -- --template vue
cd frontend
npm uninstall tailwindcss @tailwindcss/vite vite @vitejs/plugin-vue
npm install -D tailwindcss@^3.4 postcss autoprefixer vite@^5 @vitejs/plugin-vue@^5 vue-router@^4.1.6
npm install frappe-ui@beta   # or a pinned version, e.g. frappe-ui@1.0.0-beta.29
```

There is **no `templates/` directory in the `frappe-ui` repo** — a
`npx degit frappe/frappe-ui/templates/spa frontend` command does not resolve
to anything and will fail. The maintainers' own `readme.md` links a community
starter instead: [`netchampfaris/frappe-ui-starter`](https://github.com/netchampfaris/frappe-ui-starter)
(`npx degit netchampfaris/frappe-ui-starter frontend`). It gives you a working
`index.html` / `src/main.js` / `src/router.js` / `src/App.vue` skeleton plus
the bundled Inter font files, but its committed `vite.config.js`,
`tailwind.config.js`, and `package.json` pin **frappe-ui `^0.0.105`, Vite
`^2.7.2`** — years out of date, predating the `frappe-ui/vite` plugin and
`frappe-ui/tailwind` preset entirely. If you use it, replace those three
files with the versions in this doc immediately after cloning; do not run
`yarn dev` against the starter's own config.

**`vue-router` is effectively required** once any `<Button :route="...">` is
used — `Button`'s dynamic root renders `RouterLink` when the `route` prop is
set (`src/components/Button/Button.vue`), and `RouterLink` injects the
router instance itself; without an installed router, only those route-bound
buttons fail, not plain buttons with no `route` prop.

### Package `exports` — only these subpaths resolve

frappe-ui's `package.json` declares an `exports` map; anything outside it
(e.g. `frappe-ui/src/utils/tailwind.config`, the path the top-level
`readme.md`'s own snippet still uses) fails with
`Package subpath '…' is not defined by "exports"`. Verified subpaths
(`package.json` `exports`):

| Subpath | Resolves to |
|---|---|
| `frappe-ui` | `src/index.ts` — main component/composable barrel |
| `frappe-ui/frappe` | `frappe/index.js` — backend-dependent components (Link, Filter, onboarding, billing banners, telemetry) |
| `frappe-ui/editor` | `src/molecules/editor/index.ts` — `Editor`, `useEditor`, kits (v1 only; top-level `TextEditor` is deprecated) |
| `frappe-ui/list` | `src/molecules/list/index.ts` — new list primitives (v1 only) |
| `frappe-ui/code-editor` | `src/components/CodeEditor/index.ts` (v1 only) |
| `frappe-ui/drive`, `frappe-ui/drive/*` | `frappe/drive/*` (v1 only) |
| `frappe-ui/icons` | `icons/index.ts` |
| `frappe-ui/experimental` | `experimental.ts` (v1 only) |
| `frappe-ui/tailwind` | `tailwind/index.js` → re-exports `tailwind/preset.js` default |
| `frappe-ui/tailwind/tokens.js` | `tailwind/tokens.js` (v1 only) |
| `frappe-ui/vite` | `vite/index.js` — the `frappeui()` plugin factory |
| `frappe-ui/style.css` | `src/style.css` |
| `frappe-ui/editor-style.css`, `frappe-ui/list-style.css`, `frappe-ui/hljs-theme.css` | companion stylesheets (v1 only) |

0.1.261 exposes the same shape for `.`, `./frappe`, `./icons`, `./tailwind`,
`./vite`, `./style.css`, `./tsconfig.base.json` — the `editor`/`list`/
`code-editor`/`drive`/`experimental`/token-css subpaths are v1-only additions
(confirmed absent from the 0.1.261 `exports` map).

## 2. `vite.config.js` — the `frappeui()` plugin

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import frappeui from 'frappe-ui/vite'

export default defineConfig({
  plugins: [
    frappeui({
      frontendRoute: '/myapp',   // shared route prefix — see table below
    }),
    vue(),
  ],
  optimizeDeps: {
    // frappe-ui ships unbuilt source with `~icons/lucide/*` virtual imports
    // esbuild's prebundler cannot resolve; the frappeui plugin resolves them
    // at request time instead. Skip prebundling frappe-ui itself...
    exclude: ['frappe-ui'],
    // ...then explicitly prebundle its CJS transitive deps so the browser
    // gets ESM.
    include: ['feather-icons', 'tippy.js', 'showdown', 'engine.io-client', 'socket.io-client', 'debug'],
  },
})
```

`frappeui()` (`vite/index.js`) returns an *array* of plugins, one per
sub-feature. Every sub-plugin except `frappeTypes` is on by default; pass
`false` to disable one, or an options object to override its defaults.
Verified option table (source: `vite/index.js` + each plugin file; the
per-option defaults below are read straight from the implementation, not the
`vite/README.md` prose, which is stale in one place — noted inline):

| Option | Default | Plugin file | Effect |
|---|---|---|---|
| `frontendRoute` | *(none)* | `index.js` | Shared route prefix (e.g. `/myapp`). Feeds the dev-server site banner, the `buildConfig` `indexHtmlPath` inference, and a `define: { __FRONTEND_ROUTE__ }` global. |
| `lucideIcons` | `true` | `lucideIcons.js` | Wires `unplugin-auto-import` + `unplugin-vue-components` (with an `IconsResolver({ prefix: false, enabledCollections: ['lucide'] })`) so `<LucideArrowRight class="size-4" />` auto-imports, plus a custom plugin that resolves `~icons/lucide/*` / component tags straight from `lucide-static` SVGs (a placeholder circle-help icon renders for names lucide-static no longer ships, e.g. removed brand icons, with a one-time console warning). Pass `{ componentGlobs: [...] }` to restrict which files get the auto-import scan. |
| `frappeProxy` | `true` | `frappeProxy.js` | Dev-server proxy to the Frappe backend. `port` default: read `common_site_config.json`'s `webserver_port` (or `FRAPPE_WEB_SERVER_PORT` env), then `8080 + (webserver_port - 8000)` — 8000→8080, 8001→8081, etc. `source` default regex: **`'^/(desk\|app\|login\|api\|assets\|files\|private)'`** — the shipped `vite/README.md` prints this same list *without* `desk`; the source is the one Vite actually runs, so trust it over the README. |
| `buildConfig` | `true` | `buildConfig.js` | Production build wiring — see §5. |
| `jinjaBootData` | `true` | `jinjaBootData.js` | Injects a Jinja loop before `</body>` **only in production builds** (`context.server` is truthy in dev, so this is a no-op there) — see §6. |
| `frappeTypes` | *(off — opt-in)* | `frappeTypes.js` + `generateTypes.js` + `doctypeInterfaceGenerator.js` | Requires `{ input: { app_name: ['doctype1', ...] } }`. In `mode === 'development'` only, spawns a Node child process that walks `frappe-bench/apps/<app_name>/**/doctype/<doctype>/<doctype>.json`, diffs against previously generated interfaces, and writes/updates TypeScript interfaces to `output` (default `src/types/doctypes.ts`) — regenerated only when the source DocType JSON changes. |
| `barrelImports` | `true` | `barrelImports.js` | Dev-only (`apply: 'serve'`) rewrite of `import { Button } from 'frappe-ui'` to a deep import of the module that declares it, so Vite's unbundled dev server doesn't crawl the ~100-line re-export barrel (and everything it pulls in — echarts, TipTap, CodeMirror, socket.io) for one component. **Defaults to `linkedOnly: true`**, meaning it only rewrites when `frappe-ui` resolves to a working copy (the library's own source, or a symlinked/monorepo install) rather than a normal registry install — for a plain `npm install frappe-ui`, this plugin is effectively inert by default. |

Two behaviors apply unconditionally, regardless of any option above (still
`vite/index.js`): every build gets `optimizeDeps.include: ['highlight.js/lib/core', 'interactjs']`
merged in, and — separately from the `siteBanner` behavior below — no option
disables that merge.

**`siteBanner`** is not an independent toggle: `siteBanner({ frontendRoute })`
runs unconditionally, but the function itself returns `null` (adds no plugin)
when `frontendRoute` is unset. When set, it prints each site the app is
installed on plus its dev-server URL once the dev server starts listening.

The `frappeui()` plugin's Frappe-specific defaults (`frappeProxy`,
`jinjaBootData`, `buildConfig`, `lucideIcons`) all assume you're running
inside a Frappe bench. Pass `false` for each when prototyping standalone.

### Icon toolchain — what you actually need to install

SETUP.md's checklist lists `unplugin-auto-import`, `unplugin-vue-components`,
`unplugin-icons`, `lucide-static`, and `@iconify/json` as devDependencies to
install. Checked against `frappe-ui`'s own `package.json` `dependencies`
(not `devDependencies`): **`unplugin-auto-import`, `unplugin-icons`,
`unplugin-vue-components`, and `lucide-static` are already regular
dependencies of `frappe-ui` itself**, so `npm install frappe-ui` pulls them
in transitively — npm/yarn (non-strict resolution) hoist them into your
app's own `node_modules` automatically; nothing further to install. Only
under strict-hoisting package managers (pnpm without `public-hoist-pattern`)
would you need to add them directly. `@iconify/json` is not consumed at all:
`lucideIcons.js` imports `IconsResolver` only from `unplugin-icons/resolver`
(the naming-convention resolver, not the icon-content Vite plugin), and its
own `LucideIconsPlugin` resolves `~icons/lucide/*` content straight from
`lucide-static` SVGs — `@iconify/json`'s icon-collection data is never read.

## 3. `frappeui.json` — not a thing

`vite/utils.js` exports a `getConfig()` that reads `frappeui.json` from
`process.cwd()`, but no plugin calls it. There is no supported
`frappeui.json` project-config file; configure everything through the
`frappeui()` call in `vite.config.js`.

## 4. `tailwind.config.js` + `postcss.config.js`

```js
// tailwind.config.js
import frappeUIPreset from 'frappe-ui/tailwind'

/** @type {import('tailwindcss').Config} */
export default {
  presets: [frappeUIPreset],
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
    // Tailwind v3 does NOT merge `content` from presets (only `theme` merges) —
    // frappe-ui's own preset.js documents this — so list its source globs here
    // too, or component-internal classes (e.g. inside Dialog, FormControl)
    // get purged.
    './node_modules/frappe-ui/src/**/*.{vue,js,ts,jsx,tsx}',
    './node_modules/frappe-ui/frappe/**/*.{vue,js,ts,jsx,tsx}',
  ],
}
```

```js
// postcss.config.js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
```

The preset (`tailwind/preset.js`) itself sets `darkMode: ['selector',
'[data-theme="dark"]']`, fills the integer spacing scale 1–64 at the
0.25rem step (stock Tailwind has gaps above 12), safelists `prose`/`prose-v3`
for the rich-text editor, and applies `@tailwindcss/forms`,
`@tailwindcss/typography`, the design-token plugin, and a Lucide icon-class
plugin. Design tokens and Espresso details:
[design-tokens.md](../../frappe-design-tokens/references/design-tokens.md).

## 5. CSS entry + app bootstrap

```css
/* src/style.css */
@import 'frappe-ui/style.css';
@tailwind base;
@tailwind components;
@tailwind utilities;
```

```js
// src/main.js
import { createApp } from 'vue'
import { FrappeUI, pageMetaPlugin, setConfig } from 'frappe-ui'
import { router } from './router'
import './style.css'
import App from './App.vue'

const app = createApp(App)
app.use(router)          // required — frappe-ui's <Button> injects Symbol(router)
app.use(FrappeUI)        // installs resources/call/socketio globals — see below
app.use(pageMetaPlugin)  // optional — enables the `pageMeta` component option / usePageMeta()
app.mount('#app')
```

`FrappeUI` (`src/utils/plugin.ts`) is `app.use`-installed and, by default,
installs the legacy resources plugin, sets `app.config.globalProperties.$call`,
and initializes `app.config.globalProperties.$socket = initSocket()`. Pass
`app.use(FrappeUI, { config: {...} })` to seed `FrappeUIConfig` values
(`resourceFetcher`, `requestBaseUrl`, `requestHeaders`, `maxFileSize`,
timezones, error handlers) at app creation instead of calling `setConfig`
per-key afterward; both are equivalent, `config` is just fewer calls. Disable
a sub-feature with `app.use(FrappeUI, { resources: false, call: false,
socketio: false })`.

`pageMetaPlugin` and `FrappeUIProvider` are two different things you usually
want together: the plugin above is a global mixin exposing a `pageMeta`
option / `usePageMeta()` composable to set `document.title` + favicon
reactively per route; the provider below mounts the imperative `dialog.*` /
`toast.*` portals.

```vue
<!-- src/App.vue -->
<script setup>
import { FrappeUIProvider } from 'frappe-ui'
</script>

<template>
  <FrappeUIProvider>
    <router-view />
  </FrappeUIProvider>
</template>
```

`FrappeUIProvider` (`src/components/Provider/FrappeUIProvider.vue`) renders
`<slot />` then `<Dialogs />` and `<ToastProvider />` — without it,
`dialog.confirm(...)` / `toast(...)` calls render nothing.

## 6. Frappe-side wiring

### `hooks.py`

```python
website_route_rules = [
    {"from_route": "/myapp/<path:app_path>", "to_route": "myapp"},
]
```

### `myapp/www/myapp.py` — boot context

```python
import frappe

no_cache = 1

def get_context(context):
    context.boot = get_boot()

def get_boot():
    return frappe._dict({
        "csrf_token": frappe.sessions.get_csrf_token(),
        "site_name": frappe.local.site,
        "user": frappe.session.user,
    })
```

### `myapp/www/myapp.html` — built entry + boot injection

`jinjaBootData` (enabled by default) injects this block before `</body>` at
**build time only**:

```html
<script>
  {% for key in boot %}
  window["{{ key }}"] = {{ boot[key] | tojson }};
  {% endfor %}
</script>
```

Read the values back client-side as plain globals: `window.csrf_token`,
`window.site_name`. `buildConfig` (§ below) copies the built `index.html`
(with its hashed asset `<script>`/`<link>` tags already injected by Vite)
into this file — do not hand-edit the `<head>` asset tags.

### Dev-mode CSRF

The Jinja injection above only runs in a production build. In dev, either
whitelist a `get_context_for_dev` endpoint that returns the same
`get_boot()` payload and fetch it once before `app.mount()` (see
[frontend-architecture.md §2](frontend-architecture.md)), or — for a
prototype where you don't want to write that endpoint yet — set
`"ignore_csrf": 1` in `site_config.json` to stop the dev-server proxy from
rejecting non-GET requests for lacking a CSRF token. Never ship
`ignore_csrf` to production.

## 7. Production build (`buildConfig`)

All fields are overridable via
`frappeui({ buildConfig: {...} })`, defaults shown:

| Field | Default | How it's computed |
|---|---|---|
| `outDir` | `<appDir>/public/frontend` | `findOutputDir()` walks the parent directory of `frontend/` looking for a sibling folder containing both `public/` and `hooks.py` (the Frappe app root) — logs an error and disables the plugin if none is found; pass `outDir` explicitly if your layout doesn't match. |
| `baseUrl` | `/assets/<appName>/<subdir>/` | Parsed back out of the resolved `outDir` path (finds the `public` segment, takes the folder name before it as the app name). |
| `indexHtmlPath` | inferred from `frontendRoute`, else `null` | `../<appName>/www/<frontendRoute-without-leading-slash>.html`. **Required in production** — the plugin throws if it's still unset when `mode === 'production'`. |
| `emptyOutDir` | `true` | Clears `outDir` before each build. |
| `sourcemap` | `true` | Rollup sourcemaps. |

At `writeBundle`, the plugin copies `<outDir>/index.html` to
`indexHtmlPath` — that copy is what turns your Vite build into the
`www/<app>.html` Frappe serves.

```bash
cd apps/<app>/frontend
yarn build          # emits to outDir, then copies index.html to indexHtmlPath
```

Or via bench: `bench build --app <app-name>`.

## 8. Dev loop

```bash
cd apps/<app>/frontend
yarn install
yarn dev             # Vite dev server; frappeProxy forwards /app,/login,/api,/assets,/files,/private to the running site
```

`bench start` must already be running so the proxy target is reachable.

## 9. Sanity check

- DevTools console is empty: no `Package subpath '…' is not defined`, no
  `Could not resolve '~icons/lucide/…'`, no `injection "Symbol(router)" not found`.
- `<Button icon-left="lucide-plus" label="New" />` renders with an inline
  Lucide icon.
- Semantic surface colors and the Inter font render (not raw Tailwind grays)
  — confirms the preset loaded.
- `yarn build` completes and `myapp/www/myapp.html` contains a `<script
  type="module">` tag pointing at a hashed `/assets/myapp/frontend/...` file.

If any of these fail, the failure almost always traces to one row in the
tables above being skipped.

## Sources

Verified against frappe-ui `1.0.0-beta.29` (`apps/frappe-ui/package.json`),
cross-checked against the `0.1.261` baseline vendored at
`apps/crm/frontend/node_modules/frappe-ui`:

- `apps/frappe-ui/package.json` — `exports` map, `dependencies`/`devDependencies` (icon toolchain)
- `apps/frappe-ui/tailwind/preset.js` — `darkMode`, spacing scale, `@tailwindcss/forms`/`@tailwindcss/typography`, Lucide icon-class plugin
- `apps/frappe-ui/vite/index.js` — `frappeui()` plugin array, sub-plugin defaults, unconditional `optimizeDeps.include`
- `apps/frappe-ui/vite/frappeProxy.js`, `apps/frappe-ui/vite/README.md:85` — proxy `source` regex (README omits `desk`, source code includes it)
- `apps/frappe-ui/vite/buildConfig.js` — `outDir`/`baseUrl`/`indexHtmlPath`/`emptyOutDir`/`sourcemap` defaults, `findOutputDir`/`findAppDir`
- `apps/frappe-ui/vite/jinjaBootData.js` — production-only Jinja boot-data injection
- `apps/frappe-ui/vite/lucideIcons.js`, `apps/frappe-ui/vite/barrelImports.js`, `apps/frappe-ui/vite/siteBanner.js`, `apps/frappe-ui/vite/frappeTypes.js`
- `apps/frappe-ui/vite/utils.js` — `getConfig()` reads `frappeui.json` but is uncalled by any plugin
- `apps/frappe-ui/src/utils/plugin.ts` — `FrappeUI` plugin install (`resourcesPlugin`, `$call`, `initSocket`)
- `apps/frappe-ui/src/components/Provider/FrappeUIProvider.vue` — renders `<Dialogs />`/`<ToastProvider />`
- `apps/frappe-ui/src/components/Button/Button.vue:191-212` — `root` computed renders `RouterLink` only when the `route` prop is set
