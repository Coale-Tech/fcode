# Advanced Permission Patterns

> Adopted from [lubusIN/frappe-skills](https://github.com/lubusIN/frappe-skills) (MIT) — `enterprise-patterns/references/advanced-permissions.md`.

## Overview
Complex permission patterns for enterprise Frappe applications.

## Custom Permission Types (v16)

`Permission Type` (`frappe/core/doctype/permission_type`) lets you define an
application-specific `ptype` beyond the standard rights in `permissions.py`'s
`std_rights` (`select`, `read`, `write`, `create`, `delete`, `submit`, `cancel`,
`amend`, `print`, `email`, `report`, `import`, `export`, `share`). Creating one
requires `developer_mode` (`PermissionType.can_write`) — it auto-creates a `Check`
Custom Field for the new right on `DocPerm`, `Custom DocPerm`, and `DocShare`
(`create_custom_field`), scoped to the target DocType via a `depends_on` expression:

```python
frappe.get_doc({
    "doctype": "Permission Type",
    "doc_type": "Expense",
    "perm_type": "approve",  # becomes a Check field named "approve" on DocPerm etc.
}).insert()
```

Once defined, `approve` shows up as a role-permission checkbox for that DocType and
is included by `frappe.get_rights("Expense")` / `frappe.has_permission("Expense",
"approve", doc=doc)` (`get_doctype_ptype_map`, `frappe/core/doctype/permission_type/permission_type.py`).
The name cannot collide with a standard right (`PermissionType.validate` throws if
`perm_type in std_rights`).

## Role-Based Access Control (RBAC)

### Custom Permission Controller
```python
## permissions.py
import frappe

def get_permission_query_conditions(user):
    """Return SQL conditions for permission filtering"""
    if not user:
        user = frappe.session.user
    
    if "System Manager" in frappe.get_roles(user):
        return ""  # No restrictions
    
    # User can see their own records or records in their territory
    return f"""
        (`tabSales Order`.owner = '{user}'
        OR `tabSales Order`.territory IN (
            SELECT territory FROM `tabUser Permission`
            WHERE user = '{user}' AND allow = 'Territory'
        ))
    """

def has_permission(doc, ptype, user):
    """Custom permission check for documents"""
    if not user:
        user = frappe.session.user
    
    if ptype == "read":
        return check_read_permission(doc, user)
    elif ptype == "write":
        return check_write_permission(doc, user)
    elif ptype == "submit":
        return check_submit_permission(doc, user)
    elif ptype == "cancel":
        return check_cancel_permission(doc, user)
    
    return True

def check_read_permission(doc, user):
    """Check if user can read this document"""
    roles = frappe.get_roles(user)
    
    # Managers see everything
    if "Sales Manager" in roles:
        return True
    
    # Users see own records
    if doc.owner == user:
        return True
    
    # Territory-based access
    user_territories = get_user_territories(user)
    if doc.territory in user_territories:
        return True
    
    return False
```

`has_permission(doc, ptype, user)` registered via `hooks.py`'s `has_permission`
dict is dispatched by `has_controller_permissions`
(`frappe/permissions.py`) and is **deny-only**: it can turn an otherwise-allowed
action into a denial, but returning `True` never grants access beyond what role
permissions, User Permissions, and sharing already computed. To actually grant
access from custom logic (e.g. "project members can always read, regardless of
role permissions"), override the `Document.has_permission()` instance method
instead — see [permissions-rowlevel.md](permissions-rowlevel.md) for the full
comparison of both extension points.

## User Permission Patterns

### Dynamic User Permissions
```python
def set_dynamic_user_permissions(user):
    """Set user permissions based on user profile"""
    # Clear existing dynamic permissions
    frappe.db.delete("User Permission", {
        "user": user,
        "is_default": 0
    })
    
    employee = frappe.db.get_value("Employee", {"user_id": user})
    if not employee:
        return
    
    employee_doc = frappe.get_doc("Employee", employee)
    
    # Permit user's company
    if employee_doc.company:
        add_user_permission(user, "Company", employee_doc.company)
    
    # Permit user's department
    if employee_doc.department:
        add_user_permission(user, "Department", employee_doc.department)
    
    # Permit user's cost center
    if employee_doc.payroll_cost_center:
        add_user_permission(user, "Cost Center", employee_doc.payroll_cost_center)

def add_user_permission(user, doctype, value):
    frappe.get_doc({
        "doctype": "User Permission",
        "user": user,
        "allow": doctype,
        "for_value": value,
        "is_default": 0
    }).insert(ignore_permissions=True)  # trusted server code granting a permission record the requesting user cannot create directly
```

## Row-Level Security

### Document-Level Restrictions
```python
class Project(Document):
    def has_permission(self, ptype="read", user=None):
        """Row-level security for projects"""
        if not user:
            user = frappe.session.user
        
        # Skip check for admins
        if user == "Administrator":
            return True
        
        # Project members have access
        is_member = frappe.db.exists("Project Member", {
            "parent": self.name,
            "user": user
        })
        
        if is_member:
            return True
        
        # Project owner has full access
        if self.owner == user:
            return True
        
        # Managers of project department have access
        if self.department:
            if is_department_manager(user, self.department):
                return True
        
        return False
```

### Permission Query for Lists
```python
## In hooks.py
permission_query_conditions = {
    "Project": "my_app.permissions.project_query_conditions"
}

## In permissions.py
def project_query_conditions(user):
    """SQL WHERE clause for Project list"""
    if not user:
        user = frappe.session.user
    
    if "Projects Manager" in frappe.get_roles(user):
        return ""
    
    # Build complex condition
    conditions = []
    
    # Own projects
    conditions.append(f"owner = '{user}'")
    
    # Projects where user is member
    conditions.append(f"""
        name IN (
            SELECT parent FROM `tabProject Member`
            WHERE user = '{user}'
        )
    """)
    
    # Projects in user's department
    employee = frappe.db.get_value("Employee", {"user_id": user}, "department")
    if employee:
        conditions.append(f"department = {frappe.db.escape(employee)}")  # escape() adds the quotes
    
    return "(" + " OR ".join(conditions) + ")"
```

## Field-Level Permissions

There is no `doc.remove_field_from_interface()` or per-field `<field>_read_only`
attribute in Frappe — those APIs do not exist. The two real mechanisms are:

### Server-enforced: `permlevel` (see permissions.md)

Set `permlevel` on the field in the DocType JSON, then grant that level to a role
in a DocPerm row. `Document.apply_fieldlevel_read_permissions()`
(`frappe/model/document.py`) deletes attributes for permlevels the current user's
role permissions don't cover before the document reaches the client — this is the
only field hiding that also holds for REST/API reads, not just the Desk form.

```python
# Read current permlevel access for a role-evaluated doc
has_access_to = doc.get_permlevel_access("read")  # -> list[int] of allowed permlevels
```

To change a field's `permlevel` at runtime for a **Custom DocType** (not exported
to a JSON file), update the child `DocField`/`Custom Field` row and clear the doctype
cache — do not skip `clear_cache` or the meta cache will keep serving the old value:

```python
frappe.db.set_value("Custom Field", {"dt": doctype, "fieldname": fieldname}, "permlevel", permlevel)
frappe.clear_cache(doctype=doctype)
```

For a standard app DocType this must instead be a JSON change under `developer_mode`
followed by `bench migrate`, or the edit is lost on the next `bench migrate`.

### Client-only: Desk form field visibility

Hiding/read-only-ing a field only in the Desk UI (not enforced server-side, and not
applied to REST/API access) is a client script concern, not a DocType-development
one:

```javascript
// client script
frappe.ui.form.on("Sales Order", {
    refresh(frm) {
        const can_see_cost = frappe.user.has_role("Finance Manager");
        frm.toggle_display("cost_price", can_see_cost);
        frm.set_df_property("discount_percent", "read_only", !frappe.user.has_role("Sales Manager"));
    },
});
```

## Hierarchical Permissions

### Department Hierarchy Access
```python
def get_accessible_departments(user):
    """Get departments user can access based on hierarchy"""
    employee = frappe.db.get_value("Employee", {"user_id": user}, "department")
    if not employee:
        return []

    # Get all child departments via nested-set (lft/rgt) subqueries
    Department = frappe.qb.DocType("Department")
    lft_subquery = frappe.qb.from_(Department).select(Department.lft).where(Department.name == employee)
    rgt_subquery = frappe.qb.from_(Department).select(Department.rgt).where(Department.name == employee)
    rows = (
        frappe.qb.from_(Department)
        .select(Department.name)
        .where(Department.lft >= lft_subquery)
        .where(Department.rgt <= rgt_subquery)
        .run()
    )
    return [r[0] for r in rows]

def is_manager_of_user(manager_user, target_user):
    """Check if manager_user manages target_user"""
    target_employee = frappe.db.get_value("Employee", 
        {"user_id": target_user}, "name")
    
    # Check reports_to chain
    current = target_employee
    max_depth = 10  # Prevent infinite loops
    
    for _ in range(max_depth):
        reports_to = frappe.db.get_value("Employee", current, "reports_to")
        if not reports_to:
            return False
        
        reports_to_user = frappe.db.get_value("Employee", reports_to, "user_id")
        if reports_to_user == manager_user:
            return True
        
        current = reports_to
    
    return False
```

## Time-Based Permissions

### Temporal Access Control
```python
def check_time_based_permission(doc, user):
    """Permission based on time/date restrictions"""
    from frappe.utils import now_datetime, getdate
    
    # Check if within edit window
    if doc.freeze_after and getdate() > getdate(doc.freeze_after):
        frappe.throw("This document is frozen and cannot be edited")
    
    # Check business hours
    current_hour = now_datetime().hour
    business_hours = frappe.db.get_single_value("System Settings", "business_hours")  # hypothetical Custom Field you add to System Settings; not a stock field
    
    if business_hours:
        start_hour, end_hour = map(int, business_hours.split("-"))
        if not (start_hour <= current_hour < end_hour):
            frappe.throw("Document editing is only allowed during business hours")
```

## Audit Trail

### Permission Audit Logging
```python
def log_permission_check(doctype, docname, user, ptype, result):
    """Log permission checks for audit"""
    if frappe.conf.get("enable_permission_audit"):
        frappe.enqueue(
            create_permission_log,
            doctype=doctype,
            docname=docname,
            user=user,
            permission_type=ptype,
            result="Allowed" if result else "Denied",
            timestamp=frappe.utils.now_datetime()
        )

def create_permission_log(**kwargs):
    frappe.get_doc({
        "doctype": "Permission Log",
        **kwargs
    }).insert(ignore_permissions=True)  # background job (frappe.enqueue) writing a system audit log, not a user-facing insert
```

## Best Practices

1. **Cache permission checks** - Use `frappe.cache()` for frequently checked permissions
2. **Avoid N+1 queries** - Use permission query conditions instead of per-document checks
3. **Test edge cases** - Test with users having multiple roles
4. **Document your permissions** - Keep a permission matrix document
5. **Use has_permission sparingly** - It's called on every read, keep it fast

## Sources

- `apps/frappe/frappe/permissions.py`, `apps/frappe/frappe/core/doctype/permission_type/permission_type.py`, `apps/frappe/frappe/model/document.py`, `apps/frappe/frappe/model/meta.py` — Frappe 16.35.0
- Query builder: `env/lib/python3.14/site-packages/pypika/queries.py:695` (`QueryBuilder(Selectable, Term)` — a query builder is itself a `Term`, so it renders as a scalar subquery in `>=`/`<=` comparisons), matching the documented subquery pattern in [database.md](../../frappe-api-development/references/database.md#subqueries)
