# API Key Management

Issuing, validating, and securing API key/secret credentials for external
integrations. Using a key/secret you already have: see
[authentication-server.md](authentication-server.md) `## API Key Authentication`.
Header formats: `Authorization: token <api_key>:<api_secret>`, or Basic auth
with the same pair base64-encoded (`Authorization: Basic <base64(api_key:api_secret)>`).

## Creating API Keys Programmatically

Issuing a User with API access is a System Manager-level action — gate the
whitelisted endpoint before touching `ignore_permissions`, and keep the
bypass scoped to exactly the two writes it's needed for:

```python
@frappe.whitelist()
def create_api_user(email, full_name, roles=None):
    """Create a user with API access. Callable only by a System Manager —
    creating a User and assigning roles is not something any caller's own
    DocType permissions would otherwise grant."""
    frappe.only_for("System Manager")

    user = frappe.get_doc({
        "doctype": "User",
        "email": email,
        "first_name": full_name,
        "send_welcome_email": 0,
        "roles": [{"role": r} for r in (roles or ["API User"])],
    })
    # ignore_permissions=True: the frappe.only_for check above already
    # authorized this caller; User creation itself requires System Manager
    # role permissions the caller may not hold directly.
    user.insert(ignore_permissions=True)

    api_key = frappe.generate_hash(length=15)
    api_secret = frappe.generate_hash(length=15)

    user.api_key = api_key
    user.api_secret = api_secret
    # ignore_permissions=True: same trusted-caller justification as insert() above.
    user.save(ignore_permissions=True)

    return {"api_key": api_key, "api_secret": api_secret}
```

## Generating Keys for an Existing User (stock endpoint)

For a User that already exists, prefer the framework's own whitelisted method
over hand-rolling the hash generation: `POST /api/method/frappe.core.doctype.user.user.generate_keys`
with `user=<name>`. It is gated by `frappe.only_for("System Manager")`, always
regenerates `api_secret`, and only generates `api_key` if the user doesn't
already have one (`apps/frappe/frappe/core/doctype/user/user.py:1427-1444`):

```python
import frappe

@frappe.whitelist(methods=["POST"])
def generate_keys(user: str):
    frappe.only_for("System Manager")
    user_details = frappe.get_doc("User", user)
    api_secret = frappe.generate_hash(length=15)
    if not user_details.api_key:
        user_details.api_key = frappe.generate_hash(length=15)
    user_details.api_secret = api_secret
    user_details.save()
    return {"api_key": user_details.api_key, "api_secret": api_secret}
```

`api_secret` is stored as a `Password` fieldtype (encrypted at rest,
returned in cleartext only from this call) and `api_key` as plain `Data`
(`apps/frappe/frappe/core/doctype/user/user.py:75-76`).

## Validating Tokens

`api_secret` is a `Password` fieldtype: its value lives only in the
separate `__Auth` table, never in a plain column on `tabUser`
(`apps/frappe/frappe/utils/password.py:13,23-34`). `frappe.db.get_value`
against `User` cannot read it — fetch the docname first, then decrypt with
`get_decrypted_password`, exactly as the framework's own
`validate_api_key_secret` does (`apps/frappe/frappe/auth.py:721-747`):

```python
from frappe.utils.password import get_decrypted_password

def validate_api_token(api_key, api_secret):
    """Validate API credentials."""
    user = frappe.db.get_value("User", {"api_key": api_key, "enabled": 1}, "name")

    if not user:
        return None

    doc_secret = get_decrypted_password("User", user, fieldname="api_secret", raise_exception=False)

    if doc_secret and doc_secret == api_secret:
        return user

    return None
```

## IP Whitelisting

```python
@frappe.whitelist()
def ip_restricted():
    allowed_ips = ["192.168.1.0/24", "10.0.0.1"]
    client_ip = frappe.local.request_ip

    if not is_ip_allowed(client_ip, allowed_ips):
        frappe.throw(_("IP not allowed"), frappe.PermissionError)

    return {"status": "ok"}
```

## Token Security

- **Never log API secrets** — mask them in logs and error messages.
- **HTTPS only** — never send tokens over plain HTTP.
- **Rotate keys regularly** — regenerate `api_key`/`api_secret` on a schedule.
- **Limit scope** — create role-specific API users instead of sharing one
  System Manager key across integrations.

## Debugging Auth Issues

```python
# In console or an endpoint
print(frappe.session.user)   # Current authenticated user
print(frappe.get_roles())    # Current user's roles
```

```bash
curl -X GET "https://example.com/api/method/frappe.auth.get_logged_user" \
  -H "Authorization: token api_key:api_secret"
```

| Issue | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Invalid/expired token | Regenerate API credentials |
| 403 Forbidden | Missing permissions | Check role assignments |
| CSRF error | Missing CSRF token | Use proper auth headers — see [authentication-server.md](authentication-server.md) `## CSRF Protection` |
| Session expired | Cookie timeout | Re-authenticate |

## Sources

See [authentication.md](authentication.md) `## Sources`.
