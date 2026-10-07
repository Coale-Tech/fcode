# Frappe UI Components Reference

Index for the frappe-ui (Vue 3) component library, its data-fetching layer,
and the vanilla-JS Desk client APIs. Split by topic so each file stays
readable:

- [frappe-ui-setup.md](frappe-ui-setup.md) — project setup: install, `main.js`
  plugin registration, Tailwind config, HTML scaffold, CSRF
- [frappe-ui-core-components.md](frappe-ui-core-components.md) — icons,
  actions (Button), display/feedback (Badge, Alert, Avatar, Breadcrumbs,
  Divider, Progress, Skeleton, Spinner, Tooltip, KeyboardShortcut),
  navigation (Tabs, TabButtons), data display (Tree, Calendar, Charts,
  GridLayout), directives, and utilities
- [frappe-ui-overlays.md](frappe-ui-overlays.md) — Dialog, imperative
  `dialog.confirm`/`dialog.danger`/`dialog.prompt`, Toast, Dropdown,
  ContextMenu, Popover, and HoverCard
- [frappe-ui-form-controls.md](frappe-ui-form-controls.md) — every input
  control: `TextInput`, `FormControl`, `Select`, `Combobox`, `MultiSelect`,
  `Checkbox`, `Switch`, `DatePicker`, `Slider`, `Rating`, `FileUploader`, …
- [frappe-ui-list-and-editor.md](frappe-ui-list-and-editor.md) — `ListView`,
  app-shell/SPA-page patterns, and the `TextEditor` rich-text component
- [frappe-ui-data-fetching.md](frappe-ui-data-fetching.md) — `createResource`
  / `createListResource` / `createDocumentResource`, the `useCall`/`useList`/
  `useDoc`/`useDoctype`/`useNewDoc` composables, Pinia store patterns, Vue
  Router setup, authentication, and Socket.io
- [frappe-desk-client-apis.md](frappe-desk-client-apis.md) — the Desk
  (`frappe.*`) vanilla-JS APIs: `frappe.call`, `frappe.db`, `frappe.ui.Dialog`,
  form client scripts, and list customization

**Documentation:** https://ui.frappe.io
**GitHub:** https://github.com/frappe/frappe-ui

> **Scope — two distinct UIs.** The first six files above document
> **frappe-ui** (the Vue 3 library used to build *standalone SPA frontends*
> mounted under an app, e.g. `crm`, `hrms/frontend`). It is **not** the
> Frappe Desk. Desk (`/app/*`) is rendered by vanilla-JS `frappe.*` APIs
> (`frappe.ui.form`, `frappe.ui.Dialog`, `frappe.call`, `frappe.db`, control
> classes) — covered in `frappe-desk-client-apis.md`. Do not mix `frappe-ui`
> imports into Desk client scripts or vice-versa.
>
> The core-components/overlays/form-controls/list-and-editor files document
> the frappe-ui **`1.0.0-beta.29`** API surface; differences from the
> **`0.1.261`** baseline (still vendored by some apps, e.g.
> `apps/crm/frontend/node_modules/frappe-ui`) are tagged `(v1)` inline. Check
> `frontend/package.json` for the frappe-ui version actually pinned in your
> app before relying on a `(v1)`-tagged API — see each linked file's own
> `## Sources` footer for the exact source citations.

## Desk vs frappe-ui — quick map

| Concern | Desk (`frappe.*`) | frappe-ui (Vue) |
|---|---|---|
| Server call | `frappe.call` / `frappe.xcall` | `call()` / `createResource` |
| List data | `frappe.db.get_list` | `createListResource` / `useList` |
| Single doc | `frappe.db.get_doc` / `frm` | `createDocumentResource` / `useDoc` |
| Modal | `new frappe.ui.Dialog(...)` | `<Dialog>` component |
| Form | `frappe.ui.form.on` + `frm` | hand-built `<FormControl>` + resource |
| List customization | `frappe.listview_settings` | `<ListView>` props |
| Toast/alert | `frappe.show_alert` / `frappe.msgprint` | `toast()` / `<Alert>` |

## Sources

- `apps/frappe-ui/package.json` — installed frappe-ui version (`1.0.0-beta.29`) this index and its linked files are verified against
- `apps/crm/frontend/node_modules/frappe-ui/package.json` — vendored `0.1.261` baseline used for the `(v1)` comparisons in the linked files
- Per-topic verification lives in each linked file's own `## Sources` footer; this page is a pure index and adds no independent API claims.
