# Troubleshooting a Broken Bench

Failure modes that look like application bugs but are actually stale processes
or stale filesystem state. Each section states the cause, then the fix.

## `ModuleNotFoundError: No module named '<new_app>'` inside a queued job

Seen when `bench --site <site> migrate` fails on a job such as
`Role Profile.on_update -> queue_action`, right after installing a new app.

**Cause.** `bench get-app <app>` installs the app on disk and into the venv,
but does **not** restart already-running `bench worker` / `worker-pool`
processes. On a dev setup driven by `bench start` / honcho (rather than
supervisor), `bench get-app`'s own `supervisorctl restart frappe:` step fails
silently — exit 7, because there is no supervisor group. Confirm by looking for
`WARNING ... failed. Use 'bench restart' to retry.` in `logs/bench.log`. Every
worker alive before the `get-app` keeps its old Python module cache and crashes
on any job importing the new app's `hooks.py` — which is every job, via
`frappe.get_hooks("before_job")`.

**Fix.**

1. Confirm the app is importable in the venv:
   `./env/bin/python -c "import <app>"`.
2. Enumerate workers:
   `ps aux | grep -iE "bench worker|bench_helper frappe worker"`.
3. **Check the parent chain of each one before touching it:**
   `ps -o pid,ppid,tty,lstart,command -p <pid>`. A real `TTY` (not `?`) with a
   `STAT` ending in `+` is very likely a live foreground session someone is
   using — do not kill it.
4. Kill only workers confirmed orphaned (`ps -o ppid=` returns `1`) or in a
   process tree with no live foreground tty. Restart:
   ```bash
   nohup bench --site <site> worker --queue short,default,long \
     > /tmp/<site>_worker.log 2>&1 &
   ```
   Confirm health via the log's `*** Listening on ...` line and the absence of
   `ModuleNotFoundError` on the next job.
5. A stale worker you cannot kill (someone else's terminal) stays in the RQ
   rotation and will keep racing your fresh worker, intermittently failing jobs
   with the same stale-module error. It does not block `bench --site <site> migrate`
   itself, but it keeps producing new stale locks — expect to repeat the next fix.

## `DocumentLockedError: This document is currently locked and queued for execution`

**Cause.** `Document.queue_action()` calls `self.lock()` — a pure filesystem
lock at `sites/<site>/locks/<signature>.lock`, no DB or Redis state (see
`frappe/model/document.py`'s `is_locked`/`lock`/`unlock` and
`frappe/utils/file_lock.py`) — **before** enqueuing the job. If the job later
crashes (for example on the `ModuleNotFoundError` above), `unlock()` never runs
and the lock file is left behind. It is not permanent, though: `DOCUMENT_LOCK_EXPIRY`
(3 hours, `frappe/model/document.py`) auto-clears it the next time anything calls
`lock()` on that document (e.g. the next `queue_action`), and after
`DOCUMENT_LOCK_SOFT_EXPIRY` (30 minutes) `check_if_locked()` offers a "Force Unlock"
primary action in the Desk error dialog, calling the whitelisted
`frappe.model.document.unlock_document` — no filesystem access needed for a user
with access to the document. Every `queue_action` attempt within that window still
throws immediately, before reaching a worker.

**Fix.** On a shared or production-like site, first confirm no legitimate
long-running edit is in flight, then prefer the in-app path: open the locked
document after the 30-minute soft expiry and use "Force Unlock" (or call
`frappe.model.document.unlock_document(doctype, name)` from
`bench --site <site> console`). Clearing the lock file directly is only
necessary before the 30-minute soft expiry, or when you cannot reach the Desk UI —
safe to do whenever the lock is a self-inflicted leftover from a crashed job:

```bash
rm -f sites/<site>/locks/*.lock
bench --site <site> migrate
```

`queue_action` only acquires the lock and enqueues — it does not wait for the
job — so `bench --site <site> migrate` proceeds past that line regardless of whether the
async job eventually succeeds. If it fails again, clear and retry; each retry
enqueues a fresh attempt.

To see exactly which documents are affected and why their jobs died, inspect
RQ's failed registry from `bench --site <site> console`:

```python
from rq.job import Job
from frappe.utils.background_jobs import get_redis_conn, get_queue
from rq.registry import FailedJobRegistry

conn = get_redis_conn()
for qname in ("short", "default", "long"):
    reg = FailedJobRegistry(queue=get_queue(qname))
    for jid in reg.get_job_ids():
        j = Job.fetch(jid, connection=conn)
        print(jid, j.ended_at, j.kwargs)
# print(j.exc_info) for the real traceback of one
```

## The site starts 500ing after killing "just a worker"

A `bench start` / honcho session's death can cascade-kill its siblings — web
server and socketio — even though you only targeted its worker child.

**Verify before concluding you broke it.** Find the process actually listening
on the site's `webserver_port` (`lsof -iTCP -sTCP:LISTEN | grep <port>`) and
inspect it: `ps -o pid,ppid,lstart,command -p <web_pid>`. If its `PPID` is `1`
and its `lstart` predates your session, it was never a child of what you killed
and the 500 has another cause.

Reproduce the real error through the actual WSGI app. Do **not** use
`bench --site <site> console`'s `get_response` — it has no real `frappe.local.request` and
reports a misleading `AttributeError: request`.

```python
from werkzeug.test import Client
from frappe.app import application

client = Client(application)
resp = client.get("/login", headers={"Host": "<site>"})
print(resp.status_code)
```

A 200 means the DB and app layers are healthy and the fault is isolated to one
broken long-lived process — often its stdout/stderr pipe died with an unrelated
parent. Kill that single process and restart it with the exact command `ps`
shows it was running, e.g.:

```bash
nohup bench --site <site> serve --port <port> > /tmp/<site>_web.log 2>&1 &
```

## General rule

Never kill a PID you have not inspected. `ps -o pid,ppid,tty,lstart,command -p
<pid>` first, every time — the difference between an orphaned worker and
someone's live `bench start` is one column.

## Sources

Verified against Frappe v16.35.0 (`frappe/__init__.py` `__version__`) and the
installed `bench` CLI package (`bench --version` → 5.31.0):

- `apps/frappe/frappe/model/document.py:43-44` (`DOCUMENT_LOCK_EXPIRY`/`DOCUMENT_LOCK_SOFT_EXPIRY`), `:529-539` (`check_if_locked` "Force Unlock" action), `:1871-1925` (`queue_action` calls `lock()` before enqueue; `lock`/`unlock`), `:2094-2097` (whitelisted `unlock_document`)
- `apps/frappe/frappe/utils/file_lock.py` — filesystem lock primitives (`create_lock`/`lock_exists`/`lock_age`/`delete_lock`) backing the above
- `apps/frappe/frappe/app.py:134-135` — module-level WSGI `application` callable (`@Request.application`), usable via `werkzeug.test.Client`
- `bench` CLI package `bench/utils/bench.py:317-371` (`restart_supervisor_processes`: falls back to group `frappe:`, logs level 3 → `logger.warning` on failure with the exact message "restarting supervisor group `{group}` failed. Use `bench restart` to retry."), `bench/utils/bench.py:388-390` (`restart_process_manager` — "only overmind has the restart feature", so `honcho`-driven `bench start` sessions are not restarted by `bench get-app`/`bench install-app`)
- Command behavior observed directly: `bench worker --help`, `bench migrate --help`, `bench console --help`, `bench serve --help`; `supervisorctl restart frappe:` exit code 7 reproduced locally with no supervisor daemon running
