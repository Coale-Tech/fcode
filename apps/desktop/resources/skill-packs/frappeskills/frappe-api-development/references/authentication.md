# Authentication Guide

Frappe uses session-based authentication by default. `frappe-ui` does not
ship a session/user store of its own; client-side patterns build one on
`createResource`/`call` — see [authentication-client.md](authentication-client.md).

## Topics

| Topic | File |
|---|---|
| Session/role checks, the v16 permission model, rate limiting, CSRF | [authentication-server.md](authentication-server.md) |
| Session/user state, login/logout, route guards, session timeout | [authentication-client.md](authentication-client.md) |
| Issuing, validating, and securing API key/secret credentials | [authentication-api-keys.md](authentication-api-keys.md) |

## Best Practices

1. **Always check permissions** on server-side methods
2. **Build session state on `createResource`/`call`** — frappe-ui has no user/session export
3. **Implement route guards** to protect authenticated pages
4. **Use role-based access** for granular permissions
5. **Never expose sensitive data** without permission checks
6. **Use CSRF tokens** for all state-changing requests
7. **Handle session expiry** gracefully
8. **Redirect to login** on authentication failure
9. **Use `@frappe.whitelist()`** for all public API methods
10. **Validate user input** even with authenticated users

## Sources

Verified against Frappe framework v16.35.0 (`frappe.__version__ == "16.35.0"`,
`apps/frappe/frappe/__init__.py:58`):

- `apps/frappe/frappe/permissions.py` — `has_permission` (l.81), `get_doc_permissions` (l.229), `get_role_permissions` (l.284), `has_user_permission` (l.353), `has_controller_permissions` (l.483), `get_valid_perms` (l.507), `get_roles` (l.537)
- `apps/frappe/frappe/__init__.py` — `whitelist` (l.439), `is_whitelisted` (l.479), `only_for` (l.548), `has_permission` wrapper (l.600), `get_roles` (l.406), `get_installed_apps` (l.924), `generate_hash` (l.707), `ping` (l.1555), `_`/`_lt` import (l.45)
- `apps/frappe/frappe/rate_limiter.py` — `rate_limit` decorator (l.104), site-wide `apply` (l.15)
- `apps/frappe/frappe/utils/messages.py` — `throw` (l.138), `msgprint` (l.11)
- `apps/frappe/frappe/utils/translations.py` — `_` (l.4), `_lt` (l.56)
- `apps/frappe/frappe/auth.py` — `UNSAFE_HTTP_METHODS` (l.29), `validate_csrf_token` (l.81), `is_allowed_referrer` (l.102)
- `apps/frappe/frappe/sessions.py` — `get_csrf_token` (l.197), `generate_csrf_token` (l.204)
- `apps/frappe/frappe/model/db_query.py` — `get_permission_query_conditions` (l.1159)
- `apps/frappe/frappe/model/document.py` — `check_permission` (l.397), `has_permission` (l.402, `ignore_permissions` short-circuit l.409), `insert`/`save`/`delete` `ignore_permissions` (l.438/463, l.555/573, l.1380)
- `apps/frappe/frappe/website/page_renderers/base_template_page.py` (l.20-22), `apps/frappe/frappe/public/js/frappe/request.js` (l.267), `apps/frappe/frappe/public/js/frappe/desk.js` — client CSRF token exposure (`frappe.csrf_token`)
