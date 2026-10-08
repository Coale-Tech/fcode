# App Shell Patterns

App shells assemble navigation (a `Rail` icon column and/or a `Sidebar` panel)
around routed page content, with a shared header target. frappe-ui v1 ships
purpose-built shell primitives; 0.1.x apps hand-roll the same structure from
Tailwind and (in 0.1.x only) a config-object `Sidebar`.

## Choosing a shell

`DesktopShell` and `MobileShell` `(v1)` are **not** one responsive component —
mobile and desktop are different navigation models, so the app renders
whichever matches the current viewport (typically via `useMediaQuery` from
`@vueuse/core`) and swaps between them at a breakpoint:

```vue
<script setup>
import { useMediaQuery } from '@vueuse/core'
const isDesktop = useMediaQuery('(min-width: 1024px)')
</script>

<template>
  <DesktopAppShell v-if="isDesktop" />
  <MobileAppShell v-else />
</template>
```

Both shells register their content area as the active scroll container (via
an internal registry), so `useScrollContainer()` / `getScrollContainer()` and
a router `scrollBehavior` resolve the right element with no app-owned global.
Swapping shells on a viewport change hands the registry entry over cleanly.

(`src/components/DesktopShell/`, `src/components/MobileShell/`)

## DesktopShell `(v1)`

| Prop | Type | Default | Notes |
|---|---|---|---|
| `scroll` | `boolean` | `true` | `false` for multi-pane layouts where inner panes own their own scroll (the content area then fills the remaining height instead of page-scrolling). |

Slots: `#rail`, `#sidebar`, `#default`. The content region carries
`data-slot="desktop-shell-content"` for app-level styling (card surface,
gutter, background).

```vue
<!-- DesktopAppShell.vue -->
<template>
  <DesktopShell>
    <template #rail>
      <Rail>
        <RailItem label="Home" icon="lucide-home" to="/" />
        <RailItem label="Search" icon="lucide-search" variant="ghost" @click="openSearch" />
      </Rail>
    </template>

    <template #sidebar>
      <Sidebar v-if="showSidebar" v-model:collapsed="collapsed">
        <SidebarLabel>Sales</SidebarLabel>
        <SidebarItem label="Leads" icon="lucide-users" to="/leads" />
        <SidebarItem label="Deals" icon="lucide-briefcase" to="/deals" />
      </Sidebar>
    </template>

    <router-view />
  </DesktopShell>
</template>
```

Pages declare their own `PageHeader` anywhere inside the routed content — it
teleports to the header target the shell pins above the scroll region; no
manual `PageHeaderTarget` wiring is needed.

## MobileShell `(v1)`

A fixed, full-height column: a pinned header target (with safe-area padding
for installed PWAs), a natively-scrolling content area, and a `#nav` slot for
a bottom tab bar. Slots: `#default`, `#nav`.

```vue
<!-- MobileAppShell.vue -->
<template>
  <MobileShell>
    <router-view />
    <template #nav>
      <MobileNav>
        <MobileNavItem label="Home" icon="lucide-home" to="/" />
        <MobileNavItem label="Leads" icon="lucide-users" to="/leads" />
        <MobileNavItem label="You" :to="{ name: 'Profile' }" :active="onProfileRoute">
          <template #default="{ active }">
            <UserAvatar :user="me" :class="{ 'ring-2 ring-outline-gray-4': active }" />
          </template>
        </MobileNavItem>
      </MobileNav>
    </template>
  </MobileShell>
</template>
```

`MobileNavItem` props: `label` (required, also the accessible name), `icon`
(`string | Component`, e.g. `lucide-home`; ignored if the default slot is
used), `to`, `active` (independent of the current route — omit to infer from
`to`). Tapping an already-active tab scrolls to top instead of re-navigating.
Emits `click`. `MobileNav`/`MobileNavItem` render plain `<a>`/`<button>`
outside a router with no warnings.

(`src/components/MobileShell/`, `src/components/MobileNav/`)

## Rail `(v1)`

A bare fixed-width (50px) icon column with a shared tooltip context; no
built-in scrolling or layout slots — position children with plain flex
(`flex-1` on the middle list to push top/bottom anchors to the edges).

`RailItem` props:

| Prop | Type | Default | Notes |
|---|---|---|---|
| `label` | `string` | — | Required. Tooltip text and accessible-name base. |
| `icon` | `string \| Component` | — | e.g. `lucide-search`; ignored if default slot used. |
| `to` | route target | — | Renders a router link; omit for a `click`-emitting button. |
| `active` | `boolean` | — | Current-destination indicator. |
| `badge` | `number` | `0` | Unread count; teleports to `<body>` so it isn't clipped. |
| `badgeStyle` | `'count' \| 'dot'` | `'count'` | Dot still surfaces the real count in the tooltip. |
| `variant` | `'tile' \| 'ghost'` | `'tile'` | `tile`: filled cell with active indicator bar, for avatar/workspace items. `ghost`: transparent until hover/active, for icon shortcuts (Search, Notifications). |

(`src/components/Rail/`)

## Sidebar

`Sidebar` is a bare fixed-width column with collapse machinery and one slot;
compose the body from `SidebarItem` / `SidebarLabel`. No built-in scrolling —
wrap the middle list in your own `overflow-y-auto` container and push a
footer with `mt-auto`.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `disableCollapse` | `boolean` | — | Pins the sidebar open; no collapse toggle. |
| `width` | `string` | `'15rem'` | Expanded width (CSS length, applied inline). `(v1)` |
| `collapsedWidth` | `string` | `'3rem'` | `(v1)` |
| `collapsed` | `boolean \| null` | `null` | Bind `v-model:collapsed`; unset auto-collapses below the `sm` breakpoint. |
| `header` | `SidebarHeaderProps` | — | **Deprecated `(v1)`** — config-object header. Compose a header as a direct child instead. |
| `sections` | `SidebarSectionProps[]` | — | **Deprecated `(v1)`** — config-object sections. Compose `SidebarLabel` + `SidebarItem` instead. |

Emits `update:collapsed`. Slots: `#default`, `#header-logo`, `#footer-items`.

`SidebarItem` props: `label`, `icon` (`string | Component`, ignored if
`#prefix` used), `suffix` (text, ignored if `#suffix` used), `to`, `active`
(inferred from `to` vs current route if omitted), `onClick`, `accessKey`. The
trailing `#suffix` zone (an options menu, an unread count) renders as a
**sibling** of the link, not nested inside it. `SidebarLabel` takes a
`divider` prop (`(v1)`) that collapses it to a horizontal rule while the
sidebar is collapsed. `SidebarHeader` takes `title` (required), `subtitle`,
`logo`, `showLogo` (`(v1)`, default `true`), `menuItems`.

```vue
<Sidebar v-model:collapsed="collapsed">
  <SidebarHeader title="My App" logo="/logo.svg" />
  <SidebarLabel>Sales</SidebarLabel>
  <SidebarItem label="Leads" icon="lucide-users" to="/leads" />
  <SidebarItem label="Deals" icon="lucide-briefcase" to="/deals">
    <template #suffix>
      <Badge :label="dealCount" theme="gray" />
    </template>
  </SidebarItem>
</Sidebar>
```

**0.1.x fallback.** The 0.1.261 baseline `Sidebar` only supports the
config-object API — no composition mode, no `width`/`collapsedWidth`:

```vue
<Sidebar
  :header="{ title: 'My App', logo: '/logo.svg' }"
  :sections="[
    { label: 'Sales', items: [
      { label: 'Leads', icon: UsersIcon, to: '/leads' },
      { label: 'Deals', icon: BriefcaseIcon, to: '/deals' },
    ]},
  ]"
/>
```

In v1 this same config-object form still works for one release
(reimplemented on top of the composition primitives) but is deprecated; write
new code with `SidebarItem`/`SidebarLabel` children.

(`src/components/Sidebar/`)

## PageHeader

`PageHeader` (desktop) and `PageHeaderMobile` share the unstyled
`PageHeaderBase` primitive. A page declares its header anywhere in its own
template; `PageHeaderBase` teleports it to the target the active shell pins,
using an anchor left at the declaration site so the shell can still locate
the page's scroll container. Clicking empty header space scrolls to top;
interactive elements (or anything tagged `data-no-scroll-top`) are ignored.

```vue
<template>
  <PageHeader>
    <Breadcrumbs :items="crumbs" />
    <Button variant="solid" label="New Lead" @click="createLead" />
  </PageHeader>
  <!-- page content -->
</template>
```

`PageHeaderMobile` keeps its title centered regardless of `#left`/`#right`
control widths and clamps it to two lines:

```vue
<PageHeaderMobile>
  <template #left>
    <PageHeaderBackButton />
  </template>
  <PageHeaderMobileTitle title="Lead: John Doe" />
  <template #right>
    <Button variant="ghost" icon="lucide-more-horizontal" />
  </template>
</PageHeaderMobile>
```

`PageHeaderBackButton` props: `to` (falls back to browser history if omitted),
`label` (default `'Back'`). `PageHeaderMobileTitle` props: `title` (overridden
by default slot); slot `#icon`. Use bare `PageHeaderBase` directly for a
custom strip (toolbar, second row) that shares the same teleport target.

(`src/components/PageHeader/`)

## Hand-rolled 0.1.x shell fallback

`DesktopShell`/`MobileShell`/`Rail`/`PageHeader` are absent from the 0.1.261
baseline. Projects pinned to 0.1.x compose the same structure directly with
Tailwind, `<router-view>`, and (0.1.x) `FeatherIcon` — the deprecated
top-level icon component, replaced in v1 by the `lucide-<name>` CSS class
convention used throughout this document:

```vue
<!-- App.vue (0.1.x) -->
<template>
  <div class="h-screen flex flex-col bg-white">
    <header class="h-12 border-b flex items-center px-4 justify-between">
      <button @click="sidebarOpen = !sidebarOpen" class="lg:hidden">
        <FeatherIcon name="menu" class="w-5 h-5" />
      </button>
      <router-link to="/" class="font-semibold">{{ appTitle }}</router-link>
    </header>

    <div class="flex-1 flex overflow-hidden">
      <aside
        v-show="sidebarOpen || !isMobile"
        :class="['w-56 border-r bg-gray-50 flex flex-col overflow-y-auto',
                  isMobile && 'fixed inset-y-0 left-0 z-40 pt-12']"
      >
        <Sidebar :sections="navSections" />
      </aside>
      <div v-if="sidebarOpen && isMobile" class="fixed inset-0 bg-black/20 z-30"
           @click="sidebarOpen = false" />
      <main class="flex-1 overflow-auto">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useMediaQuery } from '@vueuse/core'

const sidebarOpen = ref(false)
const isMobile = useMediaQuery('(max-width: 1024px)')
const appTitle = 'My App'
const navSections = [
  { label: 'Sales', items: [
    { label: 'Leads', icon: 'users', to: '/leads' },
    { label: 'Deals', icon: 'dollar-sign', to: '/deals' },
  ]},
]
</script>
```

## Layout variations

These are plain Tailwind layout shapes, not frappe-ui components — they apply
inside the `default` slot of either shell (or inside the 0.1.x `<main>`).

### Three-column (email/messaging)

```
┌──────────┬────────────────┬──────────────────────────────┐
│ Folders  │ Message List   │ Message Content              │
├──────────┼────────────────┼──────────────────────────────┤
│ Inbox    │ Subject 1      │ From: sender@example.com     │
│ Sent     │ Preview...     │ To: me@example.com           │
│ Drafts   │                │                              │
│ Archive  │ Subject 2      │ Lorem ipsum dolor sit amet   │
└──────────┴────────────────┴──────────────────────────────┘
```

```vue
<div class="flex-1 flex overflow-hidden">
  <div class="w-48 border-r overflow-y-auto"><!-- folders --></div>
  <div class="w-80 border-r overflow-y-auto"><!-- message list --></div>
  <div class="flex-1 overflow-y-auto"><!-- message content --></div>
</div>
```

### Dashboard (stat cards + activity)

```vue
<template>
  <div class="p-6">
    <PageHeader><h1 class="text-lg font-semibold">Dashboard</h1></PageHeader>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div v-for="stat in stats" :key="stat.label" class="rounded-lg border p-4">
        <div class="text-ink-gray-6 text-sm">{{ stat.label }}</div>
        <div class="text-2xl font-semibold">{{ stat.value }}</div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 rounded-lg border p-4">
        <div class="font-medium mb-2">Recent Activity</div>
        <ActivityFeed :items="recentActivities" />
      </div>
      <div class="rounded-lg border p-4">
        <div class="font-medium mb-2">Quick Actions</div>
        <QuickActionList :actions="quickActions" />
      </div>
    </div>
  </div>
</template>
```

### Full-width detail (no split)

For complex forms or dashboards that don't need a list/detail split, skip the
sidebar's counterpart panel entirely and center content:

```vue
<div class="flex-1 overflow-auto">
  <div class="max-w-4xl mx-auto py-6 px-4">
    <PageHeader><Breadcrumbs :items="breadcrumbs" /></PageHeader>
    <DetailView :doc="doc" />
  </div>
</div>
```

See [`frappe-ui-spa-page-patterns.md`](frappe-ui-spa-page-patterns.md) for
full list/detail page recipes, and
[`frappe-ui-list-and-editor.md`](frappe-ui-list-and-editor.md) for the list
and rich-text primitives referenced above.

## Sources

Verified against frappe-ui `1.0.0-beta.29` (`apps/frappe-ui/package.json`):

- `src/components/{DesktopShell,MobileShell}/{DesktopShell,MobileShell}.{api.md,vue,md}` —
  props/slots, `data-slot="desktop-shell-content"`, `registerScrollContainer`/`useScrollContainer`
  wiring (`src/composables/useScrollContainer.ts`), PWA safe-area padding on `MobileShell`.
- `src/components/Rail/Rail.api.md`, `src/components/MobileNav/MobileNav.api.md` — `RailItem`/
  `MobileNavItem` props and active-tab scroll-to-top behavior.
- `src/components/Sidebar/Sidebar.api.md` — composition props/slots and the deprecated
  `header`/`sections` config-object props.
- `src/components/PageHeader/PageHeader.api.md` — `PageHeader`, `PageHeaderBase`,
  `PageHeaderMobile`, `PageHeaderMobileTitle`, `PageHeaderBackButton`.
- `apps/crm/frontend/node_modules/frappe-ui/` (v0.1.261) — `src/components/Sidebar/Sidebar.vue`
  confirms the config-object-only API (no composition slot, no `width`/`collapsedWidth`) on the
  0.1.x baseline.
- `src/utils/iconString.ts`, `src/index.ts` — `FeatherIcon` still exported but deprecated in
  favor of the `lucide-<name>` class convention used by v1.
- `package.json` — `@vueuse/core` is a frappe-ui dependency, supporting the `useMediaQuery`
  desktop/mobile split shown above.
