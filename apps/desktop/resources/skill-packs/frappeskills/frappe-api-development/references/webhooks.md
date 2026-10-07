# Webhooks

Outbound HTTP callbacks that fire when a document event happens on a
configured DocType. Source: `frappe/integrations/doctype/webhook/webhook.py`,
`frappe/integrations/doctype/webhook/__init__.py`,
`frappe/integrations/doctype/webhook/webhook.json`.

## Creating a webhook

Desk: **Integrations > Webhook > New**.

1. **DocType** (`webhook_doctype`, required, `set_only_once`) — the DocType to
   watch.
2. **Doc Event** (`webhook_docevent`, `set_only_once`) — one of:
   `after_insert`, `on_update`, `on_submit`, `on_cancel`, `on_trash`,
   `on_update_after_submit`, `on_change`, `workflow_transition` (v16).
   `on_submit`, `on_cancel`, and `on_update_after_submit` require the DocType
   to be submittable (`validate_docevent`); `workflow_transition` fires from
   `frappe/workflow.py` when a Workflow Transition's action is set to this
   webhook, not from the Document lifecycle.
3. **Condition** (`condition`, optional) — a `frappe.safe_eval` expression
   evaluated against `{"doc": doc, "utils": frappe.utils}`, e.g.
   `doc.status=="Open"` or `doc.total > 40000`. Empty condition always
   triggers.
4. **Request URL** (`request_url`, required) — must have a parseable network
   location or `validate_request_url` rejects it. **Is Dynamic URL?**
   (`is_dynamic_url`) renders `request_url` as a Jinja template against the
   same `{doc, utils}` context before each request.
5. **Request Method** (`request_method`): `POST` (default), `PUT`, or
   `DELETE` — no `GET`.
6. **Request Timeout** (`timeout`, default `5` seconds).
7. **Background Jobs Queue** (`background_jobs_queue`) — an Autocomplete
   populated by the whitelisted `get_all_queues` method (reads
   `frappe.utils.background_jobs.get_queues_timeout().keys()`); the webhook
   job is enqueued on this queue, or `"default"` if unset.
8. **Request Structure** (`request_structure`): empty/`Form URL-Encoded` uses
   the **Data** table (`webhook_data`, rows of `fieldname` → `key`, mapped
   from `doc.as_dict()`); `JSON` uses **JSON Request Body**
   (`webhook_json`, a Jinja-templated Code field, options `Jinja`) rendered
   against `{doc, utils}` and parsed with `json.loads`. Setting one clears the
   other (`validate_request_body`).
9. **Headers** (`webhook_headers`, child table `Webhook Header`: `key`,
   `value`) — static headers merged into the request.
10. **Enabled** (`enabled`, default checked) — unchecking disables firing.

Use the form's **Preview Request Body** action (calls the whitelisted
`preview_meets_condition` and `preview_request_body` methods against a
document you pick) to check the condition and payload before saving.

## Security: HMAC signature

**Enable Security** (`enable_security`) requires a **Webhook Secret**
(`webhook_secret`, Password field; `validate_secret` rejects an unreadable
value). When enabled, every request carries:

```
X-Frappe-Webhook-Signature: <base64(HMAC-SHA256(webhook_secret, json_body))>
```

Exact computation (`get_webhook_headers` in `webhook.py`):

```python
signature = base64.b64encode(
    hmac.new(
        webhook.get_password("webhook_secret").encode("utf8"),
        frappe.as_json(data).encode("utf8"),
        hashlib.sha256,
    ).digest()
)
```

To verify on the receiving side, HMAC-SHA256 the exact raw request body with
the shared secret, base64-encode the digest, and compare to the
`X-Frappe-Webhook-Signature` header with a constant-time comparison
(`hmac.compare_digest`). There is no timestamp or replay-nonce in the
signature — dedupe on your own idempotency key if that matters.

## Delivery

Webhooks do not fire synchronously inside the request that changed the
document:

- `Document.run_method` calls `run_webhooks(self, method)`
  (`frappe/model/document.py`) after every lifecycle hook.
- `run_webhooks` only reacts to `after_insert`, `on_update`, `on_submit`,
  `on_cancel`, `on_trash`, `on_update_after_submit`, and `on_change`
  (`on_change` is skipped on insert); it is a no-op during
  import/patch/install/migrate (`frappe.local.flags`).
- Matching webhooks are queued in `frappe.local._webhook_queue` and flushed by
  `flush_webhook_execution_queue`, registered once via
  `frappe.db.after_commit.add(...)` — so **nothing is sent until the DB
  transaction commits**, and if the transaction rolls back nothing is sent
  at all.
- The flush step deduplicates by `(webhook.name, doc.name)`, keeping only the
  **last** queued document state per webhook+document pulled within one
  transaction, then calls
  `frappe.enqueue("frappe.integrations.doctype.webhook.webhook.enqueue_webhook", doc=..., webhook=..., queue=webhook.background_jobs_queue or "default", now=frappe.in_test)`.
- `enqueue_webhook` makes up to 3 attempts (`for i in range(3)`), but the two
  exception branches behave differently:
  - A generic exception (HTTP error from `raise_for_status`, connection
    error, etc.) logs the attempt, then sleeps `3 * i + 1` seconds (1s after
    attempt 1, 4s after attempt 2) and retries — except on the third and
    final attempt, where it re-raises **only** if
    `webhook.webhook_docevent == "workflow_transition"` (so the workflow
    action itself fails); other doc-event webhooks swallow the final
    failure after logging it, with no re-raise and no further sleep.
  - `requests.exceptions.ReadTimeout` is caught in its own `except` clause
    *before* the generic one: it logs the attempt and falls through to the
    next loop iteration with **no sleep and no re-raise on the third
    attempt**, even for `workflow_transition` webhooks — a timeout is
    always silently retried/swallowed, never surfaced to the caller.
- Every attempt — success or failure — is logged via `log_request` into
  **Webhook Request Log** (not "Webhook Log"), with fields `webhook`,
  `reference_doctype`, `reference_document`, `headers`, `data`, `user`,
  `url`, `response`, `error`. Use this doctype for delivery debugging and
  auditing; it is linked from the Webhook form.
- A `workflow_transition` webhook does **not** go through `run_webhooks` /
  `_add_webhook_to_queue` at all — it is a "Webhook" `Workflow Transition
  Task`, invoked from `apply_workflow` (`frappe/model/workflow.py`) as
  `webhook.execute_for_doc(doc)` → `enqueue_webhook(doc, self)`. By default
  the task runs synchronously, in the same DB transaction as the workflow
  action (so it fires **before** commit, and a `workflow_transition`
  webhook's final-attempt exception re-raise — see above — fails the
  transition itself); marking the transition task `asynchronous` instead
  runs it via `frappe.enqueue(..., enqueue_after_commit=True)`.

## Example use cases

- Notify an external service on document create/update/submit
- Sync data to a third-party system on `on_change`
- Run a webhook as a Workflow Transition action (`workflow_transition`, v16)

## See also

- [integration-patterns.md](integration-patterns.md) — inbound webhook
  receivers, retry/backoff for outbound HTTP clients, Integration Request
  logging for calls you make yourself.
- [rate-limiting.md](rate-limiting.md) — throttling a webhook *receiver*
  endpoint you expose.

## Sources

Verified against Frappe v16.35.0 (`frappe/__init__.py` `__version__`):

- `apps/frappe/frappe/integrations/doctype/webhook/webhook.py` — `Webhook` doctype controller (`validate_docevent`, `validate_condition`, `validate_request_url`, `validate_request_body`, `validate_secret`, `preview_meets_condition`, `preview_request_body`), `enqueue_webhook` (retry/backoff/re-raise logic, lines 148-189), `log_request`, `get_webhook_headers` (HMAC signature, lines 219-239), `get_webhook_data`, `get_all_queues`
- `apps/frappe/frappe/integrations/doctype/webhook/webhook.json` — field defaults: `enabled` (`1`), `request_method` (`POST`, options `POST\nPUT\nDELETE`), `timeout` (`5`), `is_dynamic_url` (`0`), `enable_security` (`0`); `webhook_doctype`/`webhook_docevent` `set_only_once`; `webhook_docevent` options list
- `apps/frappe/frappe/integrations/doctype/webhook/__init__.py` — `run_webhooks`, `supported_events`, `_add_webhook_to_queue`, `flush_webhook_execution_queue` (dedup-by-last-instance, `frappe.db.after_commit.add`)
- `apps/frappe/frappe/integrations/doctype/webhook_request_log/webhook_request_log.json` — Webhook Request Log fields
- `apps/frappe/frappe/model/workflow.py:153-204` — `apply_workflow` Workflow Transition Task dispatch (`Webhook` → `execute_for_doc`, sync vs. `frappe.enqueue(..., enqueue_after_commit=True)` for `asynchronous` tasks)
- `apps/frappe/frappe/model/document.py` — `run_method` invoking `run_webhooks`
