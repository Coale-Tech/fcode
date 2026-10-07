---
name: frappe-doctype-development
description: Create and modify Frappe DocTypes including schema design, field types, controllers, child tables, naming, permissions, and workflows. Use when building data models, adding fields, or implementing document lifecycle logic.
---

# Frappe DocType Development

Build and modify DocTypes — the core data-model abstraction in Frappe Framework.

## When to use

- Creating DocTypes (standard, Single, child table, submittable, tree, virtual)
- Adding or modifying fields on existing DocTypes
- Implementing controller logic (`validate`, `before_save`, `on_submit`, …)
- Setting up naming series and auto-naming
- Configuring role permissions, permlevels, or user permissions
- Attaching a Workflow to a document

## Inputs required

- Target app and module path
- DocType name and type (standard / Single / child / submittable / tree / virtual)
- Field definitions (fieldname, fieldtype, options, mandatory)
- Permission requirements by role
- Whether a workflow is needed

## Procedure

### 0) Verify environment

```bash
bench --site <site> console
>>> frappe.conf.developer_mode   # must be True, or changes never reach files
```

### 1) Choose DocType type

| Type | Use case | Key setting |
|------|----------|-------------|
| Standard | Multiple records | default |
| Single | Config/settings (one record) | `issingle: 1` |
| Child Table | Rows inside a parent | `istable: 1` |
| Submittable | Draft → Submit → Cancel | `is_submittable: 1` |
| Tree | Hierarchical data | `is_tree: 1` |
| Virtual | External data source | `is_virtual: 1` |

New business entity → new DocType. Extending a standard entity → Custom Field
via fixtures ([`frappe-app-development`](../frappe-app-development/SKILL.md)).
Transient data → `frappe.cache`, not a DocType.

### 2) Create the DocType

**Option A — via UI (recommended)**: DocType List → New → define fields,
permissions, settings → Save. In developer mode it exports to the app.

**Option B — via code**: write
`<app>/<module>/doctype/<doctype_name>/<doctype_name>.json`. Do not `mkdir` the
folder by hand and expect Frappe to adopt it — let migrate create it, or use the
template in `assets/DocType.json.template`.

### 3) Define fields

```json
{
  "fieldname": "customer",
  "fieldtype": "Link",
  "label": "Customer",
  "options": "Customer",
  "reqd": 1,
  "in_list_view": 1
}
```

All fieldtypes and their `options` semantics: [references/field-types.md](references/field-types.md).
Child tables: [references/child-tables.md](references/child-tables.md).

### 4) Implement the controller

Create `<doctype_name>.py` beside the JSON. The class name is the PascalCase of
the DocType name.

```python
import frappe
from frappe import _
from frappe.model.document import Document

class SampleDoc(Document):
    def validate(self):
        if self.amount and self.amount < 0:
            frappe.throw(_("Amount cannot be negative"))

    def before_save(self):
        self.full_name = f"{self.first_name} {self.last_name}"

    def after_insert(self):
        frappe.publish_realtime("sample_doc_created", {"name": self.name})
```

Valid hooks and their order: [references/controllers.md](references/controllers.md).
`after_save` is **not** a hook. (v16) `discard()` on a draft fires `before_discard`/`on_discard`.

### 5) Set up naming

```json
{
  "autoname": "naming_series:",
  "fields": [
    {"fieldname": "naming_series", "fieldtype": "Select", "options": "PRJ-.YYYY.-.####"}
  ]
}
```

Other strategies: `field:<fieldname>`, `hash`, `format:PRJ-{####}`, `prompt`.
See [references/naming.md](references/naming.md).

### 6) Configure permissions

Set per role in the Permissions tab: Read / Write / Create / Delete / Submit /
Cancel / Amend, plus `permlevel` for field-level control. Row-level filtering
uses User Permissions or a permission query condition —
[references/permissions.md](references/permissions.md) and
[references/advanced-permissions.md](references/advanced-permissions.md).

### 7) Add a workflow (if needed)

Create a Workflow document linking your DocType with states, transitions and
allowed roles: [references/workflow-patterns.md](references/workflow-patterns.md).

### 8) Migrate

```bash
bench --site <site> migrate && bench --site <site> clear-cache
```

## Verification

- [ ] DocType appears in the list and creates records
- [ ] Every field persists after save and reload
- [ ] Controller hooks fire in the expected order (log or breakpoint proves it)
- [ ] Naming series generates unique, correctly formatted names
- [ ] Permissions enforced per role — a low-privilege user is actually blocked
- [ ] Submittable flow tested: submit, then cancel, then amend
- [ ] `bench --site <site> migrate` succeeds

## Failure modes / debugging

- **DocType not found**: wrong module path, or app not installed on that site (`bench --site <site> list-apps`)
- **Changes never reach files**: `developer_mode` is 0 in `site_config.json`
- **Controller not loading**: class name must be PascalCase of the DocType name (`SalesOrder` for "Sales Order")
- **`after_save` never runs**: not a hook — use `after_insert` or `on_update`
- **Fields not saving**: fieldtype/options mismatch, or the field is `read_only` with no default
- **Permission denied**: role permission vs. User Permission confusion — see [references/advanced-permissions.md](references/advanced-permissions.md)
- **Child rows lost on save**: the child DocType must have `istable: 1` and be referenced through a Table field

## Escalation

- Complex row-level access → [references/advanced-permissions.md](references/advanced-permissions.md)
- External data source → [references/virtual-doctypes.md](references/virtual-doctypes.md)
- App-wide plumbing (hooks, fixtures, jobs) → [`frappe-app-development`](../frappe-app-development/SKILL.md)
- Exposing the DocType over HTTP → [`frappe-api-development`](../frappe-api-development/SKILL.md)
- ERPNext/HRMS domain semantics → [`frappe-erpnext-hrms`](../frappe-erpnext-hrms/SKILL.md)

## References

- [references/doctypes.md](references/doctypes.md) - DocType JSON, types, layout, Singles (index; see references/doctype-architecture.md for internals)
- [references/doctype-architecture.md](references/doctype-architecture.md) - classification, system fields, naming internals, docstatus, Single/Tree, customization approaches, verified DocType-level flags
- [references/field-types.md](references/field-types.md) - Every fieldtype and its options
- [references/child-tables.md](references/child-tables.md) - Parent/child patterns and grids
- [references/naming.md](references/naming.md) - Naming strategies and renaming
- [references/controllers.md](references/controllers.md) - Lifecycle hooks and flags
- [references/permissions.md](references/permissions.md) - Roles, permlevel, `has_permission` (index)
- [references/permissions-rowlevel.md](references/permissions-rowlevel.md) - `has_permission` hook, `permission_query_conditions`, User Permissions, Sharing
- [references/permissions-checks.md](references/permissions-checks.md) - Enforcing permissions in RPC methods, decorators, debugging
- [references/advanced-permissions.md](references/advanced-permissions.md) - User permissions, share, query conditions
- [references/virtual-doctypes.md](references/virtual-doctypes.md) - Backing a DocType with external data
- [references/workflow-patterns.md](references/workflow-patterns.md) - States, transitions, actions
- `assets/DocType.json.template`, `assets/controller.py.template`

## Guardrails

- **Check `developer_mode` before schema changes**: otherwise edits never export to files
- **Never edit core DocTypes**: extend with Custom Fields + `doc_events`
- **Never `mkdir` DocType folders**: Frappe creates them on migrate
- **Always migrate after schema changes**: `bench --site <site> migrate` then `clear-cache`
- **Validate fieldname conventions**: snake_case, ≤140 chars, no reserved SQL keywords
- **Translate user-facing strings**: `frappe.throw(_("…"))`, never a bare string

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| Modifying a core DocType | Breaks upgrades | Custom Field + hooks |
| Missing `reqd` on mandatory fields | Incomplete data saves | `reqd: 1` |
| Wrong fieldtype for money | Rounding errors | `Currency`, not `Float` |
| Skipping `bench migrate` | Schema drift | Migrate after every change |
| Controller class name mismatch | Methods never called | PascalCase of DocType name |
| `def after_save(self)` | Not a real hook | `after_insert` / `on_update` |
| `self.get_parent()` in a child controller | Method does not exist | `self.parent_doc` |
| Circular Link dependencies | DocType creation fails | Dynamic Link or restructure |
| `frappe.throw("text")` | No i18n | `frappe.throw(_("text"))` |
