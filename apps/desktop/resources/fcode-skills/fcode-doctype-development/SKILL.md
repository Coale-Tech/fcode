---
name: fcode-doctype-development
description: "Build and modify Frappe DocTypes: fields, controllers, lifecycle hooks, child tables, permissions, and fixtures."
---

# DocType development

## File locations

```
apps/<app>/<app>/
  <module>/
    doctype/
      <doctype_slug>/
        <doctype_slug>.json    # DocType definition (fields, permissions, links)
        <doctype_slug>.py      # Controller class
        <doctype_slug>.js      # Client script (form events)
        test_<doctype_slug>.py # Unit tests
```

`<doctype_slug>` is the snake_case version of the DocType name (e.g. `sales_order`).
`<module>` matches the `module` field in the JSON.

## DocType JSON

- Edit the JSON to add or reorder fields; never hand-edit field `idx` values —
  Frappe assigns them on migrate.
- Required field properties: `fieldname`, `fieldtype`, `label`.
- Set `"in_standard_filter": 1` to expose a field in list-view filters.
- `"reqd": 1` makes the field mandatory at the DB level.
- Child tables use `fieldtype: "Table"` pointing to a `link_doctype` that is
  itself a DocType with `"istable": 1`.

## Controller lifecycle (Python)

```python
class MyDoc(Document):
    def validate(self):        # before save (insert + update)
        pass

    def before_insert(self):   # insert only, before DB write
        pass

    def after_insert(self):    # insert only, after DB write
        pass

    def on_submit(self):       # after submit (is_submitted = 1)
        pass

    def on_cancel(self):       # after cancel
        pass

    def on_trash(self):        # before delete
        pass
```

Call `self.db_set("field", value, update_modified=False)` for a direct DB write
that skips validate/save overhead (e.g. status transitions in on_submit).

## Common patterns

**Get a document**
```python
doc = frappe.get_doc("Sales Order", name)
doc = frappe.get_cached_doc("Customer", customer_id)  # LRU cache, read-only use
```

**Insert**
```python
doc = frappe.get_doc({"doctype": "My DocType", "field": value})
doc.insert(ignore_permissions=True)  # use only in migrations/fixtures
```

**Query**
```python
rows = frappe.get_all(
    "Sales Order",
    filters={"status": "Draft", "company": company},
    fields=["name", "grand_total"],
    order_by="creation desc",
    limit=50,
)
```

## Running migrate after JSON changes

Any change to `<doctype>.json` (new field, changed property) requires:

```
bench --site <site> migrate
```

Use `fcode_bench_run` with `command: "migrate"` to trigger this from the agent.

## Permissions

Define roles and permission tiers in the DocType JSON under `"permissions"`.
For programmatic checks:

```python
if not frappe.has_permission("Sales Order", "write", doc):
    frappe.throw("No write permission", frappe.PermissionError)
```

## Client scripts (`.js`)

```js
frappe.ui.form.on("My DocType", {
    refresh(frm) { },
    field_name(frm) { },
    before_save(frm) { },
});
```

Keep client scripts thin; business logic belongs in the controller.
