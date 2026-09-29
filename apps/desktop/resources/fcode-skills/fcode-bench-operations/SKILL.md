---
name: fcode-bench-operations
description: "Bench CLI: migrate, clear-cache, build, site management, app install/uninstall, and common troubleshooting sequences."
---

# Bench operations

Run all `bench` commands from the bench root directory (the directory that
contains `apps/` and `sites/`). In Fcode, use `fcode_bench_run` for the
allow-listed verbs and `fcode_bench_execute` for Python method calls.

## Essential commands

```bash
# Apply DocType JSON changes and fixtures to the database
bench --site <site> migrate

# Clear Redis and filesystem caches (needed after hooks.py, JS, route changes)
bench --site <site> clear-cache

# Rebuild JS/CSS bundles for one app
bench build --app <app>

# Rebuild all bundles
bench build

# List installed apps on a site (JSON output)
bench --site <site> list-apps -f json

# Install an app on a site
bench --site <site> install-app <app>

# Uninstall an app
bench --site <site> uninstall-app <app>
```

## Site management

```bash
# Create a new site
bench new-site <site> --install-app frappe

# Drop a site (destructive — deletes DB and files)
bench drop-site <site> --no-backup

# Backup a site
bench --site <site> backup --with-files

# Restore a backup
bench --site <site> restore <path/to/database.sql.gz> --with-public-files <files.tar.gz>
```

## Bench anatomy

```
<bench>/
  apps/                 # one subdirectory per installed app (git repos)
    frappe/
    erpnext/
    <custom_app>/
  sites/
    common_site_config.json   # shared config: webserver_port, redis URLs
    currentsite.txt           # default site name (single-site setups)
    <site>/
      site_config.json        # site-specific: db_name, db_password, ...
      private/
      public/
  env/                  # Python virtualenv
  config/               # supervisor and nginx configs
  logs/
```

`webserver_port` in `sites/common_site_config.json` is the port `bench start`
listens on (default 8000). `builder_path` in the same file controls the
Builder UI route (default `"builder"`).

## Frappe version

```bash
cat apps/frappe/frappe/__init__.py | grep __version__
```

Returns e.g. `__version__ = "16.35.0"`. Treat the major number (15/16/17) as
the compatibility boundary.

## Starting bench

```bash
bench start         # foreground, all processes
bench --site <site> serve   # single-process, no workers
```

The Fcode Bench tab starts and supervises `bench start`; do not start it
manually from the agent — it is already managed.

## Common troubleshooting

| Symptom | Fix |
|---------|-----|
| 404 on a new route | `bench --site <site> clear-cache` |
| Old JS/CSS served | `bench build --app <app>` + hard-refresh |
| `ModuleNotFoundError` for a new file | Check `__init__.py` in the package |
| DocType field missing from DB | `bench --site <site> migrate` |
| Redis connection error | `bench start` (starts redis-cache and redis-queue) |
