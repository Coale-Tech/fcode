# Existing App Workflow

Use this flow when the user wants to extend, modify, or fix an app that already exists.

## Step 1: Find and confirm bench root

The bench root is typically the parent of the workspace directory, or the workspace itself. Look for `apps/`, `sites/`, and `Procfile`.

```bash
ls apps/ sites/ Procfile
```

If the workspace is inside the app (e.g. user opened `apps/myapp/`), go up:
```bash
ls ../../apps/ ../../sites/ ../../Procfile
```

## Step 2: Locate the app

```bash
ls apps/
```

Find the app directory. Read its module structure:
```bash
ls apps/<app-name>/<app-name>/
```

Each subdirectory under the module is a Frappe module (contains DocTypes, etc.):
```bash
ls apps/<app-name>/<app-name>/<module-name>/
```

Do NOT create a second app. Do NOT run `bench new-app`.

## Step 3: Confirm site and app installation

See [bench.md](../../frappe-bench-operations/references/bench.md) for finding the right site for this app.

Verify the app is installed:
```bash
bench --site <site> list-apps
```

If not installed:
```bash
bench --site <site> install-app <app-name>
```

## Step 4: Enable developer mode

```bash
bench --site <site> set-config developer_mode 1
```

## Step 5: Build / modify features

Read the app's existing code to understand patterns before making changes. Load only the relevant feature references from the main SKILL.md table.

Key files to read first:
- `apps/<app>/setup.cfg` or `pyproject.toml` — app metadata
- `apps/<app>/<app>/hooks.py` — existing hooks
- `apps/<app>/<app>/<module>/` — existing DocTypes and modules

## Step 6: Migrate and verify

```bash
bench --site <site> migrate
```

Same rules as new app — see [new-app.md](../../frappe-app-development/references/new-app.md#step-7-migrate-and-verify) for migrate rules.

## Sources

Verified against Frappe v16.35.0 (`apps/frappe/frappe/__init__.py` `__version__`):

- CLI subcommands `list-apps`, `install-app`, `set-config`, `migrate`: `apps/frappe/frappe/commands/site.py`, `apps/frappe/frappe/commands/utils.py`
- App metadata file `apps/<app>/pyproject.toml` (no `setup.py` present in installed apps) and `apps/<app>/<app>/hooks.py` as the hooks entry point: directory layout of `apps/frappe/` and `apps/erpnext/` in the installed bench
- Everything else in this file (locating the bench root, not creating a second app, reading module structure before editing) is workflow/process guidance with no further verifiable API claim
