# Row-Level and Document-Level Permissions

Split out of [permissions.md](permissions.md). Covers the layers below plain
role permissions: the `has_permission` controller hook, list-level SQL
filtering, User Permissions, and Document Sharing.

## Permission layers

For a single-document check (`frappe.has_permission(doctype, ptype, doc=doc)` /
`doc.check_permission()`), `frappe/permissions.py` evaluates in this order:

1. **Administrator bypass** — `user == "Administrator"` always passes.
2. **`has_permission` hooks.py controller hook** (`has_controller_permissions`) — runs
   first and can only **deny**, never grant: any registered function that returns a
   falsy value fails the whole check immediately; a truthy return just continues to
   the next layer. See below.
3. **Role permissions** (DocPerm / Custom DocPerm), with `if_owner` applied on top —
   `get_role_permissions`.
4. **User Permissions** — if the doctype/link fields are restricted and the document
   isn't in the allowed set, permissions collapse to the `if_owner` subset (if the
   user is the owner) or to nothing at all — `has_user_permission`.
5. **Document Sharing fallback** — only consulted if steps 3-4 produced no permission
   for `ptype`; an explicit `frappe.share` grant on the document (or DocType, for
   list access) is then accepted — `false_if_not_shared` in `has_permission()`.
6. **`select` fallback** — if `ptype == "select"` is still denied, `has_permission()`
   retries the same check with `ptype="read"`, since `select` is implied by `read`.

A **child table** doctype's own DocPerm rows are ignored; `has_permission` detects
`frappe.is_table(doctype)` and delegates to `has_child_permission`, which checks the
**parent** doctype's permission (plus the parent field's `permlevel`) instead
(`frappe/permissions.py` `has_child_permission`).

REST endpoints enforce this automatically:

```bash
GET /api/resource/Customer/CUST-001
# checks read permission on Customer, then User Permission filters

POST /api/resource/Customer
# checks create permission on Customer

PUT /api/resource/Customer/CUST-001
# checks write permission on Customer, then document-level permission

DELETE /api/resource/Customer/CUST-001
# checks delete permission on Customer

GET /api/resource/Customer?filters=[["status","=","Active"]]
# applies User Permission filters automatically to the list
```

Whitelisted RPC methods (`@frappe.whitelist()`) do **not** get these checks for
free — see [permissions-checks.md](permissions-checks.md) for enforcing them
explicitly.

## `has_permission` controller override (Document method)

`Document.has_permission(self, permtype="read", *, debug=False, user=None)`
(`frappe/model/document.py`) is called by `doc.check_permission()`, which in turn
backs `insert()`, `save()`, `submit()`, `cancel()`, and `frappe.get_doc(dt, name,
check_permission=...)`. Overriding it on your controller **replaces** the default
role-based check for those call sites — it can grant access a role wouldn't
otherwise have, but only for code paths that go through `doc.check_permission()` /
`doc.has_permission()` directly. It is not consulted by `frappe.has_permission()`
called elsewhere with a plain doctype/doc, nor by list-view SQL filtering:

```python
class Expense(Document):
    def has_permission(self, permtype="read", *, debug=False, user=None):
        if permtype == "read" and self.department == get_user_department(user):
            return True
        return super().has_permission(permtype, debug=debug, user=user)
```

Call `super().has_permission(...)` for the fallback case (as above) unless you
intend to fully replace the role-based check for this DocType.

## `has_permission` hooks.py dispatch (deny-only)

A separate mechanism: register a module-level function per DocType in `hooks.py`
(`frappe.get_hooks("has_permission")`). Unlike the controller override above, this
*is* consulted by every `frappe.has_permission()` / `frappe.permissions.has_permission()`
call routed through `get_doc_permissions` (including REST document reads), but
`has_controller_permissions` in `frappe/permissions.py` only honors a **falsy**
return as an explicit deny — a truthy return does **not** grant anything beyond
what role permissions already allow:

```python
# hooks.py
has_permission = {
    "Sales Order": "my_app.permissions.sales_order_permission"
}
```

```python
# my_app/permissions.py
def sales_order_permission(doc, ptype, user, debug=False):
    if not user:
        user = frappe.session.user
    if ptype in ("submit", "cancel") and "Sales Manager" not in frappe.get_roles(user):
        return False  # deny: caller lacks role permission is not enough to submit/cancel
    return True  # do not deny; role-based permissions still apply
```

## Row-level filtering on list views (`permission_query_conditions`)

`DatabaseQuery.build_match_conditions` (`frappe/model/db_query.py`) builds the SQL
`WHERE` fragment applied to every `get_list`/`get_all`/report-view query, in this
order:

1. If the role has neither `select` nor `read` at all (and no User Permission grants
   access), the query is restricted to only explicitly shared documents — or throws
   `frappe.PermissionError` if nothing is shared.
2. Else if `if_owner` is enabled and the role has no unconditional `select`/`read`
   (`requires_owner_constraint`), the query is restricted to `owner = <user>`.
3. Else, User Permission conditions are added per restricted Link field
   (`add_user_permissions`).
4. The `permission_query_conditions` hook result (below) is AND-ed in.
5. If the DocType has any documents shared with the user, an `OR (name in (shared
   names))` clause is added on top of the above.

Define `permission_query_conditions` in `hooks.py` to add your own condition on
top of this pipeline:

```python
# hooks.py
permission_query_conditions = {
    "Expense": "myapp.permissions.expense_query_conditions",
}
```

```python
# myapp/permissions.py
import frappe

def expense_query_conditions(user=None, doctype=None):
    if not user:
        user = frappe.session.user
    if "Expense Manager" in frappe.get_roles(user):
        return ""  # no restriction
    return f"`tabExpense`.`owner` = {frappe.db.escape(user)}"
```

The condition method is called as `frappe.call(method, user, doctype=doctype)`
(`get_permission_query_conditions`); the `doctype` kwarg is optional — `frappe.call`
drops kwargs your function signature doesn't declare. Return a SQL WHERE clause
fragment (string), `""` for no restriction, or a falsy value like `"1=0"` to deny
all access.

Pair with `has_permission` for complete coverage — `permission_query_conditions`
filters lists, `has_permission` guards individual documents.

## User Permissions (row-level security by Link value)

Filter which documents a user can access based on a Link field's value:

```python
frappe.permissions.add_user_permission(
    doctype="Company",
    name="My Company",
    user="employee@example.com",
    ignore_permissions=True,  # trusted setup script provisioning a new employee's access
)
```

```python
# Multiple values
frappe.permissions.add_user_permission("Company", "Company A", "user@example.com")
frappe.permissions.add_user_permission("Company", "Company B", "user@example.com")
```

Once set, `frappe.get_list()` automatically filters by the user's permitted
values (e.g. a user with a User Permission for Company = "ACME" only sees
Sales Orders where `company = "ACME"`).

```python
from frappe.permissions import get_user_permissions
user_perms = get_user_permissions("user@example.com")
```

Bypass User Permission filtering for a specific Link field:
```json
{
    "fieldname": "company",
    "fieldtype": "Link",
    "options": "Company",
    "ignore_user_permissions": 1
}
```

## Document Sharing

```python
frappe.share.add(
    doctype="Project",
    name="PROJ-001",
    user="contractor@example.com",
    read=1,
    write=1,
    notify=1,
)
```

```python
# Who a document is shared with
shares = frappe.share.get_users("Project", "PROJ-001")

# Is it shared with a specific user
is_shared = "PROJ-001" in frappe.share.get_shared("Project", user="contractor@example.com")

# Remove
frappe.share.remove("Project", "PROJ-001", "contractor@example.com")
```

`frappe.share.add` only accepts `read`, `write`, `submit`, `share`, and `everyone`
as grantable flags (`frappe/share.py` `add`/`add_docshare`) — there is no `delete`,
`cancel`, `create`, `import`, or `export` share right. `print` and `email` piggyback
on `read` once a document is shared for read; `share` itself is globally disabled
when System Settings' `disable_document_sharing` is checked, at which point
`has_permission(..., ptype="share")` always returns `False`.

## Sources

Verified against Frappe v16.35.0 (`frappe/__init__.py` `__version__`):

- `apps/frappe/frappe/permissions.py:80-227` — `has_permission` evaluation order (Administrator bypass, child-table redirect, controller hook, share fallback, `select`-implies-`read` fallback)
- `apps/frappe/frappe/permissions.py:229-281` — `get_doc_permissions` (controller hook, role permissions + `if_owner`, User Permissions)
- `apps/frappe/frappe/permissions.py:353-482` — `has_user_permission`
- `apps/frappe/frappe/permissions.py:483-500` — `has_controller_permissions` (hooks.py `has_permission` dispatch, deny-only, `frappe.call(method, doc=doc, ptype=ptype, user=user, debug=debug)`)
- `apps/frappe/frappe/permissions.py:592-...` — `add_user_permission`
- `apps/frappe/frappe/permissions.py:807-903` — `has_child_permission`
- `apps/frappe/frappe/model/document.py:397-421` — `Document.check_permission`/`Document.has_permission(self, permtype="read", *, debug=False, user=None)`
- `apps/frappe/frappe/model/db_query.py:1027-1183` — `build_match_conditions`, `get_permission_query_conditions` (`frappe.call(method, user, doctype=doctype)`), `requires_owner_constraint`
- `apps/frappe/frappe/share.py:22-93` — `frappe.share.add`/`add_docshare` grantable rights, `remove`, `get_shared`, `get_users`
