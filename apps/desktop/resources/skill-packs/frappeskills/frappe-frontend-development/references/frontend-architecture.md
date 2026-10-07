# Frontend Architecture — Modern frappe-ui SPA Blueprint

The **app-level scaffold** a new Frappe v16 Vue-3 + frappe-ui SPA copies:
bootstrap, stores vs composables vs data-layer, meta caching, router+guard,
socket invalidation, session/auth, and TypeScript conventions. For
scaffolding, the `frappeui()` vite plugin, and `hooks.py`/`www/` wiring, see
[frappe-ui-setup.md](frappe-ui-setup.md) first — this file assumes that's
done and covers app-scale structure on top of it.

[frappe-ui-components.md](frappe-ui-components.md) covers per-component API
(createResource, createListResource, FormControl, Autocomplete-based link
pickers). This file covers the **wiring
around** those components. Source-verified against two production apps:

- **CRM** `apps/crm/frontend` — mature JS SPA. `frontend/package.json` pins
  `frappe-ui@0.1.261`, `vue@^3.5.13`, `pinia@^2.0.33`, `vite@^4.4.9`,
  `@vitejs/plugin-vue@^4.2.3`. Copy for a JS app on the 0.1.x line.
- **Insights** `apps/insights/frontend` — TS SPA; ships two
  trees (`src/`=v2 Pinia, `src2/`=v3 module-singleton, fully typed).
  `frontend/package.json` pins `frappe-ui@~0.1.25x`, `vite@^4.4.6`. Copy
  `src2` conventions for a TS app.

Neither production app observed here has adopted frappe-ui v1
(`1.0.0-beta.x`) yet — both are 0.1.x. For a **brand-new** app, prefer v1
(canonical per this skill's version policy) and translate these 0.1.x
snippets using [frappe-ui-components.md](frappe-ui-components.md)'s `(v1)`
tags; for an app extending CRM or Insights, match whichever line
`frontend/package.json` already pins — don't mix eras.

Precedence: verify against these trees before asserting. `## Sources` at bottom.

---

## 1. Directory layout (feature-foldered, one dir per concern)

```
frontend/
├── index.html                 # SPA entry (#app + #modals/#popovers portals)
├── vite.config.js|ts
├── package.json
└── src/
    ├── main.js|ts             # bootstrap
    ├── App.vue                # root shell: layout switch + FrappeUIProvider
    ├── router.js|ts           # flat/nested route table + one global guard
    ├── socket.js|ts           # realtime init
    ├── translation.js|ts      # __() i18n plugin
    ├── stores/                # Pinia stores (session, users, meta, settings, …)
    ├── composables/           # useX reactive helpers + ephemeral UI state
    ├── data/  (or api/)       # resource factories: doc/list wrappers, useDocument
    ├── doctypes/<slug>/*.js   # per-doctype form controller classes (glob-loaded)
    ├── pages/                 # route view components (+ Mobile* variants)
    ├── components/            # UI; components/frappe-ui/ for wrapped primitives
    └── utils/                 # pure, unit-tested helpers
```

- **Two split styles seen:** layer-foldered (CRM: `stores/ data/ pages/`) and
  feature-foldered (Insights `src2`: `workbook/ data_source/ charts/`, each dir
  co-locating its `.vue` views + `*.ts` data module + `*.types.ts`). Pick one and
  never mix. Feature-foldering scales better past ~15 entities.
- Backend web entry lives in the **python** app, not frontend:
  `crm/www/crm.py` + built `crm/www/crm.html`.

*(CRM `frontend/src/`; Insights `frontend/src2:1` listing.)*

---

## 2. App bootstrap (`main.js` / `main.ts`)

The invariant chain — pinia → router → FrappeUI → resourceFetcher → socket → mount:

```js
// crm/frontend/src/main.js:29-70
let pinia = createPinia(); let app = createApp(App)
setConfig('resourceFetcher', frappeRequest)   // wires createResource -> frappeRequest
app.use(FrappeUI); app.use(pinia); app.use(router); app.use(translationPlugin)
for (let key in globalComponents) app.component(key, globalComponents[key])
app.use(telemetryPlugin, { app_name: 'crm' })
app.config.globalProperties.$dialog = createDialog

let socket
if (import.meta.env.DEV) {                     // DEV: fetch boot context BEFORE mount
  frappeRequest({ url: '/api/method/crm.www.crm.get_context_for_dev' }).then((values) => {
    for (let key in values) window[key] = values[key]  // socketio_port, site_name, sysdefaults…
    socket = initSocket(); app.config.globalProperties.$socket = socket; app.mount('#app')
  })
} else { socket = initSocket(); app.config.globalProperties.$socket = socket; app.mount('#app') }
```

**Boot-context bridge (critical):** in **prod**, boot vars are injected server-side
via Jinja (`jinjaBootData` vite flag / inline `<script>` in `index.html`); in
**DEV**, they're fetched from a whitelisted `get_context_for_dev` and spread onto
`window.*` *before* `app.mount`, so stores/socket can read `window.site_name`,
`window.socketio_port`, `window.sysdefaults`. The backend endpoint:

```python
# crm/www/crm.py:27-59
@frappe.whitelist(methods=["POST"], allow_guest=True)
def get_context_for_dev():
    if not frappe.conf.developer_mode:
        frappe.throw(_("This method is only meant for developer mode"))
    return get_boot()   # frappe_version, site_name, socketio_port, csrf_token,
                        # sysdefaults, timezone{system,user}, translated_messages, …
```

- Expose `$dialog`/`$socket` as `globalProperties`; re-read them in a `global`
  store (`stores/global.js:5`) rather than importing across the app.
- **TS variant** (`insights/src2/main.ts`): same chain; lazy-load telemetry only
  after login via `watchEffect(() => { if (session.isLoggedIn) { app.use(telemetryPlugin…); stop() } })`,
  and set `app.config.errorHandler` for grouped error logging.
- Wrap the fetcher with a global error toast (Insights v2 `src/main.js:14-38`):
  `setConfig('resourceFetcher', (o)=>frappeRequest({...o, onError(e){ if(e.messages?.[0]) createToast({variant:'error', message:e.messages[0]}) }}))`.

---

## 3. Stores vs composables vs data-layer (the division of labor)

**Rule of thumb:** *stores/data-layer hold doc/list resources + caches;
composables hold ephemeral UI state and event wiring.*

### Pinia stores — setup style, wrap a resource, export the type

```js
// crm/frontend/src/stores/session.js:9-40 — cookie-derived user + login/logout
export const sessionStore = defineStore('crm-session', () => {
  const user = ref(getCookie('user_id'))                 // seed from cookie
  const isLoggedIn = computed(() => !!user.value && user.value !== 'Guest')
  const login = createResource({ url: 'login', onSuccess(){ user.value = getCookie('user_id'); ... } })
  const logout = createResource({ url: 'logout', onSuccess(){ user.value = null; window.location.reload() } })
  return { user, isLoggedIn, login, logout }
})
```

```ts
// insights/src/stores/dataSourceStore.ts — store wraps a list resource, exports type
const useDataSourceStore = defineStore('insights:data_sources', () => {
  const listResource = api.getListResource({ doctype:'Insights Data Source',
    cache:'dataSourceList', fields:[...], orderBy:'creation desc', pageLength:100, auto:true })
  const list = computed<DataSourceListItem[]>(() => listResource.list.data?.map(...) || [])
  return { list, loading: listResource.list.loading,
    create:(a)=>api.createDataSource.submit(a).then(()=>listResource.list.reload()) }
})
export type DataSourceStore = ReturnType<typeof useDataSourceStore>   // universal typing idiom
```

- **Layered user directory** (CRM `stores/users.js:17-135`) — a proven pattern for
  large user lists: a fast small `createResource` (auto, cached) for immediate
  interactivity, a `requestIdleCallback`-scheduled full fetch, and a coalesced
  on-demand `getUser(email)` resolver batched via `queueMicrotask`.

### Module-singleton caches (NOT stores) — `getMeta` / `getScript` / `getSettings`

Lightweight caches that any component shares without Pinia overhead: a
module-scope `reactive({})` keyed by doctype.

```js
// crm/frontend/src/stores/meta.js:6-32
const doctypesMeta = reactive({})            // module singleton, shared across all callers
export function getMeta(doctype) {
  const meta = createResource({ url:'frappe.desk.form.load.getdoctype',
    params:{ doctype, with_parent:1 }, cache:['Meta', doctype],
    onSuccess:(r)=>{ doctypesMeta[doctype] = r.docs[0]; /* parse user_settings */ } })
  if (!doctypesMeta[doctype] && !meta.loading) meta.fetch()
  return { meta, getFields, getFormattedValue, saveUserSettings }  // computed off cache
}
```

Insights v3 `src2` takes this further — **module-level `ref`s + a `useXStore()`
factory returning `reactive({...})`** replaces Pinia entirely
(`src2/data_source/data_source.ts:8-90`). Watch for implicit-fetch races: omit
auto-fetch when a scoped fetch also runs (`src2/workbook/workbooks.ts:49`).

### Composables — ephemeral UI state + event wiring

```js
// crm/composables/settings.js:1-11 — shared UI refs as app-wide singleton
export const isMobileView = computed(() => window.innerWidth < 768)
export const showSettings = ref(false)

// crm/composables/useKeyboardShortcuts.js:20-79 — generic keydown binder
useKeyboardShortcuts({ active, shortcuts:[{keys, action, guard, preventDefault}],
  ignoreTyping: true, skipWhenDialogOpen: true })   // add/removeEventListener in onMounted/onBeforeUnmount
```

---

## 4. Data layer — the `useDocument` facade

The single most reusable abstraction: one function returns doc resource +
assignees + permissions + client-script lifecycle, all module-keyed-cached.

```js
// crm/frontend/src/data/document.js:11-153
const documentsCache = {}, controllersCache = {}, assigneesCache = {}, permissionsCache = {}
export function useDocument(doctype, docname, overrides) {
  const doc = createDocumentResource({
    realtime: Boolean(vm?.$socket), doctype, name: docname,
    onSuccess: setupFormScript,                         // wires client scripts
    setValue: { onSuccess: triggerOnSave, onError: mandatory/validation toasts },
    ...overrides })
  // new-doc branch: reactive stub { doc: { __newDocument: true, doctype } } instead of a resource
  // wrap save.submit -> triggerOnValidate() + checkMandatory() before original submit
  const assignees   = createResource({ url:'crm.api.doc.get_assigned_users', cache:['assignees',doctype,docname], auto:!!docname })
  const permissions = createResource({ url:'frappe.client.get_doc_permissions', cache:['permissions',doctype,docname], auto:!!docname })
  return { document: doc, assignees, permissions, scripts, error, /* triggerOnLoad/Render/Validate/Save/Change… */ }
}
```

**TS generic variant** (Insights v3 flagship, `src2/helpers/resource.ts:35-262`) —
a typed replacement for `createDocumentResource`:

```ts
export default function useDocumentResource<T extends Document>(doctype, name, options) {
  const doc = ref(options.initialDoc); const originalDoc = ref(copy(...))
  const isDirty = computed(() => !isEqual(doc.value, originalDoc.value))   // es-toolkit
  const methods = { ...DEFAULT_API, ...options.apiMethods }                // overridable endpoints
  // lifecycle hook sets: beforeInsert/afterInsert/beforeSave/afterSave/afterLoad
  loadDoc().then(setupLocalStorage).then(setupAutoSave)
  return reactive({ doc, isdirty:isDirty, save, insert, load, call:callMethod, delete,
                    onBeforeSave:(fn)=>lifecycleHooks.beforeSave.add(fn), discard })
}
export type DocumentResource<T extends Document> = ReturnType<typeof useDocumentResource<T>>
```

- Centralized `DEFAULT_API` endpoint table (get/insert/update/delete/call),
  overridable per-doc.
- `removeMetaFields` strips `doctype/name/owner/creation/modified/…` before write.
- Optimistic localStorage keyed `insights:resource:<doctype>:<name>` with a
  `modified`-staleness check; debounced auto-save via `watchDebounced`.

**Client scripts** (CRM `data/script.js`): load BOTH DB records
(`createListResource({doctype:'CRM Form Script', filters:{view,dt,enabled:1}})`)
and file-based via `import.meta.glob('../doctypes/*/*.js')`, inject helpers
(`$dialog, toast, socket, router, call, formDialog`), instantiate controller
classes, run all matching controllers `runSequentially` on each trigger.

---

## 5. Router — flat/nested table, universal lazy import, one mega guard

```js
// crm/frontend/src/router.js:145-260
const router = createRouter({ history: createWebHistory('/crm'), routes })  // base path = app mount route
// every component lazy-loaded; detail pages pick mobile/desktop at import time:
// component: () => import(`@/pages/${handleMobileView('Lead')}.vue`)
router.beforeEach(async (to, from, next) => {
  // store previousRoute; await users.promise when logged in;
  // gate onboarding to admins; redirect non-app users to Not Permitted;
  // resolve Home -> user's default view; inject last-used tab hash; default viewType;
  // unauthenticated -> window.location.href = '/login?redirect-to=/crm'
})
```

- **Base path = the app's Frappe mount route** (`/crm`, `/insights`); must match
  the `build --base` asset path (see §7).
- **Nested layout routes** (Insights v3): `/workbook/:workbook_name` has `children`
  for `query/:query_name`, `chart/:chart_name`, `dashboard/:dashboard_name`
  (`src2/router.ts:38-63`); route `meta` flags `hideSidebar`, `isGuestView`,
  `isAllowed()`.
- **Global 403 interceptor** (Insights): monkeypatch `window.fetch` to reset
  session + redirect to `/login` on a 403 with a Guest cookie
  (`src/router.ts:256-264`). Cheap protection against session expiry mid-session.

---

## 6. Socket / realtime — generic cache invalidation

```js
// crm/frontend/src/socket.js
export function initSocket() {
  const port = window.socketio_port || 9000
  const url = `${protocol}://${host}:${port}/${window.site_name}`
  const socket = io(url, { withCredentials: true, reconnectionAttempts: 5 })
  socket.on('refetch_resource', (data) => {                 // server-driven invalidation
    const r = getCachedResource(data.cache_key) || getCachedListResource(data.cache_key)
    if (r) r.reload()
  })
  return socket
}
```

- **Two realtime mechanisms:** (1) generic — server emits `refetch_resource` with
  a `cache_key`, socket reloads the matching cached frappe-ui resource; (2)
  per-document — opt in via `createDocumentResource({ realtime: Boolean(vm?.$socket) })`.
- Dev-vs-prod site name: `import.meta.env.DEV ? host : window.site_name`.
- Reach the socket app-wide via `globalStore().$socket` (never re-init).
- frappe-ui exports `initSocket` directly (`src/utils/socketio.ts`, default
  export re-exported as `initSocket` from the package root — present in both
  v1 and the 0.1.261 baseline): `import { initSocket } from 'frappe-ui'`
  returns a connected `socket.io-client` using the same
  dev-vs-prod site-name/`withCredentials` logic as CRM's hand-rolled version
  above; it takes an optional `{ port }` (default `9000`). It does **not**
  wire the `refetch_resource` listener or a `reconnectionAttempts` option —
  add those yourself on the returned socket, same as CRM's `socket.js` does.
  For a new app, start from the export instead of copying `socket.js`
  verbatim.

---

## 7. Build & dev config (vite + frappe-ui plugin)

The `frappeui()` vite plugin's options, CSRF/boot injection, and the
`hooks.py`/`www/` wiring are covered in
[frappe-ui-setup.md](frappe-ui-setup.md) — this section only covers the
two architecture-specific patterns beyond a single-app default config.

- **Local sibling packages** (developing frappe-ui alongside): alias
  `@framework/ui`→`../../frappe/ui/src`, source the frappe-ui vite plugin from the
  local `../frappe-ui/vite` when present, and `dedupe` + `server.fs.allow` the
  bench `apps/` dir so symlinked packages serve. Order matters — subpath alias keys
  before the bare `frappe-ui` key.
- **Multiple SPAs from one config** (Insights): `build.rollupOptions.input =
  { main: index.html, insights_v2: index_v2.html }`, then `cp` each built entry
  into `../insights/www/<name>.html`. `output.manualChunks:{ 'frappe-ui':['frappe-ui'] }`.
- **frappe-ui version pin:** CRM and Insights are both on the **0.1.x line**
  (`frappe-ui@0.1.261` and `frappe-ui@~0.1.25x` respectively) — not different
  major lines. A snippet from one is safe to adapt into the other. v1
  (`1.0.0-beta.x`) is a separate, newer line with a different component API
  and export surface (see the `(v1)` tags in
  [frappe-ui-components.md](frappe-ui-components.md)); don't mix v1 snippets
  into a 0.1.x app or vice-versa. For a brand-new v16 app, prefer v1 per this
  skill's version policy; when extending CRM or Insights, match whichever
  line `frontend/package.json` already pins. Always **pin frappe-ui
  explicitly** — the API moves across both boundaries.

---

## 8. Session / auth

- Seed user from the `user_id` cookie synchronously (`getSessionFromCookies`), then
  `fetchSessionInfo()` from the backend to hydrate roles/flags. `isLoggedIn` and
  `isAuthorized` are `computed`.
- `login`/`logout` call the `login`/`logout` endpoints, then
  `window.location.reload()` (full reload clears all resource caches cleanly).
- `provide('session', session)` at `App.vue` setup so any component can inject it.
- **Gotcha:** `frappe-ui/frappe` ships a `sessionUser()` helper
  (`frappe/session.js`) but it is **not re-exported** from `frappe/index.js`,
  the file the `frappe-ui/frappe` subpath resolves to — `import {
  sessionUser } from 'frappe-ui/frappe'` fails at build time. The
  cookie-read pattern above is the actual way every verified app gets the
  current user client-side; don't reach for `sessionUser()`.

---

## 9. TypeScript conventions (copy from Insights `src`/`src2`)

- **Typed, centralized backend calls** (`src/api/index.ts`): every whitelisted
  endpoint is a thin typed wrapper — `call('insights.api.get_user_info')` cast to
  `Promise<SessionUser>`. One file = the app's backend surface.
- **Method-name registry** (`src/api/whitelistedMethods.ts`): a plain object
  mapping `doctype → { localAlias: 'backend.method.path' }`, looked up with
  `keyof typeof` typing — the canonical place a new app lists its doc-methods.
- **Ambient types** (`src/global.d.ts`): `declare module` shims for untyped deps;
  template-literal types (`type HashString = \`#${string}\``); domain interfaces
  (`SessionUser`, `Resource`, `DocumentResource`) available without import.
- **`ReturnType<typeof factory>` type-alias export** for every store/resource — the
  universal typing idiom.
- **Discriminated unions on `doctype`/`type`** for polymorphic domain objects
  (`DataSource = MariaDB | PostgreSQL | DuckDB` discriminated by `database_type`).
- **Generics on the data layer**: `useDocumentResource<T extends Document>`.
- **`__()` typing**: augment `@vue/runtime-core` `ComponentCustomProperties` in the
  translation plugin so the global translate helper is typed.
- `tsconfig.json`: `strict:true`, `moduleResolution:'bundler'`,
  `allowImportingTsExtensions:true` (enables `./router.ts` extensioned imports),
  `allowJs:true`, `paths:{'@/*':['./src/*']}`.

---

## 10. Copy-this checklist for a new frappe-ui SPA

1. `bench new-app my_app`; scaffold `frontend/` with `index.html`, `vite.config.js`
   (`frappeui({ frappeProxy, lucideIcons, jinjaBootData, buildConfig })`), `package.json`
   with `build --base=/assets/my_app/frontend/` + copy-html-entry.
2. `main.js`: pinia → router → FrappeUI → `setConfig('resourceFetcher', frappeRequest)`
   → dev boot-context fetch → socket → mount.
3. Backend `my_app/www/my_app.py`: `get_context` (prod) + `get_context_for_dev`
   (dev, `developer_mode`-gated) both returning `get_boot()`.
4. `router.js`: `createWebHistory('/my_app')`, lazy `import()` routes, one
   `beforeEach` guard (auth + default view + redirect to `/login`).
5. `socket.js`: `initSocket()` with the `refetch_resource` handler.
6. `stores/session.js` + `stores/meta.js` (module-singleton cache) + `data/document.js`
   (`useDocument` facade). TS: add `api/index.ts`, `api/whitelistedMethods.ts`, `global.d.ts`.
7. Apply Espresso tokens (see [espresso-design-system.md](../../frappe-design-tokens/references/espresso-design-system.md)), Inter font, 8pt grid.
8. `bench build --app my_app`; verify at `/my_app`.

---

## Sources
- CRM frontend: `apps/crm/frontend/src/{main.js,router.js,socket.js,App.vue}`,
  `stores/{global,session,users,meta,settings}.js`, `data/{document,script}.js`,
  `composables/{settings,document,useKeyboardShortcuts}.js`, `frontend/vite.config.js`,
  `frontend/package.json`; backend `crm/www/crm.py`. (frappe-ui 0.1.261, Vue ^3.5.13, Pinia ^2.0.33, Vite ^4.4.9.)
- Insights frontend: `apps/insights/frontend/` — v2 `src/{main.js,router.ts,socket.js,api/{index,whitelistedMethods}.ts,global.d.ts,stores/*.ts}`;
  v3 `src2/{main.ts,router.ts,session.ts,socket.ts,globals.ts,translation.ts,helpers/resource.ts,data_source/*,workbook/*,composables/*,types/*.types.ts}`;
  `frontend/vite.config.js`, `package.json`, `tsconfig.json`. (frappe-ui ~0.1.25x, Vite ^4.4.6, TS 5.5 strict — checked in a sibling bench; this bench has no `apps/insights`.)
- frappe-ui v1 (`1.0.0-beta.29`) source and 0.1.261 baseline cross-checked for
  the `(v1)`-tagged claims and the `initSocket`/`sessionUser` gotchas above.
- Extracted via read-only scout passes; all citations verified against the trees above.
