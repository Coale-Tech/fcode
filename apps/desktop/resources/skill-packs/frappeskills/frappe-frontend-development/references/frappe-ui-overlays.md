
# Frappe UI — Overlays

Adapted in part from frappe/frappe-ui (MIT): `spec/dialog.md`, `spec/toast.md`, `spec/dropdown.md`, `spec/popover.md`, `spec/hover-card.md`, `spec/imperative-api.md`.

Dialog, Toast, Dropdown, ContextMenu, Popover, and HoverCard — split out of
[frappe-ui-core-components.md](frappe-ui-core-components.md) to keep both
files under the line cap. See that file for Icons/Buttons/Badges/etc., and
[frappe-ui-components.md](frappe-ui-components.md) for the full file index.

Verified against frappe-ui `1.0.0-beta.29`
(`src/components/**/*.api.md`, `spec/*.md`); claims that differ from the
`0.1.261` baseline are tagged `(v1)`.

## Dialog

`src/components/Dialog/Dialog.vue`. One `<Dialog>` component for everything —
forms, confirms, alerts, full-screen settings; no separate `AlertDialog`
(`spec/dialog.md`, ADR-0001).

```vue
<Dialog v-model:open="show" title="Create New" size="md"
  :actions="[
    { label: 'Cancel', variant: 'outline' },
    { label: 'Save', variant: 'solid', theme: 'blue',
      onClick: ({ close }) => save().then(close) },
  ]">
  <FormControl v-model="name" label="Name" />
</Dialog>
```

Props: `open` / `modelValue` (both control visibility; `v-model:open` is
canonical, `v-model` also works — if both are bound `open` wins), `title`,
`message`, `icon` (`string | DialogIcon`), `size` (`DialogSize`, `'xs'`
through `'7xl'`, default `'lg'`), `position` (`'center'|'top'`, default
`'center'`), `paddingTop` (string/number escape hatch), `actions`
(`DialogAction[]`), `dismissible` (boolean, default `true` — outside-click +
Escape), `showCloseButton` (boolean, default `true`), `bare` (boolean,
default `false` — drops the padded card, auto-header, and auto-actions;
`#default` fills the shell directly). Deprecated: `disableOutsideClickToClose`
(use `dismissible`, inverted) and the whole `options` blob (flat props win
when both are set).

Slots: `default` (`{ close }`), `title` (`{ close }`), `actions`
(`{ close, actions }` — `actions` is the reactive list with per-button
`loading`, so a custom layout can still use the built-in buttons). Deprecated
slots, all forwarded with a one-time warning: `body`/`body-main` →
`#default`+`bare`/`#default`, `body-header` → no replacement, `body-title` →
`#title`, `body-content` → `#default`. Emits: `update:modelValue`,
`update:open`, `close`, `after-leave`.

**(v1)** `0.1.261`'s `DialogProps` is only `{ modelValue: boolean
(required); options?: DialogOptions; disableOutsideClickToClose?: boolean }`
— no flat `title`/`size`/`actions`/`bare`/`dismissible`/`showCloseButton`
props; everything went through the `options` object (`{ title, message, size,
icon, actions, position, paddingTop }`).

## Imperative dialogs — `dialog.confirm` / `dialog.danger` / `dialog.prompt`

**(v1)** — no equivalent in `0.1.261` (which only ships the `<ConfirmDialog>`
SFC, now deprecated). Source: `src/utils/dialog.ts`. Mount
`<FrappeUIProvider>` once (it renders `<Dialogs />`); apps not using the
provider can mount `<Dialogs />` directly.

```ts
import { dialog } from 'frappe-ui'

dialog.confirm({
  title: 'Archive this record?',
  theme: 'blue',
  onConfirm: async ({ close }) => { await archive(); close() },
})

dialog.danger({
  title: 'Delete customer?',
  message: 'This cannot be undone.',
  onConfirm: async () => { await api.delete() }, // resolving auto-closes
})

const handle = dialog.prompt({
  title: 'Rename',
  fields: [{ name: 'title', label: 'Title', required: true }],
  onConfirm: async ({ values, close }) => { await rename(values.title); close() },
})
```

- `dialog.confirm(args: ConfirmArgs): DialogHandle` — `ConfirmArgs`:
  `title?`, `message?`, `confirmLabel?` (default `'Confirm'`), `cancelLabel?`
  (default `'Cancel'`), `theme?: DialogTheme` (colors the confirm button +
  picks the default icon), `icon?`, `size?` (default `'md'`), `dismissible?`
  (default `true`), `onConfirm?: (ctx: DialogControl) => void | Promise<void>`,
  `onCancel?: () => void | Promise<void>`, `actions?: DialogAction[]`
  (overrides the confirm+cancel pair; `confirmLabel`/`cancelLabel`/`onConfirm`
  are then ignored). `DialogControl` = `{ close(), setError(message) }`.
- `dialog.danger(args: DangerArgs): DialogHandle` — `DangerArgs` = `ConfirmArgs`
  minus `theme`/`icon`; forces `theme: 'red'`, icon
  `lucide-alert-triangle`, and defaults `confirmLabel` to `'Delete'`.
- `dialog.prompt(args: PromptArgs): DialogHandle` — `PromptArgs`: `title?`,
  `message?`, `fields: PromptField[]`, `confirmLabel?` (default `'Submit'`),
  `cancelLabel?`, `theme?`, `icon?`, `size?` (default `'md'`), `dismissible?`
  (default `true`), `onConfirm: (ctx: PromptControl) => void | Promise<void>`
  (**required**), `onCancel?`. `PromptControl` extends `DialogControl` with
  `values: Record<string, any>`. `PromptField` is a discriminated union on
  `type`: `'text'|'textarea'` (default), `'select'` (+ `options:
  {label,value}[]`), `'checkbox'`, or `'combobox'` (+ `options:
  ComboboxOption[]`, `allowCreate?`); shared fields `name` (required),
  `label?`, `placeholder?`, `required?`, `description?`, `validate?:
  (value, allValues) => string | null | undefined | Promise<...>` (runs after
  the built-in `required` check).

Lifecycle: `onConfirm` resolving auto-closes the dialog; throwing keeps it
open and renders the thrown message inline via `setError` (Frappe
`messages[]` / `Error.message` / string, extracted automatically), with the
button re-enabling. Calling `ctx.setError(msg)` without throwing does **not**
prevent auto-close. `onCancel` fires on Cancel click, Escape, outside-click,
or the close button. Each helper returns a synchronous `DialogHandle =
{ close(): void }` for programmatic dismissal (`spec/dialog.md`).

## Toast

`src/components/Toast/toast.ts`. v1 vendors
[`vue-sonner`](https://vue-sonner.vercel.app/) and re-exports its `toast`
namespace **with sonner's API surface unchanged** (`spec/toast.md`); the
standalone `<Toast>` SFC still exists but is deprecated (use the imperative
API). Mount `<FrappeUIProvider>` (or `<ToastProvider />` directly) once.

```ts
import { toast } from 'frappe-ui'

toast.success('Saved')
toast.error(err.messages?.[0] ?? 'Failed')
toast.warning('Session expiring')
toast.info('FYI')
toast.loading('Pasting…')            // persistent, spinner icon
toast.custom(MyComponent, { duration: 4000 })
toast.promise(saveDoc(), {
  loading: 'Saving…',
  success: (doc) => `Saved ${doc.name}`,
  error: (err) => err.messages?.[0] ?? 'Failed',
})
toast.dismiss(id)                     // dismiss one, or all if id omitted
```

Every creator returns a `string | number` id synchronously; reusing that id
on a later call updates the same toast in place (the loading → success
pattern above). Bare `toast(message, options?)` and legacy
`toast({ title, text, icon, iconClasses })` object calls both still work —
the legacy shape is detected and mapped internally. For the full option
surface (`ExternalToast`, actions, `id`, `duration`, …) see vue-sonner's own
docs; frappe-ui does not re-document them. Provider defaults:
`position: 'bottom-right'`, `duration: 5000`, `closeButton: true`.

**(v1) breaking migration notes** — `0.1.261`'s toast was reka-based with a
different surface:
- **Duration flips from seconds to milliseconds** — `toast.success('Saved',
  { duration: 5 })` was 5 seconds in `0.1.261`; in v1 it is 5 *milliseconds*
  (use `{ duration: 5000 }`). Only the legacy call shapes still take seconds:
  `toast.create({ duration })` and `toast({ title, text, duration|timeout })`
  are converted by `toMs()` (seconds x 1000, `0` = persistent) and warn.
- `toast.create({ message, ... })` → `toast(message, { ... })`.
- `toast.remove(id)` → `toast.dismiss(id)`; `toast.removeAll()` →
  `toast.dismiss()`.
- `<Toasts />` → wrap with `<FrappeUIProvider>` or mount `<ToastProvider />`.
- `toast.promise`'s `successDuration`/`errorDuration`/`successAction`/
  `errorAction` extensions are dropped (not part of sonner's `toast.promise`).

The `Toast` component itself (`src/components/Toast/Toast.vue`) props are
unchanged across versions: `open` (boolean, required), `message` (string),
`type` (`"error"|"success"|"info"|"warning"`), `duration` (number, ms),
`icon` (Component), `closable` (boolean), `action` (`{ label, altText?,
onClick }`). Emits `update:open`, `action`.

## Dropdown

`src/components/Dropdown/Dropdown.vue`. The action-menu component — simple
and grouped actions, submenus, switch rows, route-based actions
(`spec/dropdown.md`). Composes `ItemListRow` for row presentation. For
choosing a form/picker value use `Select`/`Combobox` instead; `Dropdown`
should not become a generic `Select` replacement.

```vue
<Dropdown :options="[
  { group: 'Actions', options: [
    { label: 'Edit', icon: 'lucide-pen', onClick: () => edit() },
    { label: 'Delete', icon: 'lucide-trash-2', theme: 'red', onClick: () => remove() },
  ]},
]">
  <Button variant="ghost" icon="lucide-more-horizontal" />
</Dropdown>
```

Props: `button` (`ButtonProps`, used only when no trigger slot/child is
given), `options` (`DropdownOptions`, default `[]`), `open` (boolean, default
`false`, `v-model:open`), `side` (`PopoverSide`, default `'bottom'`), `align`
(`PopoverAlign`, default `'start'`), `offset` (number px, default `4`),
`portalTo` (string/element, default `'body'`), `emptyText` (string, default
`'No options'`). Deprecated `placement`
(`'left'|'center'|'right'`) silently maps to `align` unless `align` is also
bound (then `align` wins + a dev warning). No `select` event — action
handling stays item-owned via `route`/`onClick`. Emits: `update:open`.

Slots: `trigger`/default (`{ open, close, disabled }`), `item-prefix` /
`item-label` / `item-suffix` (`{ item, close, selected }`, apply at every
depth), `item` (full-row escape hatch, leaf rows only), `item-<name>`
(dynamic label slot via `item.slot`), `group-label` (`{ group }`), `empty`.

Option shape — a flat action `{ label, icon?, route?, onClick?, description?,
selected?, disabled?, theme?: 'gray'|'red', condition?, slot?, slots? }`; a
switch row adds `switch: true, switchValue?, onClick?: (value: boolean) =>
void`; a submenu row adds `submenu: DropdownOptions`; groups are `{ group,
options, hideLabel?, theme? }` — extra app fields pass through unchanged to
slot props. `condition()` (if present) is evaluated before render; hidden
items/empty groups are omitted, falling back to the `empty` slot per level.

**(v1)** `0.1.261`'s `DropdownProps` is only `{ button?, options?, placement?:
string, side?, offset? }` — no `open`/`align`/`portalTo`/`emptyText`, and
group entries use `{ group, items }` (v1 still accepts `items` as a
deprecated alias for `options`; if both are given, `options` wins with a
warning).

## ContextMenu

`src/components/ContextMenu/ContextMenu.vue` — **(v1)**, not in `0.1.261`.
Right-click menu sharing the same `Menu` option shape as `Dropdown`
(`MenuOptions`/`MenuOption`/`MenuGroupOption`, exported as
`ContextMenu*` type aliases). Props: `options` (`MenuOptions`, default `[]`),
`open` (boolean, default `false`). Slots: `default`/`trigger` — the
right-clickable trigger region, scoped `{ open }`. Emits: `update:open`.

```vue
<ContextMenu :options="[{ label: 'Copy', icon: 'lucide-copy', onClick: copy }]">
  <div class="p-4">Right-click me</div>
</ContextMenu>
```

## Popover

`src/components/Popover/Popover.vue`. The unstyled-by-default floating
panel — trigger + portaled positioned content. Escape hatch for filters,
color pickers, and custom anchored chrome; not for menus (`Dropdown`) or
hover-revealed info (`HoverCard`) (`spec/popover.md`).

Props: `open` (boolean, default `false`, `v-model:open`), `side`
(`PopoverSide`, default `'bottom'`), `align` (`PopoverAlign`, default
`'start'`), `offset` (number, default `4`), `portalTo` (default `'body'`),
`collisionPadding` (number, default `10`), `dismissible` (boolean, default
`true`), `matchTriggerWidth` (boolean, default `false`), `bare` (boolean,
default `false` — renders `#default` with no panel shell), `arrow`
(boolean, default `false`). Emits: `update:open`, plus behavior aliases
`open`/`close`. Exposed via template ref: `{ open(), close() }` only.

Slots: `trigger` (`{ open, close }`, rendered via reka `PopoverTrigger`
as-child — do not hand-wire `@click`), `default` (`{ open, close }`, panel
content). Deprecated, still working through `v1.x` with a one-time warning:
`show`/`v-model:show` → `open`; `placement="bottom-start"` → `side="bottom"`
+ `align="start"`; `hideOnBlur` → `dismissible`; `matchTargetWidth` →
`matchTriggerWidth`; `trigger="hover"` (+ `hoverDelay`/`leaveDelay`) → use
`HoverCard`; `#target` → `#trigger` (old manual-wiring contract preserved);
`#body`/`#body-main` → `#default`(+`bare`)/`#default`.

```vue
<Popover>
  <template #trigger="{ open }"><Button icon="lucide-filter" /></template>
  <template #default="{ close }"><FilterBuilder @apply="close" /></template>
</Popover>
```

**(v1)** `0.1.261`'s `PopoverProps` is `{ show?, trigger?: 'click'|'hover',
hoverDelay?, leaveDelay?, placement?: <12 dash-joined values>, popoverClass?,
transition?, hideOnBlur?, matchTargetWidth?, offset? }` — no
`open`/`side`/`align`/`dismissible`/`matchTriggerWidth`/`bare`/`arrow`/
`collisionPadding`/`portalTo`; slots were `#target`/`#body`.

## HoverCard

`src/components/HoverCard/HoverCard.vue` — **(v1)**, not in `0.1.261` (its
predecessor is `Popover trigger="hover"`, still supported there as a
deprecated alias). Non-interactive-to-open, sighted-pointer-only preview card
(author cards, link previews) — never the only path to information, since
touch and keyboard-only users cannot reliably open it (`spec/hover-card.md`).

Props: `open` (boolean, default `false`, `v-model:open`), `side` (default
`'bottom'`), `align` (default `'start'`), `offset` (default `4`),
`collisionPadding` (default `10`), `portalTo` (default `'body'`),
`hoverDelay` (seconds, default `0.5`), `leaveDelay` (seconds, default `0.3`),
`arrow` (boolean). No `dismissible` or `matchTriggerWidth` — hover cards
close on pointer-leave and don't size to the trigger. Emits: `update:open`.
Slots: `trigger` (`{ open, close }`, required, via reka `HoverCardTrigger`
as-child), `default` (`{ open, close }`). Exposed: `{ open(), close() }`.

```vue
<HoverCard side="top" align="start">
  <template #trigger><a href="/u/jane" class="underline">Jane Doe</a></template>
  <template #default>
    <Avatar :image="jane.image" :label="jane.name" />
    <div>{{ jane.bio }}</div>
  </template>
</HoverCard>
```

## Sources

- `src/components/{Dialog,Toast,Dropdown,ContextMenu,Popover,HoverCard}/*.api.md`, `.vue`, `types.ts`.
- `src/utils/dialog.ts`, `src/components/Toast/toast.ts`, `src/components/Toast/types.ts`.
- `spec/{dialog,toast,dropdown,popover,hover-card,imperative-api}.md`.
- `apps/crm/frontend/node_modules/frappe-ui/` (v0.1.261) — `src/components/{Dialog,Dropdown,Popover,Toast}/types.ts` for version-gating.
