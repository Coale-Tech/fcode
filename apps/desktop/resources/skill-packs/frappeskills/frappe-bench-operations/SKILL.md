---
name: frappe-bench-operations
description: Operate a Frappe bench and its sites including install, migrate, backup, build, scheduler and worker management, and recovery from stuck migrations or stale locks. Use for bench CLI work or when a bench is broken.
---

# Frappe Bench Operations

Run and repair a bench: sites, migrations, workers, assets, backups.

## When to use

- Installing apps, creating or dropping sites
- Running migrations, builds, backups, restores
- Managing the scheduler, queues and workers
- Diagnosing a hung `migrate`, stale locks, or dead workers

## Inputs required

- Bench root path and the target site name
- Whether the bench serves live users (changes the blast radius)
- What changed since the last working state

## Procedure

### 0) Confirm bench and site

```bash
ls apps/ sites/
grep default_site sites/common_site_config.json   # set by `bench use`; currentsite.txt is ignored
bench --site <site> list-apps
```

### 1) Routine operations

```bash
bench --site <site> migrate
bench --site <site> clear-cache
bench build --app <app>
bench --site <site> backup --with-files
bench --site <site> console
```

Every command takes `--site` explicitly. Full surface:
[references/bench.md](references/bench.md).

### 2) Run the dev server under supervision

Start `bench start` as a managed background process, and check whether one is
already running before starting another — two servers on one port fail
confusingly.

### 3) Diagnose a stuck bench

```bash
bench --site <site> doctor          # scheduler + queue health
bench --site <site> show-pending-jobs
ps aux | grep -E "bench|rq|gunicorn"
```

Stale RQ workers holding old code, and stale document locks, are the two usual
causes of a hanging `migrate` or `DocumentLockedError` —
[references/bench-troubleshooting.md](references/bench-troubleshooting.md).

### 4) Clear the blockage

Kill only the stale workers (never a live web server someone is using), clear
the stale lock, then re-run the migration. Verify afterwards that the scheduler
and queues are alive again.

### 5) Recover a failed migration

Restore the pre-migration backup, fix the offending patch or DocType, and
re-run. Never leave a half-migrated site serving users.

## Verification

- [ ] `bench --site <site> migrate` completes without errors
- [ ] `bench --site <site> doctor` reports scheduler and queues healthy
- [ ] Workers are running with current code (restarted after a deploy)
- [ ] Site loads and a document saves successfully
- [ ] Backup exists and is recent before any destructive operation

## Failure modes / debugging

- **`migrate` hangs**: stale RQ worker holding a lock, or a patch waiting on input
- **`DocumentLockedError`**: stale lock from a killed process; after 30 min Desk offers Force Unlock, after 3 h it expires — see [references/bench-troubleshooting.md](references/bench-troubleshooting.md)
- **`ModuleNotFoundError` inside a job**: worker running pre-deploy code — restart workers
- **Assets not updating**: `bench build --app <app>` missing, or browser cache
- **Scheduler not firing**: disabled on the site, or the scheduler process is dead
- **Port already in use**: a `bench start` is already running
- **Site down after migrate**: restore the backup, fix, re-run

## Escalation

- Docker environment instead of a bench → [`frappe-manager`](../frappe-manager/SKILL.md)
- Job/queue design problems → [`frappe-app-development`](../frappe-app-development/SKILL.md)
- Version/compat questions → [`frappe-project-triage`](../frappe-project-triage/SKILL.md)

## References

- [references/bench.md](references/bench.md) - Bench CLI and site management
- [references/bench-troubleshooting.md](references/bench-troubleshooting.md) - Stale workers, stuck locks, recovery

## Guardrails

- **Always `--site <site>`**: bare `bench migrate` hits the wrong site
- **Back up before destructive operations**: `--with-files` when files matter
- **Never kill a live web server** to clear workers — target the stale processes only
- **Restart workers after deploying code**: they hold the old module tree
- **Use bare `bench`**, not `./env/bin/bench` or a full path
- **Run `bench start` under a supervisor**, one per bench

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| Bare `bench migrate` | Wrong or default site | Always `--site` |
| Killing all bench processes | Takes down a live server | Kill only stale workers |
| Migrating without a backup | No recovery path | Back up first |
| Forgetting `clear-cache` | Stale schema in the app | Clear after migrate |
| Two `bench start` instances | Port conflict, confusing errors | Check first |
| Deploying without restarting workers | Jobs run old code | Restart workers |
