# Desk UI (Client Scripts)

Frappe auto-generates Desk forms and list views for each DocType. Usually no custom UI code is needed.

## Client scripts

File: `apps/<app>/<app>/<module>/doctype/<doctype>/<doctype>.js`

```javascript
frappe.ui.form.on("Sample Doc", {
    // Called once during form setup
    setup(frm) {
        frm.set_query("customer", () => ({ filters: { disabled: 0 } }));
    },

    // Called on load, before the first refresh
    onload(frm) {
        if (frm.is_new()) {
            frm.set_value("posting_date", frappe.datetime.get_today());
        }
    },

    // Called every time the form loads or refreshes
    refresh(frm) {
        if (frm.doc.status === "Draft") {
            frm.add_custom_button(__("Submit"), () => frm.call("submit"));
        }
        frm.toggle_display("discount_section", frm.doc.grand_total > 1000);
        frm.set_df_property("notes", "read_only", frm.doc.docstatus === 1);
    },

    // Field change handler (fieldname as key)
    customer(frm) {
        if (!frm.doc.customer) return;
        frappe.db.get_value("Customer", frm.doc.customer, "territory", (r) => {
            frm.set_value("territory", r.territory);
        });
    },

    amount(frm) {
        frm.set_value("tax", frm.doc.amount * 0.1);
    },

    // Before save — set frappe.validated = false to cancel the save
    validate(frm) {
        if (frm.doc.amount <= 0) {
            frappe.throw(__("Amount must be positive"));
        }
    },

    before_save(frm) {
        frm.doc.full_name = `${frm.doc.first_name} ${frm.doc.last_name}`;
    },

    after_save(frm) {
        frappe.show_alert({ message: __("Saved"), indicator: "green" });
    },
});
```

`validate` and `before_save` both run before the document is saved and both
gate on the same `frappe.validated` flag — setting `frappe.validated = false`
in either one cancels the save (`frappe/public/js/frappe/form/form.js:864-879`).
There is no separate `frm.validate()` method to call from inside a handler.

### Full event list (verified in `form/form.js` and `form/script_manager.js`)

Any name bound in `frappe.ui.form.on(doctype, {...})` fires when the form
lifecycle reaches that point. Besides `setup`, `onload`, `refresh`,
`validate`, `before_save`, `after_save`, and per-fieldname handlers, these
are also triggered:

| Event | Fires |
|---|---|
| `before_load` | Before the document is fetched for the first render |
| `onload_post_render` | After the first render completes (only on initial `onload`) |
| `before_submit` | Before a document is submitted; gates on `frappe.validated` like `validate` |
| `before_cancel` / `after_cancel` | Around document cancellation |
| `before_discard` / `after_discard` | Around discarding an unsaved/amended document |
| `before_workflow_action` / `after_workflow_action` | Around a workflow transition action |
| `on_tab_change` | When the user switches a form tab |
| `on_hide` | When the form's wrapper is hidden (navigating away) |
| `<child_table_fieldname>_on_form_rendered` / `form_render` | When a grid row's inline edit form renders (`grid_row.js`) |

## Child table events

```javascript
frappe.ui.form.on("Sample Doc Item", {
    item_amount(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        frappe.model.set_value(cdt, cdn, "tax", row.item_amount * 0.1);
        calculate_total(frm);
    },

    items_remove(frm) {
        calculate_total(frm);
    },
});

function calculate_total(frm) {
    let total = 0;
    frm.doc.items.forEach((row) => { total += row.item_amount; });
    frm.set_value("total", total);
}
```

## Dialogs and prompts

```javascript
// Quick single-field prompt
frappe.prompt(
    { fieldname: "reason", fieldtype: "Small Text", label: "Reason", reqd: 1 },
    (values) => frappe.call({ method: "my_app.api.reject", args: { name: frm.doc.name, reason: values.reason } }),
    __("Rejection Reason"),
    __("Reject")
);

// Multi-field modal
let d = new frappe.ui.Dialog({
    title: __("Configure Settings"),
    fields: [
        { fieldname: "email", fieldtype: "Data", options: "Email", label: "Email", reqd: 1 },
        { fieldname: "frequency", fieldtype: "Select", options: "Daily\nWeekly\nMonthly", label: "Frequency" },
    ],
    primary_action_label: __("Save"),
    primary_action(values) {
        frappe.call({ method: "my_app.api.save_settings", args: values, callback: () => d.hide() });
    },
});
d.show();

// Confirmation
frappe.confirm(
    __("Are you sure you want to delete this?"),
    () => { /* yes */ },
    () => { /* no */ }
);
```

## Common client API

```javascript
// Call server method
frm.call("get_summary").then(r => console.log(r.message));

// Call whitelisted API
frappe.call({
    method: "myapp.api.get_expenses",
    args: { status: "Draft" },
    callback(r) { console.log(r.message); }
});

// Promise-based call
let result = await frappe.xcall("myapp.api.get_expenses", { status: "Draft" });

// Show dialog / message
frappe.prompt("Enter reason", (values) => console.log(values.value));
frappe.msgprint("Done!");
frappe.show_alert({ message: "Saved", indicator: "green" });

// Set field properties
frm.set_df_property("amount", "read_only", 1);
frm.toggle_display("notes", frm.doc.status === "Rejected");

// Set query filter for a Link field (form-level or child-table-scoped)
frm.set_query("category", () => ({ filters: { enabled: 1 } }));
frm.set_query("item_code", "items", () => ({ filters: { is_sales_item: 1 } }));
```

### Namespacing and lazy loading

```javascript
// Create nested namespaces safely (frappe/public/js/frappe/provide.js)
frappe.provide("myapp.ui");
myapp.ui.MyWidget = class { /* ... */ };

// Load a bundle only when needed (frappe/public/js/frappe/assets.js)
frappe.require("myapp_charts.bundle.js", () => render_chart());
```

Edits to bundled JS do nothing until `bench build --app <app>` or a running `bench watch` rebuilds them.

## List view customization

```javascript
// my_app/public/js/sample_doc_list.js
// or via hooks: doctype_list_js = {"Sample Doc": "public/js/sample_doc_list.js"}

frappe.listview_settings["Sample Doc"] = {
    get_indicator(doc) {
        if (doc.status === "Open") return [__("Open"), "orange", "status,=,Open"];
        if (doc.status === "Closed") return [__("Closed"), "green", "status,=,Closed"];
        return [__("Draft"), "grey", "status,=,Draft"];
    },

    onload(listview) {
        listview.page.add_action_item(__("Mark as Closed"), () => {
            let names = listview.get_checked_items(true);
            frappe.call({ method: "myapp.api.bulk_close", args: { names }, callback: () => listview.refresh() });
        });
    },

    hide_name_column: true,
};
```

Broader list-view patterns (formatters, bulk actions, indicators): [listview-patterns.md](listview-patterns.md).

## Inject scripts via hooks

Extend a DocType from another app without modifying it:

```python
# hooks.py
doctype_js = {"Sales Order": "public/js/sales_order_custom.js"}
doctype_list_js = {"Sales Order": "public/js/sales_order_list_custom.js"}
doctype_tree_js = {"Sales Order": "public/js/sales_order_tree_custom.js"}      # Tree View
doctype_calendar_js = {"Sales Order": "public/js/sales_order_calendar_custom.js"}  # Calendar View
```

All four are appended to the DocType's generated meta bundle
(`frappe/desk/form/meta.py:add_code_via_hook`) and loaded together — no
conflict with the target app's own `<doctype>.js`. For scripts that should
load on every Desk page regardless of DocType, use `app_include_js` /
`app_include_css` (global bundles) instead.

```bash
bench build --app my_app
```

## Realtime events

```javascript
frappe.realtime.on("export_complete", (data) => {
    frappe.show_alert({ message: __("Export complete: {0} records", [data.count]), indicator: "green" });
});
```

## Navigation and routing

```javascript
frappe.set_route("Form", "Sales Order", "SO-001");

frappe.route_options = { status: "Open" };
frappe.set_route("List", "Sales Order");

let route = frappe.get_route();
```

### Key Desk globals

| Global | Purpose |
|---|---|
| `frappe.boot` | Login payload from `frappe/boot.py:get_bootinfo` — sysdefaults, user, lang |
| `frappe.session.user` | Current user |
| `frappe.call({method, args})` | Call a whitelisted method via `/api/method` |
| `frappe.set_route(...)` / `frappe.get_route()` | Desk routing |
| `frappe.model.get_new_doc`, `.set_value`, `.get_value` | Client-side model helpers |
| `frappe.meta.get_docfield(doctype, fieldname, name)` | Field metadata, mirrors server `Meta` |
| `frappe.datetime` | Date formatting and arithmetic |
| `__("text")` | Translation (mirrors Python `_()`) |

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| Mutating `frm.doc.field = value` directly | Skips the model event pipeline — no dirty flag, no field re-render, no field triggers | Use `frm.set_value(field, value)`; it calls `frappe.model.set_value`, which auto-refreshes the field and fires triggers via the doctype's `frappe.model.on(doctype, "*", ...)` watcher (`form.js:watch_model_updates`) — an explicit `frm.refresh_field()` is only needed after bypassing `set_value` |
| Wrong event hook name | Event never fires | Use exact names: `refresh`, `validate`, `onload`, `before_save` |
| Blocking UI with sync calls | Page freezes | Use `frappe.call()` — it is async by default |
| Using `cur_frm` instead of `frm` | Breaks in dialogs/multiple forms | Always use the `frm` parameter passed to handlers |
| Not checking `frm.doc.docstatus` | Buttons appear on submitted docs | Check `frm.doc.docstatus == 0` before showing edit actions |
| `console.log(frm.doc)` showing stale data | Debugging confusion | Use `frm.reload_doc()` or check network responses |

## Sources

Verified against Frappe v16.35.0 (`frappe/__init__.py` `__version__`):

- `apps/frappe/frappe/public/js/frappe/form/form.js:864-881` (`validate`/`before_save` both gate the same `frappe.validated` flag), `:2380` (`frappe.validated = 0` default), `:94-119,279-332` (`on_hide`, `watch_model_updates` — `frappe.model.on(doctype, "*", ...)` drives `frm.set_value` field refresh + triggers), `:582-659` (`before_load`, `onload`, `onload_post_render`), `:890-909` (`before_submit`), `:1045-1096` (`before_cancel`/`after_cancel`, `before_discard`/`after_discard`), `:1714` (`set_df_property`), `:1760` (`toggle_display`), `:2238-2253` (`on_tab_change`)
- `apps/frappe/frappe/public/js/frappe/form/grid_row.js:91-114` (`before_<fieldname>_remove`/`<fieldname>_remove` triggers), `:1513-1515` (`<parentfield>_on_form_rendered`, `form_render`)
- `apps/frappe/frappe/public/js/frappe/form/grid.js:1046` (`<fieldname>_add` trigger)
- `apps/frappe/frappe/public/js/frappe/provide.js:7` (`frappe.provide`)
- `apps/frappe/frappe/public/js/frappe/assets.js:8` (`frappe.require`)
- `apps/frappe/frappe/desk/form/meta.py:111-137` (`add_code_via_hook` — `doctype_js`/`doctype_list_js`/`doctype_tree_js`/`doctype_calendar_js` all merge into the generated meta bundle)
- `apps/frappe/frappe/boot.py:36` (`get_bootinfo`, backing `frappe.boot`)
- `apps/frappe/frappe/public/js/frappe/list/list_view.js:484,1366-1367` (`hide_name_column`, `get_indicator_html` reading `frappe.listview_settings`)
- `apps/frappe/frappe/public/js/frappe/ui/page.js:401` (`add_action_item`)
- `apps/frappe/frappe/public/js/frappe/socketio_client.js:12-15` (`frappe.realtime.on` wraps `socket.on`)
- `apps/frappe/frappe/public/js/frappe/request.js:13` (`frappe.xcall`)
- `apps/frappe/frappe/public/js/frappe/model/model.js:477,506` (`frappe.model.get_value`/`.set_value`), `apps/frappe/frappe/public/js/frappe/model/create_new.js:9` (`get_new_doc`), `apps/frappe/frappe/public/js/frappe/model/meta.js:71` (`get_docfield`)
