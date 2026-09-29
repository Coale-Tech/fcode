---
name: fcode-frappe-ui
description: "Build frappe-ui Vue 3 frontend pages: router, useCall/useList, FrappeUI components, and the Studio-exported app pattern."
---

# frappe-ui frontend development

frappe-ui is the Frappe-maintained Vue 3 component library used by Frappe CRM,
Raven, Helpdesk, and Studio-exported apps. Source at
`apps/frappe-ui/` in the bench.

## Project setup (standalone page inside a Frappe app)

```
apps/<app>/<app>/public/frontend/
  index.html
  package.json          # "frappe-ui": "..."
  vite.config.js
  src/
    main.js
    router.js
    pages/
    components/
```

Build output goes to `<app>/public/js/<bundle>.js` via Vite. Register the
bundle in `hooks.py`:

```python
app_include_js = ["/assets/<app>/js/<bundle>.js"]
```

## Data fetching

**Single call:**
```js
import { createCall } from "frappe-ui"

const result = createCall("myapp.api.get_data", { filters: { ... } })
// result.data, result.loading, result.error are reactive refs
await result.fetch()
```

**List resource:**
```js
import { createListResource } from "frappe-ui"

const orders = createListResource({
    doctype: "Sales Order",
    fields: ["name", "grand_total", "status"],
    filters: { status: "Draft" },
    orderBy: "creation desc",
    pageLength: 20,
})
await orders.fetch()
// orders.data — array of rows
// orders.next() — next page
```

**Single document resource:**
```js
import { createDocumentResource } from "frappe-ui"

const doc = createDocumentResource({ doctype: "Customer", name: customer_name })
await doc.get.fetch()
await doc.setValue.submit({ field: value })
```

## Key components

```vue
<template>
  <Button variant="solid" @click="save">Save</Button>
  <TextInput v-model="form.name" placeholder="Name" />
  <FormControl type="select" :options="statusOptions" v-model="form.status" />
  <Badge :label="doc.status" :theme="statusColor" />
  <Dialog v-model="showDialog" :options="{ title: 'Confirm' }">
    <template #body-content>Are you sure?</template>
    <template #actions>
      <Button variant="solid" @click="confirm">Confirm</Button>
    </template>
  </Dialog>
  <ListView :columns="columns" :rows="orders.data" />
</template>
```

Import from `frappe-ui`:
```js
import { Button, TextInput, FormControl, Badge, Dialog, ListView } from "frappe-ui"
```

## Router pattern

```js
// router.js
import { createRouter, createWebHistory } from "vue-router"

export default createRouter({
    history: createWebHistory("/myapp/"),
    routes: [
        { path: "/", component: () => import("./pages/Home.vue") },
        { path: "/:name", component: () => import("./pages/Detail.vue") },
    ],
})
```

## Frappe session and auth

```js
import { useFrappeAuth } from "frappe-ui"
const { currentUser, isLoggedIn, logout } = useFrappeAuth()
```

The frontend runs inside the Frappe session already established by the browser.
No separate token handling is needed for same-site API calls.

## Studio-exported pages

Pages built in Studio use frappe-ui components and export to
`apps/<app>/studio/<studio_app>/studio_page/<page_name>/` as JSON + sibling
`.ts` scripts. See `fcode-studio` for the export layout and sync workflow.
