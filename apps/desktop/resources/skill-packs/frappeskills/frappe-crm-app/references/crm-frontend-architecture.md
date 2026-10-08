# Frappe CRM Frontend Architecture

The frontend (`crm/frontend/`) is a Vue3 SPA built on `frappe-ui`, served at
`/crm`, independent of Desk. It talks to the backend almost entirely through
one generic list/kanban API surface rather than per-DocType endpoints.

## Directory layout

`frontend/src/`:

- `App.vue`, `main.js` — app bootstrap.
- `router.js` — Vue Router routes plus first-run persona-capture logic.
- `socket.js` — realtime cache invalidation over Socket.IO.
- `stores/` — Pinia stores: `session.js`, `global.js`, `meta.js`,
  `notifications.js`, `organizations.js`, `settings.js`, `statuses.js`,
  `users.js`, `views.js`.
- `composables/` — `demoData.js`, `doctypeModal.js`, `document.js`,
  `event.js`, `frappecloud.js`, `modals.js`, `settings.js`, `telephony.js`,
  `useActiveTabManager.js`, `useAttachments.js`, `useBroadcast.js`,
  `useContactFields.ts`, `useKeyboardShortcuts.js`,
  `useTimelinePreferences.js`, `useUnsavedChangesWarning.ts`, `whatsapp.js`.
- `pages/` — one component per route: `Calendar.vue`, `CallLogs.vue`,
  `Contact.vue`/`Contacts.vue`, `Dashboard.vue`, `DataImport.vue`,
  `Deal.vue`/`Deals.vue`, `Lead.vue`/`Leads.vue`, `Mobile*.vue` variants,
  `Notes.vue`, `Organization.vue`/`Organizations.vue`.
- `data/`, `doctypes/`, `components/`, `utils/`, `types.ts`,
  `translation.js`.

## State: Pinia + frappe-ui `createResource`

```js
// stores/session.js
export const sessionStore = defineStore('crm-session', () => {
  let user = getCurrentUser()
  const login = createResource({ url: 'login', ... })
  const logout = createResource({
    url: 'logout',
    onSuccess() { window.location.href = '/crm' },
  })
  ...
})
```

Stores wrap `frappe-ui`'s `createResource`/`createListResource` rather than
hand-rolling `fetch`; a store's job is caching and exposing reactive state,
not building request payloads. `session.js` also exports `getCurrentUser()`
and `userResource` used across the app to check the logged-in user without
every component re-deriving it. New CRM-adjacent frontend work should add a
Pinia store the same way — one `defineStore('crm-<name>', () => {...})`
module wrapping the relevant resource(s) — rather than fetching directly
from a page/component.

## Realtime: socket.js

`initSocket()` opens a Socket.IO connection to
`<protocol>://<host><port>/<site_name>` (site name and socketio port come
from `window.site_name`/`window.socketio_port`, injected server-side) and
listens for a single `refetch_resource` event carrying `{cache_key}`. On
receipt it looks up that key via `frappe-ui`'s `getCachedResource`/
`getCachedListResource` and calls `.reload()` if found — the backend
triggers a `frappe.publish_realtime('refetch_resource', {cache_key:
...})` (standard Frappe realtime, not a CRM-specific socket protocol) to
push any list/document update to the frontend. A new resource that needs
live refresh just needs its cache key published this way; no new
frontend-side socket handler is required.

## Persona-capture wizard and telemetry gating

`router.js`'s `beforeEach` guard calls `shouldCapturePersona()` before
showing the main app on first login for an admin user:

```js
export const PERSONA_DONE_KEY = 'crm_persona_captured'
async function shouldCapturePersona() {
  // reads FCRM Settings.persona_captured (a Single field, not per-user)
  // then checks telemetry opt-in before ever showing the wizard
  const { enable_telemetry } =
    (await call('frappe.utils.telemetry.pulse.client.boot_config')) || {}
  ...
}
```

The wizard is skipped entirely if telemetry is opted out
(`enable_telemetry` false from Frappe core's own telemetry boot config) —
it exists purely to seed telemetry with persona data, not to configure the
CRM itself, so a self-hosted/telemetry-disabled deployment never sees it.
`isAdminUser` is also checked — the wizard only ever targets the
first-logged-in Administrator/System Manager, not every new user.

## Backend surface: `api/doc.py`

The generic list/kanban/detail backend every DocType's Vue views call
through, instead of one endpoint per DocType:

| Function | Purpose |
|---|---|
| `sort_options(doctype)` | sortable field list for a list view |
| `get_filterable_fields(doctype)` | fields eligible for the filter UI |
| `get_group_by_fields(doctype)` | fields eligible for kanban/group-by |
| `get_quick_filters` / `update_quick_filters` | per-user "quick filter" chips |
| `get_data(...)` | the actual list/kanban row fetch, filters/order/paging applied |
| `remove_assignments` / `get_assigned_users` | assignment sidebar |
| `get_fields(doctype, allow_all_fieldtypes=False)` | field metadata for form rendering |
| `get_linked_docs_of_document` / `remove_linked_doc_reference` | "linked documents" panel |
| `delete_bulk_docs(doctype, items, delete_linked=False)` | bulk-delete from a list view |

A custom DocType added to the CRM sidebar reuses this same surface (it is
generic over `doctype`) rather than needing bespoke endpoints — register it
with a `CRM Fields Layout`/`CRM View Settings` (see
[crm-customization.md](crm-customization.md)) and these functions already
know how to list, filter, and group it.

## Sources

Verified against the installed Frappe CRM app (`crm/frontend/src/`):

- Directory listing: `frontend/src/` (pages, stores, composables, components, data, doctypes)
- `stores/session.js` — `defineStore('crm-session', ...)`, `createResource` login/logout
- `socket.js` — `initSocket`, `refetch_resource` handler
- `router.js` — `PERSONA_DONE_KEY`, `shouldCapturePersona`, `frappe.utils.telemetry.pulse.client.boot_config` call
- `crm/api/doc.py` — full whitelisted function list (:24-799)
