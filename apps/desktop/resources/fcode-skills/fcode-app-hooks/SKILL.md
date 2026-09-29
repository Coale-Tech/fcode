---
name: fcode-app-hooks
description: "Edit hooks.py: doc_events, scheduler_events, fixtures, app_include, website_route_rules, and other Frappe hook points."
---

# App hooks

All hooks live in `apps/<app>/<app>/hooks.py`. Frappe merges hooks from all
installed apps; order matches `apps.txt` (last writer wins for single-value
hooks, lists are concatenated).

## Doc events

```python
doc_events = {
    "Sales Order": {
        "on_submit": "myapp.mymodule.events.sales_order_on_submit",
        "on_cancel": "myapp.mymodule.events.sales_order_on_cancel",
    },
    "*": {
        "after_insert": "myapp.mymodule.events.log_creation",
    },
}
```

The handler receives `(doc, method)`:

```python
def sales_order_on_submit(doc, method):
    if doc.grand_total > 100_000:
        notify_approver(doc)
```

## Scheduler events

```python
scheduler_events = {
    "daily": ["myapp.mymodule.tasks.daily_cleanup"],
    "hourly": ["myapp.mymodule.tasks.refresh_cache"],
    "cron": {
        "0 9 * * 1-5": ["myapp.mymodule.tasks.weekday_morning_report"],
    },
}
```

Built-in keys: `all` (every ~1min), `hourly`, `daily`, `weekly`, `monthly`,
`yearly`, and `cron`.

## Fixtures

Fixtures are JSON files in `<app>/fixtures/` that are imported on
`bench migrate`. Declare them:

```python
fixtures = [
    "Custom Field",
    {"dt": "Property Setter", "filters": [["doc_type", "=", "Customer"]]},
]
```

Export with:
```
bench --site <site> export-fixtures
```

## Common hooks

```python
# JS/CSS loaded in the Frappe Desk
app_include_js = ["/assets/myapp/js/myapp.bundle.js"]
app_include_css = ["/assets/myapp/css/myapp.bundle.css"]

# JS loaded only in website (public pages)
web_include_js = ["/assets/myapp/js/website.js"]

# Override a core Jinja template
override_whitelisted_methods = {
    "frappe.desk.form.utils.get_pdf": "myapp.utils.get_pdf",
}

# Website route
website_route_rules = [
    {"from_route": "/myapp/<path:app_path>", "to_route": "myapp"},
]

# After app install / migrate
after_install = "myapp.setup.install.after_install"
after_migrate = ["myapp.patches.runner.run_pending"]
```

## Applying changes

After editing `hooks.py`:
- New `doc_events` / `scheduler_events`: take effect immediately (Frappe reads
  them at runtime).
- New `fixtures`: `bench --site <site> migrate` to import them.
- New JS/CSS bundles: `bench build --app <app>` then hard-refresh.
- New `website_route_rules`: `bench --site <site> clear-cache`.
