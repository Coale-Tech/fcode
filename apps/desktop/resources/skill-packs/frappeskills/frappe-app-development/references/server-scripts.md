# Server Scripts

Server Scripts (`frappe/core/doctype/server_script/`) run Python on the server,
defined and stored as documents instead of app code — useful for site-specific
automation without a custom app deployment. Verified against Frappe 16.35.0.

## Enabling

Server Scripts are disabled by default. `is_safe_exec_enabled()`
(`frappe/utils/safe_exec.py`) reads the key **only from `common_site_config.json`**
(the bench-wide config), never from a site's own `site_config.json`:

```bash
bench set-config server_script_enabled true -g
```

`bench --site <site> set-config server_script_enabled true` (no `-g`) writes to that
site's `site_config.json` and has **no effect** — it is silently ignored by
`is_safe_exec_enabled`.

## Permissions

The `Server Script` DocType grants full CRUD only to the **Script Manager** role
(`server_script.json` `permissions`) — not System Manager. `validate()` additionally
calls `frappe.only_for("Script Manager", True)` on every save.

## Script types

`script_type` (Select): `DocType Event`, `Scheduler Event`, `Permission Query`, `API`,
`Workflow Task` (v16; v15 has no `Workflow Task`).

### DocType Event

Runs `doc.execute_doc(doc)` -> `safe_exec(script, _locals={"doc": doc}, restrict_commit_rollback=True)`.
`doctype_event` options (`server_script.json`):

```
Before Insert, Before Validate, Before Save, After Insert, After Save,
Before Rename, After Rename, Before Submit, After Submit,
Before Cancel, After Cancel, Before Discard, After Discard,
Before Delete, After Delete,
Before Save (Submitted Document), After Save (Submitted Document),
Before Print,
On Payment Authorization, On Payment Paid, On Payment Failed,
On Payment Charge Processed, On Payment Mandate Charge Processed,
On Payment Mandate Acquisition Processed
```

`Before Discard`/`After Discard` and every `On Payment *` event except
`On Payment Authorization` are **(v16)** — the v15 baseline only has `On Payment
Authorization` and no discard events.

```python
# Script Type: Before Save
if "test" in doc.description:
    doc.status = "Closed"
```

### Scheduler Event

Runs on the frequency in `event_frequency` (`All`, `Hourly`, `Daily`, `Weekly`,
`Monthly`, `Yearly`, `Hourly Long`, `Daily Long`, `Weekly Long`, `Monthly Long`,
`Cron`) or `cron_format` if `Cron`. Saving syncs a matching `Scheduled Job Type`
document (`sync_scheduled_job_type`); the script executes via `safe_exec(script)`
with no `doc` in scope.

### Permission Query

Returns extra SQL `conditions` for list/report queries on `reference_doctype`.
`get_permission_query_conditions(user, active_child_tables=None)` calls the script
with `user`, `conditions` (str, set by the script), and `active_child_tables` in
scope; a non-empty `conditions` is appended to the query.

### API

Custom endpoint at `/api/method/<api_method>`. Set `allow_guest` to skip auth. Rate
limiting: `enable_rate_limit`, `rate_limit_count` (default 5), `rate_limit_seconds`
(default 86400) — enforced with `frappe.rate_limiter.rate_limit`, keyed on the script
name (`cmd`).

```python
# Script Type: API, API Method: test_method
frappe.response["message"] = "hello"
```

### Workflow Task (v16)

Runs via `execute_workflow_task(doc)` for Workflow Action Master actions; no v15
equivalent.

## Security: RestrictedPython + a curated `frappe` namespace

Scripts compile under `RestrictedPython` (`compile_restricted`, policy
`FrappeTransformer`) and execute with a curated namespace, not full `frappe.*`.
Verified subset available inside a script's `frappe` object
(`frappe/utils/safe_exec.py::exec_safe_globals`/`render_safe_globals`):

- Docs: `get_doc`, `new_doc`, `get_cached_doc`, `get_last_doc`, `get_meta`,
  `copy_doc`, `get_mapped_doc`, `rename_doc`, `delete_doc`
- Queries: `get_list`, `get_all`, `get_system_settings`, `db.get_list`, `db.get_all`,
  `db.get_value`, `db.get_single_value`, `db.get_default`, `db.exists`, `db.count`,
  `db.escape`, `db.sql` (read-only wrapper), `qb` (query builder)
- Messaging/HTTP: `msgprint`, `throw`, `sendmail`, `log_error`, `get_print`,
  `attach_print`, `make_get_request`/`make_post_request`/`make_put_request`/
  `make_patch_request`/`make_delete_request`
- Jobs: `enqueue` (wrapped as `safe_enqueue` — accepts the same `queue`/`timeout`/
  `job_name` kwargs as `frappe.enqueue`), `is_job_queued(job_name, queue="default")`
- Rendering/formatting: `render_template`, `format`/`format_value`, `get_hooks`,
  `sanitize_html`
- Misc: `flags` (a fresh `frappe._dict()` per execution — used to pass data between
  scripts in the same call), `session`, `request.path`, `user`, `FrappeClient`,
  `run_script(script_name, **kwargs)` (invoke another Server Script's `API` handler)

There is no `frappe.db.commit`/`frappe.db.rollback` in a DocType Event script's
namespace (`restrict_commit_rollback=True`); no filesystem, network sockets, or
arbitrary imports.

### Sharing data between scripts

```python
# Script 1
frappe.flags.my_key = "my value"

# Script 2 (API type, invoked from elsewhere)
my_key = run_script("script_1").get("my_key")
```

`run_script` calls `frappe.get_doc("Server Script", name).execute_method()`, which
runs the target script and returns `frappe.flags` as a dict — only meaningful for a
target script of type `API`.

## When to use

- **Server Scripts**: site-specific automation without a custom app; the restricted
  namespace above is the ceiling of what they can do.
- **App-level controllers/hooks**: anything needing full `frappe.*`, `frappe.db`
  transactions, third-party imports, or code review/version control —
  [hooks.md](hooks.md).

## Sources

- `frappe/core/doctype/server_script/server_script.json` — fields, `script_type` and
  `doctype_event` Select options, `Script Manager` permission
- `frappe/core/doctype/server_script/server_script.py` — `execute_method`,
  `execute_doc`, `execute_scheduled_method`, `get_permission_query_conditions`,
  `execute_workflow_task`, `sync_scheduled_job_type`
- `frappe/utils/safe_exec.py` — `is_safe_exec_enabled`, `safe_exec`,
  `render_safe_globals`/`exec_safe_globals`, `run_script`, `safe_enqueue`,
  `is_job_queued`
