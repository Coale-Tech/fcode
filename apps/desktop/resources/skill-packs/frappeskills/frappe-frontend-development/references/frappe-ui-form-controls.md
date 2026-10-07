# Frappe UI — Form Controls

Every input, picker, and file-upload component in frappe-ui **1.0.0-beta.29**
(v1). Check `frontend/package.json` for the frappe-ui version actually
pinned in your app before relying on anything tagged `(v1)` below — apps on
`0.1.x` do not have it. Where the current baseline (`0.1.261`) has an
equivalent, it is named inline.

Source of truth for exact prop/emit/slot names, types, and defaults is each
component's generated `<Component>.api.md` next to its `.vue` file
(`src/components/<Component>/<Component>.api.md`) — this page organizes and
cross-references that data, it doesn't replace it.

## Shared labeling contract `(v1)`

Every control below except the selection family's low-level slots and
`ErrorMessage` accepts the same four labeling props
(`src/composables/useInputLabeling.ts`, `spec/inputs.md`):

| Prop | Type | Effect |
| --- | --- | --- |
| `label` | `string` | Rendered above the control (stack layout) or beside it (inline-row layout). |
| `description` | `string` | Helper text below the control. Hidden automatically when `error` is set. |
| `error` | `string \| Error` (with `messages?: string[]`) | Renders below the control in `text-ink-red-6`, plain text (never `v-html`). An `Error` renders `messages` as stacked lines, falling back to `message`. Sets `aria-invalid="true"` and `data-state="invalid"`. |
| `required` | `boolean` | Renders a red asterisk + `sr-only` "(required)" after the label, forwards `required`/`aria-required`. |
| `id` | `string` | Overrides the auto-generated id (`useId()`). |

Layout is automatic per component, not a prop:

- **Stack** (label above): `TextInput`, `Textarea`, `Password`, `Rating`, `Slider`, the selection family, the date/time pickers, `Duration`, `Link`.
- **Inline row** (label beside the control, description/error indented below the row): `Checkbox`, `Switch`.

Slots: `#label` receives `{ required }` and overrides the label region;
`#description` overrides the description region. There is no `#error` slot —
apps needing richer error UI render it as a sibling; the `error` prop stays
the wiring source for `aria-invalid`/`aria-errormessage`.

`id` is shared between `<label for>` and the control. `description` renders
with `id="${id}-description"`, `error` with `id="${id}-error"`; both are
joined into the control's `aria-describedby` (error id also becomes
`aria-errormessage`).

### `data-*` styling hooks `(v1)`

Every input shell spreads these onto its root/control element
(`useInputLabeling` returns `dataAttrs`; `data-slot` is set per-element in
each component's template):

| Attribute | Values |
| --- | --- |
| `data-slot` | `"label"` \| `"control"` \| `"description"` \| `"error"` (per element, not on `dataAttrs`) |
| `data-size` | current `size` |
| `data-variant` | current `variant`, where the component has one |
| `data-state` | `"valid"` \| `"invalid"` \| `"checked"` \| `"unchecked"`, component-dependent |
| `data-disabled` | `"true"` when disabled, absent otherwise |
| `data-required` | `"true"` when required, absent otherwise |

### Size and variant scales

| Type | Values | Applies to |
| --- | --- | --- |
| `InputSize` | `sm \| md \| lg \| xl` | `TextInput`, `Textarea`, `Password`, `Rating`, the selection family, date/time pickers, `Duration` |
| `ToggleSize` | `sm \| md` | `Checkbox`, `Switch`, `Slider` |
| `InputVariant` | `subtle \| outline \| ghost` | `TextInput`, `Textarea`, `Password`, the selection family, date/time pickers (`ghost` not on `TimePicker`, whose `Variant` is `subtle \| outline` only) |

`lg`/`xl` are dropped for binary/range controls — they'd produce oversized
toggle affordances (`spec/inputs.md`).

## Text-style inputs

### TextInput (`src/components/TextInput/`)

`v-model` (string/number) via `defineModel`. Props beyond the labeling
contract: `type: TextInputTypes` (`text\|email\|number\|password\|search\|tel\|url\|date\|datetime-local\|month\|time\|week\|range\|file`, default `"text"`), `size`, `variant` (default `"subtle"`), `placeholder`, `disabled`, `debounce` (ms). Slots: `#prefix`, `#suffix` plus the shared `#label`/`#description`. One emit: `update:modelValue`.

### Textarea

`v-model: string`. Props: `size`, `variant` (`subtle\|outline\|ghost` — `ghost` added in v1 to match `TextInput`/`Password`), `placeholder`, `disabled`, `debounce`, `rows` (default `3`), plus the labeling contract (`required` added in v1). No `#prefix`/`#suffix` slots.

### Password

`v-model: string` via `defineModel` `(v1)` — fixes a real bug where
`0.1.261`'s `<Password v-model>` doesn't update from typing (0.1.261 has no
`defineModel`, only a `value` prop). Props: `size`, `variant`, `placeholder`,
`disabled`, plus the labeling contract; `#prefix` slot. `value: string | null`
remains as a **deprecated** alias (`Password.value` → `v-model`).

## Binary and range controls

### Checkbox

`v-model: boolean | 0 | 1` (union kept for v1 backwards compatibility with
callers passing `1`/`0`; treat `boolean` as canonical). Props: `size:
ToggleSize`, `disabled`, `indeterminate` (visual mixed "—" state — the DOM
`indeterminate` property isn't reflected as an attribute, so it must be set
via this prop), plus the labeling contract (inline-row layout). `padding:
boolean` is **deprecated** → `data-*` hooks (0 real call sites found in the
usage audit backing `spec/inputs.md`). Emit: `update:modelValue: [boolean]`.

### Switch

`v-model: boolean` (`defineModel`, default `false`). Props: `size:
ToggleSize`, `disabled`, `icon: string | Component` (a `lucide-*` string
routes through the shared Lucide Tailwind utility; no longer imports
`FeatherIcon`), plus the labeling contract (inline-row layout).
`labelClasses: string` is **deprecated** → `data-*` hooks. Binding `@change`
still fires (mirrored off the `v-model` watcher) but is **deprecated** →
`update:modelValue`/`v-model` (`src/components/Switch/Switch.vue`).

### Rating

`v-model: number` (0..`max`, in `step` increments). Props: `max: number`
(default `5`), `step: 1 | 0.5` (half-star granularity, default `1`), `icon:
string | Component` (default a filled `lucide-star`, receives
`fill="currentColor"`), `size: InputSize` (default `"md"`), `disabled`, plus
labeling. `rating_from` is a **deprecated** alias for `max`. `readonly` is a
**deprecated** alias for `disabled`. Slot `#icon` receives
`RatingIconSlotProps` and is stamped into both half-star spans for `step:
0.5` clipping.

### Slider `(v1 — new component, not in 0.1.261)`

`v-model: SliderValue` (`SliderValue = number[]` — one entry for a single
thumb, two (`[from, to]`) for a range). Props: `step` (default `1`), `max`
(default `100`), `min` (default `0`; negative values enable bidirectional
fill from zero), `size: ToggleSize` (default `"sm"`), `disabled`, plus
labeling. Emits `update:modelValue` and `value-commit: [SliderValue]` — the
latter fires once when dragging ends, for side effects you don't want on
every intermediate step. No hardcoded `aria-label` (a prior "Volume" default
was a bug); pass `label` explicitly (`src/components/Slider/types.ts`).

### ErrorMessage

Standalone, for contexts with no input to attach `error` to (e.g. a
form-level banner): `<ErrorMessage :message="err" />`. Prop: `message: string
| Error`. Uses `v-html` internally (kept as-is for v1 — not part of the
inline `error` prop's plain-text contract on the controls above).

## Selection family — Select / Combobox / MultiSelect

Full contract: `spec/selection.md`. Full prop/emit/slot lists (generated,
authoritative): `Select.api.md`, `Combobox.api.md`, `MultiSelect.api.md`.

| Use | When |
| --- | --- |
| `Select` | Short, fixed list. No search. One value. |
| `Combobox` | Long or server-backed list. One value. |
| `MultiSelect` | Same as `Combobox`, several values. |

### Option shape

```ts
{
  label: string
  value: string | number      // '' is a real value ("None"/"Any"), not "nothing"
  disabled?: boolean
  icon?: string | Component   // 'lucide-<name>' string, written out in full (not template-built)
  description?: string
  slot?: string                // routes this row to an #item-<name> template slot
  slots?: { prefix?, label?, suffix?, item? }  // Combobox/MultiSelect only
}
```

`Select` takes a flat array only — a `{ group, options }` entry has no
`value` and is dropped. `Combobox`/`MultiSelect` accept groups: `{ group,
options, key?, hideLabel? }`. `Combobox` additionally accepts an action row:
`{ type: 'custom', key, label, onClick, condition?, keepOpen? }`; both
`onClick` and `condition` receive `{ query }` (0.1.261's equivalent shape was
`{ searchTerm }` on a `CustomOption`, no `condition`/`keepOpen`).

### `v-model` vocabulary

- `v-model` — the selected value. Unselected: `undefined` (`Select`), `null` (`Combobox`), `[]` (`MultiSelect`).
- `v-model:open` — popover visibility.
- `v-model:query` `(v1 — not on 0.1.261 Combobox/MultiSelect)` — the search text. Unbound, the query clears every popover open; bound, the component never resets it (not on open/close/mount/`clear()`).

A template ref gives `{ clear, focus }`. Trigger/footer slots hand you
`setOpen(boolean)` and `clear()` since slot content has no reference to
parent-owned state.

### Popover positioning `(v1 vocabulary)`

| Prop | Default | Meaning |
| --- | --- | --- |
| `side` | `'bottom'` | Which side of the trigger. |
| `align` | `'start'` | Alignment along that side. |
| `offset` | `4` | Gap in px. |
| `portalTo` | `'body'` | Teleport target. |

`Select` defaults to item-aligned placement (anchored over the trigger,
macOS-style) until `side`/`align`/`offset` is set explicitly, which switches
it to ordinary below-trigger placement.

### Component differences

| | `Select` | `Combobox` | `MultiSelect` |
| --- | --- | --- | --- |
| Grouped options | no | yes | yes |
| Search | no | yes (from trigger, or popover in `trigger="button"` mode) | yes (popover only) |
| `v-model:query` | — | yes | yes |
| `loading` | no | yes | yes |
| `filterable` | — | yes (default `true`; set `false` for server-filtered results) | yes |
| `hideSearch` | — | button mode only | yes |
| `#summary` | no | no | yes |
| Selected-option emit | — | `update:selectedOption` | `update:selectedOptions` |
| Extra props | — | `trigger: 'input'\|'button'` (default `'input'`), `openOnFocus` (default `false`), `openOnClick` (default `true`) | — |
| Extra slot props | — | `displayValue` | `selectAll` in `#footer` |

`emptyText` defaults to `"No options"` on `Select`, `"No results"` on the
other two; `#empty` overrides it (receives `{ query }` on the searchable
two). `Combobox`'s two trigger modes are meaningfully different: in
`trigger="input"` (default) the trigger *is* the search input and doubles as
the value display; `trigger="button"` renders a button trigger with the
search box moved into the popover header. `Combobox` has no
`allowCustomValue` — it was removed before `1.0.0`; build free-form
acceptance from a `type: 'custom'` row whose `onClick` writes the typed query
to the model.

### Customizing rows and trigger

`#trigger` replaces the whole trigger; `#prefix`/`#suffix` fill the space
around the value while keeping the standard trigger (`#suffix` replaces the
default chevron). `#item-prefix`/`#item-label`/`#item-suffix` fill one region
across every row; `#item` replaces the entire row. Precedence per region: an
option's `slot` match beats a template slot, which beats an option's `slots`
function, which beats the default. `#group-label` receives `{ group }`.
`#footer` pins below the list and receives the trigger-slot shape (+
`selectAll` on `MultiSelect`).

`Select`'s `#item-prefix`/`#item-label`/`#item-suffix` scoped slots now expose
`item` `(v1)` (0.1.261 had no such slots at all, so there is nothing to
compare against there — `Select.api.md` documents `item` as canonical; the
legacy `#option` slot still passes `{ option }` unchanged as a silent alias).

### Styling hooks

Every part carries `data-slot`: `trigger`, `chevron`, `content`,
`content-body`, `search`, `input`, `group`, `group-label`, `item`,
`item-list-row`, `item-prefix`, `item-label`, `item-suffix`, `loading`,
`empty`, `footer`. `Combobox`/`MultiSelect` popovers also carry bare
(always-empty) `data-selection` and `data-loading` attributes.

## Date and time pickers

Full prop/emit/slot lists: `DatePicker.api.md` (covers `DatePicker`,
`DateRangePicker`, `DateTimePicker` in one file), `TimePicker.api.md`.

### Shared v1 popover-trigger vocabulary

`DatePicker`, `DateRangePicker`, `DateTimePicker`, and `TimePicker` all share:

| Prop | Default | Replaces (0.1.261) |
| --- | --- | --- |
| `side` / `align` / `offset` `(v1)` | `'bottom'` / `'start'` / `4` | `placement` (a combined string like `'bottom-start'`) — kept as a **deprecated** alias |
| `keepOpen` `(v1)` | `false` | `autoClose` (inverse: `autoClose: false` → `keepOpen: true`) — **deprecated** |
| `typeable` `(v1)` | `true` | picker-level `readonly` and `allowCustom` (both **deprecated**; `:typeable="false"` blocks typing while the popover stays interactive) |
| `openOnFocus` / `openOnClick` `(v1)` | `false` / `true` | — (new; same defaults on `Combobox`) |
| `min` / `max` `(v1)` | — | `TimePicker.minTime`/`maxTime` and `DateTimePicker.minDateTime`/`maxDateTime` — **deprecated** aliases |
| `isDateUnavailable` `(v1)` | — | `(date: Dayjs) => boolean`, composes with `min`/`max` |
| `#trigger` `(v1 name)` | — | `#target` — kept as a **deprecated**, silent-through-v1.x alias |
| `v-model:open` `(v1)` | — | — (new on all four) |

`min`/`max` accept `YYYY-MM-DD` (`YYYY-MM-DD HH:mm:ss` for `DateTimePicker`
second-level granularity); `TimePicker`'s are `HH:mm[:ss]`. `inputClass` is
**deprecated** → apply `class` to the component element directly. The `value`
prop (uncontrolled initial value) on every picker is **deprecated** →
`v-model`/`modelValue`.

The popover footer (including the auto-rendered Clear button) was removed;
a `#actions` slot renders a **left sidebar** instead, with `close`,
`setDate`/`setRange`/`clear` in its scope. `DateRangePicker.setRange([from,
to])` commits both endpoints atomically for fixed-window presets.

Full keyboard nav follows the WAI-ARIA APG Date Picker Dialog pattern:
arrows move by day/week, `Home`/`End` to week edges, `PageUp`/`PageDown` ±1
month, `Shift+PageUp/PageDown` ±1 year, `Enter`/`Space` selects, `Esc` closes.

### DatePicker

`v-model: string` (`YYYY-MM-DD`). `format` sets the display format.
`placeholder` defaults `"Select date"`. Emits `update:modelValue: [string]`,
`change: [string]` (after commit), `update:open`.

### DateRangePicker

`v-model: string[]` — `DateRangeValue = [string, string] | []`
(`src/components/DatePicker/types.ts`). `dualPane` renders two calendar
panels side by side. `placeholder` defaults `"Select range"`. **Breaking
change from 0.1.261**: `update:modelValue`/`change` now emit the `[from,
to]` tuple directly — 0.1.261 emitted a comma-joined string
(`v.split(',')` to destructure it there); the `modelValue` prop already
accepted `string[]` on both versions, so only the emitted shape changed.
`clearable` now defaults `true`.

### DateTimePicker

`v-model: string` (`YYYY-MM-DD HH:mm:ss`). `allowCustomTime` (default
`true`) gates typing into the embedded `TimePicker`. Selecting a date no
longer auto-closes the popover — focus moves into the time picker for a
continuous date → time flow; the popover closes on `Esc`, click-outside, or
programmatic `close()` (**breaking change from 0.1.261**, which auto-closed
on date pick). `placeholder` defaults `"Select date & time"`.

### TimePicker

`v-model: string`, canonical `HH:mm` (or `HH:mm:ss`). Props: `interval`
(minute step for the generated grid, default `15`), `options` (caller
values bypass the generated grid), `format` (dayjs format string, default
`"HH:mm"` — replaces the **deprecated** `use12Hour` boolean),
`variant: 'subtle' | 'outline'` (no `ghost`), plus the shared vocabulary
above. Flexible typed input parses `"3pm"`, `"3.30pm"`, `"1500"`, `"9:30:15
am"` to canonical `HH:mm[:ss]`. `scrollMode` is **deprecated** (list is
always centered now). Emits: `update:modelValue`, `change`, `update:open`,
`open`, `close`, `input-invalid: [string]`, `invalid-change: [boolean]`.

### Duration `(v1 — new component, not in 0.1.261)`

`v-model: number | null` — a duration in **seconds**
(`src/components/Duration/Duration.api.md`). Props: `placeholder` (default
`"1h 30m 45s"`), `format: DurationFormat` — a named preset (`short | long |
colon`) or a token template (e.g. `"h'h' m'm' s's'"`, `"hh:mm:ss"`), default
`"short"` — `size`, `variant`, `disabled`, plus labeling. One emit,
`update:modelValue`.

## FileUploader

Props (`FileUploader.api.md`, `src/components/FileUploader/types.ts`):
`fileTypes: string | string[]`, `uploadArgs: UploadOptions` (forwarded to
Frappe's upload endpoint — `private`/`is_private` override the component's
`private: true` default; uploads are private unless you explicitly opt
out), `validateFile: (file: File) => string | Error | null | undefined |
void | Promise<...>` (return a message/Error to block the upload). Single
file only — there is no `multiple` prop.

Default slot receives `FileUploaderSlotProps`: `file`, `uploading`,
`progress` (0-100), `uploaded`, `total`, `message`, `error`, `success`,
`openFileSelector()`. With no slot content, it renders a `Button` reading
"Upload File" / "Uploading N%".

`success: [data]` and `failure: [error]` emits exist but are tagged
`@deprecated` in `FileUploaderEmits` ("kept for compatibility through
v1.x") — prefer the slot's `success`/`error` state, or the standalone
`useFileUpload()` composable for a fully controlled upload flow outside the
component.

`useFileUpload()` (`src/utils/useFileUpload.ts`) returns `{ upload(file,
options), reset, state, isUploading, progress, error, result }`, where
`upload` resolves to an `UploadedFile` (`file_name`, `file_size`,
`file_url`, `name`, `is_private`, `file_type`, …). `FileUploadHandler`
(`src/utils/fileUploadHandler.ts`) is the lower-level event-emitter
(`start`/`progress`/`finish`/`error`) `FileUploader.vue` itself is built on;
reach for `useFileUpload` in new code rather than instantiating it directly.

## FormControl — type-routing dispatcher

`FormControl` forwards `label`/`description`/`error`/`required`/`size`/
`variant` plus all remaining attrs/listeners to the component its `type`
resolves to (`src/components/FormControl/FormControl.vue`). It stays a
router for v1 — a usage audit found 185 call sites across nine app
frontends, all router-style, none using it as a slot-based wrapper
(`spec/inputs.md`).

| `type` | Renders | Notes |
| --- | --- | --- |
| `"text"` (default) or any other `TextInputTypes` value | `TextInput` | `type` forwards straight through as the HTML input type. |
| `"textarea"` | `Textarea` | |
| `"checkbox"` | `Checkbox` | |
| `"select"` | `Select` | full width (`fillWidth`) |
| `"combobox"` | `Combobox` | full width |
| `"multiselect"` `(v1)` | `MultiSelect` | full width. 0.1.261 falls through to `TextInput`. |
| `"date"` `(v1)` | `DatePicker` | full width. Shadows the native `TextInputTypes` `'date'` value — `FormControl type="date"` always renders the picker, never a bare `<input type="date">`. 0.1.261 has no picker routing: it renders a native `<input type="date">` via `TextInput`. |
| `"daterange"` `(v1)` | `DateRangePicker` | full width |
| `"datetime"` `(v1)` | `DateTimePicker` | full width |
| `"time"` `(v1)` | `TimePicker` | full width. Shadows `TextInputTypes`' `'time'` the same way `"date"` does. |
| `"autocomplete"` | `Autocomplete` | **deprecated** — warns on use; see the table below. Full width. |

`size` is `"sm" | "md"` (default `"sm"`) and `variant` is `"subtle" |
"outline"` (default `"subtle"`) at the `FormControl` level — narrower unions
than the underlying components accept directly. Slots forward by name;
`#prefix`, `#suffix`, `#label` (`{ required }`), `#description`,
`#item-prefix` (autocomplete items), and `#default` (full override) are
declared for editor typing, any other slot name still passes through at
runtime.

## Frappe `Link` (`frappe-ui/frappe`)

`import { Link } from 'frappe-ui/frappe'` — a `Combobox` preconfigured to
search a DocType via `frappe.desk.search.search_link`
(`frappe/Link/Link.vue`, `Link.api.md`).

Props: `doctype: string` (**required**), `filters: Record<string, unknown>`
(default `{}`), `creatable: boolean` (default `false` — appends a "Create
New" custom row, visible once the query is non-empty), `disabled`, plus the
labeling contract and `open` (`v-model:open`). `v-model: string | null`
(default `null`). Typing debounces 300ms into a new search; changing
`doctype`/`filters` reloads immediately. A built-in inline clear button
appears once a value is set (hidden when `disabled` or `required`) unless
you provide your own `#suffix`. Emits: `update:modelValue`,
`update:open`, `create: [query: string]` (fired instead of setting a value
when the "Create New" row is chosen — wire it to open your own creation
UI). `#item-create` overrides the "Create New" row's content; any other
slot forwards straight to the inner `Combobox`.

**Not in 0.1.261**: `creatable` (0.1.261's prop is `allowCreate`, and its
custom-row `onClick` receives `{ searchTerm }` not `{ query }`), `description`,
`error`, `required`, `id`, `open`/`v-model:open`. 0.1.261's `Link` also has no
labeling-contract wiring — it renders its own `FormLabel` and has no `error`/
`aria-*` support at all.

## Deprecated → replacement

| Deprecated | Replacement | Exists in 0.1.261? |
| --- | --- | --- |
| `Autocomplete` | `Combobox` (single) or `MultiSelect` (multiple) | Yes — both existed pre-v1, with a narrower option/slot shape (see `spec/selection.md` vs 0.1.261's `Combobox/types.ts`). |
| `FormControl type="autocomplete"` | `Combobox` standalone | Yes (see above); the `FormControl` route itself still resolves to `Autocomplete` in v1, just with a dev warning. |
| `Input` (`src/components/Input.vue`) | `TextInput` | Yes — `TextInput` already existed at 0.1.261 baseline. |
| `MonthPicker` | `Select` with month options | Yes — `Select` existed; there is no dedicated month-picker replacement component, compose it from `Select`. |
| DatePicker/DateRangePicker/DateTimePicker/TimePicker `placement` | `side` + `align` + `offset` | No — `side`/`align`/`offset` are v1-only; 0.1.261 only has `placement` (a combined string like `'bottom-start'`). |
| `autoClose` | `keepOpen` (inverse) | No — v1-only. |
| picker-level `readonly` | `typeable: false` | No — v1-only; 0.1.261's `readonly` disabled typing directly, no `typeable` concept exists there. |
| `allowCustom` | `typeable: false` | No — v1-only. |
| `TimePicker.minTime` / `maxTime` | `min` / `max` | No — 0.1.261 only has `minTime`/`maxTime`. |
| `DateTimePicker.minDateTime` / `maxDateTime` | `min` / `max` | No — same as above. |
| `Rating.rating_from` | `max` | No — 0.1.261's `RatingProps` only has `rating_from`. |
| `#target` slot (date/time pickers) | `#trigger` | No — 0.1.261 only renders `#target`. |
| `Select` `#item-*` slot prop `option` | `item` | No — 0.1.261's `Select` has no `#item-*` slots at all to rename. |

All rows above continue to work through `v1.x` — a dev-mode `console.warn`
fires once per session for the ones wired through `warnDeprecated`
(everything except the silent `option`→`item` slot-prop rename, which isn't
detectable at runtime and is JSDoc-only).

## Worked example: a create form

```vue
<script setup>
import { ref, reactive } from 'vue'
import {
  TextInput,
  Select,
  Combobox,
  DatePicker,
  Button,
  ErrorMessage,
  useCall,
} from 'frappe-ui'
import { Link } from 'frappe-ui/frappe'

const form = reactive({
  subject: '',
  priority: 'Medium',
  assignee: null,
  customer: null,
  due_date: '',
})

const priorityOptions = ['Low', 'Medium', 'High', 'Urgent']

const assigneeOptions = ref([])
const loadAssignees = useCall({
  url: 'frappe.client.get_list',
  method: 'GET',
  params: {
    doctype: 'User',
    fields: ['name', 'full_name'],
    limit_page_length: 20,
  },
  immediate: true,
  transform: (data) =>
    data.map((u) => ({ label: u.full_name, value: u.name })),
  onSuccess: (data) => (assigneeOptions.value = data),
})

const createTask = useCall({
  url: 'frappe.client.insert',
  method: 'POST',
  immediate: false,
  onSuccess: () => {
    // navigate away / reset the form / toast, etc.
  },
})

function submit() {
  createTask.submit({
    doc: {
      doctype: 'Task',
      subject: form.subject,
      priority: form.priority,
      _assign: form.assignee ? [form.assignee] : undefined,
      custom_customer: form.customer,
      exp_end_date: form.due_date || undefined,
    },
  })
}
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="submit">
    <TextInput
      v-model="form.subject"
      label="Subject"
      required
      placeholder="What needs to happen?"
    />

    <Select v-model="form.priority" label="Priority" :options="priorityOptions" />

    <Combobox
      v-model="form.assignee"
      label="Assignee"
      :options="assigneeOptions"
      :loading="loadAssignees.loading"
      placeholder="Search users"
    />

    <Link
      v-model="form.customer"
      doctype="Customer"
      label="Customer"
      creatable
      @create="(query) => { /* open a Customer quick-entry dialog seeded with query */ }"
    />

    <DatePicker v-model="form.due_date" label="Due date" placeholder="Select date" />

    <ErrorMessage v-if="createTask.error" :message="createTask.error" />

    <Button variant="solid" :loading="createTask.loading" @click="submit">
      Create task
    </Button>
  </form>
</template>
```

`useCall` (`src/data-fetching/useCall/useCall.ts`, present in both v1 and
0.1.261) returns a reactive object with `data`, `error`, `loading`
(`isFetching`), `isFinished`, `submit(params?)`, `execute`/`fetch`/`reload`,
and `reset`. With `immediate: false`, nothing fires until `.submit()` is
called; `submit` re-triggers the request with the given params and resolves
to the unwrapped response body (`response.data`, per Frappe's REST envelope).
`transform` runs on every successful fetch, which is how the assignee
`Combobox`'s options are shaped from the raw `frappe.client.get_list`
response.

## Sources

Verified against frappe-ui `1.0.0-beta.29` (`package.json`), cross-checked
against the `0.1.261` baseline vendored at
`apps/crm/frontend/node_modules/frappe-ui`:

- `apps/frappe-ui/src/composables/useInputLabeling.ts`, `apps/frappe-ui/spec/inputs.md` — shared labeling contract, `data-*` hooks, size/variant scales
- `apps/frappe-ui/src/components/TextInput/TextInput.vue`, `Textarea/Textarea.vue`, `Password/Password.vue`
- `apps/frappe-ui/src/components/Checkbox/Checkbox.vue`, `Switch/Switch.vue`, `Rating/Rating.vue`, `Slider/Slider.vue`, `Slider/types.ts`, `ErrorMessage/ErrorMessage.vue`
- `apps/frappe-ui/spec/selection.md`, `apps/frappe-ui/src/components/Select/Select.api.md`, `Combobox/Combobox.api.md`, `MultiSelect/MultiSelect.api.md`
- `apps/frappe-ui/src/components/DatePicker/DatePicker.api.md`, `DatePicker/types.ts`, `TimePicker/TimePicker.api.md`, `apps/frappe-ui/spec/date-picker.md`
- `apps/frappe-ui/src/components/Duration/Duration.api.md`
- `apps/frappe-ui/src/components/FileUploader/FileUploader.vue`, `FileUploader/types.ts`, `apps/frappe-ui/src/utils/useFileUpload.ts`, `apps/frappe-ui/src/utils/fileUploadHandler.ts`
- `apps/frappe-ui/src/components/FormControl/FormControl.vue`
- `apps/frappe-ui/frappe/Link/Link.vue`, `Link/Link.api.md`
- `apps/frappe-ui/src/data-fetching/useCall/useCall.ts` (`useCall` shape referenced in the worked example)
