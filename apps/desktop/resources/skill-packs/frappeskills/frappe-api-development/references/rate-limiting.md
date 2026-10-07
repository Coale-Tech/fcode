# API Rate Limiting

Frappe has three independent throttling mechanisms. Pick the narrowest one
that fits: per-endpoint request-rate limiting for public methods, a
site-wide request cap for the whole instance, and (v16) an in-flight
concurrency cap for expensive endpoints. Source: `frappe/rate_limiter.py`,
`frappe/concurrency_limiter.py`.

## Per-endpoint rate limiting: `@frappe.rate_limit`

```python
from frappe.rate_limiter import rate_limit

@frappe.whitelist(allow_guest=True)
@rate_limit(limit=100, seconds=60)
def my_api_endpoint():
    """Max 100 requests per minute per IP."""
    return {"status": "ok"}
```

Decorator applied *below* `@frappe.whitelist()` (closest to the function).

### Signature

```python
def rate_limit(
    key: str | None = None,
    limit: int | Callable = 5,
    seconds: int = 24 * 60 * 60,
    methods: str | list = "ALL",
    ip_based: bool = True,
):
```

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `key` | `str \| None` | `None` | Name of a **`frappe.form_dict`** key whose *value* identifies the caller — not a callable. E.g. `key="api_key"` reads `frappe.form_dict.get("api_key")`. |
| `limit` | `int \| Callable` | `5` | Max requests per window. A callable is invoked with no arguments (`limit()`) each call, so the ceiling can depend on runtime state. |
| `seconds` | `int` | `86400` (1 day) | Window length. |
| `methods` | `str \| list` | `"ALL"` | HTTP methods the limit applies to; any other method skips the check entirely. |
| `ip_based` | `bool` | `True` | Include the request IP in the identity key. |

There is no callable/lambda form of `key` — it is always a form-dict field
name (string). To rate-limit by session user, put the user in the identity
via `ip_based=False` and read `frappe.session.user` yourself inside the
function, or wrap with your own key-based cache logic (below); the built-in
decorator does not accept `frappe.session.user` directly as `key`.

### How identity and the cache key are built

From `rate_limiter.py`:

```python
ip = frappe.local.request_ip if ip_based is True else None
user_key = frappe.form_dict.get(key, "")
identity = ":".join([ip, user_key]) if (key and ip_based) else (ip or user_key)
if not identity:
    frappe.throw(_("Either key or IP flag is required."))
cache_key = frappe.cache.make_key(f"rl:{frappe.form_dict.cmd}:{identity}")
```

The counter is a Redis integer at `cache_key`, `setex` to `seconds` on first
use and `incrby`'d on each call. Once the incremented value exceeds `limit`:

```python
frappe.throw(
    _("You hit the rate limit because of too many requests. Please try after sometime."),
    frappe.RateLimitExceededError,
)
```

`frappe.RateLimitExceededError` is a `ValidationError` subclass with
`http_status_code = 429` (`frappe/exceptions.py`). The decorator is skipped
entirely outside an HTTP request (`if not frappe.request: return fn(...)`),
so it never throttles calls from the console, tests, or background jobs.

### Rate-limit per user or per API key

```python
@frappe.whitelist()
@rate_limit(key="api_key", limit=5, seconds=3600, ip_based=False)
def api_key_rate_limited():
    """5 requests/hour per `api_key` form parameter, ignoring IP."""
    ...
```

### Rate-limit only specific HTTP methods

```python
@frappe.whitelist(methods=["POST"])
@rate_limit(limit=10, seconds=60, methods=["POST"])
def create_something():
    ...
```

## Site-wide request limiting

A separate mechanism throttles **every** request to the site, configured in
`site_config.json`:

```json
{
  "rate_limit": {"limit": 1000, "window": 3600}
}
```

`frappe.rate_limiter.apply()` runs before every request — it's registered
in the `before_request` hook list in `hooks.py`
(`before_request = ["frappe.recorder.record", "frappe.monitor.start",
"frappe.rate_limiter.apply", ...]`), not in `DEFAULT_AFTER_RESPONSE_CALLBACKS`
(that list in `frappe/app.py` registers `frappe.rate_limiter.update`, which
increments the counter *after* the response instead). `apply()` builds a
`RateLimiter(limit, window)` keyed on the current time window (not per-user
or per-IP — the whole site shares one counter), and raises
`frappe.TooManyRequestsError` (429) once the window's request count exceeds
`limit`. Response headers on every request:
`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, plus
`Retry-After` when rejected. Leave `rate_limit` unset (the default) to
disable this layer; it is coarser than `@rate_limit` and mainly a
last-resort abuse guard for the whole gunicorn process.

## Concurrency limiting (v16): `@frappe.concurrent_limit`

`rate_limit` caps requests **per time window**; `concurrent_limit` caps
requests **in flight at once**, for endpoints that are cheap to call often
but expensive while running (large exports, PDF generation):

```python
@frappe.whitelist(allow_guest=True)
@frappe.concurrent_limit(limit=3)
def download_pdf(...):
    ...
```

```python
def concurrent_limit(limit: int | None = None, wait_timeout: int = 10):
```

- `limit`: max simultaneous executions across all gunicorn workers, enforced
  with a Redis-backed semaphore (`frappe.utils.redis_semaphore.RedisSemaphore`,
  `LIST` + `BLPOP`). Default (`None`) is half of `workers * threads` read off
  the gunicorn command line (`web_tier_concurrency()`); if that can't be
  determined (dev server, CLI, background job) the limiter is a no-op.
- `wait_timeout`: seconds to wait for a free slot before giving up.

If no slot frees up within `wait_timeout`, it raises `ServiceUnavailableError`
(`http_status_code = 503`) with a `retry_after` attribute and sets a
`Retry-After` response header — distinct from the 429s the other two
mechanisms raise. Like `rate_limit`, it is skipped outside an HTTP request
(`frappe.local.request is None`).

`frappe.concurrency_limiter.get_stats()` is a whitelisted, System-Manager-only
method for inspecting current semaphore state.

## Custom rate limiting with `frappe.cache()`

For logic the built-in decorator can't express (sliding windows, token
buckets, tiered limits by role), build directly on `frappe.cache()`. It
returns a `redis.Redis`-derived client: use `get_value`/`set_value` (which
prefix keys with the site's `db_name` automatically via `make_key`, so
different sites sharing one Redis instance don't collide) for simple
counters, or fall back to raw `redis-py` commands (`zadd`, `zremrangebyscore`,
`zcard`, `expire`, `incrby`, inherited straight from `redis.Redis`) for
sorted-set/pipeline patterns — but raw commands bypass the automatic
site-name prefix, so prefix your own keys with something site-unique if
multiple sites share the Redis instance.

### Fixed-window counter

```python
import frappe

def check_rate_limit(key, limit, window_seconds):
    """Returns (allowed: bool, remaining: int, reset_at: int)."""
    cache = frappe.cache()
    count_key = f"rate_limit:{key}:count"
    reset_key = f"rate_limit:{key}:reset"

    current = cache.get_value(count_key) or 0
    reset_at = cache.get_value(reset_key)
    now = frappe.utils.now_datetime().timestamp()

    if reset_at is None or now >= reset_at:
        reset_at = now + window_seconds
        cache.set_value(count_key, 1, expires_in_sec=window_seconds + 1)
        cache.set_value(reset_key, reset_at, expires_in_sec=window_seconds + 1)
        return True, limit - 1, int(reset_at)

    if current >= limit:
        return False, 0, int(reset_at)

    cache.set_value(count_key, current + 1, expires_in_sec=window_seconds + 1)
    return True, limit - current - 1, int(reset_at)


@frappe.whitelist(allow_guest=True)
def rate_limited_endpoint():
    key = frappe.local.request_ip
    allowed, remaining, reset_at = check_rate_limit(key, limit=100, window_seconds=60)

    headers = frappe.local.response.headers
    headers["X-RateLimit-Limit"] = "100"
    headers["X-RateLimit-Remaining"] = str(remaining)
    headers["X-RateLimit-Reset"] = str(reset_at)

    if not allowed:
        frappe.local.response["http_status_code"] = 429
        frappe.throw("Rate limit exceeded. Try again later.", frappe.RateLimitExceededError)

    return {"status": "ok"}
```

### Tiered limits by role

```python
def get_rate_limit_for_user():
    user = frappe.session.user
    if user == "Guest":
        return 20, 60
    roles = frappe.get_roles(user)
    if "API Premium" in roles:
        return 1000, 60
    if "API User" in roles:
        return 100, 60
    return 50, 60


@frappe.whitelist()
def tiered_rate_limited():
    limit, window = get_rate_limit_for_user()
    key = frappe.session.user or frappe.local.request_ip
    allowed, remaining, reset_at = check_rate_limit(key, limit, window)
    if not allowed:
        frappe.throw("Rate limit exceeded", frappe.RateLimitExceededError)
    return {"status": "ok", "remaining": remaining}
```

### Sliding window (sorted set)

More accurate than a fixed window because it doesn't reset all requests at
a window boundary:

```python
import time

def sliding_window_rate_limit(key, limit, window_seconds):
    redis = frappe.cache()
    now = time.time()
    window_start = now - window_seconds
    sorted_set_key = f"{frappe.local.conf.db_name}|rate_limit_sw:{key}"

    redis.zremrangebyscore(sorted_set_key, 0, window_start)
    current_count = redis.zcard(sorted_set_key)
    if current_count >= limit:
        return False, 0

    redis.zadd(sorted_set_key, {str(now): now})
    redis.expire(sorted_set_key, window_seconds + 1)
    return True, limit - current_count - 1
```

## Response headers and error shape

`@rate_limit` and the site-wide limiter both raise via `frappe.throw` /
`frappe.TooManyRequestsError`, which the standard error-response pipeline
turns into HTTP 429 with the exception message. When building your own
throttling, match that shape so clients handle both the same way:

```python
def rate_limit_exceeded_response():
    frappe.local.response["http_status_code"] = 429
    return {
        "error": "rate_limit_exceeded",
        "message": "Too many requests. Please retry after some time.",
        "retry_after": 60,
    }
```

## Choosing a mechanism

| Need | Use |
|---|---|
| Cap calls/minute on one whitelisted method | `@rate_limit(limit=..., seconds=...)` |
| Cap total traffic to the whole site | `site_config.json` `rate_limit` |
| Cap simultaneous heavy requests (exports, PDFs) | `@frappe.concurrent_limit()` (v16) |
| Per-role or sliding-window logic `@rate_limit` can't express | Custom `frappe.cache()` counter |

## Sources

Verified against Frappe v16.35.0 (`frappe/__init__.py` `__version__`):

- `apps/frappe/frappe/rate_limiter.py` — `apply`/`update`/`respond` module functions, `RateLimiter` class (window-keyed counter, `headers()`, `reject()`), `rate_limit` decorator (identity/cache-key construction, `frappe.throw(..., frappe.RateLimitExceededError)`)
- `apps/frappe/frappe/hooks.py:454-458` — `before_request` hook list registering `"frappe.rate_limiter.apply"`
- `apps/frappe/frappe/app.py:76-80,293-295,436-437` — `DEFAULT_AFTER_RESPONSE_CALLBACKS` registers `frappe.rate_limiter.update` (not `apply`); rate-limiter response headers attached in `after_response`; `respond()` invoked on HTTP 429
- `apps/frappe/frappe/exceptions.py:85-86,138-139` — `TooManyRequestsError` and `RateLimitExceededError`, both `http_status_code = 429`
- `apps/frappe/frappe/concurrency_limiter.py` — `concurrent_limit` decorator, `web_tier_concurrency`/`_default_limit` (gunicorn CLI worker/thread detection), `ServiceUnavailableError` with `retry_after` attribute and `Retry-After` header, `get_stats` whitelisted method
- `apps/frappe/frappe/utils/redis_semaphore.py` — `RedisSemaphore` (LIST + BLPOP backing for `concurrent_limit`)
- `apps/frappe/frappe/utils/redis_wrapper.py:52-62` — `make_key` site `db_name` prefixing for `get_value`/`set_value`
- `apps/frappe/frappe/tests/test_rate_limiter.py` — confirms `apply`/`update`/`respond` call sequence and header behavior used as the worked examples above
