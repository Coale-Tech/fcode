# Server-Side Authentication & Permissions

Session/role/permission checks in whitelisted methods, the v16 permission
model, rate limiting, and CSRF validation. Client-side (frappe-ui) auth:
[authentication-client.md](authentication-client.md). Issuing and validating
API keys: [authentication-api-keys.md](authentication-api-keys.md).

## Checking User Session

```python
import frappe

@frappe.whitelist()
def get_current_user():
    """Get current logged-in user"""
    return frappe.session.user

@frappe.whitelist()
def check_login():
    """Check if user is logged in"""
    if frappe.session.user == "Guest":
        return {"logged_in": False}
    return {
        "logged_in": True,
        "user": frappe.session.user,
        "user_email": frappe.session.data.user_email
    }
```

## Permission Checks

```python
@frappe.whitelist()
def get_sensitive_data():
    """Require specific permission"""
    if not frappe.has_permission("MyDocType", "read"):
        frappe.throw("Not permitted", frappe.PermissionError)

    # Return data
    return frappe.get_all("MyDocType")

@frappe.whitelist()
def update_document(docname, data):
    """Write permission check"""
    doc = frappe.get_doc("MyDocType", docname)

    if not doc.has_permission("write"):
        frappe.throw("Not permitted", frappe.PermissionError)

    doc.update(data)
    doc.save()
    return doc.as_dict()
```

## Role-Based Access

```python
@frappe.whitelist()
def admin_only_method():
    """Only accessible to System Manager"""
    if "System Manager" not in frappe.get_roles():
        frappe.throw("Access denied", frappe.PermissionError)

    # Admin logic here
    return {"message": "Admin access granted"}

@frappe.whitelist()
def get_user_data():
    """Get data based on user role"""
    user = frappe.session.user
    roles = frappe.get_roles(user)

    if "System Manager" in roles:
        # Return all data
        return frappe.get_all("MyDocType", fields=["*"])
    elif "Manager" in roles:
        # Return filtered data
        return frappe.get_all("MyDocType", filters={"owner": user})
    else:
        # Return limited data
        return frappe.get_all("MyDocType", fields=["name", "status"])
```

## API Key Authentication (for external integrations)

```python
@frappe.whitelist()
def api_method():
    """Method that supports both session and API key auth"""
    # Frappe handles API key auth automatically
    # Just check permissions

    if not frappe.has_permission("MyDocType", "read"):
        frappe.throw("Not permitted", frappe.PermissionError)

    return frappe.get_all("MyDocType")
```

Issuing and rotating API keys: [authentication-api-keys.md](authentication-api-keys.md).

## Permission Model (Server-Side, source-verified — v16)

Frappe's permission system is layered (role permissions → User Permissions →
shares → controller hooks). A check passes only if the relevant layer grants it.
Critically, **controller `has_permission` hooks can only DENY, never grant**
access that role permissions didn't already allow
(`apps/frappe/frappe/permissions.py:483` `has_controller_permissions`).
`Administrator` short-circuits to `True` in `has_permission`
(`permissions.py:108-110`).

### Core permission functions & signatures

```python
# Public wrapper — USE THIS in whitelisted methods. Supports throw=True.
frappe.has_permission(
    doctype=None, ptype="read", doc=None, user=None, throw=False,
    *, parent_doctype=None, debug=False, ignore_share_permissions=False,
) -> bool
# frappe/__init__.py:600 — if throw=True and denied, raises frappe.PermissionError

# Low-level engine (called by the wrapper above)
frappe.permissions.has_permission(
    doctype, ptype="read", doc=None, user=None,
    *, parent_doctype=None, print_logs=True, debug=False,
    ignore_share_permissions=False,
) -> bool
# frappe/permissions.py:80

# Per-doc evaluated permission dict, e.g. {"read": 1, "write": 1}
frappe.permissions.get_doc_permissions(doc, user=None, ptype=None, debug=False) -> dict
# frappe/permissions.py:229

# Role-permission dict for a DocType meta (does NOT include User Permissions)
frappe.permissions.get_role_permissions(doctype_meta, user=None, is_owner=None, debug=False) -> dict
# frappe/permissions.py:284

# User Permission (document-level scoping) check
frappe.permissions.has_user_permission(doc, user=None, debug=False, *, ptype=None) -> bool
# frappe/permissions.py:353

# Controllers can only DENY, never grant
frappe.permissions.has_controller_permissions(doc, ptype, user=None, debug=False) -> bool
# frappe/permissions.py:483

# Roles of a user (includes automatic roles: All, Guest, Desk User)
frappe.get_roles(username=None) -> list[str]                                # frappe/__init__.py:406
frappe.permissions.get_roles(user=None, with_standard=True) -> list[str]    # permissions.py:537

# Raise frappe.PermissionError unless the user has ANY of the given roles.
frappe.only_for(roles, message=False)                                       # frappe/__init__.py:548
```

Document methods (`apps/frappe/frappe/model/document.py`):
`doc.has_permission(permtype="read", *, debug=False, user=None) -> bool` (line 402)
and `doc.check_permission(permtype="read", permlevel=None)` (line 397), which
raises `frappe.PermissionError` on failure.

### Recommended patterns in whitelisted methods

```python
@frappe.whitelist()
def get_sensitive_data():
    # Preferred: let the framework raise PermissionError with throw=True
    frappe.has_permission("MyDocType", "read", throw=True)
    return frappe.get_all("MyDocType")

@frappe.whitelist()
def update_document(docname, data):
    doc = frappe.get_doc("MyDocType", docname)
    doc.check_permission("write")            # raises frappe.PermissionError if denied
    doc.update(frappe.parse_json(data))
    doc.save()
    return doc.as_dict()

@frappe.whitelist()
def admin_only():
    frappe.only_for("System Manager")        # raises PermissionError otherwise
    return {"ok": True}
```

Note: the `unchecked-frappe-permission-call` semgrep rule flags a bare
`frappe.has_permission(...)` whose return value is ignored — always either check
the return value or pass `throw=True`.

### Row-level filtering: `permission_query_conditions` hook

List queries (`frappe.get_list`/`get_all` when `ignore_permissions` is falsy)
append extra `WHERE` conditions from the `permission_query_conditions` hook
(`apps/frappe/frappe/model/db_query.py:1159` `get_permission_query_conditions`).
Hooks are resolved as `hooks.get(doctype, []) + hooks.get("*", [])`; each method
is invoked as `method(user, doctype=doctype)` and must return a SQL condition
string (Server Scripts of type "Permission Query" are also supported).

```python
# hooks.py
permission_query_conditions = {
    "ToDo": "my_app.permissions.todo_query_conditions",
}

# my_app/permissions.py
def todo_query_conditions(user, doctype=None):
    user = user or frappe.session.user
    # Escape any interpolated value with frappe.db.escape to stay injection-safe.
    return f"`tabToDo`.owner = {frappe.db.escape(user)}"
```

Document-level (not list) access can be denied via the `has_permission` hook,
resolved in `has_controller_permissions` (`permissions.py:483`):

```python
# hooks.py
has_permission = {"ToDo": "my_app.permissions.todo_has_permission"}

def todo_has_permission(doc, ptype=None, user=None, debug=False):
    # Return falsy to DENY. Controllers cannot grant extra access.
    return doc.owner == (user or frappe.session.user)
```

### User Permissions

User Permissions restrict *which specific documents* a user may access for a
linked DocType, layered on top of role permissions
(`frappe/permissions.py:has_user_permission`, backed by
`frappe/core/doctype/user_permission/`). They are enforced automatically inside
`get_doc_permissions` and in list queries — you do not call them directly.

### `ignore_permissions` semantics

`ignore_permissions` **bypasses all permission checks**. On a document,
`doc.flags.ignore_permissions = True` makes `doc.has_permission()` return `True`
unconditionally (`apps/frappe/frappe/model/document.py:402-410`). DB-op kwargs
set that flag:

```python
doc.insert(ignore_permissions=True)            # document.py:438,463-464
doc.save(ignore_permissions=True)              # document.py:555,573-574
doc.delete(ignore_permissions=True)            # document.py:1380,1385
frappe.get_list("X", ignore_permissions=True)  # skips permission_query_conditions
```

Only use `ignore_permissions=True` in trusted server-side code (background jobs,
migrations, system-authored writes). NEVER derive it from user input, and NEVER
use it as a shortcut inside a `@frappe.whitelist()` endpoint reachable by
untrusted users — that is a privilege-escalation bug.

### `@frappe.whitelist` and endpoint exposure

```python
frappe.whitelist(allow_guest=False, xss_safe=False, methods=None)  # frappe/__init__.py:439
```
- Only whitelisted functions are callable via `/api/method/<dotted.path>`
  (`is_whitelisted`, `frappe/__init__.py:479`).
- `methods` defaults to `["GET", "POST", "PUT", "DELETE"]`; restrict it
  (e.g. `methods=["POST"]`) for state-changing endpoints.
- `allow_guest=True` exposes the method to unauthenticated users — audit every
  such method (semgrep `guest-whitelisted-method`). For Guest calls, `form_dict`
  string values are HTML-sanitized unless `xss_safe=True`.
- Type hints on parameters are validated at call time via
  `validate_argument_types` (semgrep `missing-argument-type-hint`).

### Rate limiting

```python
from frappe import rate_limit   # frappe.rate_limiter.rate_limit
rate_limit(key=None, limit=5, seconds=86400, methods="ALL", ip_based=True)
# frappe/rate_limiter.py:104

@frappe.whitelist(allow_guest=True)
@rate_limit(key="email", limit=5, seconds=60 * 60)
def request_otp(email):
    ...
```
Exceeding the limit raises `frappe.RateLimitExceededError`
(`rate_limiter.py:167`). A site-wide limit can also be set via
`frappe.conf.rate_limit = {"limit": ..., "window": ...}` (`rate_limiter.py:16`).

## CSRF Protection

Frappe validates a CSRF token on every unsafe HTTP request — `POST`, `PUT`,
`DELETE`, `PATCH` (`apps/frappe/frappe/auth.py:29` `UNSAFE_HTTP_METHODS`). The
submitted token is compared to `frappe.session.data.csrf_token`; a mismatch
raises `frappe.CSRFTokenError` ("Invalid Request") in
`HTTPRequest.validate_csrf_token` (`auth.py:81-97`). The token is accepted from
either the `X-Frappe-CSRF-Token` request header or a `csrf_token` form field
(`auth.py:89`). Validation is skipped for safe methods, when
`frappe.conf.ignore_csrf` is set, for a Guest session with no token, or for an
allowed referrer.

The token is generated server-side by `frappe.generate_hash()`
(`frappe/sessions.py:197,204` `get_csrf_token`/`generate_csrf_token`) and
injected into the page as the global `frappe.csrf_token`
(`frappe/website/page_renderers/base_template_page.py:22`, and on Desk boot via
`frappe/public/js/frappe/desk.js`). It is **not** a readable cookie.

When using `frappe-ui`'s `call` / `createResource`, the CSRF header is attached
automatically:

```javascript
import { call, createResource } from 'frappe-ui'

// These include the X-Frappe-CSRF-Token header automatically
await call('my_method')
await resource.submit()
```

For manual `fetch` requests, read the boot-injected `frappe.csrf_token` and send
it in the header (Frappe's own `request.js` uses the same header —
`frappe/public/js/frappe/request.js:267`):

```javascript
async function manualRequest() {
  const csrfToken = frappe.csrf_token   // injected into the desk/web boot

  await fetch('/api/method/my_method', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Frappe-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ data: 'value' }),
  })
}
```

## Sources

See [authentication.md](authentication.md) `## Sources`.
