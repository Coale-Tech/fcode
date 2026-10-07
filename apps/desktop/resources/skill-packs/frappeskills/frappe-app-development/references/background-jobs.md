# Background Jobs & Scheduler

Frappe uses [python-rq](https://python-rq.org/) (Redis Queue) for background job
processing. Verified against Frappe 16.35.0 (`frappe/utils/background_jobs.py`,
`frappe/utils/scheduler.py`, `frappe/core/doctype/scheduled_job_type/`).

## frappe.enqueue

```python
# v16 signature (frappe/utils/background_jobs.py):
def enqueue(
    method: str | Callable,
    queue: str = "default",
    timeout: int | None = None,
    event: str | None = None,
    is_async: bool = True,
    job_name: str | None = None,      # DEPRECATED — use job_id + deduplicate
    now: bool = False,
    enqueue_after_commit: bool = False,
    *,
    on_success: Callable | None = None,
    on_failure: Callable | None = None,
    at_front: bool = False,
    job_id: str | None = None,
    deduplicate=False,
    at_front_when_starved=False,
    **kwargs,
) -> Job | Any: ...
```

```python
import frappe

frappe.enqueue(
    "my_app.tasks.send_bulk_email",    # dotted path (or a callable)
    queue="long",
    timeout=1500,
    now=False,                    # now=True calls frappe.call() inline, synchronously
    enqueue_after_commit=True,    # enqueue only after the current transaction commits
    job_id="bulk_email::campaign_42",
    deduplicate=True,             # skip enqueue if a job with this job_id is queued/running
    on_success=my_app.tasks.notify_done,
    on_failure=my_app.tasks.notify_failed,
    recipients=recipients_list,
    template="welcome",
)
```

Notes, verified in source:

- `deduplicate=True` requires `job_id` (raises `frappe.throw` otherwise). It checks
  `get_job(job_id).get_status()` against `QUEUED`/`STARTED`; if the job is in either
  state the enqueue is silently skipped (returns `None`) and logged. If a job with
  that id exists but already finished, it is deleted and re-queued.
- `job_id` is namespaced per site internally as `f"{frappe.local.site}||{job_id}"`
  (`create_job_id`) — you never need to prefix it with the site yourself.
- `job_name` is deprecated (target removal v17); it becomes the human-readable RQ
  job description, not a dedup key. Use `job_id` + `deduplicate=True` for dedup.
- `now=True` or (`is_async=False` outside tests) calls `frappe.call(method, **kwargs)`
  directly in the current process — no worker involved. `is_async=False` outside of
  tests is itself deprecated; prefer `now=True`.
- If Redis is unreachable during `bench migrate`, the job runs synchronously instead
  of raising.
- `on_failure` defaults to `truncate_failed_registry`, which caps the failed-job
  registry at `RQ_FAILED_JOBS_LIMIT` (1000) so it can't grow unbounded.
- `at_front_when_starved=True` flips newly enqueued jobs to LIFO (front of queue) once
  the target queue has more than `QUEUE_STARVATION_THRESHOLD` (16) pending jobs, to
  keep interactive-job latency bounded under load.
- `MAX_QUEUED_JOBS` (default 500, override with the `max_queued_jobs` site config key)
  makes `enqueue` raise once a queue is that full.

### Queue types and timeouts

`get_queues_timeout()` (`frappe/utils/background_jobs.py`) is the source of truth:

| Queue | Default timeout |
|-------|-----------------|
| `short` | 300s |
| `default` | 300s |
| `long` | 1500s |

`timeout=` on `enqueue` overrides the queue default for that call. Custom queue names
are **not** created ad hoc — `get_queue`/`validate_queue` reject any queue not in
`get_queues_timeout()`, which is the built-in three plus whatever is declared under
`workers` in `common_site_config.json`:

```json
{
  "workers": {
    "my_custom_queue": { "timeout": 900 }
  }
}
```

A worker must then be started against that queue name (`bench worker --queue
my_custom_queue`) or nothing will ever dequeue it.

## frappe.enqueue_doc

```python
def enqueue_doc(doctype, name=None, method=None, queue="default", timeout=300, now=False, **kwargs): ...
```

```python
frappe.enqueue_doc(
    "Expense", "EXP-0001",
    "send_notification",   # method name on the Document class
    queue="short",
)
```

Internally this just calls `enqueue("frappe.utils.background_jobs.run_doc_method", ...)`,
which loads the document in the worker and calls `doc.send_notification()`. Preferred
when the job logic is a method on the Document controller.

## Document.queue_action

`frappe/model/document.py` — runs a document action (e.g. `submit`, `cancel`) in the
background instead of inline:

```python
doc.queue_action("submit", ...)   # -> doc.submit() (or doc._submit() if defined) in a worker
```

`queue_action` locks the document (`self.lock()`, raises `DocumentLockedError` if
already locked) before enqueuing `frappe.model.document.execute_action`, and defaults
`enqueue_after_commit=True` unless you pass it explicitly. If the document class
defines `_submit`/`_cancel`/etc., that inner method is called instead of the public
one, so overriding `submit()` doesn't cause infinite recursion in the worker.

## Job status

```python
from frappe.utils.background_jobs import is_job_enqueued, get_job, get_jobs

is_job_enqueued("bulk_email::campaign_42")   # True if QUEUED or STARTED (unprefixed job_id)
get_job(job_id)                               # RQ Job object, namespaced job_id, or None
jobs = get_jobs(site=frappe.local.site, queue="default")  # {site: [method, ...]}
```

`get_jobs(site=None, queue=None, key="method")` scans both pending and currently
running jobs across the given queue(s) (or all queues) and groups the requested
`kwargs` key (default `"method"`) per site.

## Scheduled jobs

Define in `hooks.py`:

```python
scheduler_events = {
    "all": ["my_app.tasks.every_tick_task"],
    "hourly": ["my_app.tasks.hourly_sync"],
    "hourly_long": ["my_app.tasks.heavy_hourly_task"],
    "daily": ["my_app.tasks.daily_cleanup"],
    "cron": {
        "0 9 * * 1": ["my_app.tasks.monday_morning_report"],
        "*/15 * * * *": ["my_app.tasks.every_15_minutes"],
    },
}
```

### Valid frequency keys (v16)

Verified against the `Scheduled Job Type.frequency` Select options
(`frappe/core/doctype/scheduled_job_type/scheduled_job_type.json`) — hooks.py keys are
the snake_case form (`event_type.replace("_", " ").title()` maps back to the Select
option in `scheduled_job_type.py::insert_event_jobs`):

| Key | Fires |
|-----|-------|
| `all` | Every scheduler tick — `scheduler_tick_interval` config, default 4 minutes (`DEFAULT_SCHEDULER_TICK`) |
| `hourly` / `hourly_long` | Once an hour |
| `hourly_maintenance` | Roughly hourly, deliberately not aligned to `:00` |
| `daily` / `daily_long` | Once a day |
| `daily_maintenance` | Roughly daily, not wall-clock aligned |
| `weekly` / `weekly_long` | Once a week |
| `monthly` / `monthly_long` | Once a month |
| `yearly` / `annual` | Once a year (both are valid, separate Select options) |
| `cron` | Dict of crontab expression -> handler list |

There is no `weekly_maintenance`, `monthly_maintenance`, `yearly_long`, or
`annual_long` — those are not in the Select options and hooks under those keys are
silently ignored.

`ScheduledJobType.get_queue_name()` sends anything with `"Long"` or `"Maintenance"` in
its frequency to the `long` queue; everything else goes to `default`. So
`hourly_maintenance`/`daily_maintenance` jobs also get the 1500s `long` timeout, not
just the `_long` variants.

Each event only actually enqueues when `is_event_due()` and no matching job is already
queued for the site (`ScheduledJobType.enqueue`, `job_id` derived from the doc name so
duplicate scheduler ticks can't double-queue the same job).

## Job execution lifecycle

`execute_job` (`frappe/utils/background_jobs.py`) is what every worker actually runs
(`enqueue` always targets `frappe.utils.background_jobs.execute_job`, passing your
method as a kwarg):

- Initializes `frappe.local.job` (`site`, `method`, `job_name`, `kwargs`, `user`) before
  calling your function.
- Runs `before_job` hooks, then your method, then `after_job` hooks (both are dotted
  paths registered via `hooks.py`; framework examples: `frappe.recorder.record` /
  `frappe.monitor.start` for `before_job`, `frappe.recorder.dump` /
  `frappe.monitor.stop` / `frappe.utils.file_lock.release_document_locks` for
  `after_job`).
- On success: `frappe.db.commit(chain=True)`.
- On `frappe.db.InternalError` or `frappe.RetryBackgroundJobError` that looks like a
  deadlock or lock-wait timeout: rolls back and **automatically retries the same job
  up to 5 times**, sleeping `retry + 1` seconds between attempts.
- On any other exception: rolls back, logs via `frappe.log_error`, commits the error
  log, and re-raises (RQ marks the job failed and calls `on_failure`).

Background jobs run in a separate worker process and do **not** share state with the
web request — pass everything the job needs via keyword arguments, and remember
`frappe.session.user` in the worker is whoever `frappe.enqueue` was called as (passed
through as `user` in the queued payload), not necessarily the request user at the time
the job actually runs.

## Worker CLI

```bash
bench worker --queue short,default    # consume specific queues; omit for all queues
bench worker --burst                  # process what's queued, then exit
bench worker-pool --num-workers 4     # pool of forked workers sharing one process
```

`bench worker` wraps `start_worker()`; `--strategy round_robin|random` controls RQ's
dequeue strategy across multiple queues. Workers also run the scheduler tick in a
background thread (`FrappeWorker.work` starts `start_scheduler` unless
`--queue`/burst mode is used to isolate a single queue).

## Common pitfalls

- Enqueue without `job_id` (or with the deprecated `job_name` used as if it deduped) —
  duplicate side effects; `deduplicate=True` is a no-op without `job_id`.
- `enqueue_after_commit=True` needed whenever the job depends on data written in the
  current request/transaction — otherwise the worker may run before the row exists.
- A custom `queue=` name that was never declared under `workers` in
  `common_site_config.json` makes every `enqueue` call to it raise.
- `scheduler disabled` (`bench doctor`), no worker consuming that queue, or a stale
  worker are the most common reasons a scheduled job silently never runs —
  [`frappe-bench-operations`](../../frappe-bench-operations/SKILL.md).

## Sources

Verified against Frappe v16.35.0 (`frappe/__init__.py` `__version__`):

- `frappe/utils/background_jobs.py` — `enqueue`, `enqueue_doc`, `execute_job`,
  `get_queues_timeout`, `get_queue`/`get_queue_list`/`validate_queue`,
  `is_job_enqueued`/`get_job`/`get_jobs`, `start_worker`/`start_worker_pool`,
  `create_job_id`, `MAX_QUEUED_JOBS`/`QUEUE_STARVATION_THRESHOLD`
- `frappe/model/document.py` — `Document.queue_action`, `Document.lock`
- `frappe/utils/scheduler.py` — `DEFAULT_SCHEDULER_TICK`, `enqueue_events_for_site`
- `frappe/core/doctype/scheduled_job_type/scheduled_job_type.json` — `frequency`
  Select options
- `frappe/core/doctype/scheduled_job_type/scheduled_job_type.py` — `insert_events`,
  `ScheduledJobType.enqueue`/`get_queue_name`/`is_event_due`
- `frappe/hooks.py` — framework's own `scheduler_events`, `before_job`, `after_job`
- `frappe/commands/scheduler.py` — `bench worker` / `bench worker-pool` CLI flags
