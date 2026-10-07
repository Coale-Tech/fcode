# FM Development & Agent Workflow

Part of [frappe-manager.md](frappe-manager.md). Site creation and management
commands: [fm-sites-and-installation.md](fm-sites-and-installation.md).

FM appends `.localhost` to the bench name to form the site name — a bench
created with `fm create devsite` contains a site named `devsite.localhost`.
Every `bench --site ...` command below uses that full name.

## Shell access

```bash
fm shell <bench>              # interactive shell inside the frappe container
fm shell <bench> -c "<cmd>"   # run one command inside the container, non-interactively

# Inside the container, ordinary bench commands apply — always with --site <bench>.localhost:
bench new-app my_app
bench --site <bench>.localhost install-app my_app
bench --site <bench>.localhost migrate
bench build --app my_app
```

`fm shell <bench> -c "..."` is the non-interactive equivalent of entering
the shell, running one command, and exiting — useful for scripts and CI.
`fm shell` also has a `--bench-console` flag that opens (or runs code in)
an IPython console with the Frappe context already loaded, and a
`--user`/`--service` pair to target a different user or container.

## fmx (internal service management)

Inside the container, `fmx` controls Frappe's own supervisor-managed
services (`frappe`, `short-worker`, `long-worker`, `schedule`, `socketio`):

```bash
fm shell <bench>
fmx status      # supervisor state + live RQ worker/queue status
fmx restart     # restart everything (workers killed via SIGUSR1, dev-fast)
fmx start
fmx stop
```

For production deploys, drain workers before restarting so no in-flight
job is lost, and optionally run a migration as part of the same sequence:

```bash
fmx restart --drain-workers            # wait for jobs to finish, then restart
fmx restart --drain-workers --migrate  # + `bench migrate --skip-failing`
fmx restart short-worker long-worker   # restart only the worker services
```

## VSCode integration

```bash
fm code <bench>              # open the bench in VSCode (Dev Containers)
fm code <bench> --debugger   # write .vscode launch/task files for debugpy
fm code <bench> --force-start
```

FM's Python debugging uses `debugpy` (attached through the Dev Containers
extension), not a PHP-style Xdebug setup — see
[fm-docker-config.md](fm-docker-config.md) for how the debugger attach
actually works.

## Standard development cycle

```bash
# 1. Create and start
fm create devsite --apps erpnext:version-15 --environment dev
fm start devsite

# 2. Enter the shell, create or modify an app
fm shell devsite
bench new-app my_app
bench --site devsite.localhost install-app my_app
# ... make code changes on the host; they're bind-mounted into the container ...
exit

# 3. Test
fm shell devsite -c "bench --site devsite.localhost run-tests --app my_app"

# 4. Check logs
fm logs devsite -f

# 5. Reset if the bench gets into a bad state
fm reset devsite               # drops the DB and reinstalls all apps, keeps app code
# or, for a fully clean rebuild:
fm stop devsite
fm delete devsite --yes
fm create devsite --apps erpnext:version-15 --environment dev
```

Treat dev benches as disposable: export fixtures/code you need first, then
reset or recreate rather than repair a corrupted one.

## Why FM for agent-driven development

- **Isolated environments** — each bench runs in Docker containers, no host pollution
- **Quick reset** — `fm reset` or delete-and-recreate to test from a clean state
- **Minimal host dependencies** — only Docker, Git, and Python 3.13+ (for `fm` itself) are required
- **Shell access** — agents run commands via `fm shell`
- **Reproducible** — same environment across machines

### Key commands for agents

| Task | Command |
|------|---------|
| Create environment | `fm create <bench> --apps erpnext:version-15 --environment dev` |
| Start / stop | `fm start <bench>` / `fm stop <bench>` |
| Run a shell command | `fm shell <bench> -c "<cmd>"` |
| View logs | `fm logs <bench> -f` |
| Check bench info | `fm info <bench>` |
| List all benches | `fm list` |
| Delete environment | `fm delete <bench> --yes` |
| Reset environment (keep apps) | `fm reset <bench>` |
| Restart Frappe services | `fm shell <bench> -c "fmx restart"` |

## Testing strategies

```bash
# All tests for an app
fm shell devsite -c "bench --site devsite.localhost run-tests --app my_app"

# Specific module
fm shell devsite -c "bench --site devsite.localhost run-tests --module my_app.tests.test_feature"

# Specific DocType
fm shell devsite -c "bench --site devsite.localhost run-tests --doctype 'My DocType'"

# Verbose
fm shell devsite -c "bench --site devsite.localhost run-tests --app my_app -v"
```

Run `bench --site devsite.localhost migrate` after schema changes and
`bench --site devsite.localhost clear-cache` after Python changes, before
re-running tests.

## Debugging workflow

```bash
fm shell devsite
bench set-config -g developer_mode 1   # bench-level: -g writes common_site_config.json,
exit                                    # no --site needed here

# or, the FM-native equivalent (writes the same config via bench_config.toml):
fm update devsite --developer-mode enable

fm code devsite --debugger
```

```bash
# Recent errors from the container logs
fm logs devsite | grep -i error | tail -20
fm logs devsite -f
```

```bash
# Console debugging
fm shell devsite
bench --site devsite.localhost console
>>> doc = frappe.get_doc("My DocType", "XYZ")
>>> doc.status
>>> exit()
```

## Database operations

```bash
# Quick DB access
fm shell devsite -c "bench --site devsite.localhost mariadb -e 'SHOW TABLES;'"

# Backup before risky changes
fm shell devsite -c "bench --site devsite.localhost backup --with-files"

# Reset the database (wipes data, keeps installed apps) — FM-native:
fm reset devsite

# or manually, from inside the shell:
fm shell devsite
bench --site devsite.localhost reinstall --yes
exit
```

## Multi-app development

```bash
fm create multiapp --apps erpnext:version-15 --apps hrms:version-15
fm shell multiapp
bench new-app app_one
bench new-app app_two
bench --site multiapp.localhost install-app app_one
bench --site multiapp.localhost install-app app_two
exit
```

## Editing app code

Files are bind-mounted from the host — edit directly there, no need to edit
inside the container:

```bash
code ~/frappe/sites/<bench>/workspace/frappe-bench/apps/my_app/
# or
fm code <bench>
```

After editing:

```bash
fm shell <bench>
bench build --app my_app                     # JS/CSS changes
bench --site <bench>.localhost migrate       # schema changes
bench --site <bench>.localhost clear-cache   # Python changes
exit
```

### Directory layout inside a bench

```
~/frappe/
├── sites/
│   └── devsite/                        # FM bench directory
│       ├── workspace/
│       │   └── frappe-bench/
│       │       ├── apps/
│       │       │   ├── frappe/
│       │       │   ├── erpnext/
│       │       │   └── my_custom_app/  # your app code
│       │       └── sites/
│       │           └── devsite.localhost/
│       │               └── site_config.json
│       ├── bench_config.toml           # per-bench FM settings
│       └── docker-compose.yml
├── services/                           # shared global-db, global-nginx-proxy
├── logs/                               # CLI logs
├── backups/                            # fm migrate backups
└── archived/                           # benches archived by fm migrate on failure
```

Upstream docs are not fully consistent on whether the per-bench directory
under `sites/` is named `<benchname>` or `<benchname>.localhost` — confirm
the exact path for a given bench with `fm info <bench> --verbose`, which
prints the resolved compose file paths.

## CI/CD integration

```yaml
- name: Setup FM
  run: pipx install frappe-manager
- name: Create test site
  run: fm create testsite --apps erpnext:version-15
- name: Install app under test
  run: fm shell testsite -c "bench get-app my_app https://github.com/org/my_app && bench --site testsite.localhost install-app my_app"
- name: Run tests
  run: fm shell testsite -c "bench --site testsite.localhost run-tests --app my_app"
```

## Cleanup

```bash
# Pull fresh FM stack images, then prune dangling ones
fm self update-images
docker image prune -f

# Full reset — remove every FM bench, then prune Docker
fm list | xargs -I {} fm delete {} --yes
docker system prune -af
```

There is no `fm clean` command.

## Sources

Verified against the upstream `rtCamp/Frappe-Manager` repository (`main`
branch, matching the published "latest"/v0.19 docs) — `fm` is not
installed in this workspace, so upstream's auto-generated `--help` docs and
narrative guides were used as the CLI reference instead of local source or
live `--help` output:

- `docs/commands/shell.md`, `docs/commands/create.md`, `docs/commands/reset.md`, `docs/commands/code.md`, `docs/commands/restart.md` — flags for `fm shell`, `fm create`, `fm reset`, `fm code`, `fm restart`
- `docs/guides/fmx.md` — `fmx` subcommands and services (`status`, `start`, `stop`, `restart`, `rq`, `--drain-workers`, `--migrate`)
- `docs/guides/vscode.md` — `fm code --debugger` uses `debugpy` via the Dev Containers extension, not Xdebug
- `docs/guides/app-management.md` — app install/update via `bench` inside `fm shell`, `--apps` string formats
- `docs/guides/backup-restore.md` — backup/restore commands and on-host backup path
- `docs/reference/configuration.md` — bench `name` field resolves to `<benchname>.localhost` (site name and default URL)
- `docs/getting-started/installation.md` — `~/frappe/` directory layout (`sites/`, `services/`, `logs/`, `backups/`, `archived/`)
- `Docker/frappe/fmx/fmx/commands/` — confirms `restart.py`, `rq.py`, `start.py`, `status.py`, `stop.py` are the only `fmx` subcommands
