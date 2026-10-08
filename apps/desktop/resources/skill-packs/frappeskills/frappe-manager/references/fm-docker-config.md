# FM Docker Compose Configuration

Part of [frappe-manager.md](frappe-manager.md). FM generates its own
`docker-compose.yml` per bench plus a shared one for global services —
its real architecture differs from a typical single-app Compose stack.
Read [FM's actual generated services](#fms-actual-generated-services)
before writing an override; the generic Compose reference below it is
correct Docker Compose syntax but does not describe what FM runs unless
noted.

## FM's actual generated services

Confirmed from FM's own Compose templates — there is no per-bench database
container and no per-bench reverse proxy:

- **Database**: one shared `global-db` MariaDB 10.6 service (in
  `~/frappe/services/`), used by every bench. There is no per-bench
  `mariadb` service to target with an override.
- **Reverse proxy**: one shared `global-nginx-proxy`
  (`jwilder/nginx-proxy`) that publishes host ports 80/443 and routes by
  `VIRTUAL_HOST`. Each bench's own `nginx` container only `expose`s port
  80 internally — it does not publish a host port itself.
- **Per-bench services**: `frappe` (Gunicorn/Werkzeug web), `nginx`,
  `socketio`, `schedule`, `redis-cache`, `redis-queue`. There is no
  `redis-socketio` service — Socket.IO runs as its own `frappe`-image
  container, not a third Redis instance.
- **Networks**: a per-bench `site-network`, plus two external shared
  networks, `fm-global-frontend-network` (10.1.0.0/16) and
  `fm-global-backend-network` (10.2.0.0/16). Custom subnets are not
  configurable per bench through documented flags.
- **Debugging**: FM uses `debugpy` for Python debugging, attached via
  `fm code <bench> --debugger` and VSCode's Dev Containers extension — not
  a manually configured Xdebug port. There is no `XDEBUG_MODE`/
  `XDEBUG_CONFIG` environment variable in FM's images.

Because of this, most of the environment-variable and service names in the
generic examples below (`DB_HOST=mariadb`, `REDIS_SOCKETIO`, a `mariadb:`
or `backup:` service block) do not correspond to anything in an
FM-generated `docker-compose.yml` — validate any override against the
bench's actual file with `fm info <bench> --verbose` (prints the resolved
compose paths) or `cat ~/frappe/sites/<bench>/docker-compose.yml`.

## Compose override

`docker-compose.override.yml` is standard Docker Compose behavior (merged
automatically alongside `docker-compose.yml` in the same directory) — FM
does not document or specifically support hand-written overrides to its
generated files, so treat this as unsupported unless you have confirmed it
against the current file:

```yaml
services:
  frappe:
    environment:
      - DEVELOPER_MODE=1   # prefer `fm update <bench> --developer-mode enable` instead
    volumes:
      - ./custom-config:/app/custom-config:ro
```

Do not add a host `ports:` mapping for `frappe`/`nginx` expecting it to
bypass FM's routing — FM's `global-nginx-proxy` routes by `VIRTUAL_HOST`,
not by a published host port, so an override port mapping like
`"8001:8000"` has no effect on how the bench is reached.

## Resource limits

Generic Compose syntax, not verified as present in FM's generated files —
apply the same way as above if you need it:

```yaml
services:
  frappe:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
```

## Global services & workers

Global services (`global-db`, `global-nginx-proxy`) are managed with
`fm services`, not raw Compose edits — see
[fm-sites-and-installation.md](fm-sites-and-installation.md#global-services).
Worker concurrency (RQ workers, Gunicorn worker count) is controlled
through `fmx` and Frappe's own config, documented in
[fm-dev-workflow.md](fm-dev-workflow.md#fmx-internal-service-management),
not through a Compose `command:` override on `redis-queue`.

## Debugging (debugpy, not Xdebug)

```bash
fm code <bench> --debugger
```

This writes `.vscode/launch.json` and `.vscode/tasks.json` into the bench
workspace. The generated task stops the Gunicorn web server
(`fmx stop frappe`) before `debugpy` attaches, since the debugger needs to
bind the same port; Gunicorn restarts automatically when the debug session
ends. There is no manual `XDEBUG_MODE`/port-based setup to replicate —
`fm code --debugger` handles the wiring.

## Health checks

Generic Compose syntax — not confirmed present in FM's generated
`docker-compose.yml` templates (no `healthcheck:` block was found in
`frappe_manager/templates/docker-compose.tmpl` or
`docker-compose.services.tmpl`). Useful general knowledge if you add your
own service to an override, but don't assume FM's `frappe`/`mariadb`
services already have one:

```yaml
services:
  frappe:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
```

## Backups

There is no FM-generated `backup` service (a `frrouting/backup` image, as
in an earlier draft of this page, does not exist for this purpose —
`frrouting` is an unrelated routing-daemon project). FM's backup path is
the Frappe `bench backup` command run inside the container, not a Compose
service:

```bash
fm shell <bench> -c "bench backup --with-files"
```

See [fm-sites-and-installation.md](fm-sites-and-installation.md#backups-restore--app-updates)
for on-host backup file locations.

## Production overrides

FM's own `-e/--environment prod` already sets the production restart
policy (`unless-stopped`) and disables developer mode / admin tools —
prefer `fm create --environment prod` or `fm update <bench> --environment
prod` over hand-written Compose overrides:

```bash
fm create mybench --environment prod
fm update mybench --environment prod   # switch an existing bench
```

## Sources

Verified against the upstream `rtCamp/Frappe-Manager` repository (`main`
branch, matching the published "latest"/v0.19 docs) — `fm` is not
installed in this workspace, so FM's own Compose templates and guides were
read directly instead of an installed bench or `docker compose config`
output:

- `frappe_manager/templates/docker-compose.tmpl` — per-bench services (`frappe`, `nginx`, `socketio`, `schedule`, `redis-cache`, `redis-queue`), `site-network`, external `fm-global-frontend-network`/`fm-global-backend-network`
- `frappe_manager/templates/docker-compose.services.tmpl` — shared `global-db` (MariaDB) and `global-nginx-proxy` (`jwilder/nginx-proxy`, ports 80/443, `10.1.0.0/16`/`10.2.0.0/16` networks)
- `docs/guides/vscode.md`, `docs/guides/fmx.md` — `fm code --debugger` uses `debugpy` via Dev Containers, not Xdebug; `fmx stop frappe` frees the port before attach
- `docs/guides/environments.md` — `--environment prod` sets restart policy and developer-mode/admin-tools defaults
- `docs/guides/backup-restore.md` — `bench backup` is the only backup mechanism; no Compose backup service
