# REST API (v1 vs v2)

Frappe exposes two parallel REST surfaces over HTTP. Both are dispatched by the same
`frappe.api.handle()` request router, which binds the incoming path against the merged
`v1` and `v2` `url_rules` tables and JSON-serializes whatever the matched endpoint
returns. For whitelisted-method argument handling, permission checks, and response
shapes for `/api/method/...` calls, see [api.md](api.md). For the underlying
`frappe.db`/`frappe.qb` query semantics these routes call into, see
[database.md](database.md).

## Route tables

### v1 — `/api/resource/...` and `/api/method/...`

| Method | Route | Endpoint |
|--------|-------|----------|
| GET | `/api/method/<path:method>` | run a whitelisted method (`frappe.handler.handle`) |
| GET | `/api/resource/<DocType>` | list documents |
| POST | `/api/resource/<DocType>` | create a document |
| GET | `/api/resource/<DocType>/<name>/` | read a document |
| PUT | `/api/resource/<DocType>/<name>/` | update a document |
| DELETE | `/api/resource/<DocType>/<name>/` | delete a document |
| POST | `/api/resource/<DocType>/<name>/` | run a doc method (`run_method` in the body/query) |

### v2 — `/api/v2/...`

| Method | Route | Endpoint |
|--------|-------|----------|
| GET | `/api/v2/method/login` | no-op; login happens via the auth layer before dispatch |
| POST | `/api/v2/method/logout` | log out and commit |
| GET | `/api/v2/method/ping` | health check |
| POST | `/api/v2/method/upload_file` | file upload |
| any | `/api/v2/method/<method>` | run a whitelisted method |
| GET/POST | `/api/v2/method/run_doc_method` | run a whitelisted controller method on an **in-memory** document passed in the body |
| any | `/api/v2/method/<doctype>/<method>` | load the doctype's controller module and call `<method>` on it |
| GET | `/api/v2/document/<DocType>` | list documents |
| POST | `/api/v2/document/<DocType>` | create a document |
| GET | `/api/v2/document/<DocType>/<name>/` | read a document |
| PATCH, PUT | `/api/v2/document/<DocType>/<name>/` | update a document |
| DELETE | `/api/v2/document/<DocType>/<name>/` | delete a document |
| GET | `/api/v2/document/<DocType>/<name>/copy` | return an in-memory amended-style copy (not saved) |
| GET, POST | `/api/v2/document/<DocType>/<name>/method/<method>/` | run a whitelisted doc method (loads the doc from DB first) |
| GET | `/api/v2/doctype/<DocType>/meta` | DocType meta |
| GET | `/api/v2/doctype/<DocType>/count` | filtered count |

There is no `/api/v2/document/<DocType>/bulk_*` route. Bulk operations are ordinary
whitelisted RPC methods — see [api.md](api.md) `### Bulk operations`.

## Response envelope — the v1/v2 gotcha

Both `/api/resource/...` and `/api/v2/document/...`/`/api/v2/doctype/...` calls return
their value under a top-level **`data`** key, because `frappe.api.handle()` sets
`frappe.response["data"] = <endpoint return value>` for any endpoint that returns a
plain value (`frappe/api/__init__.py`).

`/api/method/...` (v1) is the one exception: `handle_rpc_call` delegates to the legacy
`frappe.handler.handle()`, which sets `frappe.response["message"]` itself and returns
`None` — so the outer `data` assignment never fires and the response comes back as
`{"message": <value>}`, not `{"data": ...}`.

**`/api/v2/method/...` breaks that legacy convention** — `handle_rpc_call` in v2 returns
`frappe.call(method, **frappe.form_dict)` directly (a plain value, not `None`), so it
goes through the generic `data` wrapping like every other v2 route:

| Call | Response envelope |
|------|--------------------|
| `GET/POST /api/method/<dotted.path>` (v1) | `{"message": <return value>}` |
| `GET/POST /api/v2/method/<method>` (v2) | `{"data": <return value>}` |
| `GET /api/resource/<DocType>...` (v1) | `{"data": <return value>}` |
| `GET/POST/... /api/v2/document/<DocType>...` (v2) | `{"data": <return value>}` |

Doc-method calls (`POST /api/resource/<DocType>/<name>/` with v1, and
`/api/v2/document/<DocType>/<name>/method/<method>/` or `/api/v2/method/run_doc_method`
with v2) additionally append the updated document to a `docs` list:
`frappe.response.docs.append(doc.as_dict())` before returning the method's own result —
so a v2 doc-method response is `{"data": <method return value>, "docs": [<doc dict>]}`.
`docs` is stripped from the payload entirely if it ends up empty.

## List query parameters

| Param | v1 (`/api/resource/<DocType>`) | v2 (`/api/v2/document/<DocType>`) |
|-------|--------------------------------|-------------------------------------|
| Fields | `fields=["name","title"]` (JSON list) | same |
| Filters | `filters=[["status","=","Open"]]` (JSON list/dict) | same |
| OR filters | `or_filters=[["a","=","1"],["b","=","2"]]` (separate param) | not separate — use a nested `"or"` group inside `filters` (see [database.md](database.md) `## Filters syntax`) |
| Pagination | `limit_start` (offset) / `limit_page_length` (page size, default 20) | `start` (offset, default 0) / `limit` (page size, default 20) |
| Sorting | `order_by` | `order_by` |
| Grouping | `group_by` | `group_by` |
| Has-more indicator | not provided | `has_next_page` boolean in the response — v2 fetches `limit + 1` rows internally to detect it |
| Linked-doc expansion | `expand=["customer"]` (JSON list of link/table fields to inline) | not available |

`SUM(...)`/`COUNT(...)`-style aggregate fields must use the dict syntax documented in
[database.md](database.md) (e.g. `{"COUNT": "name", "as": "count"}`) — a raw string like
`"count(name) as count"` in `fields` is rejected with a `ValidationError` (v16).

## v2 list customization hook

A DocType controller can define a static `get_list(query)` method to modify the
`frappe.qb.get_query` object the v2 list endpoint builds, before it runs:

```python
class Project(Document):
    @staticmethod
    def get_list(query):
        Project = frappe.qb.DocType("Project")
        if user_has_role("Project Owner"):
            query = query.where(Project.owner == frappe.session.user)
        else:
            query = query.where(Project.is_private == 0)
        return query
```

The method must return a query object with a `.run(...)` method, or `None` to leave the
default query untouched; anything else raises. This only affects
`GET /api/v2/document/<DocType>` — the v1 `/api/resource/<DocType>` list still goes
through plain `frappe.client.get_list` -> `frappe.get_list`.

## Authentication

Every REST route accepts the same three schemes, checked in
`frappe.auth.validate_auth_via_api_keys` / `validate_oauth`:

```bash
# API key/secret, token scheme
curl -H "Authorization: token <api_key>:<api_secret>" "https://site.com/api/resource/Customer"

# API key/secret, HTTP Basic scheme (base64 "api_key:api_secret")
curl -H "Authorization: Basic $(echo -n 'api_key:api_secret' | base64)" "https://site.com/api/resource/Customer"

# OAuth 2.0 bearer token (frappe.integrations.oauth2)
curl -H "Authorization: Bearer <access_token>" "https://site.com/api/resource/Customer"

# Session-based (cookie), after a login call
curl -X POST "https://site.com/api/method/login" \
  -H "Content-Type: application/json" \
  -d '{"usr": "user@example.com", "pwd": "password"}'
```

Generate API keys under a User document (**API Access**). See
[authentication.md](authentication.md) for session/token lifecycle details and
[oauth.md](oauth.md) for the OAuth 2.0 provider setup.

## Which version to use

- **New integrations**: prefer `/api/v2/document/...` — it has `has_next_page`
  pagination, the `get_list(query)` customization hook, and a consistent `data`/`docs`
  envelope shared with method calls.
- **Existing integrations already on `/api/resource/...`**: v1 is not deprecated; both
  routers are registered from the same `frappe.api` module and dispatch through the same
  permission/whitelist machinery. Don't migrate working v1 callers just to reach v2.
- **RPC-style calls** (`/api/method/<dotted.path>`) remain the only way to invoke a
  module-level whitelisted function without a document context in v1; v2 offers the same
  thing at `/api/v2/method/<method>` but with a different (`data`, not `message`)
  response envelope — pick one per client and don't mix.

## Sources

Verified against Frappe v16.35.0 (`frappe/__init__.py` `__version__ = "16.35.0"`):

- `apps/frappe/frappe/api/__init__.py` — `handle()` request dispatch, `data`/`message` envelope split, `API_URL_MAP`
- `apps/frappe/frappe/api/v1.py` — `document_list`, `execute_doc_method`, `handle_rpc_call`, `url_rules`
- `apps/frappe/frappe/api/v2.py` — `document_list` (pagination, `get_list(query)` hook, `has_next_page`), `execute_doc_method`, `run_doc_method`, `handle_rpc_call`, `PERMISSION_MAP`, `url_rules`
- `apps/frappe/frappe/handler.py` — `handle()`, `execute_cmd`
- `apps/frappe/frappe/client.py` — `get_list` (v1 list backing, `limit_start`/`limit_page_length` defaults, `or_filters`, `expand`)
- `apps/frappe/frappe/auth.py` — `validate_auth`, `validate_oauth`, `validate_auth_via_api_keys`, `validate_api_key_secret`
- `apps/frappe/frappe/database/query.py` — `Engine._validate_select_field` (rejects SQL function-call strings in SELECT)
- `apps/frappe/frappe/utils/response.py` — `build_response` (drops empty `docs`)
