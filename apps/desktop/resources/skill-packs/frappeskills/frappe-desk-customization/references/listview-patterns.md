# ListView Patterns Guide

This guide covers the complete ListView design pattern used throughout the application.

> **Scope.** The template above is the **frappe-ui (Vue) `<ListView>`** pattern for standalone SPA frontends. The **Desk** list view (`/desk/<doctype>` (v16); `/app/<doctype>` on v15, and still redirects to `/desk/...` on v16) is customized differently — via `frappe.listview_settings` in a `<doctype>_list.js` file. See **"Desk ListView Settings"** at the bottom of this file. The two are unrelated APIs.

## Reference Design

Based on the Hotel Reservations ListView design with comprehensive features:
- Header with title, description, and action buttons
- Dashboard section with NumberChart stats
- Tabs with icons and badge counts
- Search and filter section
- Custom ListView with columns
- Loading and empty states
- Pagination with page size selector
- Bulk actions support

## Complete ListView Template

The full Vue template (header, dashboard stats, tabs, search/filter, error
state, `<ListView>` with column slots, loading/empty states, bulk-select
banner, and pagination) is the frappe-ui "List Page" pattern — see
**[frappe-ui-spa-page-patterns.md § Pattern: List Page](../../frappe-frontend-development/references/frappe-ui-spa-page-patterns.md#pattern-list-page)**
for the complete, maintained copy. The style rules extracted from it are
summarized below.

## Design Patterns Summary

### 1. Header Section
- Left: Title (bold, xl) + optional description (sm, gray-500)
- Right: Action buttons (New, Refresh) with icons
- Button variant: `solid` with theme `blue` or `gray`
- Button size: `sm`
- Icon prefix using `FeatherIcon` at `h-4 w-4` (deprecated `(v1)`; prefer a `lucide-*` icon string)

### 2. Dashboard Section
- White background, rounded-lg, shadow-sm
- Section header: `p-3 border-b` with `text-md font-semibold`
- Grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6`
- Padding: `p-3` for the chart container

### 3. Tabs Section
- White background, rounded-lg, shadow-sm
- Flex container with `border-b`
- Tab buttons:
  - Active: `border-blue-500 text-blue-600 bg-blue-50`
  - Inactive: `border-transparent text-gray-500`
- Icon + label + badge count
- Badge styling:
  - Active tab: `bg-blue-100 text-blue-700`
  - Inactive tab: `bg-gray-100 text-gray-600`

### 4. Search & Filter Section
- White background, border-t
- Padding: `p-3`
- Flex row for inputs
- Search input takes flex-1
- Filter selects: `md:w-40`
- Clear button with X icon

### 5. Error Banner
- `bg-red-50 border-red-200`
- `p-4` padding
- Alert circle icon (red-500)
- Retry button (outline, red theme)

### 6. List Section
- White background, rounded-lg, shadow-sm
- Header: `px-6 py-4 border-b`
- Count text: "Showing X to Y of Z"
- Custom ListView with column slots
- Row click navigation

### 7. Loading State
- `p-12` padding
- Flex centered
- Spinner: `animate-spin rounded-full h-8 w-8 border-b-2`

### 8. Empty State
- `p-12` padding, text center
- Inbox icon (gray-400, h-12 w-12)
- Heading: `text-lg font-medium text-gray-900`
- Description: `text-sm text-gray-500`
- Action button

### 9. Pagination
- `border-t bg-gray-50` or `border-t` on white
- `px-6 py-3`
- Left: Page size selector
- Right: Page navigation (first, prev, numbers, next, last)
- Disabled state for first/last buttons

---

## Desk ListView Settings (`frappe.listview_settings`)

The Desk list view at `/desk/<doctype>` (v16; `/app/<doctype>` on v15, redirected on v16 — see `hooks.py:website_redirects`) is the vanilla-JS `frappe.views.ListView` (source: `apps/frappe/frappe/public/js/frappe/list/list_view.js`, extends `base_list.js`). Customize it by assigning a settings object in `{app}/{module}/doctype/{doctype}/{doctype}_list.js`. This is **not** frappe-ui.

```javascript
frappe.listview_settings["Task"] = {
  // Extra fields to fetch for each row (needed by get_indicator/formatters)
  add_fields: ["status", "priority", "exp_end_date"],

  // Default filters when opening the list (2- or 3-tuple; doctype prepended)
  filters: [["status", "!=", "Cancelled"]],

  // Hide the auto "Name" column when title_field is set
  hide_name_column: true,

  // Colored status pill: [label, color, filter_condition]
  // colors: gray|blue|green|red|orange|yellow|purple|pink|cyan|...
  get_indicator(doc) {
    if (doc.status === "Open") return [__("Open"), "orange", "status,=,Open"];
    if (doc.status === "Completed") return [__("Completed"), "green", "status,=,Completed"];
    return [__(doc.status), "gray", "status,=," + doc.status];
  },

  // Per-field cell renderer: (value, df, doc) => html
  formatters: {
    priority(value, df, doc) {
      return `<span class="indicator-pill ${value === "High" ? "red" : "gray"}">${value}</span>`;
    },
  },

  // Inline per-row action button
  button: {
    show: (doc) => doc.status === "Open",
    get_label: () => __("Close"),
    get_description: (doc) => __("Close {0}", [doc.name]),
    action: (doc) => frappe.db.set_value("Task", doc.name, "status", "Completed"),
  },

  // Runs after the list controller is constructed; `listview` is the controller
  onload(listview) {
    listview.page.add_inner_button(__("Bulk Import"), () => open_import());
    listview.page.add_action_item(__("Archive selected"), () => {
      const names = listview.get_checked_items(true); // true -> docnames only
      // ...bulk operation
    });
  },

  // Override the primary ("+ Add") action
  primary_action() { frappe.new_doc("Task"); },

  // Override the row link target
  get_form_link(doc) { return `/desk/task/${encodeURIComponent(doc.name)}`; },  // (v16) — was `/app/task/...` on v15

  before_render() {},   // before each render pass
  refresh(listview) {}, // after each refresh
};
```

### Verified settings keys

All keys below are read directly in `list_view.js` (line refs approximate, v16):

| Key | Type | Behavior |
|---|---|---|
| `add_fields` | `string[]` | Extra fields fetched per row (merged into query, ~L225) |
| `filters` | `array[]` | Default filters; 3-tuples get the doctype prepended (~L107, `parse_filters_from_settings`) |
| `hide_name_column` | `boolean` | Suppresses the Name column when `title_field` set (~L456) |
| `get_indicator(doc)` | `fn → [label, color, condition]` | Row status pill; also drives `frappe.get_indicator` (`model/indicator.js`) |
| `formatters` | `{ [field]: (value, df, doc) => html }` | Custom cell HTML (~L997); skipped for the Subject column |
| `button` | `{ show(doc), get_label(doc), get_description(doc), action(doc) }` | Inline row button; all four are functions (~L1191-1201, action at ~L1633) |
| `dropdown_button` | `{ get_label: string, buttons: [{ show(doc), get_label: string, get_description(doc), action(doc) }] }` | Inline row dropdown (~L1169–1241). Unlike `button`, `get_label` here is a **plain string** rendered directly (not called as a function) at both the group and per-button level; `show`/`get_description`/`action` are still functions |
| `onload(listview)` | `fn` | Called once after setup (~L338) |
| `primary_action()` | `fn` | Replaces the default "+ Add" behavior (~L297, ~L1694) |
| `get_form_link(doc)` | `fn → string` | Row link URL override (~L1253) |
| `before_render()` | `fn` | Before render (~L630) |

### Indicator precedence (from `model/indicator.js`)

`frappe.get_indicator(doc, doctype)` resolves in this order — the first
matching branch returns; later branches never run:
1. `doc.__unsaved` → "Not Saved" (orange)
2. Workflow state field value, unless the workflow sets `override_status`
   (and `show_workflow_state` isn't passed) or the state is in
   `frappe.workflow.avoid_status_override[doctype]`
3. Submittable + `docstatus==0` → "Draft" (red), unless `settings.has_indicator_for_draft`
4. Submittable + `docstatus==2` → "Cancelled" (red), unless `settings.has_indicator_for_cancelled`
5. `doc.status` matches a title in the DocType's own `states` table
   (`meta.states`, the "Document States" grid on the DocType form) — uses
   that state's configured color
6. `settings.get_indicator(doc)` return value
7. Submittable + `docstatus==1` → "Submitted" (blue)
8. `doc.status` generic fallback (gray, best-effort)
9. `enabled` / `disabled` field fallback

So a custom `get_indicator` does **not** override the Not Saved / workflow /
Draft / Cancelled pills, nor a DocType's own `states`-table pill (step 5) —
it only wins when none of steps 1-5 match.

### Bulk actions & selection

- `listview.get_checked_items()` → array of row docs; `listview.get_checked_items(true)` → array of docnames.
- Standard bulk actions (Edit, Delete, Assign, Add Tags, Print, Export, Apply Assignment Rule, workflow transitions) are provided by `list/bulk_operations.js` and wired in the list view's actions menu — you don't reimplement them.
- Add custom bulk actions via `listview.page.add_action_item(label, fn)` inside `onload`.

### Real example (verified)

`apps/erpnext/erpnext/stock/doctype/delivery_note/delivery_note_list.js` defines `frappe.listview_settings["Delivery Note"]` with `add_fields`, a multi-branch `get_indicator` (To Bill / Partially Billed / Completed / Return / Closed), and an `onload` that adds a "Delivery Trip" bulk action using `doclist.get_checked_items()`.

## Sources

- `apps/frappe/frappe/public/js/frappe/list/list_view.js` — `frappe.views.ListView`, `this.settings.*`
- `apps/frappe/frappe/public/js/frappe/list/base_list.js` — base list controller
- `apps/frappe/frappe/public/js/frappe/list/bulk_operations.js` — bulk actions
- `apps/frappe/frappe/public/js/frappe/model/indicator.js` — `frappe.get_indicator`, precedence
- `apps/frappe/frappe/public/js/frappe/ui/page.js` — `add_inner_button`, `add_action_item`, `set_primary_action`
- `apps/erpnext/erpnext/stock/doctype/delivery_note/delivery_note_list.js` — real `listview_settings` example
