# frappe-ui SPA Page Patterns

List, Detail, and Form page layouts for a frappe-ui (Vue) SPA. See
[page-patterns.md](page-patterns.md) for the two native Frappe page kinds
(Desk Page, Web/Portal Page). Component-level API — list primitives,
`ListView`, `Editor` — lives in
[frappe-ui-list-and-editor.md](frappe-ui-list-and-editor.md); shell/nav
components in [app-shell-patterns.md](app-shell-patterns.md); data
composables (`useList`, `useDoc`, `useNewDoc`) in
`frappe-ui-data-fetching.md`; `FormControl` field types in
`frappe-ui-form-controls.md`. This page shows how they wire together inside
a routed page, not their full APIs.

## Pattern: List Page

```
List Page
├── PageHeader — title, New / Refresh actions
├── Tabs (optional) — status filter, tabs prop array, not <Tab> children
├── Search & Filter — FormControl(text) + FormControl(select), feeds useList filters
├── List body — frappe-ui/list primitives or ListView
│   ├── Loading — Skeleton rows
│   ├── Empty — no rows in `data`
│   └── Error — useList `error`, retry button
└── Pagination — useList `next()`/`previous()`/`hasNextPage`
```

### Template

```vue
<template>
  <div class="flex flex-col h-full">
    <PageHeader>
      <h1 class="text-lg font-semibold">{{ title }}</h1>
      <div class="flex gap-2">
        <Button variant="solid" @click="router.push({ name: 'LeadNew' })">
          <template #prefix><span class="lucide-plus size-4" /></template>
          New
        </Button>
        <Button variant="subtle" :loading="leads.loading" @click="leads.reload()">
          <template #prefix><span class="lucide-refresh-cw size-4" /></template>
          Refresh
        </Button>
      </div>
    </PageHeader>

    <Tabs v-model="activeTabIndex" :tabs="statusTabs">
      <template #tab-panel />
    </Tabs>

    <div class="flex gap-3 p-4">
      <FormControl v-model="search" placeholder="Search..." class="flex-1" />
      <FormControl v-model="statusFilter" type="select" :options="statusOptions" class="w-40" />
      <Button variant="outline" @click="clearFilters">Clear</Button>
    </div>

    <div v-if="leads.error" class="p-4">
      <p class="text-ink-red-3 text-sm">{{ leads.error.messages?.[0] ?? leads.error.message }}</p>
      <Button variant="outline" theme="red" size="sm" @click="leads.reload()">Retry</Button>
    </div>

    <List v-else-if="!leads.loading && leads.data?.length" class="flex-1">
      <ListRows :items="leads.data" v-slot="{ item, value }">
        <ListRow :value="value" :to="{ name: 'LeadDetail', params: { name: value } }">
          <ListCell>{{ item.lead_name }}</ListCell>
          <ListCell class="justify-end"><Badge :label="item.status" theme="gray" /></ListCell>
        </ListRow>
      </ListRows>
    </List>

    <div v-else-if="!leads.loading" class="flex flex-col items-center py-12 text-center">
      <span class="lucide-inbox size-8 text-ink-gray-4 mb-3" />
      <h3 class="font-medium mb-1">No leads found</h3>
      <Button variant="solid" @click="router.push({ name: 'LeadNew' })">Create New</Button>
    </div>

    <div v-if="leads.loading" class="p-4 space-y-2">
      <Skeleton v-for="i in 5" :key="i" class="h-10 w-full" />
    </div>

    <div class="flex justify-between p-4">
      <span class="text-sm text-ink-gray-6">Page {{ page }}</span>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" :disabled="page === 1" @click="leads.previous(); page--">
          <span class="lucide-chevron-left size-4" />
        </Button>
        <Button variant="outline" size="sm" :disabled="!leads.hasNextPage" @click="leads.next(); page++">
          <span class="lucide-chevron-right size-4" />
        </Button>
      </div>
    </div>
  </div>
</template>
```

### Script

```js
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useList } from 'frappe-ui'
import { List, ListRow, ListCell, ListRows } from 'frappe-ui/list'

const router = useRouter()
const search = ref('')
const statusFilter = ref('')
const activeTabIndex = ref(0)
const page = ref(1)

const statusTabs = [
  { label: 'All' }, { label: 'Active' }, { label: 'Draft' }, { label: 'Inactive' },
]
const statusOptions = ['', 'Active', 'Draft', 'Inactive']

const leads = useList({
  doctype: 'CRM Lead',
  fields: ['name', 'lead_name', 'status'],
  filters: computed(() => ({
    status: statusFilter.value || statusTabs[activeTabIndex.value]?.label.replace('All', '') || undefined,
    lead_name: search.value ? ['like', search.value] : undefined,
  })),
  orderBy: 'modified desc',
  limit: 25,
})

function clearFilters() {
  search.value = ''
  statusFilter.value = ''
  activeTabIndex.value = 0
  page.value = 1
}
```

`useList`'s `filters` accepts a reactive object or getter; a `'like'`
operator value auto-wraps `%…%`. `leads.next()`/`previous()` mutate the
internal `start` and refetch (since `refetch` defaults `true`);
`hasNextPage`/`hasPreviousPage` gate the pagination buttons. Swap the `List`
body for `ListView` (see `frappe-ui-list-and-editor.md`) when grouping or a
built-in pagination footer is needed instead of hand-rolled paging.

For a bulk-action toolbar over a filtered page, use `ListFilter`
(`v-model` is a `FiltersDict`, `docfields` a `DocField[]` — see
`frappe-ui-core-components.md`) instead of hand-rolled `FormControl` filters
when the filter set should mirror the doctype's own field metadata.

## Pattern: Detail Page

```
Detail Page
├── PageHeader — PageHeaderBackButton, title + status Badge, actions
├── Status banner (conditional, e.g. submitted/cancelled)
├── Tabs — tabs prop array, #tab-panel per section
└── Tab content
```

### Template

```vue
<template>
  <div class="flex flex-col h-full">
    <PageHeader>
      <div class="flex items-center gap-3">
        <PageHeaderBackButton :to="{ name: 'LeadList' }" />
        <h1 class="text-lg font-semibold">{{ lead.doc?.lead_name }}</h1>
        <Badge v-if="lead.doc" :label="lead.doc.status" theme="gray" />
      </div>
      <div class="flex gap-2">
        <Button variant="solid" :loading="lead.setValue.loading" @click="save">Save</Button>
        <Dropdown :options="moreOptions">
          <Button variant="outline" icon="lucide-more-vertical" />
        </Dropdown>
      </div>
    </PageHeader>

    <Tabs v-model="activeTabIndex" :tabs="[{ label: 'Details' }, { label: 'Activity' }]">
      <template #tab-panel="{ tab }">
        <div v-if="tab.label === 'Details'" class="p-6">
          <!-- form fields bound to lead.doc -->
        </div>
        <ActivityFeed v-else doctype="CRM Lead" :name="lead.doc?.name" />
      </template>
    </Tabs>
  </div>
</template>
```

### Script

```js
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useDoc, dialog, toast } from 'frappe-ui'

const route = useRoute()
const activeTabIndex = ref(0)

const lead = useDoc({ doctype: 'CRM Lead', name: route.params.name })

async function save() {
  try {
    await lead.setValue.submit({ ...lead.doc, name: lead.doc.name })
    toast.success('Saved')
  } catch (err) {
    toast.error(err.messages?.[0] ?? 'Failed to save')
  }
}

const moreOptions = [
  {
    label: 'Delete',
    icon: 'lucide-trash-2',
    theme: 'red',
    onClick: () =>
      dialog.danger({
        title: 'Delete Lead?',
        message: 'This action cannot be undone.',
        onConfirm: async () => {
          await lead.delete.submit()
          toast.success('Deleted')
        },
      }),
  },
]
```

`useDoc`'s `setValue.submit(partial)` PUTs the given fields (no dirty-diff —
it is not a full-document `save()`); `delete.submit()` takes no args and
resolves the current `name`. Both are `useCall`-shaped: `.loading`, `.error`
are available on `lead.setValue`/`lead.delete` directly.

## Pattern: Form Page (create)

```vue
<template>
  <div class="max-w-2xl mx-auto p-6 space-y-6">
    <PageHeader>
      <h1 class="text-lg font-semibold">New Lead</h1>
      <div class="flex gap-2">
        <Button variant="outline" @click="router.back()">Cancel</Button>
        <Button variant="solid" :loading="newLead.loading" @click="create">Create</Button>
      </div>
    </PageHeader>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <FormControl v-model="newLead.doc.lead_name" label="Name" required />
      <!-- No core FormControl type="link"; type="combobox" + a search
           resource builds a DocType picker (see frappe-ui-form-controls.md). -->
      <FormControl
        v-model="newLead.doc.customer"
        label="Customer"
        type="combobox"
        :options="customerOptions.data ?? []"
      />
      <FormControl v-model="newLead.doc.status" label="Status" type="select" :options="statusOptions" />
      <FormControl v-model="newLead.doc.date" label="Date" type="date" />
    </div>

    <FormControl v-model="newLead.doc.description" label="Description" type="textarea" :rows="4" />
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useNewDoc, toast } from 'frappe-ui'

const router = useRouter()
const newLead = useNewDoc('CRM Lead', { status: 'Draft' })
const statusOptions = ['Draft', 'Active', 'Inactive']

async function create() {
  try {
    const doc = await newLead.submit()
    toast.success(`Created ${doc.name}`)
    router.push({ name: 'LeadDetail', params: { name: doc.name } })
  } catch (err) {
    toast.error(err.messages?.[0] ?? 'Failed to create')
  }
}
</script>
```

`useNewDoc(doctype, initialValues)` returns a reactive local `doc` draft —
bind form fields to it directly (no separate `v-model="form"` object) — plus
a no-argument `submit()` that POSTs the current draft and resolves the
persisted doc. See `frappe-frontend-development/assets/FormWizard.vue.template`
for a multi-step version with per-step validation and a `Dialog` shell.

## Best practices

1. **Consistent spacing** — 8pt grid (`p-4`, `p-6`, `p-8`).
2. **Loading states** — `Skeleton` rows/blocks, not a spinner div, for list
   and detail bodies; `:loading` on the triggering `Button` for actions.
3. **Empty states** — a `lucide-*` icon, a one-line message, and (when
   filters aren't active) a create action.
4. **Errors** — surface `error.messages?.[0]` (Frappe's structured error
   shape) with a retry action, not a raw `error.message` stack string.
5. **Confirmations** — `dialog.confirm`/`dialog.danger`, not a hand-rolled
   `showConfirm` ref + inline `Dialog`.
6. **Feedback** — `toast.success`/`toast.error` after mutations, not a
   local banner state.
7. **Mobile** — stack columns (`grid-cols-1 md:grid-cols-2`), and use
   `MobileShell`/`PageHeaderMobile` instead of the desktop shell below the
   `sm`/`lg` breakpoint (see `app-shell-patterns.md`).

## Sources

Verified against frappe-ui `1.0.0-beta.29` (`package.json`). This page
composes APIs documented in full elsewhere; only the composition itself was
re-checked here:

- `apps/frappe-ui/src/data-fetching/useList/useList.ts` — `filters`/`orderBy`, `next()`/`previous()`, `hasNextPage`
- `apps/frappe-ui/src/data-fetching/useDoc/useDoc.ts` — `setValue.submit(partial)` (no dirty-diff), `delete.submit()`
- `apps/frappe-ui/src/data-fetching/useNewDoc/useNewDoc.ts` — reactive `doc` draft, no-argument `submit()`
- `apps/frappe-ui/src/molecules/list/List.vue`, `ListRows.vue`, `ListRow.vue`, `ListCell.vue`
- `apps/frappe-ui/src/components/FormControl/FormControl.vue`
- `apps/frappe-ui/src/utils/dialog.ts` (`dialog.confirm`/`dialog.danger`), `apps/frappe-ui/src/components/Toast/toast.ts` (`toast.success`/`toast.error`)
- See [frappe-ui-data-fetching.md](frappe-ui-data-fetching.md), [frappe-ui-list-and-editor.md](frappe-ui-list-and-editor.md), and [frappe-ui-form-controls.md](frappe-ui-form-controls.md) for full API verification of each composable/component used above.
