# Vue SPA Frontend

Entry point for building a standalone Vue 3 + frappe-ui SPA inside a Frappe app.
Read this to decide and wire one; then go deeper:

- **[frappe-ui-setup.md](frappe-ui-setup.md)** — scaffolding, the `frappeui()`
  vite plugin options, Tailwind preset, `hooks.py`/`www/` wiring, and the
  production build. Read this before touching `vite.config.js`.
- **[frontend-architecture.md](frontend-architecture.md)** — the full SPA
  blueprint: bootstrap order, stores vs composables vs data layer, the
  `useDocument` facade, router and guards, socket-driven invalidation,
  TypeScript conventions.
- **[frappe-ui-components.md](frappe-ui-components.md)** — component and
  data-layer catalog: `useCall`/`useList`/`useDoc` (v1), `createResource`/
  `createListResource`/`createDocumentResource` (legacy, still public), form
  controls, `Dialog`, toasts.

## When an SPA is the wrong choice

Standard Desk already gives you list views, filters, form layouts, permissions,
keyboard navigation and print formats for free. Build an SPA only for a
customer-facing portal, a bespoke dashboard, or a workflow Desk genuinely
cannot express. For everything else see
[frontend-desk.md](../../frappe-desk-customization/references/frontend-desk.md) and
[listview-patterns.md](../../frappe-desk-customization/references/listview-patterns.md) — customizing Desk is cheaper to
build and cheaper to keep working across upgrades.

---

Some apps have a standalone Vue 3 frontend in a `frontend/` directory. This is a full SPA that talks to Frappe via API calls.

## Structure

```
apps/<app>/
  frontend/
    src/
      main.js          # app entry
      App.vue          # root component
      pages/           # route views
      components/      # reusable components
      router.js         # vue-router setup
      composables/      # Vue composables
    index.html
    vite.config.js
    package.json
    tailwind.config.js
  <app>/
    hooks.py           # website_route_rules to serve the SPA
    www/<app>.html      # built entry Frappe serves (see frappe-ui-setup.md §6-7)
    www/<app>.py         # boot context
```

Scaffolding, `vite.config.js`, the Tailwind preset, and the `hooks.py`/`www/`
wiring are covered in full in [frappe-ui-setup.md](frappe-ui-setup.md) — this
file assumes that's done and covers the app-facing pieces.

## hooks.py route

```python
website_route_rules = [
    {"from_route": "/myapp/<path:app_path>", "to_route": "myapp"},
]
```

## Development

```bash
cd apps/<app>/frontend
yarn install
yarn dev            # starts Vite dev server with HMR (proxies API to Frappe)
```

The Vite dev server proxies `/api` (and `/app`, `/login`, `/assets`, `/files`,
`/private`) calls to the running Frappe backend (`bench start` must be
running).

## Production build

```bash
cd apps/<app>/frontend
yarn build          # outputs to apps/<app>/<app>/public/frontend, copies index.html to www/
```

Or via bench:
```bash
bench build --app <app-name>
```

## Calling Frappe APIs from Vue

frappe-ui v1 provides composables for data fetching (`(v1)`; the 0.1.x
equivalent is `createResource`/`createListResource`/`createDocumentResource`
— see [frappe-ui-components.md](frappe-ui-components.md)):

```javascript
import { useCall, useList, useDoc } from 'frappe-ui'

// API call — POST to a full path, not a dotted method name
const result = useCall({
  url: '/api/v2/method/myapp.api.get_summary',
  method: 'POST',
  immediate: false,        // set true to call on mount
  onSuccess: (data) => {
    console.log(data)
  },
})
result.submit({ status: 'Draft' })  // call manually with params
// result.fetch()/result.reload() re-run with the last submitted params but
// take NO arguments — pass params through .submit(), not .fetch().

// Document list
const expenses = useList({
  doctype: 'Expense',
  fields: ['name', 'title', 'amount', 'status'],
  filters: { status: 'Draft' },
})
// expenses.data — reactive list
// expenses.reload() — refetch

// Single document
const expense = useDoc({
  doctype: 'Expense',
  name: 'EXP-0001',
})
// expense.doc — reactive document data
// expense.doc.title — access fields
// expense.setValue.submit({ status: 'Approved' }) — update fields
```

## Session and CSRF

Requests from the SPA carry the Frappe session cookie. For non-GET calls,
the data layer attaches the CSRF token itself: `useCall`/`useList`/`useDoc`
read `window.csrf_token` via `useFrappeFetch` (`src/data-fetching/useFrappeFetch.ts`);
the legacy `call()`/`createResource` path reads the same global via
`src/utils/call.ts`. `window.csrf_token` is populated by the `jinjaBootData`
build-time injection (see [frappe-ui-setup.md §6](frappe-ui-setup.md)) — this
is one more reason to route every call through the data layer instead of raw
`fetch`, which has to do this bookkeeping itself.

There is no exported "get current session user" helper reachable from the
package: `frappe-ui/frappe`'s `sessionUser()` (`frappe/session.js`) exists in
source but is **not re-exported** from `frappe/index.js` (the file the
`frappe-ui/frappe` subpath resolves to), so `import { sessionUser } from
'frappe-ui/frappe'` fails. Real apps read the `user_id` cookie directly
instead — see [frontend-architecture.md §8](frontend-architecture.md) for the
verified pattern.

## Checklist

- Route wired in `hooks.py` via `website_route_rules`.
- `frontendRoute` in the vite config matches that route prefix.
- Every data path goes through a frappe-ui resource, not raw `fetch`.
- Loading, error and empty states exist for each resource.
- Design tokens used rather than hardcoded colours or spacing — see
  [design-tokens.md](../../frappe-design-tokens/references/design-tokens.md).
- `bench build --app <app>` runs clean before shipping.

## Sources

Verified against Frappe v16.35.0 (`frappe/__init__.py` `__version__`) and frappe-ui
`1.0.0-beta.29` (`apps/frappe-ui/package.json`):

- `frappe/website/path_resolver.py:225-239` — `website_route_rules` hook resolution.
- `apps/frappe-ui/vite/README.md:70-79`, `apps/frappe-ui/vite/frappeProxy.js` — dev-server proxy
  default `'^/(app|login|api|assets|files|private)'`.
- `apps/frappe-ui/vite/buildConfig.js:101-126`, `apps/frappe-ui/vite/README.md:170-183` — build
  output (`../app_name/public/frontend`) and `index.html` copy target (`../app_name/www/app_name.html`).
- `apps/frappe-ui/src/data-fetching/index.ts` — `useCall`/`useDoc`/`useDoctype`/`useList`/`useNewDoc` exports.
- `apps/frappe-ui/src/data-fetching/useCall/useCall.ts` — `url`/`method`/`immediate`/`onSuccess`
  options; `submit(params)`, `fetch`/`reload` (both aliases of a no-argument `execute()` that
  reuses the last `submit`ted params).
- `frappe/api/v2.py:280` — `/method/<method>` route mounted under `/api/v2`.
- `apps/frappe-ui/src/data-fetching/useList/{useList.ts,types.ts}` — `doctype`/`fields`/`filters`
  options, `.data`/`.reload()`.
- `apps/frappe-ui/src/data-fetching/useDoc/useDoc.ts:34-197` — `doctype`/`name` options,
  `.doc`, `.setValue` (a `useCall` instance, hence `.setValue.submit(...)`).
- `apps/frappe-ui/src/data-fetching/useFrappeFetch.ts:132` — reads `window.csrf_token`.
- `apps/frappe-ui/src/utils/call.ts:3,50-51` — legacy `call()`/`createResource` CSRF path.
- `apps/frappe-ui/frappe/session.js` (`sessionUser()`), `apps/frappe-ui/frappe/index.js`,
  `apps/frappe-ui/package.json` `exports["./frappe"]` — confirms `sessionUser` exists in source
  but is not re-exported from the `frappe-ui/frappe` subpath entry.
