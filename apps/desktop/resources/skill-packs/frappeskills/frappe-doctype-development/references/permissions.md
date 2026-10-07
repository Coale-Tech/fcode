# Permissions

## DocType-level permissions

Define in the DocType JSON under `permissions`:

```json
{
    "permissions": [
        {
            "role": "System Manager",
            "read": 1, "write": 1, "create": 1, "delete": 1, "submit": 0, "cancel": 0
        },
        {
            "role": "Expense User",
            "read": 1, "write": 1, "create": 1, "delete": 0
        }
    ]
}
```

### Permission actions

`std_rights` in `frappe/permissions.py` defines the permission types (`ptype`) a DocPerm row can grant:

| Action | Description |
|--------|--------------|
| `select` | Reference the document from a Link field / query without full `read` (see below) |
| `read` | View document |
| `write` | Edit document |
| `create` | Create new |
| `delete` | Delete document |
| `submit` | Submit document |
| `cancel` | Cancel document |
| `amend` | Amend cancelled |
| `print` | Print document |
| `email` | Email document |
| `report` | Access reports |
| `import` | Import data |
| `export` | Export data |
| `share` | Share with others |
| `mask` (v16) | Field-level: mask this DocPerm role's fields flagged `mask: 1` instead of hiding them (`frappe/model/meta.py` `get_masked_fields`, `frappe/model/utils/mask.py`) |

`select` is auto-granted wherever `read` is granted (`has_permission()` falls back to
checking `read` when a `select` check fails). A role with `select` but not `read` can
resolve the document as a Link target (e.g. autocomplete) without seeing full field
data; `frappe.only_has_select_perm(doctype)` reports whether the current user is in
that state. `mask` is a separate v16 field-level right — see
[advanced-permissions.md](advanced-permissions.md) for masking fields containing PII
(phone, email, dates) instead of denying access outright.

Configure per role in the Permissions tab, or via Setup > Role Permission Manager.

### Permission levels (`permlevel`)

Split fields into permission groups so a base role can read/write level-0 fields
while only a higher role can touch a restricted group:

```json
{
    "fieldname": "internal_notes",
    "fieldtype": "Text",
    "permlevel": 1
}
```

```json
{
    "permissions": [
        {"role": "Sales User", "read": 1, "write": 1, "permlevel": 0},
        {"role": "Sales Manager", "read": 1, "write": 1, "permlevel": 1}
    ]
}
```

- `permlevel 0` — default, accessible by the base role
- `permlevel 1+` — restricted to roles explicitly granted that level

## Custom roles

Create a Role DocType JSON:
```json
{
    "name": "Expense User",
    "doctype": "Role",
    "desk_access": 1,
    "is_custom": 0
}
```

Place at: `apps/<app>/<app>/<module>/role/expense_user/expense_user.json`

Or use fixtures in `hooks.py`:
```python
fixtures = [
    {"dt": "Role", "filters": [["name", "in", ["Expense User", "Expense Manager"]]]}
]
```

## Bypassing permissions

```python
# Insert without permission checks
doc.insert(ignore_permissions=True)

# flags approach
doc.flags.ignore_permissions = True
doc.save()

# Run as Administrator
frappe.set_user("Administrator")
# ... do work ...
frappe.set_user(original_user)
```

Use `ignore_permissions` only in server-side background logic that already
performed an explicit check (or is system-owned setup code) — never in
user-facing APIs to silently skip a check.

## User-based filtering (owner permissions)

Add `"if_owner": 1` to a permission rule to restrict users to their own documents:
```json
{
    "role": "Expense User",
    "read": 1, "write": 1,
    "if_owner": 1
}
```

## References

- [permissions-rowlevel.md](permissions-rowlevel.md) — `has_permission` hook, `permission_query_conditions`, User Permissions, Document Sharing, REST permission layers
- [permissions-checks.md](permissions-checks.md) — checking/enforcing permissions in RPC methods, decorators, debugging, common issues
- [advanced-permissions.md](advanced-permissions.md) — dynamic User Permissions, audit logging, caching

## Sources

Verified against Frappe v16.35.0 (`frappe/__init__.py` `__version__`):

- `frappe/permissions.py` — `std_rights`, `has_permission`, `add_user_permission`, `get_doc_permissions`, `get_user_permissions`, `get_rights`
- `frappe/__init__.py` — `only_has_select_perm`
- `frappe/share.py` — `add`, `remove`, `get_users`, `get_shared`
- `frappe/core/doctype/docperm/docperm.json` — role permission fields (`if_owner`, `permlevel`, action flags including `select` and `mask` (v16))
- `frappe/core/doctype/user_permission/user_permission.py` — User Permission record shape
- `frappe/utils/user.py` — `get_users_with_role`
- `frappe/model/meta.py`, `frappe/model/utils/mask.py` — field masking (v16)
