# Checking and Enforcing Permissions in Code

Split out of [permissions.md](permissions.md). Covers programmatic
`has_permission` checks, enforcing them inside whitelisted RPC methods,
debugging, and common permission-related failures.

## Basic checks

```python
# DocType-level
frappe.has_permission("Expense", "read")

# Document-level
frappe.has_permission("Expense", "write", doc="EXP-0001")

# Throw if no permission
frappe.has_permission("Expense", "write", throw=True)

# For a specific user
frappe.has_permission("Expense", "read", user="john@example.com")

# Role check
if "Sales Manager" in frappe.get_roles():
    ...

# Users with a role
from frappe.utils.user import get_users_with_role
users = get_users_with_role("System Manager")

# Evaluated permission dict for a doc, e.g. {"read": 1, "write": 1}
perms = frappe.permissions.get_doc_permissions(doc)
```

## Always check permissions in whitelisted methods

`@frappe.whitelist()` methods do not get automatic DocType/document permission
checks the way REST resource endpoints do — the method body must check
explicitly:

```python
@frappe.whitelist()
def update_order_status(order_name, new_status):
    doc = frappe.get_doc("Sales Order", order_name)

    # document-level check
    if not frappe.has_permission("Sales Order", "write", doc):
        frappe.throw(_("Permission denied"), frappe.PermissionError)

    # role check for a specific action
    if new_status == "Approved" and "Approver" not in frappe.get_roles():
        frappe.throw(_("Only Approvers can approve orders"), frappe.PermissionError)

    doc.status = new_status
    doc.save()
    return doc.name
```

Reusable check patterns:

```python
def check_document(doc):
    if not frappe.has_permission(doc.doctype, "write", doc):
        frappe.throw(_("Cannot modify this document"), frappe.PermissionError)

def check_role(required_role):
    if required_role not in frappe.get_roles():
        frappe.throw(_(f"{required_role} role required"), frappe.PermissionError)

def check_any_role(roles):
    if not set(frappe.get_roles()).intersection(roles):
        frappe.throw(_("Insufficient permissions"), frappe.PermissionError)

def check_all_roles(roles):
    if not set(roles).issubset(frappe.get_roles()):
        frappe.throw(_("Missing required roles"), frappe.PermissionError)
```

### Decorator form

```python
from functools import wraps

def require_permission(doctype, ptype):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if not frappe.has_permission(doctype, ptype):
                frappe.throw(
                    _("Permission denied: {0} {1}").format(ptype, doctype),
                    frappe.PermissionError,
                )
            return func(*args, **kwargs)
        return wrapper
    return decorator

def require_role(*roles):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if not set(frappe.get_roles()).intersection(roles):
                frappe.throw(_("Requires role: {0}").format(", ".join(roles)), frappe.PermissionError)
            return func(*args, **kwargs)
        return wrapper
    return decorator

@frappe.whitelist()
@require_permission("Sales Order", "write")
@require_role("Sales User", "Sales Manager")
def process_order(order_name):
    # already verified permissions
    ...
```

## Never trust client data

```python
@frappe.whitelist()
def bad_example(docname, new_owner):
    # Don't: no permission check
    frappe.db.set_value("Document", docname, "owner", new_owner)

@frappe.whitelist()
def good_example(docname, new_owner):
    # Do: check permissions first, including the specific action being performed
    doc = frappe.get_doc("Document", docname)
    if not frappe.has_permission(doc.doctype, "write", doc):
        frappe.throw(_("Permission denied"), frappe.PermissionError)
    if "Admin" not in frappe.get_roles():
        frappe.throw(_("Only Admin can change owner"), frappe.PermissionError)
    doc.owner = new_owner
    doc.save()
```

Validate references passed into a whitelisted method too, not just the primary
document:

```python
@frappe.whitelist()
def update_customer_order(order_name, customer):
    doc = frappe.get_doc("Sales Order", order_name)
    if not frappe.has_permission("Sales Order", "write", doc):
        frappe.throw(_("Permission denied"), frappe.PermissionError)
    if not frappe.has_permission("Customer", "read", customer):
        frappe.throw(_("Cannot access customer"), frappe.PermissionError)
    doc.customer = customer
    doc.save()
```

## Permission-aware APIs

```python
# Do: respects permissions
docs = frappe.get_list("Order")

# Don't: bypasses permissions
docs = frappe.get_all("Order")
```

Prefer a single filtered `get_list` call over looping `has_permission` per
document:

```python
# Bad: one permission check per document
for name in document_names:
    if frappe.has_permission("Order", "read", name):
        process(name)

# Good: get_list applies permissions once
for doc in frappe.get_list("Order", filters={"name": ["in", document_names]}):
    process(doc.name)
```

## Debugging permissions

```python
frappe.session.user
frappe.get_roles()

from frappe.permissions import get_user_permissions
get_user_permissions("user@example.com")

from frappe.permissions import has_permission
has_permission("Sales Order", ptype="write", doc=doc, user="user@example.com", debug=True)
```

## Common issues

| Issue | Cause | Fix |
|-------|-------|-----|
| 403 on REST API | Missing DocType permission | Check Role Permission Manager |
| Can't see some records | User Permission filtering | Check User Permissions for that user |
| Whitelisted method returns data it shouldn't | Missing explicit permission check | Add `has_permission` check in the method body |
| Custom logic not applying | Hook not registered | Verify `hooks.py` `permission_query_conditions` / `has_permission` registration |

## Testing

```python
def test_sales_user_cannot_delete(self):
    frappe.set_user("sales@example.com")
    self.assertRaises(
        frappe.PermissionError,
        frappe.delete_doc, "Sales Order", self.order.name,
    )
    frappe.set_user("Administrator")
```

## Sources

Verified against Frappe v16.35.0 (`frappe/__init__.py` `__version__`):

- `apps/frappe/frappe/__init__.py:600-646` — `frappe.has_permission(doctype, ptype, doc, user, throw, ..., debug, ignore_share_permissions)` wrapper, `throw` raising `frappe.PermissionError`
- `apps/frappe/frappe/permissions.py:81-227` — `frappe.permissions.has_permission`, `debug` param; `:229-281` `get_doc_permissions`
- `apps/frappe/frappe/permissions.py:347-350` — `get_user_permissions`
- `apps/frappe/frappe/utils/user.py:433` — `get_users_with_role`
- `apps/frappe/frappe/model/db_query.py` — `frappe.get_list`/`frappe.get_all` permission-filtering behavior
