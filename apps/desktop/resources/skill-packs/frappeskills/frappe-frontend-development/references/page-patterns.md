# Page Patterns

This guide defines common page layouts and patterns for Frappe/ERPNext applications.

> **Scope.** This file indexes page layout patterns for Frappe/ERPNext applications. Frappe has two native page kinds, documented below: **Desk Pages** (`frappe.pages[...]`, custom full-page apps inside `/desk` (v16) — `/app` on v15, still redirects to `/desk` on v16) and **Web/Portal Pages** (server-rendered pages under `www/` or via `get_context`). For a standalone product UI built as a **frappe-ui (Vue) SPA**, see the List/Detail/Form page patterns in [frappe-ui-spa-page-patterns.md](frappe-ui-spa-page-patterns.md). Pick the right one: standalone product UI → frappe-ui SPA; an admin/tool screen inside Desk → Desk Page; a public/portal page → Web Page.

---

## Desk Page (`frappe.pages`, `frappe.ui.make_app_page`)

A **Desk Page** is a custom full-page screen inside `/desk` (v16; `/app` on v15, redirected on v16 per `hooks.py:website_redirects`), not tied to a DocType. Create the "Page" doctype record (via `bench` or fixtures) which produces a folder `{app}/{module}/page/{page_name}/` with `{page_name}.js` (+ optional `.json`, `.py`, `.html`). Source: `apps/frappe/frappe/public/js/frappe/ui/page.js`.

```javascript
// {app}/{module}/page/my_tool/my_tool.js
frappe.pages["my-tool"].on_page_load = function (wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: __("My Tool"),
    single_column: true,
    card_layout: true,        // wrap content in a card
  });

  frappe.breadcrumbs.add("Setup");

  // page.main is the jQuery content container:
  $("<div class='my-tool-body' style='padding:15px;'></div>").appendTo(page.main);

  wrapper.my_tool = new MyTool(page);
};

// Fires on every route back to the page (on_page_load fires only once):
frappe.pages["my-tool"].on_page_show = function (wrapper) {};
// Some pages also define .refresh:
frappe.pages["my-tool"].refresh = function (wrapper) {};
```

### `page` object API (verified in `ui/page.js`)

| Method | Purpose |
|---|---|
| `page.set_primary_action(label, click, icon?, working_label?)` | Blue primary button |
| `page.set_secondary_action(label, click, icon?, working_label?)` | Secondary button |
| `page.clear_primary_action()` / `page.clear_actions()` | Remove action buttons |
| `page.add_inner_button(label, action, group?, type?, align_right?)` | Button in the inner button bar (grouped) |
| `page.add_button(label, click, opts?)` | Standalone action button |
| `page.add_menu_item(label, click, standard?, shortcut?, show_parent?)` | Item in the "..." menu |
| `page.add_action_item(label, click, standard?)` | Item in the actions dropdown |
| `page.add_action_icon(icon, click, css_class?, tooltip_label?)` | Icon button |
| `page.set_indicator(label, color)` | Status indicator in the header |
| `page.set_title_sub(txt)` | Subtitle under the title |

`frappe.ui.make_app_page(opts)` just does `opts.parent.page = new frappe.ui.Page(opts); return opts.parent.page;`. Useful `opts`: `parent`, `title`, `single_column`, `card_layout`. You can also add a `frappe.ui.form.Layout`/fields, filters (`page.add_field`), or embed a `frappe.views.QueryReport`.

---

## Web / Portal Page (public, server-rendered)

Public-facing pages live under an app's `www/` folder (auto-routed by path) or are built dynamically. Each page is an `.html` (Jinja) template plus an optional same-named `.py` exposing `get_context(context)`. Source dir: `apps/frappe/frappe/www/` (e.g. `about.py`, `contact.py`, `list.py`). `www/desk.py` renders the Desk single-page app itself (v16) — the old `www/app.py`/`www/apps.py` were removed and `/app`, `/apps` now redirect to `/desk`.

```python
# {app}/www/dashboard.py
import frappe

no_cache = 1                      # module-level flags are read by the renderer

def get_context(context):
    if frappe.session.user == "Guest":
        frappe.throw("Login required", frappe.PermissionError)
    context.title = "Dashboard"
    context.orders = frappe.get_all(
        "Sales Order",
        filters={"owner": frappe.session.user},
        fields=["name", "status", "grand_total"],
    )
    # return context (optional) — mutating in place also works
    return context
```

```html
{# {app}/www/dashboard.html — rendered at /dashboard #}
{% extends "templates/web.html" %}
{% block page_content %}
  <h1>{{ title }}</h1>
  <ul>
    {% for o in orders %}
      <li>{{ o.name }} — {{ o.status }} — {{ frappe.format_value(o.grand_total, {"fieldtype": "Currency"}) }}</li>
    {% endfor %}
  </ul>
{% endblock %}
```

Notes (verified against `frappe/www/*.py` and `templates/`):
- File path under `www/` maps to the URL path; `index.html`/`index.md` map to the folder root (`website/router.py:get_page_info`, `page_renderers/template_page.py`).
- Module-level properties read from the `.py` (`WEBPAGE_PY_MODULE_PROPERTIES` in `website/page_renderers/template_page.py`): `base_template_path`, `template`, `no_cache`, `sitemap`, `condition_field`.
- Portal templates extend `templates/web.html` and use blocks like `page_content`, `title`, `head_include`.
- **Web Page** DocType (`frappe/website/doctype/web_page/`) is the no-code alternative: content authored in the DB, rendered via the website router — use it for CMS-style pages, `www/` + `get_context` for code-driven ones.
- For DocType-backed portal listing/detail, ERPNext uses `Web Form` and the generic `www/list.py` / portal item views rather than hand-written templates.

## Sources

- `apps/frappe/frappe/public/js/frappe/ui/page.js` — `frappe.ui.Page`, `frappe.ui.make_app_page`, page action API
- `apps/frappe/frappe/core/page/permission_manager/permission_manager.js` — real `frappe.pages[...].on_page_load` example
- `apps/frappe/frappe/www/` — portal pages (`about.py`, `contact.py`, `list.py`, `desk.py`) using `get_context`
- `apps/frappe/frappe/website/doctype/web_page/` — Web Page DocType (no-code portal pages)
