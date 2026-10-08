# New App Workflow

Follow these steps in order.

## Step 1: Confirm bench root

```bash
ls apps/ sites/ Procfile
```
If it succeeds, bench is valid. Do not run anything else to verify.

## Step 2: Enable developer mode

```bash
bench set-config -g developer_mode 1
```

## Step 3: Pick or create site

See [bench.md](../../frappe-bench-operations/references/bench.md) for finding or creating a site. A working site is a prerequisite for the next steps.

## Step 4: Create app

The `bench new-app` command MUST use piped `printf`. No heredoc (`<<EOF`). No `--no-input`
(that flag does not exist). No bare `bench new-app <name>` without pipe.

App name must be lowercase with underscores — a valid Python identifier, since it is also the top-level module name.

`bench new-app` delegates straight to `frappe.utils.boilerplate._get_user_inputs`, which prompts for
exactly **7** values in this order — title, description, publisher, email, license, a
yes/no GitHub Actions prompt, and a git branch name (defaulting to the current `frappe` app's branch):

1. App Title (text, defaults to the title-cased app name)
2. App Description (text)
3. App Publisher (text)
4. App Email (text, validated as an email)
5. App License (choice, defaults to `mit`)
6. Create GitHub Workflow action for unittests (`y`/`N`, defaults to `N`)
7. Branch Name (text, defaults to the `frappe` app's current git branch — press Enter/leave blank to accept it)

Ask user for: app title, description, publisher, email, license. Default the GitHub Actions prompt to `N`
unless the user asks for CI, and leave the branch name blank to accept the default.

```bash
printf '<title>\n<description>\n<publisher>\n<email>\n<license>\nN\n\n' | bench new-app <app-name>
```

Example:
```bash
printf 'Expense Tracker\nTrack expenses\nJohn\njohn@example.com\nmit\nN\n\n' | bench new-app expense_tracker
```

`--no-git` (skip git init) is the only other flag `bench new-app` accepts; avoid it — a fresh git repo is
expected by the generated `.pre-commit-config.yaml` and README.

## Step 5: Install app on site

```bash
bench --site <site> install-app <app-name>
```

## Step 6: Build features

Write DocTypes, controllers, hooks, permissions, UI directly in the app module directory created in step 4.
Keep DocType controllers thin — validation and orchestration only — and put business logic in
`services/`, cross-cutting concerns (cache, logging, permissions, validation) in `utils/`, external
system connectors in `integrations/`, and async handlers in `background_jobs/`. See
`assets/mini-app/` for a runnable skeleton of this layout.

The app structure after `bench new-app myapp` (`frappe/utils/boilerplate.py::_create_app_boilerplate`):
```
apps/myapp/
  myapp/
    myapp/          ← default module directory: scrub(App Title), usually == app name
      __init__.py
    templates/
      pages/
      includes/
    www/
    config/
    public/css/  public/js/
    patches/
    hooks.py
    patches.txt
    __init__.py
  pyproject.toml
  README.md
  license.txt
  .pre-commit-config.yaml
  .gitignore                 ← omitted with --no-git
```

The module directory name is `scrub(App Title)`, not literally `app_name` — they only match when the App
Title prompt is left at its default (title-cased app name). A custom title produces a differently-named
module directory.

`hooks.py` keys, resolution order, and the `override_doctype_class` /
`extend_doctype_class` (v16+, preferred — extends rather than replaces the base
controller) choice: [hooks.md](hooks.md). Keep `hooks.py` itself free of logic — only
configuration, importing handlers from modules.

Load the relevant feature references through `frappe-router` as needed.

Match Frappe's own formatting (`apps/frappe/pyproject.toml`): ruff with **tab
indentation**, double quotes, line length 110, target `py314`. Run the app's
configured `ruff format` / `ruff check`; don't hand-format.

## Step 7: Migrate and verify

```bash
bench --site <site> migrate
```

**Rules:**
- After migration succeeds, do NOT query the database directly to verify schema changes. The migrate output is the source of truth.
- Confirm with `bench --site <site> run-tests --app <app-name>` once the app has tests.

Start bench in background if not already running:
```bash
bench start
```

Get URL:
```bash
bench --site <site> execute frappe.utils.get_url
```

## Templates

Runnable examples under `assets/mini-app/`:

- `services/sample_service.py` — service-layer pattern
- `background_jobs/sample_job.py` — job handler stub
- `api.py` — API response envelope
- `integrations/sample_connector.py` — external connector stub
- `utils/cache.py`, `utils/permissions.py`, `utils/errors.py`, `utils/logging.py`, `utils/validation.py` — cross-cutting helpers

Background jobs, caching, and translations each have their own reference:
[background-jobs.md](background-jobs.md), [queue-patterns.md](queue-patterns.md),
[caching.md](caching.md), [translations.md](translations.md).

## Failure modes / debugging

- **App not found**: check `apps.txt` and `sites/<site>/site_config.json`
- **Import errors**: dotted path in a hook doesn't match the actual module layout
- **Developer mode off**: DocType changes won't export to files — redo step 2

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| Wrong module path in `hooks.py` | Events don't fire | Verify the path matches the actual `my_app/module/file.py` structure |
| Duplicate hook registrations | Events fire multiple times | Use a list, not repeated keys |
| Editing `hooks.py` without restart | Changes not picked up | `bench restart` |
| Missing `__init__.py` | Module import errors | Every package directory needs one |
| Logic in `hooks.py` | Hard to test, import errors | Move logic to a module, import it in `hooks.py` |

## Sources

Verified against Frappe v16.35.0 at `<bench>/apps/frappe`, cross-checked against v15.120.0:
- `apps/frappe/frappe/utils/boilerplate.py:34` — `_get_user_inputs`, the exact 7-prompt sequence and defaults
- `apps/frappe/frappe/utils/boilerplate.py:136` — `_create_app_boilerplate`, generated file/folder layout; `pyproject.toml` write at `:160`, template at `:339`
- `apps/frappe/frappe/commands/utils.py:868` — `make-app` CLI (what `bench new-app` delegates to via `bench/app.py::new_app`)
- `apps/frappe/frappe/commands/testing.py:285` — `run-tests --app`
- `apps/frappe/frappe/utils/data.py:1844` — `get_url` (re-exported at `frappe.utils.get_url`)
- `apps/frappe/frappe/model/base_document.py:190` — `extend_doctype_class` hook resolution (v16-only, absent from v15 baseline)
- `apps/frappe/frappe/__init__.py:1579` — `override_whitelisted_methods` resolution
