# Frappe UI — Legacy Data Fetching (`createResource` family)

Adapted in part from frappe/frappe-ui (MIT): `skills/frappe-ui/COMPONENTS.md`.

`createResource` / `createListResource` / `createDocumentResource`
(`src/resources/`) predate the v3 composables in
[frappe-ui-data-fetching.md](frappe-ui-data-fetching.md) and remain exported
"until official apps finish the v3 migration" (`src/index.ts`). **Do not use
this family in new code** — reach for `useCall`/`useList`/`useDoc`/
`useDoctype`/`useNewDoc` instead. This page exists to read and migrate
existing code (CRM, Helpdesk, Gameplan, and most 0.1.x apps still use this
family throughout).

---

## `createResource`

Generic resource for one API call (dotted-path RPC, `/api/method/...`).

```typescript
interface ResourceOptions<TData = any> {
  url: string                                    // dotted method path or '/api/...'
  method?: string                                 // default 'GET'
  params?: object                                 // static params object
  auto?: boolean                                  // fetch immediately on creation
  cache?: string | any[]                          // cache key; a second createResource() with the same key returns the SAME reactive instance
  debounce?: number                               // debounce fetch/submit calls by this many ms
  initialData?: TData
  makeParams?: (params?: any) => object            // called with fetch()/submit() args; return value becomes the request params
  validate?: (params: object) => string | void     // return a string (or throw) to reject before the request fires
  beforeSubmit?: (params: object) => void
  transform?: (data: TData) => TData               // non-null return replaces the stored data
  onSuccess?: (data: TData) => void
  onError?: (error: Error) => void
  onFetch?: (params: object) => void               // fires as soon as a fetch starts, before validate/beforeSubmit
  resourceFetcher?: (options) => Promise<TData>    // override the underlying fetch function (default: request())
}

interface Resource<TData = any> {
  method?: string
  url?: string
  data: TData | null
  previousData: TData | null      // data as of just before the last fetch; restored into `data` on error
  loading: boolean
  fetched: boolean                // true once at least one fetch has completed
  error: unknown
  promise: Promise<TData> | null
  auto?: boolean
  params: unknown
  fetch: (params?, tempOptions?) => Promise<TData | null>
  reload: (params?, tempOptions?) => Promise<TData | null>   // alias of fetch
  submit: (params?, tempOptions?) => Promise<TData | null>   // alias of fetch
  abort: () => void
  reset: () => void               // resets data/error/fetched/params to initial state
  update: (opts: { method?, url?, params?, auto? }) => void
  setData: (data: TData | ((current: TData | null) => TData)) => void
}
```

```javascript
import { createResource } from 'frappe-ui'

const stats = createResource({
  url: 'myapp.api.get_stats',
  auto: true,
  onSuccess(data) { console.log('Loaded:', data) },
})

const search = createResource({
  url: 'frappe.client.get_list',
  makeParams() {
    return { doctype: 'Task', filters: { status: ['!=', 'Cancelled'] }, limit_page_length: 20 }
  },
})

const saveSettings = createResource({ url: 'myapp.api.save_settings' })
await saveSettings.submit({ theme: 'dark' })
```

Verified behavior (`resources.js`, `resources.test.ts`):

- `cache` returns the **same** resource instance across every
  `createResource()` call with an equal key; if `auto` is set, re-requesting
  it re-`reload()`s the cached instance instead of creating a new one.
- Errors always **re-throw** after `onError`/`error` are populated
  (`handleError` calls `throw error`) — a `submit()`/`fetch()` you don't
  `.catch()` produces an unhandled rejection.
- A deliberate `abort()` does not populate `.error` and does not reject the
  in-flight promise; a fresh `fetch()` afterward works normally (each fetch
  gets its own `AbortController`).
- On error, `.data` is restored to `.previousData` (the value from just
  before the failed fetch), not cleared to `null`.
- With no `cache` key, the request always goes to the network first, then
  (if `cache` is set) is written to IndexedDB and read back on next mount as
  an initial value while the fresh request runs.

---

## `createListResource`

```typescript
interface ListResourceOptions {
  doctype: string
  fields?: string[]
  filters?: object
  orFilters?: object
  orderBy?: string
  start?: number
  pageLength?: number             // default 20
  groupBy?: string
  parent?: string
  debug?: number | boolean
  cache?: string | any[]
  auto?: boolean
  realtime?: boolean              // subscribe to `list_update` for this doctype via `vm.$socket` (Options API only — needs a `vm`)
  url?: string                    // default 'frappe.client.get_list'
  transform?: (data: any[]) => any[]
  onSuccess?: (data: any[]) => void
  onError?: (error: Error) => void
  insert?: { onSuccess?, onError? }
  setValue?: { onSuccess?, onError? }
  delete?: { onSuccess?, onError? }
  runDocMethod?: { onSuccess?, onError? }
  fetchOne?: { onSuccess?, onError? }
}

interface ListResource<TRow = any> {
  doctype: string
  data: TRow[] | null              // = transform(originalData)
  originalData: TRow[] | null      // raw, untransformed rows
  dataMap: Record<string, TRow>    // originalData indexed by `name`
  hasNextPage: boolean
  hasPreviousPage: boolean
  next: () => void
  previous: () => void
  getRow: (name: string | number) => TRow | undefined
  list: Resource<TRow[]>           // the underlying fetch sub-resource
  fetchOne: Resource<TRow[]>       // re-fetch and patch a single row: fetchOne.submit(name)
  insert: Resource<TRow>           // insert.submit(values)
  setValue: Resource<TRow>         // setValue.submit({ name, ...fields })
  delete: Resource                 // delete.submit(name)
  runDocMethod: Resource           // runDocMethod.submit({ method, name, ...args })
  update: (options: object) => void
  fetch: () => void                // alias of reload
  reload: () => Promise<TRow[] | null>
  setData: (data: TRow[] | ((current) => TRow[])) => void
}
```

```javascript
import { createListResource } from 'frappe-ui'
import { computed, ref } from 'vue'

const tasks = createListResource({
  doctype: 'Task',
  fields: ['name', 'subject', 'status', 'priority'],
  orderBy: 'creation desc',
  pageLength: 20,
  auto: true,
})

const statusFilter = ref('Open')
const filteredTasks = createListResource({
  doctype: 'Task',
  fields: ['name', 'subject', 'status'],
  filters: computed(() => ({ status: statusFilter.value })),
  auto: true,
})

await tasks.insert.submit({ subject: 'New Task', status: 'Open' })
await tasks.setValue.submit({ name: 'TASK-001', status: 'Completed' })
await tasks.delete.submit('TASK-001')
await tasks.runDocMethod.submit({ method: 'send_email', name: 'TASK-001', email: 'user@example.com' })

if (tasks.hasNextPage) tasks.next()
```

`insert`/`setValue`/`delete`/`runDocMethod`/`fetchOne` each `.list.fetch()`
the parent list on success (re-fetching the whole page, not a local patch);
`setValue`/`insert`/`delete` on **any** `ListResource` for the same doctype
also patch every other cached `ListResource`/`DocumentResource` for that
doctype via `resourcesByDocType` (`updateRowInListResource`/
`deleteRowInListResource` in `listResource.js`) — the pre-v3 equivalent of
`useList`'s automatic `listStore` sync.

**Unified `createResource({ type: 'list' | 'document', ... })`** builds
either family without a separate import — same options as the dedicated
factory, e.g. `createResource({ type: 'list', doctype: 'ToDo', auto: true })`.

---

## `createDocumentResource`

```typescript
interface DocumentResourceOptions {
  doctype: string
  name: string
  auto?: boolean                    // default true
  debounce?: number                 // debounce ms for setValueDebounced (default 500)
  realtime?: boolean                // reload on `list_update` for this doc, via `vm.$socket`
  whitelistedMethods?: Record<string, string | { method: string, onSuccess?, makeParams?, transform? }>
  transform?: (doc: any) => any
  onSuccess?: (doc: any) => void
  onError?: (error: Error) => void
  setValue?: { validate?, onSuccess?, onError? }
  delete?: { onSuccess?, onError? }
}

interface DocumentResource<TDoc = any> {
  doctype: string
  name: string
  doc: TDoc | null
  originalDoc: TDoc | null          // last-saved snapshot, used to diff isDirty and getChangedFields()
  isDirty: boolean                  // reactively tracks `doc` vs `originalDoc` (deep watch)
  auto: boolean
  get: Resource<TDoc>
  setValue: Resource<TDoc>          // setValue.submit({ name, field1: v1, field2: v2, ... }) — sends ALL passed fields verbatim
  setValueDebounced: Resource<TDoc> // same call shape, debounced
  save: Resource<TDoc>              // save.submit() — no args; diffs `doc` against `originalDoc`, sends ONLY changed fields, no-ops if nothing changed
  delete: Resource<TDoc>            // delete.submit() — no args, uses `doctype`/`name` from state
  reload: () => Promise<TDoc | null>
  setDoc: (doc: TDoc | ((current) => TDoc)) => void
  [methodAlias: string]: Resource   // one per whitelistedMethods entry
}
```

```javascript
import { createDocumentResource } from 'frappe-ui'

const task = createDocumentResource({ doctype: 'Task', name: props.taskId, auto: true })

// task.doc.subject, task.doc.status
await task.setValue.submit({ name: task.name, subject: 'Updated', priority: 'High' })
task.setValueDebounced.submit({ name: task.name, subject: 'Typing...' })

task.doc.subject = 'Changed'          // mutate the reactive doc directly
await task.save.submit()              // sends only { subject: 'Changed' }
await task.delete.submit()

const invoice = createDocumentResource({
  doctype: 'Sales Invoice',
  name: invoiceId,
  auto: true,
  whitelistedMethods: { submitInvoice: 'submit', sendEmail: 'send_email' },
})
await invoice.submitInvoice.submit()
await invoice.sendEmail.submit({ recipient: 'customer@example.com' })
```

Verified from `documentResource.js`/`documentResource.test.ts`:

- `save.submit()` computes `getChangedFields()` — deep-diffs `doc` against
  `originalDoc`, **strips** `doctype`/`name` and any standard field the
  server rejects as read-only, and sends only the remainder as `fieldname`
  to `frappe.client.set_value`. If nothing changed, `save.submit()`
  resolves immediately with `doc` and makes **no request**.
  `setValue.submit()` has no such diffing — it PUTs exactly what you pass.
  This is the key behavioral gap when migrating to v3 `useDoc`, whose
  `setValue` also never diffs (see migration table).
- `setValue`/`save` optimistically mutate `out.doc` in `beforeSubmit`
  (before the response arrives) and roll it back via `revertRowInListResource`
  in `onError` — the v3 `useDoc.setValue` has no optimistic-update phase.
- `whitelistedMethods` results that include a matching `docs` array patch
  `out.doc` in place, mirroring the doctype/name of the call.

---

## Options API — `resourcesPlugin` / `this.$resources`

Exposes the same three factories to Options API components. Prefer
Composition API (`<script setup>`) in new code; this exists for components
that predate it.

```javascript
import { resourcesPlugin } from 'frappe-ui'
app.use(resourcesPlugin)
```

```javascript
export default {
  resources: {
    todos() {
      return { type: 'list', doctype: 'ToDo', fields: ['name', 'status'], auto: true }
    },
    todo() {
      return { type: 'document', doctype: 'ToDo', name: '1' }
    },
  },
  computed: {
    todoList() { return this.$resources.todos.data },
  },
}
```

A function-valued `resources` entry is re-evaluated on every reactive
dependency change (deep-watched) and creates a **new** resource instance
whenever the returned options object changes — a plain object entry is
created once. `this.$getResource(cache)` /
`this.$getDocumentResource(doctype, name)` /
`this.$getListResource(cache)` look up an already-cached resource by key
without creating a new one; `this.$getDoc(doctype, name)` is a shortcut for
`this.$getDocumentResource(...).doc`.

---

## Migration table — legacy → v3

| Legacy | v3 | Notes |
| --- | --- | --- |
| `createResource({ url, method, params, auto })` | `useCall({ url, method, params, immediate })` | `auto` → `immediate`; legacy defaults to RPC `/api/method/`, v3 composables target `/api/v2/...` — pick the matching backend route. |
| `resource.fetch()` / `.reload()` | `call.execute()` / `.fetch()` / `.reload()` | same three aliases. |
| `resource.submit(params)` | `call.submit(params)` | v3 `submit` does not throw on error — check `.error` instead of `try/catch`. |
| `createListResource({ doctype, fields, filters, pageLength })` | `useList({ doctype, fields, filters, limit })` | `pageLength` → `limit`; `start`/pagination shape unchanged. |
| `list.insert.submit(values)` | `list.insert.submit(values)` | same call shape; v3 refetches only when `refetch: true` (list default) vs. legacy always refetching. |
| `list.setValue.submit(name, field, value)`-style code | `list.setValue.submit({ name, ...fields })` | legacy `makeParams(options)` already destructures `{name, ...values}` — both eras take one options object, not `(name, field, value)`. |
| `list.delete.submit(name)` | `list.delete.submit({ name })` | v3 wraps the name in an object. |
| `createDocumentResource({ doctype, name })` | `useDoc({ doctype, name })` | v3 caching is automatic (`docStore`, 5 min TTL) instead of an explicit `cache` key. |
| `doc.save.submit()` (diffs changed fields) | `doc.setValue.submit(partial)` (no diffing) | **behavior change** — compute the changed subset yourself before calling v3 `setValue`, or keep a small diff helper. |
| `doc.setValue.submit({ name, field: value })` | `doc.setValue.submit({ field: value })` | v3 `useDoc.setValue` already knows its own `name`; don't pass it. |
| `doc.delete.submit()` | `doc.delete.submit()` | unchanged. |
| `whitelistedMethods: { alias: 'method' }` | `methods: { alias: 'method' }` | same shape (string alias or options object with `name`/`method`). |
| `createResource({ type: 'list'/'document', ... })` | `useList(...)` / `useDoc(...)` | the unified `type` flag has no v3 equivalent — import the specific composable. |
| `this.$resources.x` (Options API) | `useCall`/`useList`/`useDoc` in `<script setup>` | `resourcesPlugin` has no v3 equivalent; migrate the component to Composition API. |
| `getCachedResource`/`getCachedListResource`/`getCachedDocumentResource` | *(none)* | v3's `docStore`/`listStore` caches are internal and not exported — there is no direct v3 lookup-by-key API. |

---

## Other utilities

### `debounce`

```javascript
import { debounce } from 'frappe-ui'
const debouncedSearch = debounce((query) => { /* ... */ }, 500)
```

### `fileToBase64`

```javascript
import { fileToBase64 } from 'frappe-ui'
const base64 = await fileToBase64(fileObject)
```

### `pageMeta` plugin

Sets the document title (and optionally a favicon override) reactively per
component:

```javascript
// Options API
export default {
  pageMeta() {
    return { title: 'Page Title', icon: '/path/to/icon.png' }
  },
}
```

```javascript
// Composition API
import { usePageMeta } from 'frappe-ui'
usePageMeta(() => ({ title: 'Page Title' }))
```

---

## Directives

### `v-on-outside-click`

```vue
<script setup>
import { onOutsideClickDirective } from 'frappe-ui'
const vOnOutsideClick = onOutsideClickDirective
</script>

<template>
  <div v-on-outside-click="closeDropdown"><!-- content --></div>
</template>
```

### `v-visibility`

Fires when an element enters/leaves the viewport (wraps
`IntersectionObserver`):

```vue
<script setup>
import { visibilityDirective } from 'frappe-ui'
const vVisibility = visibilityDirective

function onVisible(visible, entry) {
  // entry is an IntersectionObserverEntry
}
</script>

<template>
  <div v-visibility="onVisible">Lazy loaded content</div>
</template>
```

---

## References

- [frappe-ui-data-fetching.md](frappe-ui-data-fetching.md) — v3 composables (canonical for new code).
- https://ui.frappe.io/docs/data-fetching/resource
- https://ui.frappe.io/docs/data-fetching/list-resource
- https://ui.frappe.io/docs/data-fetching/document-resource
- https://ui.frappe.io/docs/other/utilities
- https://ui.frappe.io/docs/other/directives
- https://github.com/frappe/frappe-ui

## Sources

Verified against frappe-ui `1.0.0-beta.29` (`package.json`):

- `apps/frappe-ui/src/resources/resources.js` — `createResource`, cache-key reuse, `handleError` re-throw, `previousData` rollback
- `apps/frappe-ui/src/resources/listResource.js` — `createListResource`, `resourcesByDocType`, `updateRowInListResource`/`deleteRowInListResource`/`revertRowInListResource`
- `apps/frappe-ui/src/resources/documentResource.js` — `createDocumentResource`, `getChangedFields` diffing, optimistic `setValue`/`save` mutation and rollback
- `apps/frappe-ui/src/resources/plugin.js`, `apps/frappe-ui/src/resources/index.ts` (`resourcesPlugin` export) — Options API `$resources`/`$getResource`/`$getDocumentResource`/`$getListResource`/`$getDoc`
- `apps/frappe-ui/src/index.ts:11` — legacy resources family "kept public until official apps finish the v3 migration"
- `apps/frappe-ui/src/resources/resources.test.ts`, `apps/frappe-ui/src/resources/documentResource.test.ts`
- `apps/frappe-ui/src/utils/debounce.ts`, `apps/frappe-ui/src/utils/file-to-base64.ts`, `apps/frappe-ui/src/utils/pageMeta.ts`
- `apps/frappe-ui/src/directives/onOutsideClick.ts`, `apps/frappe-ui/src/directives/visibility.ts`
