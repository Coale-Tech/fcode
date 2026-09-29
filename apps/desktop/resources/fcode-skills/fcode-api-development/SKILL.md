---
name: fcode-api-development
description: "Write Frappe whitelisted API methods: permissions, parameterized SQL, safe response patterns, and frappe.client wrappers."
---

# API development

## Whitelisted methods

```python
import frappe
from frappe import _

@frappe.whitelist()
def get_order_summary(order_name: str) -> dict:
    # Permission check before any data access.
    if not frappe.has_permission("Sales Order", "read", order_name):
        frappe.throw(_("No read permission for Sales Order {0}").format(order_name),
                     frappe.PermissionError)
    doc = frappe.get_doc("Sales Order", order_name)
    return {"name": doc.name, "grand_total": doc.grand_total, "status": doc.status}
```

- `@frappe.whitelist()` makes the method callable via `frappe.call(...)` from
  JS and via `bench execute`.
- Add `allow_guest=True` only for truly public, unauthenticated endpoints.
- Always check `frappe.has_permission` before reading or mutating data; throw on
  failure rather than returning empty data.

## Parameterized SQL

Never concatenate user input into SQL. Use `frappe.db.sql` with `%s`
placeholders:

```python
rows = frappe.db.sql(
    """
    SELECT name, grand_total
    FROM `tabSales Order`
    WHERE company = %s AND status = %s
    ORDER BY creation DESC
    LIMIT 100
    """,
    (company, status),
    as_dict=True,
)
```

Prefer `frappe.get_all` / `frappe.get_list` for standard queries — they apply
permission filters automatically:

```python
frappe.get_all(
    "Sales Order",
    filters={"company": company, "status": ["in", ["Draft", "Submitted"]]},
    fields=["name", "grand_total"],
)
```

## frappe.client wrappers (JS → Python)

From client scripts or Vue:

```js
// Single document
const doc = await frappe.call("frappe.client.get", {
    doctype: "Customer",
    name: customer_name,
});

// List
const { message: rows } = await frappe.call("frappe.client.get_list", {
    doctype: "Sales Order",
    filters: { status: "Draft" },
    fields: ["name", "grand_total"],
    limit: 50,
});

// Custom whitelisted method
const { message } = await frappe.call(
    "myapp.mymodule.api.get_order_summary",
    { order_name: "SO-0001" },
);
```

## Response conventions

- Return plain dicts or lists; Frappe wraps them in `{"message": ...}`.
- Raise `frappe.ValidationError` for user-fixable input problems.
- Raise `frappe.PermissionError` for authorization failures.
- Raise `frappe.DoesNotExistError` for missing documents.
- Never catch and swallow these — let Frappe serialize them to the client.

## Security checklist

- No string-concatenated SQL.
- `frappe.has_permission` before every data read/write in a whitelisted method.
- Numeric limits on any `LIMIT` clause from user input (`min(limit, 500)`).
- No `eval` or `exec` on user-supplied strings.
- Secrets from `frappe.conf` (site config), never from request params.
