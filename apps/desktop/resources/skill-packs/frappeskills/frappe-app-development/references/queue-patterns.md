# Background Queue Patterns

> Adopted from [lubusIN/frappe-skills](https://github.com/lubusIN/frappe-skills) (MIT) — `enterprise-patterns/references/queue-patterns.md`.

## Overview
Background job and queue patterns for enterprise Frappe applications.

## Basic Enqueueing

### Simple Job
```python
import frappe

def send_notification(user, message):
    """Function to run in background"""
    frappe.sendmail(
        recipients=user,
        subject="Notification",
        message=message
    )

## Enqueue the job
frappe.enqueue(
    send_notification,
    user="user@example.com",
    message="Hello!"
)
```

### With Options
```python
frappe.enqueue(
    "my_app.tasks.process_data",
    queue="long",           # short, default, long (custom names must be declared in
                             # common_site_config.json under "workers" first)
    timeout=600,            # seconds; defaults to the queue's timeout otherwise
    is_async=True,          # default True
    now=False,              # now=True calls frappe.call() inline, synchronously
    at_front=False,         # priority
    job_id="process_data::123",  # required for deduplicate
    deduplicate=True,       # skip enqueue if job_id is already QUEUED/STARTED
    enqueue_after_commit=True,  # wait for transaction commit

    # Job arguments
    data_id="123",
    option="value"
)
```

> `job_name` is deprecated in v16 (`frappe/utils/background_jobs.py`) — it only sets
> the RQ job description, it is not a dedup key. Use `job_id` + `deduplicate=True`.

## Queue Types

### Queue Selection
```python
## Short queue - quick tasks (< 5 minutes)
frappe.enqueue(send_email, queue="short")

## Default queue - standard tasks (5-30 minutes)
frappe.enqueue(process_batch, queue="default")

## Long queue - heavy tasks (> 30 minutes)
frappe.enqueue(generate_report, queue="long")
```

### Custom Queues

Queue names are validated against `get_queues_timeout()` — `frappe.enqueue(queue=...)`
raises unless the name is `short`/`default`/`long` or declared under `workers` in
`common_site_config.json` (`frappe/utils/background_jobs.py::validate_queue`):

```json
{
  "workers": {
    "my_custom_queue": { "timeout": 900 }
  }
}
```

A worker process must then be started against that queue explicitly — nothing
dequeues it automatically:

```bash
bench worker --queue my_custom_queue
```

## Scheduled Jobs

### hooks.py Configuration
```python
scheduler_events = {
    # Every minute
    "all": [
        "my_app.tasks.process_queue"
    ],
    
    # Hourly
    "hourly": [
        "my_app.tasks.hourly_cleanup"
    ],
    
    # Daily at midnight
    "daily": [
        "my_app.tasks.daily_report"
    ],
    
    # Weekly on Monday
    "weekly": [
        "my_app.tasks.weekly_summary"
    ],
    
    # Monthly on 1st
    "monthly": [
        "my_app.tasks.monthly_archive"
    ],
    
    # Cron expression
    "cron": {
        "0 9 * * *": [  # Every day at 9 AM
            "my_app.tasks.morning_task"
        ],
        "*/15 * * * *": [  # Every 15 minutes
            "my_app.tasks.frequent_check"
        ]
    }
}
```

## Job Patterns

### Batch Processing
```python
def process_large_dataset():
    """Process data in batches"""
    batch_size = 100
    offset = 0
    
    while True:
        records = frappe.get_all("My DocType",
            filters={"status": "Pending"},
            limit_start=offset,
            limit_page_length=batch_size
        )
        
        if not records:
            break
        
        for record in records:
            process_single_record(record.name)
        
        offset += batch_size
        frappe.db.commit()  # unbounded while loop — commit each batch so a mid-run failure doesn't lose already-processed pages
```

### Chunked Enqueueing
```python
def enqueue_bulk_operation(items):
    """Split large job into chunks"""
    chunk_size = 50
    
    for i in range(0, len(items), chunk_size):
        chunk = items[i:i + chunk_size]
        frappe.enqueue(
            process_chunk,
            items=chunk,
            chunk_number=i // chunk_size,
            queue="long",
            job_id=f"bulk_op_chunk_{i}",
            deduplicate=True,
        )

def process_chunk(items, chunk_number):
    """Process a chunk of items"""
    for item in items:
        process_item(item)

    frappe.publish_realtime("bulk_progress", {
        "chunk": chunk_number,
        "completed": len(items)
    })
```

### Job Chaining
```python
def job_step_1(data_id):
    """First step of multi-step job"""
    result = perform_step_1(data_id)
    
    # Chain to next step
    frappe.enqueue(
        job_step_2,
        data_id=data_id,
        step_1_result=result,
        queue="default"
    )

def job_step_2(data_id, step_1_result):
    """Second step"""
    result = perform_step_2(data_id, step_1_result)
    
    frappe.enqueue(
        job_step_3,
        data_id=data_id,
        step_2_result=result,
        queue="default"
    )
```

## Error Handling

### Retry Pattern
```python
def job_with_retry(data_id, retry_count=0, max_retries=3):
    """Job with automatic retry"""
    try:
        process_data(data_id)
    except Exception as e:
        if retry_count < max_retries:
            # Exponential backoff
            delay = 2 ** retry_count * 60  # 1, 2, 4 minutes
            
            frappe.enqueue(
                job_with_retry,
                data_id=data_id,
                retry_count=retry_count + 1,
                max_retries=max_retries,
                queue="default",
                enqueue_after_commit=True
            )
        else:
            # Log failure
            log_job_failure(data_id, str(e))
            raise
```

### Error Notification
```python
def safe_background_job(func):
    """Decorator for jobs with error notification"""
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            frappe.log_error(
                title=f"Background Job Failed: {func.__name__}",
                message=frappe.get_traceback()
            )
            
            # Notify admin
            frappe.sendmail(
                recipients=frappe.db.get_single_value("System Settings", "admin_email"),
                subject=f"Job Failed: {func.__name__}",
                message=f"Error: {str(e)}\n\nArgs: {args}\nKwargs: {kwargs}"
            )
            raise
    return wrapper

@safe_background_job
def critical_job(data):
    """Critical job with error handling"""
    process_critical_data(data)
```

## Progress Tracking

### Job Progress
```python
def long_running_job(items):
    """Track progress of long job"""
    total = len(items)
    job_id = frappe.local.job.id if hasattr(frappe.local, 'job') else None
    
    for i, item in enumerate(items):
        process_item(item)
        
        # Update progress
        progress = (i + 1) / total * 100
        frappe.publish_progress(
            percent=progress,
            title="Processing Items",
            description=f"Processing {i + 1} of {total}"
        )
        
        if (i + 1) % 100 == 0:
            frappe.db.commit()  # unbounded items list — bound transaction/lock size on a long-running job
    
```

### Job Status Tracking
```python
## Create job status record
def create_job_status(job_type, total_items):
    return frappe.get_doc({
        "doctype": "Job Status",
        "job_type": job_type,
        "total_items": total_items,
        "processed_items": 0,
        "status": "In Progress",
        "started_at": frappe.utils.now_datetime()
    }).insert()

def update_job_status(job_status_name, processed, status=None):
    frappe.db.set_value("Job Status", job_status_name, {
        "processed_items": processed,
        "status": status or "In Progress",
        "last_updated": frappe.utils.now_datetime()
    })
```

## Locking

### Single-host: frappe.utils.synchronization.filelock

For jobs that must not run concurrently on one bench, use the framework's own
lockfile helper (`frappe/utils/synchronization.py`) rather than hand-rolling one:

```python
from frappe.utils.synchronization import filelock

def sync_inventory():
    """Only one instance runs at a time, across processes on this bench."""
    with filelock("sync_inventory", timeout=30):
        perform_sync()
```

`filelock(lock_name, *, timeout=30, is_global=False)` creates `{lock_name}.lock` under
the site's `locks/` directory (or the bench `config/` directory if `is_global=True`)
and raises `frappe.utils.file_lock.LockTimeoutError` if it can't acquire the lock
within `timeout` seconds. This only coordinates processes on the same machine.

### Multi-host: Redis `SET NX`

Across multiple worker hosts, use Redis directly. Namespace the key with
`frappe.cache.make_key()` so it doesn't collide with another site sharing the same
Redis database:

```python
import frappe

def run_with_lock(lock_name, timeout=300):
    """Decorator for jobs requiring exclusive access across hosts."""
    def decorator(func):
        def wrapper(*args, **kwargs):
            lock_key = frappe.cache.make_key(f"lock:{lock_name}")
            acquired = frappe.cache.set(lock_key, "1", ex=timeout, nx=True)

            if not acquired:
                frappe.log_error(f"Could not acquire lock: {lock_name}")
                return None

            try:
                return func(*args, **kwargs)
            finally:
                frappe.cache.delete(lock_key)
        return wrapper
    return decorator

@run_with_lock("sync_inventory")
def sync_inventory():
    perform_sync()
```

## Rate Limiting Jobs

### Throttled Processing
```python
import time

def throttled_job(items, rate_per_minute=60):
    """Process items with rate limiting"""
    interval = 60 / rate_per_minute
    
    for item in items:
        start = time.time()
        
        process_item(item)
        
        elapsed = time.time() - start
        if elapsed < interval:
            time.sleep(interval - elapsed)
```

## Monitoring

### Job Statistics
```python
def get_queue_stats():
    """Get queue statistics"""
    from rq import Queue
    from frappe.utils.background_jobs import get_queue
    
    stats = {}
    for queue_name in ["short", "default", "long"]:
        q = get_queue(queue_name)
        stats[queue_name] = {
            "pending": len(q),
            "failed": len(q.failed_job_registry),
            "scheduled": len(q.scheduled_job_registry)
        }
    
    return stats
```

## Sources

- `apps/frappe/frappe/utils/background_jobs.py:76-209` (`enqueue` signature, `job_name` deprecation warning), `:53-73` (`get_queues_timeout`), `:547-559` (`validate_queue`), `:535-544` (`get_queue`)
- `apps/frappe/frappe/utils/synchronization.py:18-45` (`filelock(lock_name, *, timeout=30, is_global=False)`, `LockTimeoutError`)
- `apps/frappe/frappe/utils/redis_wrapper.py:38-58` (`RedisWrapper` extends `redis.Redis`, `make_key`) — `frappe.cache` is a `RedisWrapper` instance (`frappe/__init__.py:77`), so `.set(key, val, ex=timeout, nx=True)`/`.delete(key)` are the standard `redis-py` methods
- `apps/frappe/frappe/utils/boilerplate.py:563-579` (`scheduler_events` hook keys: `all`/`daily`/`hourly`/`weekly`/`monthly`, plus `cron` used in `apps/frappe/frappe/hooks.py:222-225`)
- `apps/frappe/frappe/realtime.py:12` (`publish_progress`), `:23` (`publish_realtime`)
- `env/lib/python3.14/site-packages/rq/queue.py:419-452` (`Queue.failed_job_registry`/`.scheduled_job_registry` properties) — RQ (Redis Queue) / python-rq for queue internals

See also [background-jobs.md](background-jobs.md) for verified `enqueue`/scheduler signatures.
