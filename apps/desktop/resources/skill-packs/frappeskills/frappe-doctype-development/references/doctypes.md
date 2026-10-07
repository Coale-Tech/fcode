# DocTypes

DocTypes are the core data model in Frappe. Each DocType becomes a database table and gets auto-generated CRUD APIs, forms, and list views.

## Creating a DocType

Write the JSON definition file and let `bench migrate` create the folder structure. Do NOT `mkdir` DocType directories. Requires `developer_mode = 1` in `site_config.json` — otherwise DocType/Custom Field changes save to the database but are never exported to files.

File path: `apps/<app>/<app>/<module>/doctype/<doctype_name>/<doctype_name>.json`

Minimal example:
```json
{
    "name": "Expense",
    "module": "Expense Tracker",
    "doctype": "DocType",
    "engine": "InnoDB",
    "fields": [
        {
            "fieldname": "title",
            "fieldtype": "Data",
            "label": "Title",
            "reqd": 1
        },
        {
            "fieldname": "amount",
            "fieldtype": "Currency",
            "label": "Amount",
            "reqd": 1
        },
        {
            "fieldname": "status",
            "fieldtype": "Select",
            "label": "Status",
            "options": "Draft\nApproved\nRejected",
            "default": "Draft"
        }
    ],
    "autoname": "format:EXP-{####}",
    "naming_rule": "Expression",
    "is_submittable": 0,
    "permissions": [
        {
            "role": "System Manager",
            "read": 1,
            "write": 1,
            "create": 1,
            "delete": 1
        }
    ]
}
```

Also create an empty `__init__.py` alongside the JSON:
```
apps/<app>/<app>/<module>/doctype/<doctype_name>/__init__.py
```

## Common field types

| fieldtype | Use for |
|-----------|---------|
| Data | Short text (140 chars) |
| Small Text | Multi-line text |
| Text Editor | Rich text (HTML) |
| Int / Float | Number |
| Currency | Money amounts |
| Date / Datetime | Date, or date with time |
| Select | Dropdown (options separated by `\n`) |
| Link | Foreign key to another DocType |
| Table | Child table (one-to-many) |
| Check | Boolean (0/1) |
| Attach | File attachment |

Full reference, including options and layout/media/special fields: [field-types.md](field-types.md).

## Naming patterns

- `autoname: "format:EXP-{####}"` — sequential (EXP-0001, EXP-0002)
- `autoname: "field:title"` — use field value as name
- `autoname: "hash"` — random hash
- `autoname: "naming_series:"` — user-configurable series
- `autoname: "prompt"` — user enters name manually

Full reference, including renaming and custom autoname: [naming.md](naming.md).

## Child DocTypes

For one-to-many relationships (e.g. Expense Items inside an Expense):

1. Create a child DocType JSON with `"istable": 1`
2. Add a `Table` field in the parent pointing to it:
```json
{
    "fieldname": "items",
    "fieldtype": "Table",
    "label": "Items",
    "options": "Expense Item"
}
```

A child DocType needs no permissions. It inherits them from the parent. Full reference: [child-tables.md](child-tables.md).

## After creating/modifying DocTypes

Always run:
```bash
bench --site <site> migrate
```

## Other useful JSON keys

```json
{
    "sort_field": "modified",       // default sort column for list view
    "sort_order": "DESC",           // ASC or DESC
    "track_changes": 1,             // enable version history / timeline
    "is_submittable": 1             // enables Submit → Cancel → Amend workflow
}
```

Submittable DocTypes get a `docstatus` field automatically: `0` = Draft, `1` = Submitted, `2` = Cancelled. Users cannot edit submitted documents — they must cancel and amend. Details: [doctype-architecture.md](doctype-architecture.md#docstatus--document-states).

Do NOT add `creation`, `modified`, `owner`, `modified_by`, or `docstatus` as fields — Frappe creates these automatically.

## Reference templates

Working example DocType JSON in this skill's sibling app scaffold
(`frappe-app-development/assets/mini-app/`):

- Single DocType: `../../frappe-app-development/assets/mini-app/doctype/sample_single/sample_single.json`
- Tree DocType: `../../frappe-app-development/assets/mini-app/doctype/sample_tree/sample_tree.json`
- Submittable DocType: `../../frappe-app-development/assets/mini-app/doctype/sample_submittable/sample_submittable.json`
- Child DocType: `../../frappe-app-development/assets/mini-app/doctype/sample_doc_item/sample_doc_item.json`
- Dashboard/Links: `../../frappe-app-development/assets/mini-app/dashboard/sample_doc_dashboard.json`
- Dynamic Link fields: `../../frappe-app-development/assets/mini-app/doctype/sample_doc/sample_doc_dynamic_link.json`
- Naming series: `../../frappe-app-development/assets/mini-app/doctype/sample_doc/sample_doc_naming_series.json`
- Workflow: `../../frappe-app-development/assets/mini-app/workflow/sample_doc_workflow.json`
- DocType with workflow and child table: `../../frappe-app-development/assets/mini-app/doctype/sample_doc/sample_doc.json`

## Best Practices

### DocType Design
1. Choose appropriate type (Master, Transactional, Submittable, Single, Tree)
2. Plan relationships using Link and Table fields
3. Mark `in_list_view`, `in_standard_filter`, `in_global_search`
4. Configure `autoname` appropriately
5. Set sensible `default` values

### Controller Design
1. Validate early in `validate()`, throw on errors
2. Auto-compute values in `before_validate()` or `validate()`
3. Side effects in `on_submit()` (ledger entries, status updates)
4. Clean up in `on_cancel()` (reverse side effects)
5. Expose actions via `@frappe.whitelist()` methods

### Permission Design
1. Define role permissions for all user roles
2. Use permission levels for sensitive field groups
3. Add User Permissions for Link field restrictions
4. Test across roles

### Performance
1. Index search fields with `in_standard_filter`
2. Use `frappe.get_cached_doc()` for frequently accessed docs
3. Batch operations and commit after bulk updates
4. Use `ignore_permissions` only for trusted server-side/background operations that already performed an explicit check — never to silently bypass one

## References

- [doctype-architecture.md](doctype-architecture.md) — classification, system fields, naming internals, docstatus, Single/Tree, customization approaches, verified DocType-level flags
- [field-types.md](field-types.md) — every fieldtype and its options
- [naming.md](naming.md) — naming strategies and renaming
- [child-tables.md](child-tables.md) — parent/child patterns
- [virtual-doctypes.md](virtual-doctypes.md) — backing a DocType with external data
- [controllers.md](controllers.md) — lifecycle hooks
- [permissions.md](permissions.md) — roles, permlevel, `has_permission`

## Sources

Verified against Frappe v16.35.0 (`frappe/__init__.py` `__version__`):

- `apps/frappe/frappe/model/document.py` — `insert`, `save`/`_save`, `run_before_save_methods`, `run_post_save_methods`, `run_method`, `_submit`/`_cancel`, `_validate`, `Document.__init__`, `load_from_db`
- `apps/frappe/frappe/model/delete_doc.py` — `on_trash` / `on_change` / `after_delete` ordering
- `apps/frappe/frappe/model/rename_doc.py` — `before_rename` / `after_rename`
- `apps/frappe/frappe/model/base_document.py` — `get_controller`, `override_doctype_class` + `extend_doctype_class`
- `apps/frappe/frappe/core/doctype/doctype/doctype.json` — DocType-level Check flags, `naming_rule` options
- `apps/frappe/frappe/model/naming.py` — naming series / autoname tokens
- `apps/frappe/frappe/desk/doctype/todo/todo.json` — representative DocType JSON structure
