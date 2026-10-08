# Component Patterns

> Adopted from [lubusIN/frappe-skills](https://github.com/lubusIN/frappe-skills) (MIT) — `ui-patterns/references/component-patterns.md`.

Usage patterns for Frappe UI components in app development.

### Button Patterns

#### Variants

```vue
<!-- Primary action -->
<Button variant="solid">Save</Button>

<!-- Secondary action -->
<Button variant="subtle">Cancel</Button>

<!-- Tertiary/icon action -->
<Button variant="ghost" icon="lucide-more-horizontal" />

<!-- Destructive action -->
<Button variant="solid" theme="red">Delete</Button>
```

#### With icons

`icon` accepts a `lucide-<name>` CSS class string (or a component). A bare
non-`lucide-`-prefixed string falls back to the deprecated `FeatherIcon` and
logs a dev warning — always use the `lucide-` form in new code.

```vue
<!-- Icon prefix (label + leading icon) -->
<Button variant="solid">
  <template #prefix><span class="lucide-plus size-4" /></template>
  New Lead
</Button>

<!-- Icon only -->
<Button variant="ghost" icon="lucide-settings" />

<!-- Loading state -->
<Button variant="solid" :loading="saving">
  {{ saving ? 'Saving...' : 'Save' }}
</Button>
```

#### Button groups

frappe-ui has no dedicated `ButtonGroup` primitive. For a segmented control
(mutually-exclusive selection, not a plain toolbar), use `TabButtons`
instead — see [app-shell-patterns.md](app-shell-patterns.md). For a plain
row of independent actions, compose `Button`s in a flex container:

```vue
<div class="flex -space-x-px">
  <Button class="rounded-r-none">Left</Button>
  <Button class="rounded-none">Center</Button>
  <Button class="rounded-l-none">Right</Button>
</div>
```

### Form Controls

#### Basic inputs

```vue
<!-- Text input -->
<FormControl
  label="Full Name"
  type="text"
  v-model="form.name"
  :required="true"
  placeholder="Enter name"
/>

<!-- Email with validation -->
<FormControl
  label="Email"
  type="email"
  v-model="form.email"
  :error="emailError"
  description="We'll never share your email"
/>

<!-- Textarea -->
<FormControl
  label="Description"
  type="textarea"
  v-model="form.description"
  :rows="4"
/>
```

#### Select and Link

```vue
<!-- Static options -->
<FormControl
  label="Status"
  type="select"
  v-model="form.status"
  :options="[
    { label: 'Open', value: 'Open' },
    { label: 'Closed', value: 'Closed' }
  ]"
/>

<!-- Link to DocType — no core FormControl type="link"; build a picker from
     Combobox + a search resource (see frappe-ui-core-components.md).
     FormControl also accepts type="combobox" and forwards to the same
     component. Autocomplete/type="autocomplete" are deprecated — use
     Combobox. -->
<Combobox
  label="Customer"
  v-model="form.customer"
  :options="customerOptions.data || []"
  @update:query="(q) => customerOptions.update({ params: { txt: q, filters: { status: 'Active' } } })"
/>
```

#### Date and time

```vue
<!-- Date picker -->
<FormControl
  label="Due Date"
  type="date"
  v-model="form.due_date"
/>

<!-- Datetime -->
<FormControl
  label="Scheduled At"
  type="datetime"
  v-model="form.scheduled_at"
/>
```

#### Checkbox and switch

```vue
<!-- Checkbox -->
<FormControl
  label="I agree to terms"
  type="checkbox"
  v-model="form.agree"
/>

<!-- Switch for toggles -->
<div class="flex items-center justify-between">
  <div>
    <p class="font-medium">Email notifications</p>
    <p class="text-sm text-gray-500">Receive email updates</p>
  </div>
  <Switch v-model="settings.email_notifications" />
</div>
```

### Lists and Tables

#### Basic list

```vue
<ListView
  :columns="columns"
  :rows="rows"
  row-key="name"
  :options="{
    selectable: true,
    onRowClick: handleRowClick
  }"
>
  <template #cell="{ item, column, row }">
    <Badge v-if="column.key === 'status'" :theme="statusTheme(row.status)">
      {{ item }}
    </Badge>
    <span v-else>{{ item }}</span>
  </template>
</ListView>

<script setup>
const columns = [
  { label: 'Name', key: 'name', width: '200px' },
  { label: 'Status', key: 'status', width: '100px' },
  { label: 'Modified', key: 'modified', width: '150px' }
]
</script>
```

#### Custom row rendering

```vue
<div class="divide-y">
  <div 
    v-for="item in items" 
    :key="item.name"
    class="flex items-center p-3 hover:bg-gray-50 cursor-pointer"
    @click="select(item)"
  >
    <Avatar :label="item.title" :image="item.image" class="mr-3" />
    <div class="flex-1 min-w-0">
      <p class="font-medium truncate">{{ item.title }}</p>
      <p class="text-sm text-gray-500">{{ item.subtitle }}</p>
    </div>
    <Badge :theme="statusTheme(item.status)">{{ item.status }}</Badge>
    <Dropdown :options="rowActions" class="ml-2">
      <Button variant="ghost" icon="lucide-more-horizontal" />
    </Dropdown>
  </div>
</div>
```

### Dialogs and Modals

#### Confirmation dialog

For confirm/destructive flows, prefer the imperative `dialog` namespace over
a hand-rolled `showConfirm` ref — it mounts, awaits, and tears itself down:

```ts
import { dialog } from 'frappe-ui'

dialog.danger({
  title: 'Delete Lead?',
  message: 'This action cannot be undone.',
  onConfirm: async () => {
    await deleteLead()
  },
})
```

`dialog.danger` is sugar for `dialog.confirm` with `theme: 'red'` and a
`'Delete'` confirm label. `onConfirm` resolving auto-closes the dialog;
throwing keeps it open with the thrown message rendered inline (e.g. a
server validation error). `dialog.confirm`/`dialog.danger`/`dialog.prompt`
each return a `DialogHandle` for programmatic dismissal. Requires
`<FrappeUIProvider>` (or a standalone `<Dialogs />`) mounted once in the app.

#### Declarative dialog (custom content)

For anything beyond confirm/prompt — a form, a multi-section body — use
`Dialog` directly with its flat v1 props and canonical `#default`/`#actions`
slots. `v-model:open` is canonical; plain `v-model` also works. The legacy
`:options="{...}"` blob and `#body-content` slot still work (flat props take
precedence when both are given) but are deprecated — write new code with
flat props.

```vue
<Dialog v-model:open="showForm" title="New Lead" size="lg">
  <div class="space-y-4">
    <FormControl label="Name" v-model="newLead.name" />
    <FormControl label="Email" v-model="newLead.email" type="email" />
    <FormControl label="Source" v-model="newLead.source" type="select" :options="sources" />
  </div>
  <template #actions>
    <Button @click="showForm = false">Cancel</Button>
    <Button variant="solid" @click="createLead" :loading="creating">Create</Button>
  </template>
</Dialog>
```

`Dialog` props: `title`, `message`, `icon`, `size` (default `'lg'`),
`position`, `paddingTop`, `actions`, `dismissible` (default `true`),
`showCloseButton` (default `true`), `bare` (default `false` — `true` renders
only the default slot with no chrome; `title`/`icon`/`actions` become no-ops).

#### Nested dialogs

```vue
<!-- Avoid deeply nested dialogs. Use side panels instead. -->
<Dialog v-model:open="showEdit" title="Edit Lead">
  <FormFields :doc="editDoc" />
  <!-- Instead of nesting another Dialog, emit an event to the parent -->
  <Button @click="$emit('show-advanced')">Advanced Options</Button>
</Dialog>
```

### Dropdowns and Menus

#### Action dropdown

```vue
<Dropdown
  :options="[
    { label: 'Edit', icon: 'lucide-pencil', onClick: edit },
    { label: 'Duplicate', icon: 'lucide-copy', onClick: duplicate },
    { label: 'Delete', icon: 'lucide-trash-2', onClick: confirmDelete, theme: 'red' }
  ]"
>
  <Button variant="ghost" icon="lucide-more-horizontal" />
</Dropdown>
```

#### Filter dropdown

`Dropdown` has no `v-model` for a selected value — each option is an action
row with its own `onClick` (`open`/`update:open` is the only model it
exposes, for the popover's visibility). Set the selection from the option's
`onClick` instead:

```vue
<Dropdown
  :options="filterOptions.map((f) => ({ ...f, onClick: () => (selectedFilter = f) }))"
>
  <Button variant="subtle">
    <template #prefix><span class="lucide-filter size-4" /></template>
    {{ selectedFilter?.label || 'All' }}
    <template #suffix><span class="lucide-chevron-down size-4" /></template>
  </Button>
</Dropdown>
```

### Avatars and Badges

#### Avatar sizes

```vue
<!-- Small (list items) -->
<Avatar :label="user.name" :image="user.image" size="sm" />

<!-- Medium (default) -->
<Avatar :label="user.name" :image="user.image" />

<!-- Large (profile headers) -->
<Avatar :label="user.name" :image="user.image" size="lg" />

<!-- With status indicator -->
<div class="relative">
  <Avatar :label="user.name" :image="user.image" />
  <span class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
</div>
```

#### Badge variants

```vue
<!-- Status badges — color comes from `theme`, not `variant` -->
<Badge variant="subtle" theme="gray">Draft</Badge>
<Badge variant="subtle" theme="green">Active</Badge>
<Badge variant="subtle" theme="orange">Pending</Badge>
<Badge variant="subtle" theme="red">Overdue</Badge>

<!-- Count badges -->
<Badge variant="solid" theme="gray">42</Badge>
```

### Tabs

`Tabs` takes a `tabs` prop (`Tab[]`, required) — there is no `<Tab>` child
component. Each `Tab` is `{ label, icon?, route? }`. `v-model` is the
**0-based index** into `tabs`, not a name string. Customize the trigger with
`#tab-item` (scoped `{ tab, selected }`) and the panel content with
`#tab-panel` (scoped `{ tab }`, rendered once per tab in the array).

#### Basic tabs

```vue
<script setup>
import { ref } from 'vue'

const activeTab = ref(0)
const tabs = [
  { label: 'Details' },
  { label: 'Activity' },
  { label: 'Notes' },
]
</script>

<template>
  <Tabs v-model="activeTab" :tabs="tabs">
    <template #tab-panel="{ tab }">
      <DetailsPanel v-if="tab.label === 'Details'" :doc="doc" />
      <ActivityFeed v-else-if="tab.label === 'Activity'" :doctype="doctype" :name="doc.name" />
      <NotesList v-else :doctype="doctype" :name="doc.name" />
    </template>
  </Tabs>
</template>
```

#### Tabs with icons

```vue
<Tabs
  v-model="activeTab"
  :tabs="[
    { label: 'Overview', icon: 'lucide-layout-dashboard' },
    { label: 'Activity', icon: 'lucide-activity' },
    { label: 'Settings', icon: 'lucide-settings' },
  ]"
>
  <template #tab-panel="{ tab }">…</template>
</Tabs>
```

For a segmented-control look (not a panel switcher), use `TabButtons`
instead — `options` (`TabButton[]`: `{label?, value?, icon?, active?,
disabled?, route?, href?, onClick?}`), `modelValue`, `type` (`'subtle' |
'ghost' | 'underline' | 'browser-tab'`, default `'subtle'`), `size`,
`vertical`. It renders a button group, not tab panels, and carries no
`<Tab>`/`tabs`-panel semantics. `buttons` is a deprecated alias for
`options`.

### Tooltips

```vue
<!-- Basic tooltip -->
<Tooltip text="Click to edit">
  <Button variant="ghost" icon="lucide-pencil" />
</Tooltip>

<!-- Tooltip for truncated text -->
<Tooltip :text="fullText" :disabled="!isTruncated">
  <p class="truncate">{{ fullText }}</p>
</Tooltip>

<!-- Tooltip with HTML -->
<Tooltip>
  <template #content>
    <div class="text-sm">
      <p class="font-medium">{{ user.name }}</p>
      <p class="text-gray-400">{{ user.email }}</p>
    </div>
  </template>
  <Avatar :label="user.name" />
</Tooltip>
```

### Loading States

#### Skeleton components

```vue
<!-- Text skeleton -->
<Skeleton class="h-4 w-32" />

<!-- Multi-line -->
<div class="space-y-2">
  <Skeleton class="h-4 w-full" />
  <Skeleton class="h-4 w-3/4" />
</div>

<!-- Circle (avatar) -->
<Skeleton class="h-10 w-10 rounded-full" />

<!-- Card skeleton -->
<div class="border rounded-lg p-4 space-y-3">
  <Skeleton class="h-6 w-1/3" />
  <Skeleton class="h-4 w-full" />
  <Skeleton class="h-4 w-2/3" />
</div>
```

#### List skeleton

```vue
<template>
  <div v-if="loading" class="divide-y">
    <div v-for="i in pageSize" :key="i" class="flex items-center p-3 gap-3">
      <Skeleton class="h-10 w-10 rounded-full" />
      <div class="flex-1 space-y-2">
        <Skeleton class="h-4 w-1/3" />
        <Skeleton class="h-3 w-1/2" />
      </div>
      <Skeleton class="h-6 w-16 rounded" />
    </div>
  </div>
</template>
```

### Empty States

```vue
<template>
  <div class="flex flex-col items-center justify-center py-12 text-center">
    <div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
      <span class="size-8 text-ink-gray-4" :class="icon" />
    </div>
    <h3 class="font-medium text-gray-900 mb-1">{{ title }}</h3>
    <p class="text-sm text-gray-500 max-w-sm mb-4">{{ description }}</p>
    <Button v-if="action" variant="solid" @click="action.handler">
      <template #prefix><span class="lucide-plus size-4" /></template>
      {{ action.label }}
    </Button>
  </div>
</template>

<script setup>
defineProps({
  icon: { type: String, default: 'lucide-inbox' },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  action: { type: Object, default: null }
})
</script>
```

### Error States

```vue
<template>
  <div class="flex flex-col items-center justify-center py-12 text-center">
    <div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
      <span class="lucide-alert-triangle size-8 text-red-500" />
    </div>
    <h3 class="font-medium text-gray-900 mb-1">Something went wrong</h3>
    <p class="text-sm text-gray-500 max-w-sm mb-4">{{ error.message }}</p>
    <Button variant="subtle" @click="retry">
      <template #prefix><span class="lucide-refresh-cw size-4" /></template>
      Try Again
    </Button>
  </div>
</template>
```

## Sources

Verified against frappe-ui `1.0.0-beta.29` (`apps/frappe-ui/package.json`) —
`src/components/{Button,FormControl,Combobox,ListView,Dialog,Dropdown,Menu,Avatar,Badge,Tabs,TabButtons,Tooltip,Skeleton}/*.api.md`,
`.vue`, `types.ts`:

- `src/components/Button/Button.api.md` — no `ButtonGroup` export anywhere
  in `src/components/` or `src/index.ts`; `TabButtons` (`src/components/TabButtons/TabButtons.api.md`)
  is the only segmented-control primitive.
- `src/components/FormControl/{FormControl.api.md,types.ts}`, `src/components/types/TextInput.ts` — `type` union
  (no `type="link"`; `date`/`datetime` both valid).
- `src/components/Combobox/Combobox.api.md` — `label`, `options`, `update:query` emit.
- `src/components/ListView/{ListView.api.md,ListView.vue,ListRow.vue,utils.js}`,
  `src/components/ListView/stories/CellSlot.vue` — `rowKey` is required; `#cell` scope is
  `{ item, row, column, align }` (threaded via `list.slots.cell`, not declared in `ListView`'s own
  `defineSlots` so it doesn't appear in the auto-generated `.api.md`); column `width` accepts a
  number (`fr` fraction) or a CSS-length string.
- `src/utils/dialog.ts` — `dialog.confirm`/`dialog.danger`/`dialog.prompt` namespace, `onConfirm`
  resolve/throw semantics, `danger()` theme/label defaults.
- `src/components/Dialog/Dialog.api.md` — `open`/`modelValue`, `size`, `bare`, deprecated `options`/`#body-content`.
- `src/components/Provider/FrappeUIProvider.vue`, `src/components/Dialogs.vue`, `src/index.ts` exports.
- `src/components/Dropdown/{Dropdown.api.md,types.ts}`, `src/components/Menu/types.ts` — no
  `modelValue`/`v-model`; options are `MenuActionOption` rows with `onClick`/`theme`.
- `src/components/Avatar/Avatar.api.md`, `src/components/Badge/Badge.api.md` — Badge color comes
  from `theme`, not `variant` (`variant` is `"subtle" | "outline" | "solid" | "ghost"`).
- `src/components/Tabs/{Tabs.api.md,Tabs.vue}` — `v-model` binds `TabsTrigger`/`TabsContent`
  `:value="i"` (the loop index), confirming it is 0-based, not a label string.
- `src/components/Tooltip/Tooltip.api.md`, `src/components/Skeleton/Skeleton.api.md`.
- `src/utils/iconString.ts` — `lucide-*` vs. legacy feather-name fallback and dev warning.
