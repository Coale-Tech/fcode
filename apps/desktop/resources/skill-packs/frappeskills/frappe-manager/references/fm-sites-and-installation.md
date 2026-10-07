# FM Installation, Sites & Global Commands

Part of [frappe-manager.md](frappe-manager.md). Frappe Manager (`fm`) is a
third-party CLI by rtCamp, built on official [Frappe Docker](https://github.com/frappe/frappe_docker)
images — not an official Frappe project. `fm` manages **benches**: each
`fm create BENCHNAME` produces one Docker-based bench, reachable by default
at `http://BENCHNAME.localhost`, whose site inside is named
`BENCHNAME.localhost` (FM appends `.localhost` to form both the default
domain and the site name — use that full name for `bench --site ...`
commands run inside the container).

## Install

```bash
# Stable, with uv (recommended upstream)
uv tool install --python 3.13 frappe-manager
uvx --from frappe-manager fm --help    # try without installing

# Stable, with pipx
pipx install frappe-manager

# Latest develop branch
pipx install git+https://github.com/rtcamp/frappe-manager@develop

# Shell completion (Typer's default `--install-completion`/`--show-completion`)
fm --install-completion

# Version / help
fm --version
fm --help
```

Requirements: Python 3.13+ (to install `fm` itself), Docker, Git, a
non-root user with Docker permissions, and ports 80/443 free on the host
(the shared nginx proxy binds them). VSCode is optional, only needed for
`fm code`.

## Bench vs Frappe Manager

| Aspect | Bench | Frappe Manager |
|--------|-------|----------------|
| Setup | Native Python, manual dependencies | Docker-based, minimal host setup |
| Isolation | Shared host environment | Isolated containers per bench |
| Best for | Production servers, direct control | Local dev, quick onboarding, reproducible envs |
| Requirements | Python, Node, MariaDB, Redis, etc. | Python 3.13+, Docker, Git |

## `fm create`

```bash
fm create BENCHNAME [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `-a, --apps TEXT` | Apps to install. Format `app` or `app:branch` (e.g. `erpnext:version-15`); repeat the flag per app. Frappe is always included by default. |
| `-e, --environment` | `dev` \| `prod` (default `dev`) |
| `--developer-mode` | `enable` \| `disable` |
| `--admin-pass TEXT` | Administrator password |
| `--template` | Create as a template bench |
| `--alias-domains TEXT` | Comma-separated alias domains (add SSL for them separately with `fm ssl add`) |
| `-t, --github-token TEXT` | GitHub token for private app repos (or `GITHUB_TOKEN` env var) |
| `--python TEXT` | Python version, e.g. `3.11` (auto-detected by default) |
| `--node TEXT` | Node version, e.g. `18`, `20` (auto-detected by default) |
| `--restart TEXT` | Docker restart policy; defaults to `no` (dev) or `unless-stopped` (prod) |
| `--allow-domain-conflicts` | Skip domain-uniqueness validation (not recommended) |

There is no `--frappe-branch` or `--ssl`/`--letsencrypt-*` flag on
`fm create`: the Frappe branch is set the same way as any other app, via
`--apps frappe:<branch>`, and SSL is always provisioned afterwards with
`fm ssl add` (see [fm-ssl-and-production.md](fm-ssl-and-production.md)).

```bash
# Basic bench (Frappe only, default branch)
fm create mybench

# Bench with ERPNext on a specific branch
fm create mybench --apps erpnext:version-15

# Bench with multiple apps
fm create mybench --apps erpnext --apps hrms --environment dev

# Private app repo
fm create mybench --apps myorg/private-app --github-token ghp_xxx
```

`--apps` accepts several string formats: `erpnext` (default branch),
`erpnext:version-15` (app:branch), `org/repo:branch` (non-Frappe-org repo),
a full `https://` or `git@` GitHub URL, `org/repo:branch#apps/subdir` for a
monorepo app, or `org/repo:<sha>` for a specific commit.

## Bench lifecycle & site management

```bash
fm list                             # list all benches with status
fm info <bench>                     # bench config, apps, environment
fm info <bench> --verbose           # + container states, compose file paths
fm start <bench>
fm start <bench> --force            # recreate containers
fm stop <bench>
fm restart <bench>                  # restart web + workers (default)
fm restart <bench> --supervisor     # faster, in-container restart
fm restart <bench> --web --no-workers
fm logs <bench>
fm logs <bench> -f                  # follow mode
fm logs <bench> --service nginx     # logs for one service (frappe, nginx, redis-cache, ...)
fm delete <bench>
fm delete <bench> --yes             # skip confirmation
fm delete <bench> --delete-db-from-global-db
fm reset <bench>                    # drop the DB and reinstall all apps (destructive)
```

`fm delete` uses `-y/--yes`, not `--force`, and `fm logs` has no
`--tail`/`-n` option — pipe through `tail` if you need a fixed line count.

## Global services

FM benches share one MariaDB instance (`global-db`) and one reverse proxy
(`global-nginx-proxy`) — there is no per-bench database container.
`fm services` always takes a `SERVICE_NAME` argument (a specific service
name or `all`):

```bash
fm services start global-db
fm services stop all
fm services restart global-nginx-proxy
fm services shell global-db
```

There is no `fm doctor`, `fm ps`, or `fm clean` command. The closest
equivalents are:

```bash
fm list                             # bench status overview
fm self compose <bench> ps          # raw `docker compose ps` for one bench
fm self update-images               # pull fresh FM stack images
docker system prune                 # standard Docker cleanup
```

## Configuration

There is no `fm config` subcommand. Settings live in two TOML files and are
normally changed through `fm update` rather than hand-edited:

- Global: `~/frappe/fm_config.toml` — ngrok token, DNS-provider
  credentials, domain-uniqueness enforcement, log level
- Per-bench: `~/frappe/sites/<benchname>/bench_config.toml` — environment
  type, developer mode, admin tools, upload limit, restart policy, alias
  domains, SSL certificates

```bash
fm update <bench> --environment prod
fm update <bench> --admin-tools enable
fm update <bench> --developer-mode enable
fm update <bench> --python 3.11 --node 20
fm update <bench> --add-alias www.example.com,api.example.com
```

Environment variables:

```bash
# Relocate FM's entire data root (set before any fm command)
export FRAPPE_MANAGER_HOME=/srv/frappe

# Override the global Cloudflare DNS-01 token at runtime
export FM_CLOUDFLARE_API_TOKEN=...
```

There is no `FM_HOME` or `FM_DEBUG` variable. Verbosity is a CLI flag, not
an env var: `fm -v <command>` (info level) or `fm --log-level debug
<command>` (explicit level).

## Backups, restore & app updates

There are no `fm export`/`fm import`/`fm clone` commands. Backups,
restores, and app updates go through the standard Frappe `bench` CLI
inside `fm shell`:

```bash
fm shell <bench> -c "bench backup --with-files"
fm shell <bench> -c "bench update"                # update all apps
fm shell <bench> -c "bench update --app erpnext"   # update one app
```

Backups land at
`~/frappe/sites/<bench>/workspace/frappe-bench/sites/<bench>.localhost/private/backups/`
on the host. See [fm-dev-workflow.md](fm-dev-workflow.md) for the full
development cycle.

## Exit codes

Confirmed from source: `fm` exits `0` on success and `1` on any handled
exception (Docker daemon not running, migration failure, unexpected
errors — all routed through the same error handler into `exit(1)`).
Argument/usage errors (missing required argument, unknown option) use
Click/Typer's standard exit code `2`. FM does not document separate exit
codes for "site not found" or "Docker error" beyond that.

## Sources

Verified against the upstream `rtCamp/Frappe-Manager` repository (`main`
branch, matching the published "latest"/v0.19 docs) — `fm` is not
installed in this workspace, so no local source or `--help` output was
available; an isolated venv install of the PyPI `frappe-manager` package
failed to import on this machine's default Python (3.14, incompatible with
a `josepy`/`certbot` transitive dependency), so the upstream repo's
auto-generated `--help` docs were used as the CLI reference instead:

- `docs/commands/create.md`, `docs/commands/delete.md`, `docs/commands/list.md`, `docs/commands/logs.md`, `docs/commands/services.md`, `docs/commands/self.md`, `docs/commands/update.md`, `docs/commands/reset.md` — command flags and defaults
- `docs/getting-started/installation.md`, `docs/getting-started/requirements.md` — install methods, requirements, `~/frappe/` directory layout
- `docs/reference/configuration.md` — `fm_config.toml`/`bench_config.toml` locations and fields, `FRAPPE_MANAGER_HOME`/`FM_CLOUDFLARE_API_TOKEN` env vars
- `docs/guides/app-management.md`, `docs/guides/backup-restore.md` — app install/update and backup paths (no export/import/clone commands)
- `frappe_manager/commands/__init__.py` (`app_callback`), `frappe_manager/main.py` — global `-v/--log-level` flags and `exit(1)` error handling
- README.md — command list (confirms no `doctor`/`ps`/`clean`/`config`/`export`/`import`/`clone` commands exist)
