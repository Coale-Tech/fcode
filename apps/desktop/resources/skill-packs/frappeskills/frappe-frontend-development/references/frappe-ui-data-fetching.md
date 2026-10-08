# Frappe UI — Data Fetching

Adapted in part from frappe/frappe-ui (MIT): `skills/frappe-ui/COMPONENTS.md`.

The v3 composables (`useCall`, `useList`, `useDoc`, `useDoctype`, `useNewDoc`,
all from `src/data-fetching/`) are the canonical way to call Frappe APIs from
new frappe-ui code. They wrap `@vueuse/core`'s `useFetch` against Frappe's
**v2 REST API** (`/api/v2/...`). The legacy `createResource` /
`createListResource` / `createDocumentResource` family
(`src/resources/`) is kept exported "until official apps finish the v3
migration" (`src/index.ts`) — see
[frappe-ui-data-fetching-legacy.md](frappe-ui-data-fetching-legacy.md) for
that API and a migration table. `call` / `frappeRequest` / `request` target
the older RPC-style `/api/method/<dotted.path>` endpoints and remain current
for both eras (below).

**Version note:** these composables already exist in the `0.1.261` baseline
many production apps pin, minus the pieces tagged `(v1)` below (new in
`1.0.0-beta.29`). Check `frontend/package.json` for the pinned version before
relying on a `(v1)`-tagged option. See
[frontend-architecture.md](frontend-architecture.md) for Pinia store, router,
and socket.io wiring in real apps (CRM, Insights) — not duplicated here.

---

## `useCall` — the base composable

Everything else (`useDoc`, `useDoctype`, `useNewDoc`, `useList`) is built on
top of `useCall` (`src/data-fetching/useCall/useCall.ts`). Reach for it
directly for any one-off whitelisted method or custom v2 endpoint.

```typescript
interface UseCallOptions<TResponse = any, TParams extends BasicParams = undefined> {
  url: string | Ref<string>                    // e.g. '/api/v2/method/ping', or computed() for a reactive URL
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'    // default 'GET'
  params?: TParams | (() => TParams)            // object, or a function read reactively on each fetch
  cacheKey?: string | Array<string | number | boolean | object>  // IndexedDB persistence key
  staleOnError?: boolean                        // (v1) keep cached data visible if a refetch fails with a network error
  immediate?: boolean                           // default true — fetch on mount
  refetch?: boolean                             // default false — re-run when reactive url/params change
  baseUrl?: string
  initialData?: TResponse
  beforeSubmit?: (params?: TParams) => void     // runs before submit(); a thrown/rejected error lands in `.error`
  transform?: (data: TResponse) => TResponse    // return value replaces data.value unless it returns undefined
  onSuccess?: (data: TResponse) => void
  onError?: (error: Error) => void
}

// Return value (a Vue `reactive` object — read fields without `.value`)
interface UseCallResult<TResponse, TParams> {
  data: TResponse | null
  error: Error | null                 // FrappeResponseError, see "Error shapes" below
  loading: boolean                    // alias of isFetching
  isFetching: boolean
  isFinished: boolean
  canAbort: boolean
  aborted: boolean
  url: string                         // the resolved URL (GET requests append the query string)
  params: TParams                     // resolved params for the in-flight/last request
  promise: Promise<any>               // resolves/rejects on the next response; re-armed after each fetch
  abort: () => void
  execute: () => Promise<TResponse | null>
  fetch: () => Promise<TResponse | null>   // alias of execute
  reload: () => Promise<TResponse | null>  // alias of execute
  reset: () => void                   // clears any pending submit() params
  submit: (params?: TParams) => Promise<TResponse | null>
}
```

**Read pattern (auto-fetch on mount):**

```typescript
import { useCall } from 'frappe-ui'

const ping = useCall<string>({ url: '/api/v2/method/ping' })
// ping.data, ping.loading, ping.error
```

```typescript
// Reactive URL + persisted cache: cached data hydrates `.data` on next mount
// while a fresh request runs in the background (instant perceived loads).
const user = useCall<User>({
  url: computed(() => `/api/v2/document/User/${userId.value}`),
  refetch: true,
  cacheKey: ['user', userId],
})
```

**Write pattern (`immediate: false` + `submit()` is the canonical shape):**

```typescript
const createTask = useCall<Task, { title: string; description?: string }>({
  url: '/api/v2/method/myapp.api.create_task',
  method: 'POST',
  immediate: false,
  onSuccess: (task) => router.push(`/tasks/${task.name}`),
  onError: (err) => toast.error(err.message),
})

async function save() {
  await createTask.submit({ title: form.title, description: form.description })
}
```

Notes verified against `useCall.ts` / `useCall.test.ts`:

- `params` also accepts a plain reactive value (unwrapped per-key via
  `unrefObject`) — not just a function.
- `submit(params)` sets the params and, when `refetch` is `false` (the
  default), immediately calls `execute()`; when `refetch: true`, changing
  params/url is enough to trigger a fetch on its own and `submit` does not
  double-fire.
- `submit()` with no arguments re-submits with the last resolved params
  (useful once `immediate:false` + a reactive `params` function is set).
- `abort()` sets `aborted = true`; an aborted request does not populate
  `error` (it is not treated as a resource error).
- `beforeSubmit` errors are surfaced through `.error`, not thrown to the
  caller of `submit()`.

### Caching (`cacheKey` / `staleOnError`)

When `cacheKey` is set, the last successful response is persisted to
IndexedDB (via the internal `idbStore`, prefixed `useCall:`) and re-hydrated
into `.data` synchronously on next mount while the real request is in
flight. If a **refetch** then fails:

- by default (`staleOnError: false`), `.data` falls back to the cache only
  while there is no error;
- with `staleOnError: true` **(v1)**, the cached value stays visible through
  a *network*-level failure (e.g. offline) but not through a structured
  Frappe server error (`FrappeResponseError`) — a real 4xx/5xx still clears
  `.data` to reflect the server's answer.

### Error shapes

`useCall` (and everything built on it) talks to `/api/v2/...`, whose error
envelope is `{ errors: [{ title, message, type, indicator, exception? }] }`.
`useFrappeFetch` (`src/data-fetching/useFrappeFetch.ts`) parses this into a
`FrappeResponseError`:

```typescript
class FrappeResponseError extends Error {
  title: string        // e.g. "Server Error"
  type: string          // e.g. "ServerError" — the raised exception's class name
  exception?: string    // full traceback, dev-only
  indicator?: string    // e.g. "red"
}
// error.message === `${type}: ${message}` when a message is present,
// or `${type} (Traceback)` when only `exception` is present.
```

A server-side `frappe.throw("Cannot delete a submitted document")` in a v2
endpoint surfaces as `error.message === 'ValidationError: Cannot delete a
submitted document'` and `error.title === 'Cannot delete a submitted
document'` (the title `frappe.throw` was given, or the exception class
name). A plain network failure (offline, CORS, aborted DNS) reaches
`onError`/`.error` as a bare `Error`, not a `FrappeResponseError` — that
distinction is what `staleOnError` keys off.

---

## `useDoc` — a single document

```typescript
interface UseDocOptions<TDoc> {
  doctype: string
  name: MaybeRefOrGetter<string>                // string, ref, or computed — re-binds when it resolves/changes
  baseUrl?: string
  url?: string                                  // (v1) override the default `/api/v2/document/<doctype>/<name>` GET URL
  methods?: Record<string, string | DocMethodOption>  // alias -> whitelisted instance method name, or full useCall options
  immediate?: boolean                           // default true
  staleOnError?: boolean                        // (v1) — see docStore caching below
  transform?: (doc: TDoc & { doctype: string }) => TDoc & { doctype: string }
}

interface DocMethodOption<T = any> extends Omit<UseCallOptions<T>, 'url' | 'baseUrl'> {
  name: string   // the whitelisted controller method to call
}
```

Returns a reactive object with `doc`, `error`, `loading`/`isFetching`,
`isFinished`, `canAbort`, `aborted`, `execute`/`fetch`/`reload`, `abort`,
plus:

- `setValue` — a `useCall` PUT to `/api/v2/document/<doctype>/<name>`.
  `setValue.submit(partialDoc)` sends exactly the object you pass — **there
  is no automatic dirty-diffing** (unlike the legacy `save`; see below).
- `delete` — a `useCall` DELETE. `delete.submit()` takes no arguments.
- `onSuccess(callback)` — registers an extra success listener (fired after
  every successful GET); returns an unsubscribe function.
- one `useCall`-shaped entry per `methods` key, e.g. `user.getFullName`,
  each POSTing to `/api/v2/document/<doctype>/<name>/method/<methodName>`.

```typescript
import { useDoc } from 'frappe-ui'

interface Task { name: string; subject: string; status: string }
interface TaskMethods { markDone: () => void }

const task = useDoc<Task, TaskMethods>({
  doctype: 'Task',
  name: props.taskId,                 // may be a ref/computed that resolves later
  methods: { markDone: 'mark_done' },
})

// task.doc.subject, task.doc.status — read-only reactive view

await task.setValue.submit({ status: 'Completed' })  // PUT only these fields
await task.markDone.submit()
await task.delete.submit()
```

**Reactive `name` semantics** (verified in `useDoc.test.ts`): if `name`
starts empty (e.g. bound to a still-loading parent doc), `useDoc` does not
bind to any cache slot and does not fire a GET — `doc` stays `null`,
`loading` stays `false`. Once `name` resolves to a non-empty string, the
`doc` computed re-points to the real cache slot and the GET fires
automatically (this needs `refetch: true` behavior internally — you don't
set it yourself, `useDoc` always re-fetches on a name/url change).

### Document caching (`docStore`)

`useDoc` does not take a `cacheKey`. Instead, every fetched/mutated document
is written into an internal singleton `docStore`, keyed by
`` `${doctype}/${name}` ``, backed by IndexedDB with a **5-minute** default
staleness timeout. Any other `useDoc` instance for the same doctype+name —
anywhere in the app — sees the update reactively without an extra request.
`staleOnError: true` **(v1)** keeps the last-known IndexedDB copy on a stale
reload failure instead of evicting it. `docStore` (and the parallel
`listStore` used by `useList`, below) are **internal and not exported** from
`'frappe-ui'` — there is no supported way to import and call them directly;
their effects are observed only through `useDoc`/`useList`/`useDoctype`.

---

## `useDoctype` — doctype-level operations (no bound instance)

For operations that are not tied to one already-loaded document — creating
a new one, deleting/updating by name, or running a whitelisted method
against an arbitrary or not-yet-fetched record.

```typescript
function useDoctype<T>(doctype: string, options?: { baseUrl?: string }): {
  insert: { submit: (values: Partial<T>) => Promise<T>, loading: boolean, error: Error | null }
  delete: { submit: (params: { name: string }) => Promise<'ok'>, loading: boolean }
  setValue: { submit: (params: { name: string } & Partial<T>) => Promise<T & { name: string }>, loading: boolean }
  runDocMethod: {
    submit: (params: { name: string; method: string; validate?: () => string | void; params?: Record<string, any> }) => Promise<any>
    isLoading: (name: string, method: string) => boolean
    loading: boolean
    error: Error | null
  }
  runMethod: {
    submit: (params: { method: string; validate?: () => string | void; params?: Record<string, any> }) => Promise<any>
    isLoading: (method: string) => boolean
  }
}
```

```typescript
import { useDoctype } from 'frappe-ui'

const tasks = useDoctype<Task>('Task')

await tasks.insert.submit({ subject: 'New Task', status: 'Open' })
await tasks.setValue.submit({ name: 'TASK-001', status: 'Completed' })
await tasks.delete.submit({ name: 'TASK-001' })
await tasks.runDocMethod.submit({ method: 'send_email', name: 'TASK-001', params: { to: 'user@example.com' } })
```

- `insert.submit(values)` POSTs to `/api/v2/document/<doctype>` and resolves
  with the created document.
- `runDocMethod` hits `/api/v2/document/<doctype>/<name>/method/<method>`
  (an **instance** method); `runMethod` hits
  `/api/v2/method/<doctype>/<method>` (a **doctype-level** whitelisted
  method, no instance). Both accept an optional synchronous `validate()`
  that can return an error string to reject the submit before any request
  fires, surfaced through `.error`.
- `runDocMethod.isLoading(name, method)` / `runMethod.isLoading(method)` let
  a list row show a per-item spinner without a separate loading ref per row.

---

## `useNewDoc` — new-document draft + insert

```typescript
function useNewDoc<T extends object>(
  doctype: string,
  initialValues?: Partial<T>,
  options?: Omit<UseCallOptions<any, Partial<T>>, 'url' | 'method' | 'params' | 'immediate'>,
): UseCallResult<T & { name: string }, Partial<T>> & {
  doc: T                    // reactive local draft — bind form inputs directly to its fields
  submit: () => Promise<T>  // POSTs the current `doc`, stores the result in docStore, resolves the persisted doc
}
```

```typescript
import { useNewDoc } from 'frappe-ui'

const newTask = useNewDoc<Task>('Task', { status: 'Open' })
// v-model="newTask.doc.subject" in the template

async function create() {
  const task = await newTask.submit()   // no arguments — reads the current newTask.doc
  router.push(`/tasks/${task.name}`)
}
```

`submit()` here **overrides** the base `useCall` submit (which takes a
`params` argument) — `useNewDoc.submit()` always POSTs the live `doc`
object; standard fields (`creation`, `modified`, `owner`, `modified_by`) are
excluded from the draft's type but nothing stops the server rejecting a
malformed payload, so validate before calling `submit()`.

---

## `useList` — paginated DocType lists

```typescript
interface UseListOptions<T> {
  doctype: string
  fields?: Array<keyof T | `${string}.${string}` | `${string} as ${string}` | { [child: string]: string[] } | '*'>
  filters?: MaybeRefOrGetter<{
    [field: string]: string | number | boolean
      | [operator: string, value: string | number | boolean | string[]]
  }>
  orderBy?: MaybeRefOrGetter<`${string} asc` | `${string} desc` | `${string} ASC` | `${string} DESC`>
  start?: number
  limit?: number              // default 20
  groupBy?: string
  parent?: string              // parent doctype, for child-table rows
  debug?: boolean
  cacheKey?: string | Array<string | number | boolean | object>
  staleOnError?: boolean       // (v1)
  initialData?: T[]
  immediate?: boolean          // default true
  refetch?: boolean            // default true — reactive filters/orderBy/pagination re-fetch automatically
  baseUrl?: string
  url?: `/${string}`           // custom list endpoint, default `/api/v2/document/<doctype>`
  transform?: (data: T[]) => T[]
  onSuccess?: (data: T[]) => void
  onError?: (error: Error) => void
}
```

Returns `data`, `hasNextPage`, `hasPreviousPage`, `start`/`limit`
(read-only), `error`, `loading`, `next()`/`previous()`,
`execute`/`fetch`/`reload`, `updateRow(doc)`/`removeRow(name)` (local-only
patch, no request), plus three `useCall`-shaped sub-resources: `insert`,
`setValue`, `delete`.

```typescript
import { useList } from 'frappe-ui'
import { computed, ref } from 'vue'

const statusFilter = ref('Open')
const tasks = useList<Task>({
  doctype: 'Task',
  fields: ['name', 'subject', 'status', 'priority'],
  filters: computed(() => ({ status: statusFilter.value })),
  orderBy: 'creation desc',
  limit: 20,
})
// changing statusFilter.value refetches automatically (refetch: true by default)

await tasks.insert.submit({ subject: 'New Task', status: 'Open' })
await tasks.setValue.submit({ name: 'TASK-001', status: 'Completed' })
await tasks.delete.submit({ name: 'TASK-001' })

if (tasks.hasNextPage) tasks.next()
```

Verified filter semantics (`parseFilters` in `utils.ts`): a bare value is an
equality filter; `[operator, value]` passes the operator through as-is,
except `'like'`, whose value is coerced to a string and auto-wrapped in `%`
on both sides if you did not already include one (empty/`null` `like`
values are dropped from the request entirely). Filter values may themselves
be refs — they are unwrapped per key on every fetch.

**Pagination**: `next()`/`previous()` always mutate `start`. When `refetch:
true` (the default) the reactive URL change alone triggers the next fetch;
`useList` additionally calls `execute()` directly from `next()`/`previous()`
only when you pass `refetch: false`, so pagination works either way.

### Realtime / cross-instance sync (no socket.io required)

Every `useFrappeFetch` response whose JSON body includes a `docs` array
(several v2 endpoints, including doc-method calls) is broadcast into the
internal `docStore` + `listStore`. `useDoc.setValue`/`delete` and
`useList.insert`/`setValue`/`delete` also push their results into the same
stores directly. The practical effect: **any doc fetched or mutated
anywhere in the app patches every other live `useList` for that doctype**
(`updateRow`/`removeRow`), with no extra plumbing and no socket.io
involved. True socket.io realtime (`list_update` events from
`frappe.publish_realtime`) is a separate, opt-in layer — see
[frontend-architecture.md](frontend-architecture.md) for `initSocket`
wiring in a real app; `useList`/`useDoc` do not subscribe to sockets
themselves.

---

## `call` / `frappeRequest` / `request` / `initSocket`

These live outside the composable/resource abstractions and remain the
right tool for **RPC-style dotted-path methods** (`frappe.client.get_list`,
`myapp.api.do_thing`) hit at `/api/method/<dotted.path>` — as opposed to the
v2 REST paths (`/api/v2/...`) the composables above use.

```typescript
import { call } from 'frappe-ui'

const customer = await call('frappe.client.get', { doctype: 'Customer', name: 'CUST-001' })
```

- `call<TResponse>(method, args?, options?)` — POSTs to
  `/api/method/<method>` (or `method` verbatim if it already starts with
  `/`); resolves with `response.message` (or the whole payload for
  `docs`-shaped responses / `method === 'login'`). Rejects with a
  `CallError extends Error { exc_type?, exc?, status?, messages: string[] }`
  — `messages` is the parsed `_server_messages` array plus the top-level
  `message`, so a server `frappe.throw("X")` lands as
  `error.messages` containing `"X"`.
- `createCall(options)` — returns a `call`-shaped function pre-bound with
  `options` (e.g. a shared `onError`), for call sites that don't want to
  repeat error handling.
- `frappeRequest<TResponse>(options)` — a lower-level Frappe-aware fetch
  wrapper (`RequestOptions` shape: `url`, `method`, `params`, `headers`,
  `credentials`, ...) used internally by `call`; same error shape as
  `CallError` but named `FrappeRequestError` and additionally carrying
  `response: Response`. Prefer `call` unless you need response-shape
  control `call` doesn't expose (custom `credentials`, non-JSON responses).
- `request<TResponse>(options)` — the generic, non-Frappe-aware fetch
  primitive `frappeRequest` builds on (no CSRF header, no `_server_messages`
  parsing); use it only for non-Frappe endpoints.
- `initSocket(options?: { port?: number })` — returns a `socket.io-client`
  `Socket` pointed at the current site. `app.use(FrappeUI)` calls this once
  and assigns it to `app.config.globalProperties.$socket` (Options API:
  `this.$socket`); it is **not** `app.provide()`-d, so `inject('$socket')`
  in `<script setup>` only works if your own bootstrap explicitly
  `app.provide('$socket', socket)` — see
  [frontend-architecture.md](frontend-architecture.md) for how CRM wires
  this end to end.

---

## See also

- [frappe-ui-data-fetching-legacy.md](frappe-ui-data-fetching-legacy.md) —
  `createResource`/`createListResource`/`createDocumentResource`, the
  Options API `$resources` plugin, other utilities (`debounce`,
  `fileToBase64`, directives), and a legacy → v3 migration table.
- [frappe-ui-components.md](frappe-ui-components.md) — component index.
- [frontend-architecture.md](frontend-architecture.md) — Pinia stores, Vue
  Router, and socket.io wiring in real apps.
- https://ui.frappe.io/llms.txt — upstream exhaustive API reference.

## Sources

Verified against frappe-ui `1.0.0-beta.29` (`package.json`); inline
`Verified …`/`Notes verified against …` callouts above pin specific claims
to specific test files:

- `apps/frappe-ui/src/data-fetching/useCall/useCall.ts`, `useCall/useCall.test.ts`, `useCall/types.ts`
- `apps/frappe-ui/src/data-fetching/useFrappeFetch.ts` — `FrappeResponseError`, `/api/v2/...` error envelope
- `apps/frappe-ui/src/data-fetching/useDoc/useDoc.ts`, `useDoc/useDoc.test.ts`
- `apps/frappe-ui/src/data-fetching/docStore.ts`, `docStore.test.ts` — 5-minute IndexedDB staleness TTL, `docStore`/`listStore` not exported from `src/index.ts`
- `apps/frappe-ui/src/data-fetching/useDoctype/useDoctype.ts`, `useDoctype/useDoctype.test.ts`
- `apps/frappe-ui/src/data-fetching/useNewDoc/useNewDoc.ts`
- `apps/frappe-ui/src/data-fetching/useList/useList.ts`, `useList/useList.test.ts`, `useList/listStore.ts`, `useList/types.ts`
- `apps/frappe-ui/src/data-fetching/utils.ts` — `parseFilters`, `unrefObject`, `makeGetParams`, `normalizeCacheKey`
- `apps/frappe-ui/src/utils/call.ts` (`call`/`createCall`), `apps/frappe-ui/src/utils/frappeRequest.ts`, `apps/frappe-ui/src/utils/request.ts`, `apps/frappe-ui/src/utils/socketio.ts` (`initSocket`)
- `apps/frappe-ui/src/utils/plugin.ts` (`FrappeUI` — `app.config.globalProperties.$socket`)
