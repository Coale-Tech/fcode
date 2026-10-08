# List and Rich-Text Editor

frappe-ui ships two overlapping list families and two overlapping rich-text
families. This page picks the canonical one for new v1 code and documents the
still-supported alternative so existing code isn't misdiagnosed as wrong.

## List: which family to use

| | `frappe-ui/list` `(v1)` | `ListView` (top-level) |
|---|---|---|
| Import | `import { List, ListRows, ... } from 'frappe-ui/list'` | `import { ListView } from 'frappe-ui'` |
| Shape | Composition primitives (`List` + `ListRows` + `ListRow` + `ListCell`) | One config-driven component (`:columns`, `:rows`, `:options`) |
| Status | New in v1; the forward direction | **Not deprecated.** Source explicitly keeps it until `frappe-ui/list` reaches feature parity (grouping, footer/pagination, resize-column, select-banner). |
| Grouping, footer/pagination, resizable columns, select-banner | Not yet (roll your own) | Built in (`ListGroup(s)`, `ListFooter`, `resizeColumn`, `ListSelectBanner`) |
| Virtualization | `virtual` prop on `ListRows` (`useVirtualRows`) | Not built in |

Pick `frappe-ui/list` for new feed/table UI without heavy chrome (settings
lists, simple record tables, master-detail panes). Reach for `ListView` when
you need grouped rows, built-in pagination footer, resizable columns, or a
bulk-selection banner today — its API is stable, not a deprecated fallback.
Both are present in 1.0.0-beta.29; only `ListView` is present in the 0.1.261
baseline.

## `frappe-ui/list` `(v1)`

One column grid: a feed row is the default column template
(`['auto', 'minmax(0,1fr)', 'auto']`); a table passes explicit `columns`. The
family owns geometry (columns, dividers, hover, selection, sort chrome); cell
contents (typography, avatars, badges) are entirely app-authored.

```ts
import {
  List, ListRow, ListCell, ListHeader, ListHeaderCell,
  ListHeaderCellSort, ListRows, ListGroup, useVirtualRows,
} from 'frappe-ui/list'
```

### Feed mode

```vue
<script setup>
import { List, ListRow, ListCell, ListRows } from 'frappe-ui/list'
import { useList } from 'frappe-ui'

const leads = useList({ doctype: 'CRM Lead', fields: ['name', 'lead_name', 'status'] })
const selection = ref([])
</script>

<template>
  <List v-model:selection="selection" selectable>
    <ListRows :items="leads.data ?? []" v-slot="{ item, value }">
      <ListRow :value="value" :to="`/leads/${value}`">
        <ListCell>
          <Avatar :label="item.lead_name" size="sm" />
          <span>{{ item.lead_name }}</span>
        </ListCell>
        <ListCell class="justify-end">
          <Badge :label="item.status" theme="gray" />
        </ListCell>
      </ListRow>
    </ListRows>
  </List>
</template>
```

`List` props: `columns` (`string[]` track sizes), `divider` (`'inset' |
'full'`, default `inset` for the feed template / `full` once `columns` is
set), `selectable` (reveals the animated checkbox column, switches row click
to toggle, drives `v-model:selection`), `rowHeight` (px; required for
virtualization), `selection` (`string[]`), `active` (single-select row key,
`v-model:active`). Emits `update:selection`, `update:active`.

`ListRow` props: `to` (renders a RouterLink), `value` (the row key used by
selection/active state — required whenever the list uses either), `onClick`.
Without `to`, a row with a click listener renders as a button, otherwise a
plain `div`.

`ListRows` props: `items` (required), `rowKey` (string field name or
`(item, index) => key`; defaults to `name`, then `id`, then index),
`virtual` (`boolean | ListVirtualOptions`, windows rows via
`useVirtualRows`). Scoped slot: `{ item, index, value }`.

### Active row (master-detail)

```vue
<List v-model:active="openId">
  <ListRows :items="threads" v-slot="{ value }">
    <ListRow :value="value">…</ListRow>
  </ListRows>
</List>
```

Activation is additive (unlike `selectable`): the row's own `@click`/`to`
navigation still fires. Single-select, independent of `selection`.

### Column mode with sortable header

```vue
<script setup>
const sortField = ref('modified')
const sortDir = ref('desc')
function toggleSort(field) {
  if (sortField.value !== field) { sortField.value = field; sortDir.value = 'desc'; return }
  sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'
}
</script>

<template>
  <List :columns="['minmax(8rem,1fr)', '7rem', '9rem']">
    <ListHeader>
      <ListHeaderCell>Name</ListHeaderCell>
      <ListHeaderCellSort
        align="end"
        :direction="sortField === 'amount' ? sortDir : null"
        @click="toggleSort('amount')"
      >
        Amount
      </ListHeaderCellSort>
      <ListHeaderCellSort
        :direction="sortField === 'modified' ? sortDir : null"
        @click="toggleSort('modified')"
      >
        Modified
      </ListHeaderCellSort>
    </ListHeader>
    <ListRows :items="deals" v-slot="{ item, value }">
      <ListRow :value="value">
        <ListCell>{{ item.name }}</ListCell>
        <ListCell class="justify-end">{{ item.amount }}</ListCell>
        <ListCell>{{ item.modified }}</ListCell>
      </ListRow>
    </ListRows>
  </List>
</template>
```

`ListHeaderCellSort` is a **controlled** sort button — you own sort state,
toggle rules, and (for server ordering) feeding `sortField`/`sortDir` into
`useList`'s `orderBy`. Props: `direction` (`'asc' | 'desc' | null`), `align`
(`'start' | 'end'`, `'end'` also flips the glyph to the leading side). Emits
`click`.

### Virtual rows

```vue
<List :row-height="48">
  <ListRows :items="bigList" virtual v-slot="{ item, value }">
    <ListRow :value="value">{{ item.name }}</ListRow>
  </ListRows>
</List>
```

Only rows near the viewport mount (`vueuse` `useVirtualList` under the hood).
The scroll container is the nearest scrollable ancestor — the list windows
against an app-owned scroll area, not its own. `itemHeight` defaults to the
`List`'s `rowHeight`.

### Styling hooks

CSS vars: `--list-columns`, `--list-gap` (default `0.5rem`),
`--list-row-padding-x` (default `0.75rem`, shared by rows and header). The
Tailwind preset ships `list-gap-*` / `list-row-px-*` utilities. `data-slot`
values for targeting: `list`, `list-header`, `list-header-cell`, `list-row`,
`list-cell`, `list-row-checkbox`, `list-divider`. State attributes:
`data-state="selected"`, `data-active` (+ `aria-current`), `data-interactive`,
`data-sort`.

(`src/molecules/list/`)

## `ListView` (top-level, still supported)

```vue
<script setup>
import { ListView } from 'frappe-ui'

const columns = [
  { label: 'Name', key: 'lead_name', width: 3 },
  { label: 'Status', key: 'status', width: 1 },
]
</script>

<template>
  <ListView
    :columns="columns"
    :rows="leads.data ?? []"
    row-key="name"
    :options="{ selectable: true, getRowRoute: (row) => `/leads/${row.name}` }"
  >
    <template #cell="{ item, row, column }">
      <Badge v-if="column.key === 'status'" :label="item" theme="gray" />
      <span v-else>{{ item }}</span>
    </template>
  </ListView>
</template>
```

Props: `columns` (`unknown[]`, default `[]`), `rows` (`unknown[]`, default
`[]`), `rowKey` (**required** `string`), `options` — an object merged over
these defaults: `{ getRowRoute: null, onRowClick: null, showTooltip: true,
selectable: true, resizeColumn: false, rowHeight: 40, emptyState: { title:
'No Data', description: 'No data available' } }`. Emits `update:selections`,
`update:active-row`. Default slot receives `{ showGroupedRows, selectable }`.

**Per-cell rendering is one scoped `#cell` slot receiving `{ item, row,
column }`** — switch on `column.key` inside it, as above. `ListView` has
**no dynamic per-column named slots** (there is no `#status` or `#name`
slot); every cell customization goes through `#cell`. `ListRowItem`'s
`default` slot similarly receives `{ label }`, not a per-column name.

Sub-components (all under `src/components/ListView/`, importable individually
for hand-built layouts): `ListEmptyState`, `ListFooter` (`modelValue` page
length, `options.{rowCount,totalCount,pageLengthOptions}`, slots
`#left`/`#right`, emits `update:modelValue`/`loadMore`), `ListGroupHeader`
(`group` prop), `ListGroupRows`, `ListGroups` (slot `#group-header`),
`ListHeader`, `ListHeaderItem` (`item` prop, slots `#prefix`/`#suffix`/
`#resizer`, emits `columnWidthUpdated`), `ListRow` (`row` prop, default slot
`{ idx, column, item, isActive }`), `ListRowItem`, `ListRows`,
`ListSelectBanner` (slots `#default`/`#actions` receiving `{ selections,
allRowsSelected, selectAll, unselectAll }`).

(`src/components/ListView/`)

## Rich text: which family to use

| | `frappe-ui/editor` `(v1)` | `TextEditor` (top-level) |
|---|---|---|
| Import | `import { Editor, useEditor, RichTextKit } from 'frappe-ui/editor'` | `import { TextEditor } from 'frappe-ui'` |
| Shape | Renderless `<Editor>` + `useEditor` composable + composable kits | One opinionated SFC with a fixed/bubble menu |
| Status | v1 canonical | **`@deprecated` — use `frappe-ui/editor` instead.** Still exported for back-compat. |
| Present in 0.1.261 | No | Yes (this is the 0.1.x API) |

## `frappe-ui/editor` `(v1)`

`Editor` is renderless: it wraps `useEditor` (the TipTap engine) and exposes
`{ editor, isEmpty }` through its default scoped slot and via
`defineExpose`, so the app owns 100% of the chrome.

```vue
<script setup>
import { Editor, EditorContent, EditorFixedMenu, RichTextKit } from 'frappe-ui/editor'
import { minimalToolbar } from 'frappe-ui/editor'

const extensions = [RichTextKit.configure({ placeholder: 'Write something…' })]
</script>

<template>
  <Editor
    v-model="content"
    :extensions="extensions"
    format="html"
    :editable="true"
    @change="onChange"
  >
    <template #default="{ editor }">
      <EditorFixedMenu :editor="editor" :items="minimalToolbar" />
      <EditorContent :editor="editor" />
    </template>
  </Editor>
</template>
```

`Editor` props: `extensions` (required, TipTap extension array — normally one
or more configured kits), `format` (`'html' | 'json' | 'markdown'`, default
`'html'`, reactive), `placeholder` (reactive), `editable` (reactive),
`autofocus` (one-shot on mount), `uploadFunction`. `v-model` binds content in
the shape `format` names. Emits `change`, `focus`, `blur`, `transaction`.

Building blocks composed inside the default slot: `EditorContent` (renders
the document), `EditorFixedMenu`, `EditorBubbleMenu`, `EditorFloatingMenu`
(toolbars — each takes `:editor` and an `:items` array of `MenuItem`s).

### Kits

Kits are TipTap extension bundles with a typed `.configure()`:

- `StarterKit` — baseline nodes/marks (paragraph, headings, lists, etc.).
- `InlineKit` — `{ starterKit, placeholder, link }`. For single-line/comment
  contexts that must stay inline.
- `CommentKit` — `{ starterKit, heading, placeholder, link, image,
  imageGroup, imageViewer, video, attachment, table (off by default),
  contentPaste, emoji, mention, tag }`. Comment-thread-shaped rich text.
- `RichTextKit extends CommentKit`, adding `{ taskList, iframe, toc,
  slashCommands, color, highlight, typography, textAlign, styleClipboard }`.
  Full document editing (articles, wiki pages).

```ts
const extensions = [
  RichTextKit.configure({
    mention: { fetchSuggestions: (query) => fetchUsers(query) },
    table: true,
  }),
]
```

Toolbar presets (arrays of `MenuItem` for the menu components):
`minimalToolbar`, `commentToolbar`, `articleToolbar`, `tableToolbar`. Command
building blocks (`Bold`, `Italic`, `Strike`, `InlineCode`, `BulletList`,
`OrderedList`, `Blockquote`, `Paragraph`, `H1`–`H6`, `HeadingGroup`,
`AlignLeft`/`Center`/`Right`, `FontColor`, `FontHighlight`, `InsertImage`,
`InsertVideo`, `InsertAttachment`, `InsertLink`, `InsertIframe`,
`InsertTable` + table controls, `HorizontalRule`, `Undo`, `Redo`,
`Separator`) compose custom toolbars when a preset doesn't fit.

(`src/molecules/editor/`)

## `TextEditor` (deprecated, 0.1.x baseline)

Still present and functional in v1 for migration, but new code should use
`frappe-ui/editor` above. This is the 0.1.261 API:

```vue
<template>
  <TextEditor
    v-model:content="content"
    editor-class="prose"
    :bubble-menu="true"
    :fixed-menu="['Bold', 'Italic', 'Link']"
    :mentions="fetchMentions"
    placeholder="Write something…"
  >
    <template #editor="{ editor }">
      <EditorContent :editor="editor" />
    </template>
  </TextEditor>
</template>
```

Props: `content` (`v-model`), `placeholder`, `editorClass`, `editable`,
`autofocus`, `bubbleMenu` (`boolean`), `bubbleMenuOptions`, `fixedMenu`
(array of button names), `floatingMenu`, `extensions` (appended to the
built-in set), `starterkitOptions`, `mentions`, `tags`. Slots: `#top`,
`#editor`, `#bottom`.

### Migration

| 0.1.x `TextEditor` | v1 `frappe-ui/editor` |
|---|---|
| `<TextEditor :content v-model:content extensions>` | `<Editor v-model :extensions>` + compose `EditorContent`/menus yourself |
| `fixedMenu: ['Bold', 'Italic', ...]` | `<EditorFixedMenu :items="minimalToolbar">` or a custom `MenuItem[]` |
| `bubbleMenu` / `bubbleMenuOptions` | `<EditorBubbleMenu :items="...">` |
| `starterkitOptions` | `RichTextKit.configure({ starterKit: {...} })` |
| `mentions` | `RichTextKit.configure({ mention: {...} })` |
| Built-in image/video/attachment extensions imported top-level | Bundled into `CommentKit`/`RichTextKit`; configure via `.configure({ image, video, attachment })` |

(`src/components/TextEditor/`)

## Sources

Verified against frappe-ui `1.0.0-beta.29` (`package.json`), cross-checked
against the `0.1.261` baseline vendored at
`apps/crm/frontend/node_modules/frappe-ui`:

- `apps/frappe-ui/src/molecules/list/List.vue`, `ListRows.vue`, `ListRow.vue`/`ListRowBase.vue`, `ListCell.vue`, `ListHeader.vue`, `ListHeaderCell.vue`, `ListHeaderCellSort.vue`, `ListGroup.vue`, `useVirtualRows.ts`, `list-context.ts`, `types.ts`, `list.api.md`
- `apps/frappe-ui/src/components/ListView/ListView.vue`, `ListEmptyState.vue`, `ListFooter.vue`, `ListGroupHeader.vue`, `ListGroupRows.vue`, `ListGroups.vue`, `ListHeader.vue`, `ListHeaderItem.vue`, `ListRow.vue`, `ListRowItem.vue`, `ListRows.vue`, `ListSelectBanner.vue`, `ListView.api.md`
- `apps/frappe-ui/src/molecules/editor/Editor.vue`, `EditorContent.vue`, `EditorFixedMenu.vue`, `EditorBubbleMenu.vue`, `EditorFloatingMenu.vue`, `kits.ts`, `menu.ts`, `extensions.ts`
- `apps/frappe-ui/src/components/TextEditor/TextEditor.vue`, `TextEditor.api.md`
- `apps/frappe-ui/src/index.ts` — `TextEditor` re-exported with `@deprecated Use the 'frappe-ui/editor' subpath instead`
