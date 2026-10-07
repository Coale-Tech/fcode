---
name: frappe-app-development
description: Scaffold and architect custom Frappe apps including app structure, hooks.py, fixtures, background jobs, caching, realtime, and translations. Use when creating new apps, wiring cross-cutting behaviour, or hardening an app for production.
---

# Frappe App Development

Scaffold an app and wire the cross-cutting plumbing every Frappe app needs:
hooks, fixtures, jobs, cache, realtime, i18n.

## When to use

- Creating a new app and installing it on a site
- Wiring `doc_events`, overrides, scheduler entries or asset includes in `hooks.py`
- Shipping custom fields and property setters as fixtures
- Writing background jobs, scheduled tasks, or long-running queue work
- Adding caching, realtime events, or translations

## Inputs required

- Bench path and target site
- App name (snake_case) and module layout
- Which DocTypes the app owns vs. extends
- Which events need server-side reactions
- Queue expectations: latency, volume, idempotency

## Procedure

### 0) Create and install the app

```bash
bench new-app <app_name>
bench --site <site> install-app <app_name>
```

Structure, `pyproject.toml`, module registration: [references/new-app.md](references/new-app.md).

### 1) Wire `hooks.py`

```python
app_name = "my_app"

doc_events = {
    "Sales Order": {
        "validate": "my_app.overrides.sales_order.validate",
        "on_submit": "my_app.overrides.sales_order.on_submit",
    }
}

override_doctype_class = {"Sales Order": "my_app.overrides.sales_order.CustomSalesOrder"}

scheduler_events = {
    "daily": ["my_app.tasks.rebuild_daily_summary"],
    "cron": {"*/15 * * * *": ["my_app.tasks.poll_inbox"]},
}
```

Every key and its resolution order: [references/hooks.md](references/hooks.md).
Start from `assets/hooks.py.template`.

### 2) Ship customizations as fixtures

```python
fixtures = [
    {"dt": "Custom Field", "filters": [["name", "like", "%-my_app_%"]]},
    {"dt": "Property Setter", "filters": [["module", "=", "My App"]]},
]
```

```bash
bench --site <site> export-fixtures
```

Custom fields are **never** hand-edited in the database.
See [references/fixtures.md](references/fixtures.md) and
`assets/custom_fields.py.template`.

### 3) Move slow work off the request

```python
frappe.enqueue(
    "my_app.tasks.sync_orders",
    queue="long",
    job_id=f"sync_orders::{order}",   # idempotency key
    timeout=1500,
    order=order,
)
```

Queues, retries, deduplication, failure handling:
[references/background-jobs.md](references/background-jobs.md) and
[references/queue-patterns.md](references/queue-patterns.md).

### 4) Cache deliberately

```python
from frappe.utils.caching import redis_cache

@redis_cache(ttl=300)  # site_cache(ttl=...) for per-process memory
def get_active_price_list():
    return frappe.get_all("Price List", filters={"enabled": 1}, pluck="name")
```

Invalidate on write, never flush globally — [references/caching.md](references/caching.md).

### 5) Push realtime updates

```python
frappe.publish_realtime("order_synced", {"order": order}, user=frappe.session.user)
```

See [references/realtime.md](references/realtime.md).

### 6) Translate

Wrap every user-facing string in `_()` and generate the CSV:

```bash
bench --site <site> get-untranslated <lang> untranslated.csv
```

See [references/translations.md](references/translations.md).

### 7) Migrate and verify

```bash
bench --site <site> migrate && bench --site <site> clear-cache
```

## Verification

- [ ] App installs cleanly on a fresh site
- [ ] `doc_events` handlers fire on the real document action
- [ ] Fixtures export and re-import on a second site, producing identical fields
- [ ] Enqueued job runs, and a duplicate enqueue with the same `job_id` is deduped
- [ ] Cached value refreshes after its invalidation path
- [ ] Realtime event arrives in the browser console
- [ ] All new user-facing strings appear in `get-untranslated` output

## Failure modes / debugging

- **`doc_events` handler never fires**: dotted path typo, or the app isn't installed on that site — `bench --site <site> list-apps`
- **Fixture fields missing after migrate**: the `filters` don't match the field names; check `bench --site <site> export-fixtures` output
- **Job never runs**: scheduler disabled (`bench --site <site> doctor`), no worker for that queue, or a stale worker — [`frappe-bench-operations`](../frappe-bench-operations/SKILL.md)
- **Job runs twice**: no `job_id`; enqueue is not idempotent by default
- **Stale data after write**: cached value not invalidated in the write path
- **Realtime silent**: socket.io not running, or the event was published to a different user/room
- **`migrate` hangs / `DocumentLockedError`**: stale RQ workers or a stale lock — [`frappe-bench-operations`](../frappe-bench-operations/SKILL.md)

## Escalation

- Data model questions → [`frappe-doctype-development`](../frappe-doctype-development/SKILL.md)
- HTTP surface → [`frappe-api-development`](../frappe-api-development/SKILL.md)
- Large multi-entity architecture → [`frappe-enterprise-patterns`](../frappe-enterprise-patterns/SKILL.md)
- Standards sweep before release → [`frappe-app-audit`](../frappe-app-audit/SKILL.md)

## References

- [references/new-app.md](references/new-app.md) - App scaffolding end to end
- [references/hooks.md](references/hooks.md) - Every `hooks.py` key
- [references/fixtures.md](references/fixtures.md) - Custom fields and property setters as code
- [references/background-jobs.md](references/background-jobs.md) - `enqueue`, scheduler, workers
- [references/queue-patterns.md](references/queue-patterns.md) - Long jobs, retries, idempotency
- [references/caching.md](references/caching.md) - `frappe.cache` and decorators
- [references/realtime.md](references/realtime.md) - `publish_realtime` and socket.io
- [references/translations.md](references/translations.md) - i18n workflow
- [references/server-scripts.md](references/server-scripts.md) - No-code server logic
- `assets/hooks.py.template`, `assets/custom_fields.py.template`, `assets/version_utils.py.template`
- `assets/mini-app/` - Runnable app skeleton: DocTypes, report, workflow, dashboard, job, connector, services, utils

## Guardrails

- **Never edit core apps**: extend via Custom Fields, `doc_events`, `override_doctype_class`
- **Custom fields ship as fixtures**: manual DB edits do not survive a fresh site
- **Always `--site <site>`**: bare `bench migrate` is never correct
- **No module-level queries**: `frappe.get_all(...)` at import time breaks multitenancy
- **No manual `frappe.db.commit()` mid-request**: it exposes partial state
- **`frappe.cache.flushdb()`, never `flushall()`**: `flushall` wipes every Redis database
- **Run `bench start` under a process supervisor**, and check whether one is already running

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| Module-level `frappe.get_all(...)` | Breaks multitenancy | Query inside a function |
| Manual `frappe.db.commit()` | Partial state visible on failure | Let the request transaction commit |
| `frappe.cache.flushall()` | Flushes every Redis DB | `flushdb()` |
| Hand-editing custom fields in the UI only | Lost on a fresh site | Export as fixtures |
| Long work inside `validate` | Request timeouts | `frappe.enqueue` |
| Enqueue without `job_id` | Duplicate side effects | Idempotency key |
| Hardcoding company/warehouse | Breaks multi-tenant installs | Read from settings |
| Untranslated strings | No i18n | Wrap in `_()` |
