---
name: frappe-frontend-development
description: Build Vue 3 frontends with frappe-ui (0.1.x and 1.0) including setup, components, useCall/useList data fetching, routing, stores, and portal pages. Use when implementing a custom SPA or portal interface on top of Frappe.
---

# Frappe Frontend Development

Build a Vue 3 + frappe-ui single-page app served by a Frappe site — or a simpler
portal page when an SPA is overkill.

## When to use

- Building a custom dashboard, portal, or customer-facing app
- Consuming Frappe data with `useCall` / `useList` / `useDoc` (or legacy `createResource`)
- Structuring stores, router, sockets and TypeScript in an SPA
- Writing a website/portal page without a build step

## Inputs required

- Whether Desk already suffices (if yes, stop — use [`frappe-desk-customization`](../frappe-desk-customization/SKILL.md))
- Route prefix and auth model (logged-in users, guests, or both)
- The whitelisted endpoints the UI will call
- Pinned frappe-ui version in `frontend/package.json`: 0.1.x apps and 1.0 beta
  differ (Dialog props, toast units, DateRangePicker emits); `(v1)` tags in the
  references mark 1.0-only APIs
- Frappe version: the `use*` composables call `/api/v2` (Frappe v15+)

## Procedure

### 0) Choose the frontend

| Scenario | Choice |
|---|---|
| Simple CRUD | Desk — write no frontend |
| Custom dashboard | Vue + frappe-ui |
| Customer-facing portal | Vue + frappe-ui, or website pages |
| Multi-step workflow | Vue + frappe-ui + a store |
| Content page, no interactivity | `www/` portal page |

### 1) Scaffold the SPA

There is no `frappe/frappe-ui/templates/spa` to degit. Scaffold Vite + Vue, then
pin **Vite 5 + Tailwind v3** (frappe-ui's plugin and preset reject newer), add
`frappeui()` to `vite.config.js`, the `frappe-ui/tailwind` preset,
`@import 'frappe-ui/style.css'`, `app.use(router)` + `app.use(FrappeUI)`, and
wrap `App.vue` in `<FrappeUIProvider>`. Then wire `website_route_rules` and the
`www/<app>.py` boot context in the app — every step in
[references/frappe-ui-setup.md](references/frappe-ui-setup.md).
To mount a Vue component inside a Desk Page instead, use
`assets/page.js.template` (page.js loader + `.bundle.js`).

### 2) Fetch data with the data layer

```javascript
import { useList, useCall } from 'frappe-ui'

const orders = useList({
  doctype: 'Sales Order',
  fields: ['name', 'customer', 'grand_total', 'status'],
  filters: { docstatus: 1 },
  limit: 20,
})

const approve = useCall({
  url: '/api/v2/method/my_app.api.approve_order',
  method: 'POST',
  immediate: false,
  onSuccess: () => orders.reload(),
})
// approve.submit({ name: 'SO-0001' })
```

Never use raw `fetch`/`axios`. `createResource` & family are legacy but still
exported: [references/frappe-ui-data-fetching.md](references/frappe-ui-data-fetching.md),
[references/frappe-ui-data-fetching-legacy.md](references/frappe-ui-data-fetching-legacy.md).
Component catalog index (which file for what):
[references/frappe-ui-components.md](references/frappe-ui-components.md).

### 3) Structure the app

Stores, router, socket wiring, TypeScript layout:
[references/frontend-architecture.md](references/frontend-architecture.md).
Shell, sidebar and navigation:
[references/app-shell-patterns.md](references/app-shell-patterns.md).
SPA page and component shapes:
[references/frappe-ui-spa-page-patterns.md](references/frappe-ui-spa-page-patterns.md),
[references/component-patterns.md](references/component-patterns.md).
Start from `assets/App.vue.template`, `assets/ListPage.vue.template`,
`assets/DetailPage.vue.template`, `assets/FormWizard.vue.template`.

### 4) Handle every state

Loading, error, and empty states are required, not optional — every call has
`.loading`, `.error`, and a possibly-empty `.data`. Confirm with
`dialog.confirm/danger/prompt` and report with `toast.success/error` (there is no
`dialog.alert`) — [references/frappe-ui-overlays.md](references/frappe-ui-overlays.md).

### 5) Style with tokens

Use Espresso tokens and the shared Tailwind preset
(`assets/tailwind.config.js.template`); never hardcode colors, spacing, or fonts
— [`frappe-design-tokens`](../frappe-design-tokens/SKILL.md).

### 6) Build

```bash
cd apps/<app>/frontend && yarn build
bench --site <site> clear-cache
```

## Verification

- [ ] Route loads in the browser for the intended auth state
- [ ] Data renders from real site data, not fixtures
- [ ] Loading, error and empty states each render correctly
- [ ] Mutations refresh the affected list/detail view
- [ ] A user without permission sees a handled error, not a blank screen
- [ ] No hardcoded colors/spacing; tokens only
- [ ] Production build succeeds and is served by the site

## Failure modes / debugging

- **Blank page after build**: route not registered in `hooks.py`, or the built `index.html` path is wrong
- **`Package subpath '…' is not defined by "exports"`**: deep import such as `frappe-ui/src/...`; use `frappe-ui/tailwind`, `frappe-ui/style.css`, `frappe-ui/editor`, `frappe-ui/list`
- **`Could not resolve '~icons/lucide/…'`**: add `optimizeDeps.exclude: ['frappe-ui']`
- **`injection "Symbol(router)" not found`**: `app.use(router)` missing — Button needs it
- **`useCall` 404**: the URL lacks `/api/v2/method/` or the site runs Frappe < v15
- **403 on every call**: session not shared — check the site origin and that the user is logged in
- **Toast disappears instantly (1.0)**: `duration` is milliseconds, not seconds
- **Stale UI after a mutation**: no `reload()` in `onSuccess`
- **Socket events never arrive**: socket.io not running on the bench, or `initSocket()` never called

## Escalation

- Endpoint design or permission errors → [`frappe-api-development`](../frappe-api-development/SKILL.md)
- Proven app shells and UX patterns → [`frappe-ui-patterns`](../frappe-ui-patterns/SKILL.md)
- Large multi-entity product → [`frappe-enterprise-patterns`](../frappe-enterprise-patterns/SKILL.md)
- Desk would be cheaper → [`frappe-desk-customization`](../frappe-desk-customization/SKILL.md)

## References

- [references/frappe-ui-setup.md](references/frappe-ui-setup.md) - Scaffold, version pins, `frappeui()` vite options, Tailwind preset, hooks.py/www wiring
- [references/frontend-vue.md](references/frontend-vue.md) - SPA entry point, when to choose it
- [references/frontend-architecture.md](references/frontend-architecture.md) - Stores, router, sockets, TS in real apps
- [references/frappe-ui-components.md](references/frappe-ui-components.md) - Catalog index: which frappe-ui file for what
- [references/frappe-ui-core-components.md](references/frappe-ui-core-components.md) - Button, Badge, Tabs, charts, utilities, deprecated exports
- [references/frappe-ui-form-controls.md](references/frappe-ui-form-controls.md) - Inputs, Select/Combobox/MultiSelect, date/time pickers, FileUploader, Link
- [references/frappe-ui-overlays.md](references/frappe-ui-overlays.md) - Dialog, `dialog.*`, toast, Dropdown, Popover, HoverCard
- [references/frappe-ui-list-and-editor.md](references/frappe-ui-list-and-editor.md) - `frappe-ui/list`, legacy ListView, `frappe-ui/editor`
- [references/frappe-ui-data-fetching.md](references/frappe-ui-data-fetching.md) - `useCall`, `useList`, `useDoc`, `useDoctype`, `useNewDoc`, `call`
- [references/frappe-ui-data-fetching-legacy.md](references/frappe-ui-data-fetching-legacy.md) - `createResource` family and migration to v3
- [references/frappe-desk-client-apis.md](references/frappe-desk-client-apis.md) - Desk `frappe.*` vanilla-JS APIs
- [references/component-patterns.md](references/component-patterns.md) - Lists, forms, dialogs, empty states
- [references/page-patterns.md](references/page-patterns.md) - Page kind index: Desk Pages, Web/Portal pages
- [references/frappe-ui-spa-page-patterns.md](references/frappe-ui-spa-page-patterns.md) - SPA List/Detail/Form page layouts
- [references/app-shell-patterns.md](references/app-shell-patterns.md) - DesktopShell/MobileShell/Sidebar, 0.1.x fallback
- [references/frontend-portal.md](references/frontend-portal.md) - Website/portal pages without a build step
- `assets/`: `App.vue`, `ListPage.vue`, `DetailPage.vue`, `FormWizard.vue`, `page.js` (Desk Page embed), `useVersion.js`, `tailwind.config.js` templates

## Guardrails

- **Don't build an SPA when Desk suffices**: Desk is free maintenance
- **`useCall`/`useList`/`useDoc`, never raw `fetch`**: you lose auth, errors and caching
- **Match the pinned frappe-ui version**: no `(v1)` API in a 0.1.x app
- **No deprecated exports in new code**: `Autocomplete`, `FeatherIcon`, `TextEditor`, `ConfirmDialog`, `Input`, `ListItem`, `Card`
- **Overlays bind `v-model:open`; icons are `lucide-<name>` strings**
- **Composition API with `<script setup>`**; every call handles loading, error and empty
- **Design tokens only**; rebuild (`yarn build`, then `clear-cache`) after changes

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| Raw `fetch` calls | No auth, no error handling | `useCall` |
| `npx degit frappe/frappe-ui/templates/spa` | Path does not exist | Follow `frappe-ui-setup.md` |
| Vite 6+/Tailwind v4 | Plugin and preset silently fail | Pin Vite 5, Tailwind 3.4 |
| `dialog.alert(...)` | Not in the `dialog` namespace | `dialog.confirm` or `toast` |
| `FormControl type="autocomplete"` | Deprecated, warns | `Combobox` |
| Styling `FormControl type="date"/"time"` as a native input `(v1)` | 1.0 renders `DatePicker`/`TimePicker`; 0.1.x a native `<input>` | Use their props (`frappe-ui-form-controls.md`) |
| No empty state | Blank screen on zero rows | Render an explicit empty state |
| Hardcoded colors | Breaks theming | Semantic tokens (`ink-*`, `surface-*`, `outline-*`) |
| Endpoint returning `Response` | Resource data is `undefined` | Return a dict |
| Permission checks only in the UI | API remains open | Gate on the server |
| Building an SPA for simple CRUD | Maintenance for nothing | Use Desk |
