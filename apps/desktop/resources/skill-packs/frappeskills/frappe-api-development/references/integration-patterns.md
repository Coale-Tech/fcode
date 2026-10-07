# Integration Patterns

> Adopted from [lubusIN/frappe-skills](https://github.com/lubusIN/frappe-skills) (MIT) — `enterprise-patterns/references/integration-patterns.md`.

Patterns for integrating Frappe applications with external systems.

## Connector Architecture

### Base Connector Pattern
```python
## base_connector.py
import frappe
from frappe import _
import requests

class BaseConnector:
    """Base class for external integrations"""
    
    def __init__(self, settings=None):
        self.settings = settings or self.get_settings()
        self.session = requests.Session()
        self.setup_session()
    
    def get_settings(self):
        """Override to get connector settings"""
        raise NotImplementedError
    
    def setup_session(self):
        """Configure session with auth, headers, etc."""
        self.session.headers.update({
            "Content-Type": "application/json",
            "Accept": "application/json"
        })
    
    def request(self, method, endpoint, **kwargs):
        """Make authenticated request with error handling"""
        url = f"{self.settings.base_url}/{endpoint}"
        
        try:
            response = self.session.request(method, url, **kwargs)
            response.raise_for_status()
            return response.json() if response.content else None
        except requests.exceptions.HTTPError as e:
            self.handle_http_error(e, response)
        except requests.exceptions.ConnectionError:
            frappe.throw(_("Connection failed. Check your network."))
        except requests.exceptions.Timeout:
            frappe.throw(_("Request timed out. Please try again."))
    
    def handle_http_error(self, error, response):
        """Handle HTTP errors with appropriate messages"""
        status_code = response.status_code
        
        error_handlers = {
            401: lambda: frappe.throw(_("Authentication failed. Check credentials.")),
            403: lambda: frappe.throw(_("Access denied. Check permissions.")),
            404: lambda: frappe.throw(_("Resource not found.")),
            429: lambda: frappe.throw(_("Rate limited. Please wait.")),
            500: lambda: frappe.throw(_("Server error. Contact support."))
        }
        
        handler = error_handlers.get(status_code)
        if handler:
            handler()
        else:
            frappe.throw(f"Request failed: {response.text}")
```

### OAuth2 Connector
```python
## oauth_connector.py
from datetime import datetime, timedelta

class OAuth2Connector(BaseConnector):
    """Connector with OAuth2 authentication"""
    
    def get_settings(self):
        return frappe.get_single("My Integration Settings")
    
    def setup_session(self):
        super().setup_session()
        self.ensure_valid_token()
    
    def ensure_valid_token(self):
        """Refresh token if expired"""
        if self.token_expired():
            self.refresh_access_token()
        
        self.session.headers["Authorization"] = f"Bearer {self.settings.access_token}"
    
    def token_expired(self):
        if not self.settings.token_expiry:
            return True
        return datetime.now() > self.settings.token_expiry
    
    def refresh_access_token(self):
        """Exchange refresh token for new access token"""
        response = requests.post(
            f"{self.settings.auth_url}/oauth/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": self.settings.get_password("refresh_token"),
                "client_id": self.settings.client_id,
                "client_secret": self.settings.get_password("client_secret")
            }
        )
        response.raise_for_status()
        data = response.json()
        
        self.settings.access_token = data["access_token"]
        self.settings.token_expiry = datetime.now() + timedelta(seconds=data["expires_in"])
        self.settings.save()
```

## Framework HTTP Helpers

For a one-off outbound call, skip building a `requests.Session` from
scratch — `frappe/integrations/utils.py` wraps `requests` with automatic
retry and Integration Request logging:

```python
from frappe.integrations.utils import make_post_request, create_request_log

def sync_customer(customer):
    log = create_request_log(data=customer, service_name="My ERP", is_remote_request=1)
    try:
        response = make_post_request(
            "https://erp.example.com/api/customers",
            data=customer,
            headers={"Authorization": f"Bearer {get_token()}"},
        )
        log.handle_success(response)
        return response
    except Exception as e:
        log.handle_failure({"error": str(e)})
        raise
```

- `make_get_request` / `make_post_request` / `make_put_request` /
  `make_patch_request` / `make_delete_request` all call a shared
  `make_request(method, url, auth=None, headers=None, data=None, json=None, params=None)`
  built on `frappe.utils.get_request_session()` — a `requests.Session` with
  automatic retry (`max_retries=5`, `status_forcelist=[500]`) already mounted
  for `http://` and `https://`. Responses are parsed as JSON, form-encoded
  text, or raw text based on `Content-Type`; a non-2xx status raises via
  `response.raise_for_status()`.
- On any exception, `make_request` logs it — to
  `frappe.flags.integration_request_doc.log_error()` if that flag is set, or
  `frappe.log_error()` otherwise — then re-raises.
- `create_request_log(data, integration_type=None, service_name=None, name=None, error=None, request_headers=None, output=None, **kwargs)`
  inserts an **Integration Request** document (`ignore_permissions=True`,
  immediate `frappe.db.commit()`) and returns it. `integration_type` is
  deprecated in favor of passing `is_remote_request=1` or
  `request_description=...` as a kwarg. Call `log.handle_success(response)`
  or `log.handle_failure(response)` afterward — both use `db_set` to update
  `status` (`Completed`/`Failed`) and `output`/`error` without a full
  document save.
- **Integration Request** fields worth filtering/reporting on:
  `status` (`Queued`/`Authorized`/`Completed`/`Cancelled`/`Failed`),
  `reference_doctype`/`reference_docname`, `data`, `output`, `error`,
  `request_headers`, `response_headers`, `url`, `is_remote_request`,
  `integration_request_service`. `IntegrationRequest.clear_old_logs(days=30)`
  purges rows older than `days`.

Reach for `BaseConnector`-style session classes (above) only when you need
persistent auth/session state across many calls; for a single request,
`make_post_request` plus `create_request_log` gives you retry and audit
logging for free.

## Data Sync Patterns

These run as scheduled jobs or `bench execute` scripts, not web request
handlers — see [database.md](database.md) `## Transactions` for when manual
`frappe.db.commit()` is (and isn't) needed in that context.

### Full Sync
```python
def full_sync_customers():
    """Full sync - replace all records"""
    connector = MyConnector()
    
    # Fetch all from external system
    external_customers = connector.get_all_customers()
    
    # Track processed
    synced_ids = []
    
    for ext_customer in external_customers:
        local = sync_customer(ext_customer)
        synced_ids.append(local.name)
    
    # Delete orphaned local records
    ExternalCustomer = frappe.qb.DocType("External Customer")
    (
        frappe.qb.from_(ExternalCustomer)
        .delete()
        .where(ExternalCustomer.external_id.notin(synced_ids))
        .run()
    )
    # No explicit commit: this runs as a scheduled job, which auto-commits
    # on successful completion (see database.md `## Transactions`).
```

### Incremental Sync
```python
def incremental_sync_customers():
    """Sync only changed records since last sync"""
    settings = frappe.get_single("Sync Settings")
    last_sync = settings.last_customer_sync or "1970-01-01T00:00:00Z"
    
    connector = MyConnector()
    
    # Fetch changes since last sync
    changes = connector.get_customers(modified_since=last_sync)
    
    for customer in changes["created"]:
        create_local_customer(customer)
    
    for customer in changes["updated"]:
        update_local_customer(customer)
    
    for customer_id in changes["deleted"]:
        delete_local_customer(customer_id)
    
    # Update sync timestamp
    settings.last_customer_sync = frappe.utils.now_datetime()
    settings.save()
```

### Delta Sync with Cursor
```python
def delta_sync_with_cursor():
    """Cursor-based incremental sync"""
    settings = frappe.get_single("Sync Settings")
    cursor = settings.sync_cursor
    
    connector = MyConnector()
    
    while True:
        response = connector.get_changes(cursor=cursor, limit=100)
        
        for item in response["items"]:
            process_sync_item(item)
        
        cursor = response.get("next_cursor")
        settings.sync_cursor = cursor
        settings.save()
        # Explicit commit: this scheduled job may process thousands of pages
        # over minutes; committing the cursor after each page means a crash
        # mid-run resumes from the last page instead of reprocessing everything.
        frappe.db.commit()
        
        if not response.get("has_more"):
            break
```

## Webhook Handling

### Webhook Receiver
```python
## api.py
@frappe.whitelist(allow_guest=True)
def webhook_receiver():
    """Handle incoming webhooks"""
    # Verify signature
    signature = frappe.request.headers.get("X-Webhook-Signature")
    if not verify_webhook_signature(signature):
        frappe.throw("Invalid signature", frappe.AuthenticationError)
    
    payload = frappe.request.json
    event_type = payload.get("event")
    
    # Route to handler
    handlers = {
        "customer.created": handle_customer_created,
        "customer.updated": handle_customer_updated,
        "order.placed": handle_order_placed
    }
    
    handler = handlers.get(event_type)
    if handler:
        # Queue for async processing
        frappe.enqueue(
            handler,
            payload=payload,
            queue="default"
        )
    
    return {"status": "received"}

def verify_webhook_signature(signature):
    """Verify webhook HMAC signature"""
    import hmac
    import hashlib
    
    settings = frappe.get_single("Integration Settings")
    secret = settings.get_password("webhook_secret")
    
    expected = hmac.new(
        secret.encode(),
        frappe.request.data,
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(signature, expected)
```

### Idempotent Webhook Processing

`Webhook Log` here is an **app-defined** doctype for tracking idempotency —
not the framework's `Webhook Request Log` (which only records *outbound*
Frappe Webhook deliveries; see [webhooks.md](webhooks.md)). Name your own
tracking doctype distinctly, e.g. `Inbound Webhook Log`, to avoid confusion
with either:

```python
def handle_webhook_with_idempotency(payload):
    """Process webhook with idempotency key"""
    idempotency_key = payload.get("idempotency_key")

    # Check if already processed
    if frappe.db.exists("Inbound Webhook Log", {"idempotency_key": idempotency_key}):
        return {"status": "duplicate"}

    # Create log entry
    log = frappe.get_doc({
        "doctype": "Inbound Webhook Log",
        "idempotency_key": idempotency_key,
        "event_type": payload.get("event"),
        "payload": frappe.as_json(payload),
        "status": "Processing"
    }).insert()

    try:
        process_webhook(payload)
        log.status = "Completed"
    except Exception as e:
        log.status = "Failed"
        log.error_message = str(e)
        raise
    finally:
        log.save()

    return {"status": "processed"}
```

## Connecting to Another Frappe Site: FrappeClient

For Frappe-to-Frappe integration, `frappe.frappeclient.FrappeClient` wraps
the REST resource API and RPC methods in a typed client — use it instead of
hand-rolling `requests` calls against another Frappe site's `/api/...`
routes.

```python
from frappe.frappeclient import FrappeClient

# Session-cookie login
client = FrappeClient("https://other-site.example.com", "user@example.com", "password")

# Or API key/secret (recommended for server-to-server)
client = FrappeClient(
    "https://other-site.example.com",
    api_key="...",
    api_secret="...",
)

customers = client.get_list(
    "Customer",
    fields=["name", "customer_name"],
    filters={"disabled": 0},
    limit_page_length=20,
)

customer = client.get_doc("Customer", "CUST-0001")
client.set_value("Customer", "CUST-0001", "customer_group", "Retail")
new_customer = client.insert({"doctype": "Customer", "customer_name": "Acme"})
client.submit(sales_order_dict)
client.delete("Customer", "CUST-0001")

result = client.get_api("my_app.api.custom_method", params={"arg": "value"})
client.post_api("my_app.api.custom_method", params={"arg": "value"})
```

Key methods and their real signatures (`frappe/frappeclient.py`):

| Method | Signature | Notes |
|---|---|---|
| `get_list` | `(doctype, fields='["name"]', filters=None, limit_start=0, limit_page_length=None, order_by=None, group_by=None)` | GET `/api/resource/<doctype>` |
| `get_doc` | `(doctype, name="", filters=None, fields=None)` | GET `/api/resource/<doctype>/<name>` |
| `insert` | `(doc)` | POST `/api/resource/<doctype>`; `doc` needs a `doctype` key |
| `insert_many` | `(docs)` | RPC `frappe.client.insert_many` |
| `update` | `(doc)` | PUT `/api/resource/<doctype>/<name>`; `doc` needs `doctype` and `name` |
| `bulk_update` | `(docs)` | RPC `frappe.client.bulk_update` |
| `delete` | `(doctype, name)` | RPC `frappe.client.delete` |
| `submit` | `(doc)` | RPC `frappe.client.submit` |
| `get_value` / `set_value` | `(doctype, fieldname=None, filters=None)` / `(doctype, docname, fieldname, value)` | RPC `frappe.client.get_value` / `set_value` |
| `rename_doc` | `(doctype, old_name, new_name)` | RPC `frappe.client.rename_doc` |
| `get_api` / `post_api` | `(method, params=None)` / `(method, params=None, json=None)` | Arbitrary whitelisted method by dotted path, under `/api/method/<method>` |
| `migrate_doctype` | `(doctype, filters=None, update=None, verbose=1, exclude=None, preprocess=None)` | Bulk-copies records (and child tables, Communications, Files) from a remote site into the **local** site via `frappe.get_doc(...).insert()` — run on the destination site, not the source |

All calls raise `frappe.frappeclient.FrappeException` on a server-side
`exc`/`exc_type`/`errors` response — catch that, not raw HTTP errors, when
handling failures from another Frappe site.

`FrappeOAuth2Client(url, access_token, verify=True)` is a thin subclass that
swaps API-key auth for a bearer token — same method surface.

## Queue Integration

### External Queue Consumer
```python
## queue_consumer.py
import redis
import json

def consume_external_queue():
    """Consume messages from external Redis queue"""
    r = redis.from_url(frappe.conf.get("external_redis_url"))
    
    while True:
        message = r.brpop("integration_queue", timeout=30)
        if message:
            _, data = message
            payload = json.loads(data)
            process_queue_message(payload)

def process_queue_message(payload):
    """Process a queue message"""
    message_type = payload.get("type")
    
    handlers = {
        "sync_customer": sync_customer_from_message,
        "update_inventory": update_inventory_from_message
    }
    
    handler = handlers.get(message_type)
    if handler:
        handler(payload["data"])
```

## Error Handling & Retry

### Retry with Exponential Backoff
```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=60)
)
def sync_with_retry(data):
    """Sync data with automatic retry"""
    connector = MyConnector()
    return connector.push_data(data)
```

If the failing call already went through `create_request_log` (see
[Framework HTTP Helpers](#framework-http-helpers)), call
`log.handle_failure(response_or_error)` on that Integration Request instead
of writing a second doctype — it already tracks `status`, `error`, and
`reference_doctype`/`reference_docname`. Reach for a custom error log only
when you need domain-specific fields (a `connector` name, retry count, etc.)
that Integration Request doesn't have:

### Integration Error Logging
```python
def log_integration_error(connector_name, operation, error, payload=None):
    """Log integration errors for debugging. Called from exception handlers in
    system-owned sync/webhook code, never with caller-supplied doctype/fields —
    same pattern frappe core uses for Integration Request logging
    (`frappe/integrations/utils.py` `insert(ignore_permissions=True)`)."""
    frappe.get_doc({
        "doctype": "Integration Error Log",
        "connector": connector_name,
        "operation": operation,
        "error_message": str(error),
        "traceback": frappe.get_traceback(),
        "payload": frappe.as_json(payload) if payload else None,
        "timestamp": frappe.utils.now_datetime()
    # ignore_permissions=True: the caller triggering an error may lack write
    # access to a log doctype; the log record itself carries no user-supplied
    # doctype/fields, so this isn't user-controlled privilege escalation.
    }).insert(ignore_permissions=True)
```

## Rate Limiting

### Client-Side Rate Limiting
```python
import time
from collections import deque

class RateLimitedConnector(BaseConnector):
    """Connector with client-side rate limiting"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.request_times = deque(maxlen=100)
        self.rate_limit = 100  # requests per minute
    
    def request(self, *args, **kwargs):
        self.wait_for_rate_limit()
        self.request_times.append(time.time())
        return super().request(*args, **kwargs)
    
    def wait_for_rate_limit(self):
        """Wait if rate limit would be exceeded"""
        if len(self.request_times) >= self.rate_limit:
            oldest = self.request_times[0]
            elapsed = time.time() - oldest
            if elapsed < 60:
                time.sleep(60 - elapsed)
```

See also [rate-limiting.md](rate-limiting.md) for server-side rate limiting and
[webhooks.md](webhooks.md) for inbound webhook handling.

## Sources

- Query builder: `apps/frappe/frappe/database/query.py:290` (`.delete()` support), `env/lib/python3.14/site-packages/pypika/terms.py:209` (`Term.notin`)
