---
name: fcode-frappe-router
description: "Entry point: which skill to use for each Frappe/ERPNext task in Fcode. Read this first when the task is not obviously a single-skill job."
---

# Fcode Frappe skill router

This file routes work to the right skill. Read it before opening code.

## Skill index

| Task | Skill |
|------|-------|
| Create or modify a DocType, add fields, controller lifecycle hooks | `fcode-doctype-development` |
| Write a `@frappe.whitelist()` API endpoint, permissions, parameterized queries | `fcode-api-development` |
| Edit `hooks.py`, doc_events, scheduler, fixtures | `fcode-app-hooks` |
| Run bench CLI commands (migrate, build, clear-cache) | `fcode-bench-operations` |
| Build a frappe-ui Vue 3 frontend page | `fcode-frappe-ui` |
| Use `fcode_bench_execute`, `fcode_bench_run`, `fcode_canvas*` host tools | `fcode-bench` |
| Edit Studio exported app pages or page scripts | `fcode-studio` |
| Edit Builder standard pages or components | `fcode-builder` |

## Frappe version notes (v15 / v16 / v17)

The active bench's Frappe version is in `apps/frappe/frappe/__init__.py` as
`__version__`. Read it before assuming API shapes.

**v15 → v16 notable changes**
- `frappe.db.get_value` signature unchanged; `frappe.get_cached_doc` available
  since v14.
- `frappe.has_permission(doctype, ptype, doc)` — `throw` keyword removed; call
  `frappe.throw()` explicitly on `False`.
- `frappe.get_list` → `frappe.get_all` is the idiomatic read-only variant.
- Site config lives in `sites/<site>/site_config.json`; shared keys in
  `sites/common_site_config.json`.

**v17 (preview)**
- Requires Python 3.11+, Node 20+.
- No confirmed breaking API changes for custom apps as of the plan date; verify
  against `apps/frappe/CHANGELOG.md` before migration.

## Starting a new custom app

```
bench new-app <app_name>    # scaffolds pyproject.toml, hooks.py, modules.txt
bench --site <site> install-app <app_name>
```

The scaffold places the Python package at `apps/<app_name>/<app_name>/`. Every
DocType, controller, and hook lives inside that package.
