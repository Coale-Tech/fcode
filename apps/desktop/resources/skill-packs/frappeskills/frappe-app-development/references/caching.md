# Caching

`frappe.cache` is a `RedisWrapper` (`frappe/utils/redis_wrapper.py`) that
auto-prefixes keys with the current site's db name and pickles values.

## Redis cache (`frappe.cache`)

```python
# Set with TTL (preferred for ephemeral state); expires_in_sec optional
frappe.cache.set_value("presence:user1", {"status": "online"}, expires_in_sec=300)

# Get; generator= computes and caches on miss
value = frappe.cache.get_value("presence:user1")
value = frappe.cache.get_value("expensive", generator=compute_expensive)

# Delete (single key or a list)
frappe.cache.delete_value("presence:user1")
frappe.cache.delete_value(["key1", "key2"])

# Hash maps
frappe.cache.hset("group", "field", value)
frappe.cache.hget("group", "field")
frappe.cache.hgetall("group")
frappe.cache.hdel("group", "field")

# Keys matching a prefix (returns raw, site-prefixed Redis keys)
keys = frappe.cache.get_keys("presence:")
frappe.cache.delete_keys("presence:")
```

Pass logical keys (e.g. `presence:user1`); the wrapper handles site-prefixing via
`make_key()`. Do NOT manually prefix with the database name, and do NOT compare
`get_keys()` output directly against unprefixed logical keys — it returns the raw,
prefixed form.

## Client cache (`frappe.client_cache`, v16)

`frappe.client_cache` is a `ClientCache` (also in `frappe/utils/redis_wrapper.py`): an
in-process cache (max 1024 keys, 10-minute local TTL, FIFO eviction) backed by Redis
client-side-caching invalidation (`__redis__:invalidate` pub/sub) — faster than
`frappe.cache` for hot keys read many times per request across workers. Intended for
framework-internal hot paths (hooks, schema, settings docs); the framework's own docs
say to avoid it for large values or low-read-frequency data.

```python
frappe.client_cache.get_value("key", generator=compute)
frappe.client_cache.set_value("key", value)
frappe.client_cache.delete_value("key")
frappe.client_cache.delete_keys("prefix:*")
frappe.client_cache.get_doc("Website Settings")   # cached single/doc
```

Never mix `frappe.cache`'s request-local cache and `client_cache` for the same key —
they can drift and cause data races.

## Caching decorators (`frappe.utils.caching`)

```python
from frappe.utils.caching import request_cache, site_cache, redis_cache, http_cache

@request_cache                       # memoize for the duration of ONE request
def get_config(name): ...

@site_cache(ttl=600, maxsize=1024)   # in-process, per-site, across requests (FIFO eviction)
def get_settings(): ...

@redis_cache(ttl=3600, user=None, shared=False)  # persisted in Redis, survives process restart
def get_report_data(company): ...

@frappe.whitelist()
@http_cache(public=False, max_age=600, stale_while_revalidate=3600)  # Cache-Control header
def get_static_options(): ...
```

- `request_cache` — cache is `frappe.local.request_cache`, cleared at end of request.
- `site_cache(ttl=None, maxsize=None)` — process-local dict keyed by `(site, args)`;
  **not** shared across workers; `.clear_cache()` clears it for all sites.
- `redis_cache(ttl=3600, user=None, shared=False)` — `user=True`/a user id scopes the
  cache key per user; `shared=True` shares the key across sites in the same Redis DB.
- `http_cache(public=False, max_age=None, stale_while_revalidate=None)` — sets a
  `Cache-Control` response header on whitelisted GET endpoints only; it does not cache
  anything server-side.

> Rule of thumb: `request_cache` for within-request memoization, `site_cache` for
> process-local hot data, `redis_cache` / `frappe.cache` for cross-process data.
> Always invalidate on write (e.g. in `on_update`) for cached DB-derived values.
> `redis_cache`/`site_cache` decorated functions expose `.clear_cache()`.

## Site-wide cache invalidation

```python
frappe.clear_cache(user=None, doctype=None)   # frappe/cache_manager.py
```

Clears the User cache for a user, the DocType cache (meta, permissions, controller
resolution) for a doctype, or the full global cache (routes, boot info, hooks,
website) when called with no arguments. This is what `bench --site <site>
clear-cache` runs.

## When to use cache

- **Session/presence data** — TTL-backed, short-lived
- **Expensive computed values** — cache with TTL to avoid recomputation
- **Cross-request coordination** — flags, locks, counters

Do not cache large objects. Redis is not a blob store.

## Sources

- `frappe/utils/redis_wrapper.py` — `RedisWrapper`, `ClientCache`
- `frappe/utils/caching.py` — `request_cache`, `site_cache`, `redis_cache`, `http_cache`
- `frappe/cache_manager.py` — `clear_cache` and friends
