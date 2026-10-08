# OAuth 2.0 & Social Login

A Frappe site can play three OAuth roles at once: **Provider** (other apps
authenticate against your site), **Consumer/Social Login** (your site's own
login page authenticates users against Google, GitHub, etc.), and **Client**
(your site's own code calls an external OAuth-protected API via a
**Connected App**). All three share `frappe/oauth.py` helpers but are
otherwise independent subsystems.

## Frappe as OAuth Provider

Server implementation: `frappe/integrations/oauth2.py`, built on
`oauthlib`'s OpenID-Connect `WebApplicationServer`
(`frappe/oauth.py` `OAuthWebRequestValidator`).

### Endpoints

| Endpoint | Path | Method | Whitelist |
|---|---|---|---|
| Authorization | `/api/method/frappe.integrations.oauth2.authorize` | GET/POST | `allow_guest=True` |
| Approve (consent submit) | `/api/method/frappe.integrations.oauth2.approve` | POST | session required |
| Token | `/api/method/frappe.integrations.oauth2.get_token` | POST | `allow_guest=True` |
| Revoke | `/api/method/frappe.integrations.oauth2.revoke_token` | POST | `allow_guest=True` |
| Userinfo | `/api/method/frappe.integrations.oauth2.openid_profile` | GET/POST | `allow_guest=True` |
| Introspect | `/api/method/frappe.integrations.oauth2.introspect_token` | POST | `allow_guest=True` |
| Dynamic client registration (v16) | `/api/method/frappe.integrations.oauth2.register_client` | POST | `allow_guest=True`, gated by OAuth Settings |

(`ENDPOINTS` dict, `frappe/integrations/oauth2.py:29-35`.) Well-known
metadata documents are served directly by the request router, not through
`/api/method/` (`frappe/app.py:166-174`, `handle_wellknown`,
`frappe/integrations/oauth2.py:293-307`):

| Well-known path | RFC | Gate |
|---|---|---|
| `/.well-known/openid-configuration` | legacy OIDC discovery | always on |
| `/.well-known/oauth-authorization-server` (v16) | RFC 8414 | `OAuth Settings.show_auth_server_metadata` (default on) |
| `/.well-known/oauth-protected-resource` (v16) | RFC 9728 | `OAuth Settings.show_protected_resource_metadata` (default on) |

### Supported grants and response types — do not assume more than this

`_get_authorization_server_metadata()` (`oauth2.py:324-356`) is the
authoritative, source-verified list:

- `response_types_supported`: `["code"]` only — the implicit/token response
  type is intentionally excluded ("PKCE token flow is not supported...
  responding with token in the redirect URL is an unsafe practice").
- `grant_types_supported`: `["authorization_code", "refresh_token"]` only.
  **Client Credentials and Resource Owner Password grants are not
  implemented** by the provider — `oauthlib`'s `WebApplicationServer` only
  wires up authorization-code/implicit/refresh-token grants, and the OAuth
  Client doctype's own `grant_type` select only offers `Authorization
  Code`/`Implicit` (`oauth_client.json` field `grant_type`). If you need
  machine-to-machine (no user) auth to your own site, use API key/secret
  (`authentication-api-keys.md`), not this OAuth provider.
- `token_endpoint_auth_methods_supported`: `["none", "client_secret_basic"]`.
- `code_challenge_methods_supported`: `["S256"]` — PKCE is supported and its
  `code_challenge`/`code_challenge_method` are persisted on **OAuth
  Authorization Code** (fields exist; validation happens inside
  `OAuthWebRequestValidator`, not application code).

### DocTypes

**OAuth Client** (`frappe/integrations/doctype/oauth_client`) — one row per
registered client app. Key fields: `client_id`, `client_secret` (both
read-only, server-generated), `app_name`, `scopes` (space-separated,
default `"all openid"`), `redirect_uris` (newline-separated),
`default_redirect_uri`, `skip_authorization` (skip the consent screen),
`token_endpoint_auth_method` (`Client Secret Basic` / `Client Secret Post` /
`None` — `None` means a public client using PKCE instead of a secret),
`allowed_roles` (Table MultiSelect of `OAuth Client Role`).

**OAuth Bearer Token** — issued access/refresh tokens: `client`, `user`,
`scopes`, `access_token` (autoname field), `refresh_token`,
`expiration_time`, `status` (`Active`/`Revoked`).

**OAuth Authorization Code** — short-lived codes from the authorize step:
`client`, `user`, `scopes`, `authorization_code` (autoname field),
`expiration_time`, `redirect_uri_bound_to_authorization_code`, `validity`
(`Valid`/`Invalid`), `nonce`, `code_challenge`, `code_challenge_method`.

**OAuth Settings** (v16, single DocType, `frappe/integrations/doctype/oauth_settings`)
— the current place to configure the provider/resource-server side:
`show_auth_server_metadata`, `show_protected_resource_metadata` (both
default on), `enable_dynamic_client_registration` (default on),
`allowed_public_client_origins` (newline list or `*`, used for CORS on
public-client requests), `skip_authorization`,
`show_social_login_key_as_authorization_server`, `resource_name`,
`resource_documentation`, `resource_policy_uri`, `resource_tos_uri`,
`scopes_supported`.

**OAuth Provider Settings** (legacy, still read as a fallback) — only has
`skip_authorization` (`Force`/`Auto`). `get_oauth_settings()`
(`frappe/integrations/utils.py:277-288`) checks **OAuth Settings** first and
falls back to this doctype only if the new one has no value set — new sites
should configure OAuth Settings.

### Authorization Code flow (with PKCE)

```python
import secrets, hashlib, base64
from urllib.parse import urlencode

code_verifier = secrets.token_urlsafe(64)
code_challenge = base64.urlsafe_b64encode(
    hashlib.sha256(code_verifier.encode()).digest()
).decode().rstrip("=")

auth_params = {
    "client_id": CLIENT_ID,
    "redirect_uri": REDIRECT_URI,
    "response_type": "code",
    "scope": "all openid",
    "state": "random-state-string",       # your own CSRF check, see below
    "code_challenge": code_challenge,
    "code_challenge_method": "S256",
}
auth_url = f"{SITE}/api/method/frappe.integrations.oauth2.authorize?{urlencode(auth_params)}"
# Browser redirect to auth_url.
```

Server-side, `authorize()` (`oauth2.py:93-164`) forces login if the session
is a Guest, then shows the `oauth_confirmation.html` consent screen (skipped
if `OAuth Client.skip_authorization` is set, or if `OAuth Settings` is
`skip_authorization="Auto"` and the user already has an active bearer token
for this client). Clicking Allow POSTs to `approve()` (`oauth2.py:66-90`,
requires the site's own CSRF token — embedded as a hidden field in the
consent form), which redirects back to your `redirect_uri` with `?code=...`.

```python
# Exchange code for tokens
response = requests.post(
    f"{SITE}/api/method/frappe.integrations.oauth2.get_token",
    data={
        "grant_type": "authorization_code",
        "code": code,
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "code_verifier": code_verifier,   # required if a challenge was sent
    },
)
token_data = response.json()  # access_token, refresh_token, expires_in, token_type
```

### Refresh token flow

```python
requests.post(f"{SITE}/api/method/frappe.integrations.oauth2.get_token", data={
    "grant_type": "refresh_token",
    "refresh_token": refresh_token,
    "client_id": CLIENT_ID,
})
```

### Introspect / Revoke

```python
requests.post(f"{SITE}/api/method/frappe.integrations.oauth2.introspect_token",
    data={"token": token, "token_type_hint": "access_token"})
# {"active": bool, "client_id": ..., "exp": ..., "scope": ..., "sub": ..., ...}
# (sub/openid claims only included if "openid" is in the token's scopes.)

requests.post(f"{SITE}/api/method/frappe.integrations.oauth2.revoke_token",
    data={"token": token})
# Always returns HTTP 200 per RFC 7009, even for an unknown token.
```

Both are unauthenticated at the whitelist level (`allow_guest=True`); the
token itself is the credential — `introspect_token` swallows any exception
and returns `{"active": False}` rather than erroring
(`oauth2.py:251-290`).

### Userinfo / OpenID claims

`openid_profile` returns claims from `frappe.oauth.get_userinfo()`
(`oauth.py:530-556`): `sub` (the `User Social Login` `frappe` provider
userid, not the User's `name`), `name`, `given_name`, `family_name`,
`email`, `picture`, `roles`, `iss`. The legacy `/.well-known/openid-configuration`
document additionally advertises `id_token_signing_alg_values_supported:
["HS256"]`, but note its `response_types_supported` list (which includes
`token`, `id_token token`, etc.) is broader than what `authorize()` actually
grants — treat RFC 8414's `oauth-authorization-server` metadata as
authoritative, this legacy document as informational only.

### Dynamic Client Registration (v16, RFC 7591)

`register_client()` (`oauth2.py:359-434`) is a new v16 endpoint, gated by
`OAuth Settings.enable_dynamic_client_registration` (default on — raises
`NotFound` if disabled). POST a JSON body validated against
`OAuth2DynamicClientMetadata` (Pydantic, `frappe/integrations/utils.py:17-46`):
`redirect_uris` (required, non-empty, must be `https` unless
`developer_mode` or a loopback `http` URI), `client_name` (required),
`token_endpoint_auth_method`, `grant_types` (subset of `authorization_code`/
`refresh_token`), `response_types` (`code` only), plus optional
`client_uri`/`logo_uri`/`contacts`/`tos_uri`/`policy_uri`/`software_id`/
`software_version`. A valid request creates a new **OAuth Client** and
returns `201` with `client_id`/`client_secret` (secret omitted for public
clients, i.e. `token_endpoint_auth_method="none"`) plus the echoed metadata.
There is deliberately no "does this client already exist" check (would leak
`client_id`/`client_secret` to a caller who merely guessed a `client_name`)
— every call mints a fresh client (`create_new_oauth_client`,
`frappe/integrations/utils.py:241-274`).

### Protected-resource metadata and the 401 challenge (v16)

`GET /.well-known/oauth-protected-resource` (RFC 9728,
`_get_protected_resource_metadata`, `oauth2.py:450-491`) advertises
`resource`, `authorization_servers` (the site itself, plus any `Social
Login Key` rows with `show_in_resource_metadata` if
`OAuth Settings.show_social_login_key_as_authorization_server` is set),
`bearer_methods_supported: ["header"]`, and `scopes_supported`. When this
metadata is enabled, every `401`/`403` response gets a
`WWW-Authenticate: Bearer resource_metadata="<site>/.well-known/oauth-protected-resource"`
header (`frappe/app.py:304-305,356-360` `set_authenticate_headers`) so an
MCP/OAuth-aware client can discover how to authenticate without prior
configuration.

### CORS for privileged OAuth requests (v16)

`set_cors_for_privileged_requests()` (`oauth2.py:523-564`, called from
`before_request`) allows cross-origin `GET`/`OPTIONS` on any
`/.well-known/` path unconditionally, and allows cross-origin `POST` to
`register_client` (if dynamic registration is enabled) and to the token,
revocation, introspection, and userinfo endpoints — but only against the
origins listed in `OAuth Settings.allowed_public_client_origins` (or `*`).
This exists so that public clients (browser SPAs, native apps with no
backend) can complete the token exchange directly from the browser without
a site-wide `allow_cors = "*"` in `site_config.json`.

## Frappe as OAuth Consumer (Social Login)

**Social Login Key** (`frappe/integrations/doctype/social_login_key`) is one
row per external provider: `social_login_provider` (`Custom`/`Facebook`/
`Frappe`/`GitHub`/`Google`/`Office 365`/`Salesforce`, plus others),
`client_id`, `client_secret`, `enable_social_login`, `sign_ups`
(`Allow`/`Deny`, per-provider override of the site-wide signup switch),
`authorize_url`, `access_token_url`, `redirect_url`, `api_endpoint`,
`base_url`, `show_in_resource_metadata` (v16 — see protected-resource
metadata above).

The login page (`frappe/www/login.py` `get_context`) lists every provider
with `enable_social_login=1` and a resolvable `client_secret`, and builds
each button's `auth_url` with `get_oauth2_authorize_url(provider, redirect_to)`
(`frappe/utils/oauth.py:121-136`), which also stashes `redirect_to` behind a
single-use cache token via `create_oauth_state()`
(`frappe/utils/oauth.py:98-105`, `OAUTH_LOGIN_FLOW_CACHE_PREFIX`) — **you do
not write your own `state` handling for the stock providers**, the
framework already does CSRF-safe state for you.

The provider's redirect comes back to one of the stock, per-provider,
`allow_guest=True` callbacks in `frappe/integrations/oauth2_logins.py`:
`login_via_google`, `login_via_github`, `login_via_facebook`,
`login_via_frappe`, `login_via_office365`, `login_via_salesforce`,
`login_via_fairlogin`, `login_via_keycloak`, each calling
`frappe.utils.oauth.login_via_oauth2(provider, code, state, decoder=...)`
(`login_via_oauth2_id_token` for Office 365, which authenticates via the
OIDC `id_token` instead of a userinfo call). `login_via_oauth2` exchanges
the code, calls `login_oauth_user()` to create-or-update the `User` and its
`User Social Login` child row, and redirects post-login
(`frappe/utils/oauth.py:168-171,218-275`).

For a provider with no stock callback, register it as a **Social Login
Key** with `social_login_provider = "Custom"` and point its redirect URI at
`/api/method/frappe.integrations.oauth2_logins.custom/<provider-name>`
(`oauth2_logins.py:51-64`) rather than writing a bespoke whitelisted method
— `custom()` looks up the `Social Login Key` by that path segment and
delegates to the same `login_via_oauth2()`:

```python
# Social Login Key doc:
# social_login_provider = "Custom", client_id/client_secret set,
# redirect_url = "<site>/api/method/frappe.integrations.oauth2_logins.custom/my_provider"
```

`decoder_compat` (`oauth2_logins.py:66-68`) is a real, importable helper —
`from frappe.integrations.oauth2_logins import decoder_compat` — needed
because `rauth`'s OAuth2 client returns raw bytes for some providers'
token responses.

## Frappe as an OAuth Client to external APIs (Connected App)

For server-side code that needs to call an external OAuth-protected API
(distinct from social login, which only authenticates a *user*), use
**Connected App** (`frappe/integrations/doctype/connected_app`):
`provider_name`, `client_id`, `client_secret`, `authorization_uri`,
`token_uri`, `revocation_uri`, `userinfo_uri`, `introspection_uri`, child
tables `scopes` (`OAuth Scope`) and `query_parameters`. `redirect_uri` is
computed on `validate()` as
`/api/method/frappe.integrations.doctype.connected_app.connected_app.callback/<name>`
(`connected_app.py:60-65`).

```python
app = frappe.get_doc("Connected App", "my-provider")
url = app.get_user_token(frappe.session.user)   # redirect URL if no token yet,
                                                 # else an existing Token Cache
# or, once authorized:
session = app.get_oauth2_session()              # auto-refreshing requests.Session
response = session.get("https://api.example.com/resource")
```

`initiate_web_application_flow()` builds the authorization URL and persists
`state` on a **Token Cache** row (`frappe/integrations/doctype/token_cache`:
`user`, `connected_app`, `access_token`, `refresh_token`, `expires_in`,
`state`, `scopes`, `success_uri`, `token_type`); the stock `callback()`
whitelisted method exchanges the code and redirects to `success_uri`.
`get_active_token()` transparently refreshes an expired token under a
`filelock` before returning it. For service-principal (no end user) access,
`get_backend_app_token()` uses `oauthlib`'s `BackendApplicationClient`
against the same `token_uri` — this is a **client_credentials call to the
external provider**, unrelated to the "Client Credentials not supported"
note above, which is about Frappe's *own* provider.

## Sources

Verified against Frappe framework v16.35.0
(`apps/frappe/frappe/__init__.py:58`):

- `apps/frappe/frappe/integrations/oauth2.py` — `ENDPOINTS` (l.29-35), `approve` (l.66-90), `authorize` (l.93-164), `get_token` (l.167-185), `revoke_token` (l.188-204), `openid_profile` (l.207-221), `get_openid_configuration` (l.224-248), `introspect_token` (l.251-290), `handle_wellknown` (l.293-307), `_get_authorization_server_metadata` (l.324-356), `register_client` (l.359-434), `_get_protected_resource_metadata` (l.450-491), `set_cors_for_privileged_requests` (l.523-564)
- `apps/frappe/frappe/oauth.py` — `OAuthWebRequestValidator` (l.15), `get_userinfo` (l.530-556), `get_url_delimiter` (l.559-560), `get_server_url` (l.578-581)
- `apps/frappe/frappe/utils/oauth.py` — `get_oauth_keys` (l.83-92), `create_oauth_state`/`consume_oauth_state` (l.98-118), `get_oauth2_authorize_url` (l.121-136), `login_via_oauth2`/`login_via_oauth2_id_token` (l.168-176), `login_oauth_user` (l.218-275)
- `apps/frappe/frappe/integrations/oauth2_logins.py` — full file (per-provider callbacks, `custom`, `decoder_compat`)
- `apps/frappe/frappe/integrations/utils.py` — `OAuth2DynamicClientMetadata` (l.17-46), `validate_dynamic_client_metadata` (l.206-225), `create_new_oauth_client` (l.241-274), `get_oauth_settings` (l.277-288)
- `apps/frappe/frappe/integrations/doctype/oauth_client/oauth_client.json` and `.py` (`is_public_client`, `client_id_issued_at`)
- `apps/frappe/frappe/integrations/doctype/oauth_bearer_token/oauth_bearer_token.json`
- `apps/frappe/frappe/integrations/doctype/oauth_authorization_code/oauth_authorization_code.json`
- `apps/frappe/frappe/integrations/doctype/oauth_settings/oauth_settings.json` (v16), `oauth_provider_settings/oauth_provider_settings.json` (legacy)
- `apps/frappe/frappe/integrations/doctype/social_login_key/social_login_key.json` and `.py` (`provider_allows_signup`)
- `apps/frappe/frappe/integrations/doctype/connected_app/connected_app.py` and `.json`
- `apps/frappe/frappe/integrations/doctype/token_cache/token_cache.json`
- `apps/frappe/frappe/www/login.py` — `get_context` (l.25-116)
- `apps/frappe/frappe/templates/includes/oauth_confirmation.html`
- `apps/frappe/frappe/app.py` — well-known dispatch (l.166-174), `set_authenticate_headers` (l.304-305,356-360)
