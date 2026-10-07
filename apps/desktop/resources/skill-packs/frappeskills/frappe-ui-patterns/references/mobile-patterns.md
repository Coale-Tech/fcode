# Mobile UI Patterns

Adapted in part from frappe/frappe-ui (MIT): `skills/frappe-ui/DESIGN.md`.

Mobile shell APIs and desktop→mobile translation patterns for frappe-ui apps.
Desktop shell, screen archetypes, hierarchy, and color rules live in
[ui-patterns.md](ui-patterns.md) — this file covers only what's
mobile-specific: the mobile shell components and the systematic desktop→mobile
translation.

**Version note:** every component below — `MobileShell`, `MobileNav`/
`MobileNavItem`, `PageHeaderMobile`/`PageHeaderBackButton`, `BottomSheet`, and
the `useScreenSize`/`useIsMobile` composables — is **`(v1)`**; none exist in
frappe-ui 0.1.x. 0.1.x apps hand-build a mobile header/drawer with plain
`<div>`s, a media query (commonly `@vueuse/core`'s `useBreakpoints`/
`useMediaQuery`), and either a self-built sheet or a third-party one. If your
app is pinned to 0.1.x, treat the component names below as the migration
target, not as available imports — check `frontend/package.json` first.

### Breakpoints

frappe-ui apps use TailwindCSS's default breakpoint scale for responsive
utility classes (`sm:`, `md:`, …):

| Breakpoint | Min width | Typical device |
|---|---|---|
| `sm` | 640px | Large phones |
| `md` | 768px | Tablets |
| `lg` | 1024px | Small laptops |
| `xl` | 1280px | Desktops |
| `2xl` | 1536px | Large screens |

For the one decision that isn't a utility class — *which shell to mount* —
use the reactive composable below rather than a CSS-only toggle; the app
needs to pick `DesktopShell` vs `MobileShell` in script, not just restyle one
component.

### `useScreenSize` / `useIsMobile` `(v1)`

`src/composables/useScreenSize.ts`:

```ts
function useScreenSize(): { width: number; height: number } // reactive, updates on resize
function useIsMobile(breakpoint = 640): ComputedRef<boolean>
```

`useScreenSize()` returns a reactive `{ width, height }` that tracks
`window.resize`; it falls back to a desktop-sized `1024×768` with no
`window` (SSR) so a mobile layout doesn't flash before hydration.
`useIsMobile(breakpoint)` derives a boolean from it — `true` below
`breakpoint`, default `640` (Tailwind's `sm`). Use it to pick the shell:

```vue
<script setup>
import { useIsMobile } from 'frappe-ui'
const isMobile = useIsMobile()
</script>

<template>
  <MobileShell v-if="isMobile">…</MobileShell>
  <DesktopShell v-else>…</DesktopShell>
</template>
```

## MobileShell `(v1)`

The mobile app frame — a fixed, full-height column: a pinned
`PageHeaderTarget` on top (with safe-area padding when running as an
installed PWA), a native-momentum-scrolling content area, and a `#nav` slot
for a bottom `MobileNav`. It's a separate family from `DesktopShell`, not a
responsive variant of it — the app picks which shell to render
(`src/components/MobileShell/MobileShell.vue`).

**Slots:** `#default` (routed page content, scrolls with the platform's own
momentum/overscroll), `#nav` (pinned tab bar, not scrolled). No props.

```html
<MobileShell>
  <PageHeaderMobile title="Inbox">
    <template #left><PageHeaderBackButton /></template>
    <template #right><Button variant="ghost" icon="lucide-search" /></template>
  </PageHeaderMobile>
  <div>…routed page…</div>
  <template #nav>
    <MobileNav>
      <MobileNavItem label="Home" icon="lucide-home" to="/" />
      <MobileNavItem label="Inbox" icon="lucide-inbox" to="/inbox" />
      <MobileNavItem label="You"><Avatar :image="user.image" size="sm" /></MobileNavItem>
    </MobileNav>
  </template>
</MobileShell>
```

The content area registers into frappe-ui's scroll-container registry, so
`useScrollContainer()` / `getScrollContainer()` resolve it — a tapped-active
tab or a router `scrollBehavior` can drive it without an app-owned global.

## PageHeaderMobile / PageHeaderBackButton `(v1)`

`PageHeaderMobile` keeps its title centered regardless of the `#left`/`#right`
control widths and clamps it to two lines; it teleports into the
`PageHeaderTarget` `MobileShell` pins for it, same mechanism as the desktop
`PageHeader`.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `title` | `string` | — | Centered title; overridden by the `#default` slot |

**Slots:** `#left`, `#default`, `#right`.

`PageHeaderBackButton`:

| Prop | Type | Default | Notes |
|---|---|---|---|
| `to` | `string \| RouteLocationRaw` | — | Navigation target; omit to fall back to browser history |
| `label` | `string` | `"Back"` | Accessible label |

There's also `PageHeaderMobileTitle` (props: `title`; slots: `#icon`,
`#default`) — the title-plus-leading-icon primitive `PageHeaderMobile` is
built from, for a custom header row that still needs the centered-title
behavior.

## MobileNav / MobileNavItem `(v1)`

`MobileNav` is a bare grid frame — each `MobileNavItem` becomes one
equal-width column (`grid auto-cols-fr grid-flow-col`), so the bar adapts to
however many items you pass; it isn't hardcoded to a fixed tab count. Bottom
padding clears the home-indicator area in an installed PWA
(`src/components/MobileNav/MobileNav.vue`). **Slots:** `#default` only (place
`MobileNavItem`s in it).

`MobileNavItem`:

| Prop | Type | Default | Notes |
|---|---|---|---|
| `label` | `string` | — | **Required.** Shown under the icon; also the accessible name |
| `icon` | `string \| Component` | — | `lucide-*` class or a component; ignored when the `#default` slot is used |
| `to` | `string \| RouteLocationRaw` | — | Router link target. Tapping the item while it's already the current route scrolls the shell to top instead of re-navigating |
| `active` | `boolean` | inferred from `to` | Highlight independent of the current route, so one tab can stay lit across a whole section |

**Slots:** `#default` (`{ active: boolean }`) — a custom glyph or `Avatar`,
overriding `icon`. **Emits:** `click` (`[event: MouseEvent]`).

A common convention in shipping apps (not a component constraint) is four
tabs with the last a personal-account `Avatar` — but `MobileNav`'s grid
layout works with any item count.

## BottomSheet `(v1)`

The mobile-native replacement for a desktop `Popover`/side panel — "whatever
lived in the desktop sidebar" per `skills/frappe-ui/DESIGN.md`. Built on
`reka-ui`'s `DialogRoot`, so it inherits the same focus-trap/ARIA baseline as
`Dialog` (P12); content scrolls in a fixed `70vh` region below the drag
handle (`src/components/BottomSheet/BottomSheet.vue`).

| Prop | Type | Default | Notes |
|---|---|---|---|
| `open` | `boolean` | — | Visibility; bind with `v-model:open` |
| `title` | `string` | — | Optional centered title in the drag-handle area |
| `dismissible` | `boolean` | `true` | Allow outside-click, Escape, **and swipe-down** to close |

**Slots:** `#default`. **Emits:** `update:open` (`[value: boolean]`),
`after-leave` (`[]`, fires once the close transition finishes).

```vue
<BottomSheet v-model:open="showFilters" title="Filters">
  <div class="space-y-4 p-4">
    <FormControl v-model="statusFilter" type="select" label="Status" :options="statusOptions" />
    <FormControl v-model="sortBy" type="select" label="Sort by" :options="sortOptions" />
  </div>
</BottomSheet>
```

The handle is genuinely swipeable — dragging it down past ~25% of the sheet's
own height, or a fast downward flick, closes it with an iOS-style fling
animation; an upward drag rubber-bands back to rest. This is a real pointer
gesture (`@vueuse/core`'s `usePointerSwipe`), not a CSS-only transition, so
don't wrap `BottomSheet`'s content in another scrollable/draggable element
that would compete with it for the same pointer events. There is no separate
`ActionSheet` component in frappe-ui — build an action list as a `BottomSheet`
whose body is a stack of `Button`/`SidebarItem`-style rows, or use a
`Dropdown` for a small, anchored action menu.

## Desktop → mobile translation

Systematic translation, not a separate design (`skills/frappe-ui/DESIGN.md`):

- `Sidebar` → `BottomSheet`; persistent nav → `MobileNav` tabs; side-by-side
  panes → separate routes, not a CSS breakpoint toggle on one component.
- Action clusters collapse to one `…` `Dropdown`; multi-value fields collapse
  (an assignee list → a single avatar, a meta panel → a chip row).
- Titles scale up (`text-base` → `text-lg`), rows get taller (`h-15` →
  `h-17`).
- Drop the active-row highlight used on desktop lists — tapping drills in
  instead of selecting-and-showing-alongside.
- Section cards go flush on mobile: border/rounding/padding apply only at
  `sm:`+.
- Pinned footers need safe-area padding in an installed PWA:
  `[@media(display-mode:standalone)]:pb-[env(safe-area-inset-bottom)]`
  (the same pattern `MobileNav` and `MobileShell`'s header target use
  internally).
- Same data on both — trim fields for the narrower layout, don't fork the
  underlying model or fetch different data per breakpoint.

### Responsive filters

Inline controls on desktop become a `BottomSheet` trigger on mobile — the
sheet body is ordinary `FormControl`s, not a bespoke filter widget:

```vue
<template>
  <div class="hidden md:flex items-center gap-2">
    <FormControl v-model="search" type="text" placeholder="Search…" />
    <FormControl v-model="statusFilter" type="select" :options="statusOptions" />
  </div>

  <div class="flex items-center gap-2 md:hidden">
    <FormControl v-model="search" type="text" placeholder="Search…" class="flex-1" />
    <Button variant="subtle" icon-left="lucide-filter" label="Filters" @click="showFilters = true" />
  </div>

  <BottomSheet v-model:open="showFilters" title="Filters">
    <div class="space-y-4 p-4">
      <FormControl v-model="statusFilter" type="select" label="Status" :options="statusOptions" />
    </div>
  </BottomSheet>
</template>
```

### Responsive actions

A desktop button row collapses to a single `Dropdown` trigger on mobile —
there's no `ActionSheet` component to reach for; `Dropdown`'s own options
list already renders as a scrollable menu:

```vue
<div class="hidden items-center gap-2 md:flex">
  <Button label="Edit" @click="edit" />
  <Button label="Duplicate" @click="duplicate" />
  <Button variant="subtle" theme="red" label="Delete" @click="confirmDelete" />
</div>

<Dropdown
  class="md:hidden"
  :options="[
    { label: 'Edit', icon: 'lucide-edit-2', onClick: edit },
    { label: 'Duplicate', icon: 'lucide-copy', onClick: duplicate },
    { label: 'Delete', icon: 'lucide-trash-2', onClick: confirmDelete },
  ]"
>
  <Button variant="ghost" icon="lucide-more-vertical" />
</Dropdown>
```

### Responsive table → list

Don't hand-build a card list to replace a table on narrow viewports — pick
the archetype per breakpoint from the same data source (`List` from the
`frappe-ui/list` subpath, `(v1)`, or the legacy `ListView` family), rather
than maintaining two markup trees. Component and prop reference:
[frappe-ui-list-and-editor.md](../../frappe-frontend-development/references/frappe-ui-list-and-editor.md).

## Common mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Building a custom fixed-bottom sheet with `Teleport` + `Transition` | Reimplements focus trap, Escape handling, and swipe-to-dismiss `BottomSheet` already has | Use `BottomSheet` (`(v1)`) |
| Reaching for `useMediaQuery`/`useBreakpoints` from `@vueuse/core` to pick the shell | Works, but frappe-ui already ships `useIsMobile()` wired to the same breakpoint convention and SSR-safe defaults | Use `useIsMobile()` from `frappe-ui` |
| A component named `ActionSheet` | Doesn't exist in frappe-ui at any version | Compose action lists from `BottomSheet`, or use `Dropdown` for a small anchored menu |
| Hardcoding `MobileNav` to exactly 4 columns | `MobileNav`'s grid adapts to item count automatically | Just add/remove `MobileNavItem`s |
| Wrapping `BottomSheet`'s content in another swipeable/scrollable region | Competes with the handle's pointer-swipe gesture for events | Keep custom gesture handling out of a `BottomSheet` body; use its own `70vh` scroll region |

## Sources

Verified against frappe-ui `1.0.0-beta.29` (`apps/frappe-ui/package.json`):

- `apps/frappe-ui/src/composables/useScreenSize.ts` — `useScreenSize`/`useIsMobile`, `1024×768` SSR fallback, `640` default breakpoint
- `apps/frappe-ui/src/components/MobileShell/MobileShell.vue` — fixed full-height column, pinned `PageHeaderTarget` with `standalone` safe-area padding, `#default`/`#nav` slots, no props
- `apps/frappe-ui/src/composables/useScrollContainer.ts` — `registerScrollContainer`/`unregisterScrollContainer`/`useScrollContainer`/`getScrollContainer`/`scrollToTop` registry
- `apps/frappe-ui/src/components/PageHeader/PageHeaderMobile.vue`, `PageHeaderBase.vue`, `types.ts` — centered title with dynamic `#left`/`#right` inset, two-line clamp, shared `Teleport`-to-target mechanism with desktop `PageHeader`
- `apps/frappe-ui/src/components/PageHeader/PageHeaderBackButton.vue` — `label` default `'Back'`, `to` falls back to `router.back()`
- `apps/frappe-ui/src/components/PageHeader/PageHeaderMobileTitle.vue` — `#icon`/`#default` slots
- `apps/frappe-ui/src/components/MobileNav/MobileNav.vue` — bare `grid auto-cols-fr grid-flow-col` frame, `#default`-only slot
- `apps/frappe-ui/src/components/MobileNav/MobileNavItem.vue`, `types.ts` — required `label`, `to`/`active` props, tap-when-current scrolls to top instead of re-navigating, `#default` slot receives `{ active }`, `click` emit
- `apps/frappe-ui/src/components/BottomSheet/BottomSheet.vue`, `types.ts` — built on `reka-ui`'s `DialogRoot`, fixed `h-[70vh]` scroll region, `dismissible` (default `true`) gates outside-click/Escape/swipe, `usePointerSwipe`-driven drag with `CLOSE_HEIGHT_RATIO = 0.25` and rubber-band on upward drag, `update:open`/`after-leave` emits
- No `ActionSheet` component anywhere in the package (repo-wide search)
- `apps/frappe-ui/skills/frappe-ui/DESIGN.md` — desktop→mobile translation rules (sidebar→BottomSheet, action clusters→Dropdown, row-height/title-scale deltas, `[@media(display-mode:standalone)]` footer padding)
- `apps/frappe-ui/src/index.ts` — `ListView` "do not deprecate until `frappe-ui/list` reaches parity" comment; full `List`/`ListView` API verification lives in [frappe-ui-list-and-editor.md](../../frappe-frontend-development/references/frappe-ui-list-and-editor.md)
