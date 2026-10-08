# UI Patterns from Official Frappe Apps

Adapted in part from frappe/frappe-ui (MIT): `PHILOSOPHY.md`, `CONTEXT.md`, `skills/frappe-ui/DESIGN.md`.

The maintainers' own design language for apps built on frappe-ui, distilled
from `PHILOSOPHY.md` (the API-design rules, `P1`-`P14`), `CONTEXT.md` (the
shared vocabulary), and `skills/frappe-ui/DESIGN.md` (the app-design guide
derived from Gameplan, CRM, Helpdesk, Drive, and Insights). Mobile-specific
shell APIs are covered in [mobile-patterns.md](mobile-patterns.md). Full
component prop/slot/emit tables live in
[frappe-ui-components.md](../../frappe-frontend-development/references/frappe-ui-components.md)
and its split files (`frappe-ui-core-components.md`, `frappe-ui-form-controls.md`,
`frappe-ui-list-and-editor.md`) — this file does not repeat them.

**Version note:** written against frappe-ui **1.0.0-beta.29** (v1). Real Frappe
apps mostly still pin 0.1.x. Every component named below that doesn't exist in
0.1.x is tagged `(v1)`. Before choosing an API, check the pinned version in
`frontend/package.json`.

### When to use

- Designing UI for a new Frappe app built on frappe-ui
- Laying out an app shell, choosing a screen archetype, or reviewing hierarchy/color
- Deciding how to show empty, loading, and error states, confirmations, and feedback
- Reviewing whether a screen's component choices match the library's own design rules

### Inputs required

- App type (CRM-like, Helpdesk-like, data management, dashboard)
- Key entities and their relationships
- Primary user workflows

## P1-P14 at a glance

The rules that govern frappe-ui's own API surface (full text, rationale, and
examples: `PHILOSOPHY.md`). App authors don't design new frappe-ui components,
but every rule below still shapes how you *use* the library correctly.

| ID | Rule (one line) |
|---|---|
| P1 | Event/slot names describe behavior (`change`, `dismiss`), not the physical input that triggered it. |
| P2 | Two-way state is `v-model` / `v-model:<name>` — never hand-rolled `:value` + `@valueChange` pairs. |
| P3 | Props are primitives by default; only irreducibly structured data (`options`, `actions`) is object/array-shaped. |
| P4 | Color has exactly two axes — `variant` (solid\|outline\|subtle\|ghost) and `theme` (color name); map "warning"/"success" to a `theme` in your own code, never invent an `intent` prop. |
| P5 | Every form control takes the same four labeling props: `label`, `description`, `error`, `required`. |
| P6 | Slots use the shared vocabulary (`#prefix`, `#suffix`, `#trigger`, `#empty`, `#header`, `#footer`) — don't invent `#icon-left`/`#emptyState`. |
| P7 | Per-item/per-state slots receive the component's own state as slot props (`{ item, active, selected }`) — don't re-derive selection from the outer `v-model`. |
| P8 | Components with a different value shape or UI region are separate components (`Select` vs `MultiSelect` vs `Combobox`), not one component with boolean mode-switches. |
| P9 | Imperative helpers (`dialog.*`, `toast.*`) are namespaced, provider-mounted, and shortest-call-site-first — use them instead of hand-rolling a confirm `<Dialog>`. |
| P10 | Style hooks are `data-slot`/`data-state` attributes targeted from your app's CSS — frappe-ui exposes no `triggerClass`/`itemClass` props to pass. |
| P11 | Icon props take `string | Component`; strings are `lucide-*` namespaced (`icon="lucide-plus"`), never bare names or `{ name, theme }` blobs. |
| P12 | Keyboard operability, visible focus, and ARIA wiring are built in — don't strip a focus ring or rebuild a widget's semantics in raw `<div>`s. |
| P13 | Deprecated props/behaviors keep working through one major release; check `v1-release/changelog.md` and `v1-release/deprecated-removals.md` before assuming an old name is gone. |
| P14 | `frappe-ui/experimental` has no stability promise — never import it into app code. |

## App shell anatomy

Desktop and mobile are two different navigation models, not one responsive
component — the app picks which shell to render for the viewport (typically
via `useIsMobile()` from `frappe-ui`, `(v1)`). Full mobile
shell/nav detail: [mobile-patterns.md](mobile-patterns.md).

### Desktop

```html
<div class="h-screen w-full bg-surface-base text-ink-gray-9">
  <DesktopShell> <!-- :scroll="false" when an inner pane owns its own scroll -->
    <template #rail>…</template>      <!-- Rail: only multi-workspace apps -->
    <template #sidebar>
      <Sidebar width="14rem" class="border-r">
        <SidebarHeader title subtitle logo :menu-items />
        <div class="min-h-0 flex-1 overflow-y-auto px-2 pt-0.5 pb-10">
          <SidebarLabel>Section</SidebarLabel>
          <SidebarItem label="Leads" icon="lucide-users" to="/leads" />
        </div>
      </Sidebar>
    </template>
    <PageHeader>…</PageHeader>   <!-- teleports into DesktopShell's pinned header target -->
    <div>…page body…</div>
  </DesktopShell>
</div>
```

`DesktopShell`, `Sidebar` (composition mode), `Rail`, and `PageHeader` are all
**`(v1)`**; none exist in 0.1.x. `Sidebar` in 0.1.x (and the deprecated,
one-release-only compat path in v1) takes a config blob instead — `:header`
and `:sections="[{ label, items }]"` — rather than composed
`SidebarHeader`/`SidebarLabel`/`SidebarItem` children. 0.1.x apps hand-roll the
outer shell (`<div class="flex h-screen">` + `<Sidebar :sections>` + a plain
header `<div>`) because there was no `DesktopShell`/`PageHeader` pair to
teleport into.

- `DesktopShell` owns a `PageHeaderTarget` and the scroll region; a page
  declares its `PageHeader` anywhere in its tree and it teleports up. The
  content region carries `data-slot="desktop-shell-content"` for app-level
  card/gutter/border styling (`spec` source: `src/components/DesktopShell/DesktopShell.vue`).
- `Sidebar` owns its own collapse state (`v-model:collapsed`, or automatic
  below the `sm` breakpoint); `width`/`collapsedWidth` are CSS-length props
  applied inline. `SidebarItem` renders a router link when `to` is set,
  otherwise a button; `active` is inferred from the current route when
  omitted.
- Sidebar nav rows: `h-7`, `space-y-0.5`, label `flex-1 truncate text-sm`,
  count suffix `mr-1 text-xs text-ink-gray-5`.
- `Rail` (the icon column, multi-workspace apps only) is a bare 50px frame;
  compose it from `RailItem` (`variant="tile"` filled cells or `variant="ghost"`
  hover-only icons). Home is usually a bespoke logo button, not a `RailItem`;
  a user-avatar `Dropdown` pins to the bottom with `mt-auto`.
- `PageHeaderBase` (the padding-free primitive under `PageHeader`) is for a
  header that must split to align with a column border below it — two-pane
  layouts, editor toolbars.

Deeper page-composition patterns (list/detail split routing, SPA page
wiring): [frappe-ui-spa-page-patterns.md](../../frappe-frontend-development/references/frappe-ui-spa-page-patterns.md)
and [app-shell-patterns.md](../../frappe-frontend-development/references/app-shell-patterns.md).

### Mobile (summary — see mobile-patterns.md for the full API)

```html
<MobileShell>  <!-- owns height; no h-screen wrapper -->
  <PageHeaderMobile title="…">
    <template #left>…back chevron or menu opener…</template>
    <template #right>…actions…</template>
  </PageHeaderMobile>
  <div>…body…</div>
  <BottomSheet v-model:open="…">…whatever lived in the desktop sidebar…</BottomSheet>
  <template #nav>
    <MobileNav>
      <MobileNavItem label="Home" icon="lucide-home" to="/" />
      <!-- … -->
    </MobileNav>
  </template>
</MobileShell>
```

`MobileShell`, `MobileNav`/`MobileNavItem`, `PageHeaderMobile`, and
`BottomSheet` are all **`(v1)`** — none exist in 0.1.x, which has no
dedicated mobile shell family; 0.1.x apps hand-build a mobile header/drawer
from plain `<div>`s and a media query, or a third-party sheet.

## Screen archetypes

Each has a recipe in `docs/components/recipes/*.vue` (live at
ui.frappe.io/recipes) — copy from a recipe or a shipping app rather than
inventing a new layout. List and detail are two routes with the id as a
route param, not one component with a screen-level toggle.

| Archetype | Composition |
|---|---|
| Feed list | `List` (`frappe-ui/list`, `(v1)`) in feed mode; rows `h-15` desktop / `h-17` mobile; title + meta line; unread signal |
| Data table | `List` with `:columns` + sortable header cells; row height `40`-`60`; sort state/comparators are app code |
| Two-pane | Split panes under `PageHeaderBase`, `DesktopShell :scroll="false"` |
| Board (kanban) | `ScrollArea orientation="horizontal"`; columns on `bg-surface-gray-1`; cards on `bg-surface-elevation-1` — frappe-ui ships no `Kanban`/`ActionSheet` component, this is composed from `ScrollArea` + plain markup |
| Compose / editor | Focused page, no sidebar; `Editor` (`frappe-ui/editor`, `(v1)`) + its fixed-menu building block; prose column `max-w-[770px]` |
| Detail + meta panel | Content column + right panel `w-[20rem] shrink-0 border-l` of label/control rows |
| Settings | `SettingsDialog`: nav groups → header + body → `space-y-11 pt-6` sections → `divide-y divide-outline-gray-1` of setting rows |
| Dashboard | Centered `max-w-4xl space-y-6`; KPI strip as `divide-x divide-outline-gray-2` |

`List` (new, `frappe-ui/list` subpath) and the legacy top-level `ListView`
family are covered in
[frappe-ui-list-and-editor.md](../../frappe-frontend-development/references/frappe-ui-list-and-editor.md) —
`ListView` is legacy but not deprecated until `List` reaches parity (P13).

## Hierarchy by role

Pick tokens by the *role* they play, not by eye. Ink ladder (`espresso-v2-design-tokens/`, tokens spec: `spec/foundations.md`):

| Token | Role |
|---|---|
| `ink-gray-9` | page default, strongest values (unread titles, KPI figures) |
| `ink-gray-8` | titles, headings, primary content |
| `ink-gray-7` | secondary values, table cells, descriptions |
| `ink-gray-6` | field labels, form icons |
| `ink-gray-5` | timestamps, counts, captions, meta |
| `ink-gray-4` | ids (`tabular-nums`), decorative glyphs |

Type by role (prefer composite utilities like `text-base-medium` over size +
`font-medium`, per `spec/foundations.md`'s named-style utilities):

- Row title: `text-base` desktop / `text-lg` mobile; unread → `-semibold`.
- Meta: `text-sm` desktop / `text-md` mobile, always `ink-gray-5`, `mt-1.5`
  below the title.
- Section headings `text-lg-semibold`; page titles `text-2xl`+; prose
  `text-p-base text-ink-gray-8`.

Row heights: `:row-height="40"` for a dense table, `44`-`60` for a medium one,
`h-15` desktop feed, `h-17` mobile feed — one row-height mechanism per list.

Icons: `size-4` default, `size-3.5` inline meta, `size-5` mobile row leading,
`size-2`/`size-1.5` status dots. Icons support labels; they don't replace them
— reserve icon-only buttons for universal actions (close, overflow menu).

## Color

Two axes only (P4): `variant` + `theme`. Gray everywhere except where color
encodes meaning — at most one accent per screen:

- Status/priority/unread dots: `bg-surface-{red,amber,blue,green}-7`.
- Financial sign: `text-ink-red-6` negative, `text-ink-green-6` positive.
- Status badges map through one lookup, not a prop-level `intent`:
  ```ts
  <Badge :label="status" :theme="statusTheme(status)" variant="subtle" />
  // statusTheme = (s) => ({ open: 'blue', closed: 'gray', error: 'red', done: 'green' })[s] ?? 'gray'
  ```
- Focus rings are themed the same way — `focus-visible:ring-2` +
  `ring-outline-gray-3` (default) or `ring-outline-red-3`/`ring-blue-400`/
  `ring-outline-green-3` — never a custom outline color per component
  (`spec/foundations.md`, ADR-0005).

A screen that isn't encoding state, sign, severity, or unread stays gray.
Primary button is usually `solid` + `gray` — reserve the accent theme for the
one thing that needs it.

## Geometry

- Sidebar `14rem`; page header `min-h-12` (48px).
- Gutters `px-3 sm:px-5` — same pair on header, body, full-bleed rows.
- Content width: reading pages `max-w-[940px]` centered; prose/editor
  `max-w-[770px]`; dashboards `max-w-4xl`; dense tables may run full-width.
- Radius: numbered tokens `rounded-0`-`rounded-9` are canonical
  (`rounded-4`/8px default control, `rounded-6`/12px card, `rounded-9` pill);
  named aliases (`rounded`, `rounded-md`, `rounded-lg`, `rounded-xl`,
  `rounded-2xl`) are deprecated — migrate to the numbered equivalent
  (`spec/foundations.md`, ADR-0006).
- Stacks: sections `space-y-6`, settings sections `space-y-11`, form fields
  `space-y-4`, sidebar nav `space-y-0.5`, inline actions `gap-2`.
- Top of a page body `pt-5`/`pt-6`; bottom of every scroll area `pb-10`…`pb-40`.

## Empty, loading, and error states

**Empty:**

```vue
<div class="flex flex-col items-center justify-center gap-3 py-16 text-center">
  <div class="rounded-full bg-surface-gray-2 p-3 text-ink-gray-5">
    <span class="lucide-inbox size-6" aria-hidden="true" />
  </div>
  <p class="text-base text-ink-gray-7">No tasks yet</p>
  <p class="text-sm text-ink-gray-5">Create one to get started.</p>
  <Button variant="solid" theme="gray" icon-left="lucide-plus" label="New Task" class="mt-2" />
</div>
```

**Loading:**

- Buttons: `<Button :loading="saving" />` (built-in spinner, no extra markup).
- Inline: `<LoadingIndicator />` / `<Spinner />`; skeleton text `<LoadingText :lines="3" />`.
- First page load: render the shell with `LoadingText` placeholders in
  content slots — don't blank the screen while data loads.

**Error:** render `.error` from `useCall`/`useList`/`useDoc` (or a
`createResource` in 0.1.x) with `<ErrorMessage :message="error" />` next to
the form or list it belongs to — it accepts a raw string or an `Error`,
sanitizes any HTML in the message, and renders with `role="alert"`
(`src/components/ErrorMessage/ErrorMessage.vue`). Don't build a bespoke error
banner per screen.

## Confirmations

Never build a bespoke confirm `<Dialog>` — that's exactly the boilerplate
`dialog.confirm` exists to remove (P9):

```ts
dialog.confirm({
  title: 'Delete this item?',
  message: 'This cannot be undone.',
  theme: 'red',
  confirmLabel: 'Delete',
  onConfirm: async ({ close }) => {
    await api.delete(id)
    toast.success('Deleted')
  },
})
```

`dialog.confirm` auto-closes on a resolving `onConfirm` and surfaces a thrown
error inline; `dialog.danger` is the same shape themed for destructive
actions, `dialog.prompt` adds an input field. All three are namespaced,
provider-mounted through `<FrappeUIProvider>`, and return a synchronous
`{ close }` handle for programmatic dismissal. Full contract:
`spec/dialog.md`.

## Feedback

`toast.success('Saved')` after writes, `toast.error(err.message)` for
failures, `toast.info(...)` for neutral notices — never for a decision the
user has to make (that's `dialog.confirm`). `toast` is imported from
`frappe-ui`'s data layer alongside `dialog`; both need `<FrappeUIProvider>`
mounted once at the app root (it renders `<Dialogs/>` and the toast host).

## Forms

Every form control shares the same four labeling props — `label`,
`description`, `error`, `required` (P5). One column, `space-y-4`; a
secondary `Cancel` on the left of the submit row, a primary `solid` `Save`
on the right:

```vue
<form class="mx-auto max-w-xl space-y-4 p-6" @submit.prevent="save">
  <FormControl v-model="form.title" label="Title" required :error="errors.title" />
  <FormControl v-model="form.description" type="textarea" label="Description" description="Markdown supported." />
  <FormControl v-model="form.priority" type="select" label="Priority" :options="priorityOptions" />
  <div class="flex justify-end gap-2 pt-2">
    <Button label="Cancel" @click="cancel" />
    <Button variant="solid" theme="gray" type="submit" :loading="saving" label="Save" />
  </div>
</form>
```

Reads use `useCall`/`useList`/`useDoc` (auto-fetch on mount, `(v1)`), or
`createResource`/`createListResource` in 0.1.x — never raw `fetch`/`axios`.
Writes set `immediate: false` and call `.submit(params)`; bind `.loading` to
`<Button :loading>`. Full control catalog, props, and the labeling contract's
exact ARIA wiring:
[frappe-ui-form-controls.md](../../frappe-frontend-development/references/frappe-ui-form-controls.md).

## Dark mode

Semantic tokens (`ink-*`, `surface-*`, `outline-*`) resolve automatically
under `[data-theme="dark"]` — before calling a screen done, toggle it on
`<html>` and verify. A screen built entirely from semantic tokens should need
no dark-mode-specific classes.

## Common mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Inventing an `intent`/`severity`/`appearance` prop on an app component | Drifts from frappe-ui's two-axis color model (P4) | Use `variant` + `theme`; map semantic names to a `theme` in a lookup |
| Passing `triggerClass`/`itemClass`-style props to a frappe-ui component | These props don't exist — frappe-ui exposes `data-slot`/`data-state` instead (P10) | Target `[data-slot="…"]` in app CSS |
| Hand-building a confirm modal instead of `dialog.confirm` | Reimplements focus trap, Esc handling, loading state that `dialog.confirm` already owns | Use the imperative `dialog.*` namespace |
| Re-deriving "is this row selected" from an outer `v-model` inside a `#item` slot | Duplicates and drifts from the component's own selection logic | Use the slot props the component already passes (`{ item, active, selected }`, P7) |
| Using bare, un-namespaced icon names (`icon="edit"`) | Collides once a second icon set ships; not what frappe-ui components accept | Use the `lucide-*` namespaced class string, or a component for a custom glyph |
| No keyboard navigation on a custom-built widget | Accessibility gap frappe-ui components don't have by default (P12) | Prefer the frappe-ui component over a hand-rolled `<div>` widget; if hand-rolling is unavoidable, follow the WAI-ARIA pattern for that role |

## Sources

Verified against frappe-ui `1.0.0-beta.29` (`apps/frappe-ui/package.json`):

- `apps/frappe-ui/PHILOSOPHY.md` — P1-P14 rule text (naming, prop design, slot design, composition, styling, quality, evolution sections)
- `apps/frappe-ui/CONTEXT.md`, `apps/frappe-ui/skills/frappe-ui/DESIGN.md` — shared vocabulary and app-design guide this file distills (shell anatomy, hierarchy, geometry, forms, confirmations, feedback, dark-mode patterns are near-verbatim from `DESIGN.md`)
- `apps/frappe-ui/src/components/DesktopShell/DesktopShell.vue` — `data-slot="desktop-shell-content"`, `scroll` prop (default `true`), pinned `PageHeaderTarget`, scroll-container registration
- `apps/frappe-ui/src/components/Sidebar/Sidebar.vue`, `types.ts` — `v-model:collapsed` (`defineModel`), auto-collapse below the `sm` breakpoint (`useBreakpoints`), `width`/`collapsedWidth` defaults (`15rem`/`3rem`; recipes and `DESIGN.md` itself call `Sidebar` with `width="14rem"`)
- `apps/frappe-ui/src/components/PageHeader/PageHeaderBase.vue` — padding-free `Teleport`-to-target primitive shared by `PageHeader`/`PageHeaderMobile`
- `apps/frappe-ui/src/components/Rail/Rail.vue`, `RailItem.vue`, `types.ts` — bare `w-[50px]` frame, `variant: 'tile' | 'ghost'` (default `'tile'`)
- `apps/frappe-ui/src/components/ErrorMessage/ErrorMessage.vue` — accepts `string | Error`, `DOMPurify.sanitize`/escape fallback, `role="alert"`
- `apps/frappe-ui/src/utils/dialog.ts` — `dialog = { confirm, prompt, danger }` namespace, `DialogHandle.close`, `onConfirm` auto-close + inline `setError` on throw
- `apps/frappe-ui/src/components/Toast/toast.ts` — `toast.success`/`toast.error`/`toast.info`
- `apps/frappe-ui/src/components/Provider/FrappeUIProvider.vue` — renders `<Dialogs />` and `<ToastProvider />`
- `apps/frappe-ui/src/components/FormControl/FormControl.vue` — `label`/`description`/`error`/`required` passthrough (P5)
- `apps/frappe-ui/src/data-fetching/useCall/useCall.ts` — `immediate` default `true`, `submit(params?)`, `loading`
- `apps/frappe-ui/src/components/ScrollArea/ScrollArea.vue` — `orientation: 'vertical' | 'horizontal' | 'both'`
- `apps/frappe-ui/spec/foundations.md`, `spec/adr/0005-focus-ring-2px.md` — focus-ring themes (`ring-outline-gray-3`/`ring-outline-red-3`/`ring-blue-400`/`ring-outline-green-3`)
- `apps/frappe-ui/spec/adr/0006-numbered-radius-tokens.md` — numbered radius scale (`rounded-4`=8px default control, `rounded-6`=12px card, `rounded-9`=100px pill), deprecated named aliases
- `apps/frappe-ui/spec/adr/0007-typography-style-utilities.md`, `apps/frappe-ui/tailwind/generated/typography.json` — `text-{size}-{weight}` composite utilities (`medium`/`semibold`/`bold`/`black` variants exist per size, incl. `text-base-medium` and `text-lg-semibold`)
- `apps/frappe-ui/src/index.ts` — `ListView` "do not deprecate until `frappe-ui/list` reaches parity" comment; full `List`/`ListView` prop/slot tables live in [frappe-ui-list-and-editor.md](../../frappe-frontend-development/references/frappe-ui-list-and-editor.md)
- Full component prop/slot/emit reference: [frappe-ui-components.md](../../frappe-frontend-development/references/frappe-ui-components.md) and its split files, cited independently in each file's own `## Sources` footer
