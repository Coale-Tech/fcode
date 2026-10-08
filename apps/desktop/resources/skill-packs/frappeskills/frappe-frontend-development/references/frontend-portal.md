# Portal Pages (Public Website)

Server-rendered Jinja templates for public-facing pages. Portals are the
customer-facing or public counterpart to Desk — built with plain web
views/portal pages for simple record exposure, web forms for record
submission without Desk access ([web-forms.md](../../frappe-web-forms/references/web-forms.md)),
or a full frappe-ui SPA ([frappe-ui-setup.md](frappe-ui-setup.md) to scaffold
it, [frappe-ui-components.md](frappe-ui-components.md) for its component/data
API) when the portal needs app-like interactivity. Authenticate with
standard Frappe auth and enforce permissions server-side regardless of
which approach you pick.

## Jinja templates

File: `apps/<app>/<app>/www/<page_name>.html`

```html
{% extends "templates/web.html" %}
{% block page_content %}
<h1>Expenses</h1>
{% for expense in expenses %}
<div>{{ expense.title }} — {{ expense.amount }}</div>
{% endfor %}
{% endblock %}
```

Context via Python:
File: `apps/<app>/<app>/www/<page_name>.py`

```python
import frappe

def get_context(context):
    context.expenses = frappe.get_all("Expense",
        filters={"owner": frappe.session.user},
        fields=["title", "amount"])
```

### Page properties: `no_cache` / `sitemap`

Set these as module-level attributes in the page's `.py` file:

```python
no_cache = 1     # skip website cache for this page
sitemap = 0       # exclude from sitemap.xml / search index
```

Or as HTML comment directives at the top of the `.html` file when there is
no `.py` module:

```html
<!-- no-cache -->
<!-- no-sitemap -->
```

Other supported comment directives (`frappe/website/page_renderers/template_page.py`):
`show-sidebar`, `no-breadcrumbs`, `add-breadcrumbs`, `add-next-prev-links`,
`no-header`.

## Routing resolution

`PathResolver.resolve()` (`frappe/website/path_resolver.py`) tries renderers
in this order for every incoming request, stopping at the first one that
matches:

1. Any custom `page_renderer` hooks (`hooks.py`, app-provided renderer classes).
2. `StaticPage` — a plain static HTML file.
3. `WebFormPage` — a published `Web Form` whose `route` matches.
4. `DocumentPage` — a `WebsiteGenerator` document whose own `route` matches.
5. `TemplatePage` — a `www/<path>.html` (+ optional `.py`) template.
6. `PrintPage` — `/printview` style document print rendering.
7. `ListPage` — an auto-generated list view for a `WebsiteGenerator` doctype.

`website_route_rules` in `hooks.py` maps a custom URL pattern to a
`DocumentPage` lookup before the router falls through to the template path:

```python
website_route_rules = [
    {"from_route": "/expenses/<name>", "to_route": "Expense"},
]

has_website_permission = {
    "Expense": "myapp.permissions.has_website_permission"
}
```

## DocType-backed pages — `WebsiteGenerator`

For a DocType whose records each render as a public page (like `Web Page`, `Help Article`), subclass `WebsiteGenerator` (`frappe/website/website_generator.py`). It manages the `route` field (`set_route` / `make_route` from the title) and cache clearing. Supply template variables by defining `get_context(self, context)` on the controller; the document page renderer calls it if present.

```python
from frappe.website.website_generator import WebsiteGenerator

class Event(WebsiteGenerator):
	def get_context(self, context):
		context.attendees = frappe.get_all("Event Attendee", filters={"event": self.name}, fields=["full_name"])
```

Use `www/` pages (a `.py` with `get_context(context)` next to the template) for one-off pages not tied to records.

## Web forms

For record submission without Desk access, use Frappe's built-in **Web Form**
doctype instead of hand-writing a Jinja template + controller: it renders a
public form for a target doctype, applies the doctype's permissions (or a
dedicated web-form role), and handles create/update/list itself. See
[web-forms.md](../../frappe-web-forms/references/web-forms.md).

## Portal navigation and website context hooks

Register these in `hooks.py` to customize the logged-in user's portal
sidebar and to inject data into every website page's Jinja context
(`frappe/website/doctype/website_settings/website_settings.py`, `frappe/website/utils.py`,
`frappe/website/page_renderers/base_template_page.py`):

```python
# list-of-dict menu items shown in the logged-in "My Account" sidebar;
# cached per user
portal_menu_items = [
    {"title": "My Expenses", "route": "/expenses", "reference_doctype": "Expense"},
]

# seeds Portal Settings' own configurable menu on first install/migrate
standard_portal_menu_items = [
    {"title": "Orders", "route": "/orders", "reference_doctype": "Sales Order"},
]

# dict merged into every website page's Jinja context
website_context = {
    "favicon": "/assets/myapp/images/favicon.ico",
}

# list of functions called with the context dict, for computed values
update_website_context = ["myapp.utils.update_website_context"]
```

## Sources

- `frappe/website/path_resolver.py:38-86` — `PathResolver.resolve()` renderer order
- `frappe/website/page_renderers/template_page.py` — `no_cache`/`sitemap` module properties,
  `COMMENT_PROPERTY_KEY_VALUE_MAP` comment directives
- `frappe/website/website_generator.py` — `WebsiteGenerator.set_route`/`make_route`;
  `frappe/website/doctype/{web_page,help_article}/` for real subclasses (no `Blog Post` doctype
  in this v16.35.0 install — removed from core)
- `frappe/website/page_renderers/document_page.py:64-68` — `get_context` invocation
- `frappe/website/utils.py:464-490` — `portal_menu_items` hook
- `frappe/website/doctype/portal_settings/portal_settings.py:47` — `standard_portal_menu_items` hook
- `frappe/website/doctype/website_settings/website_settings.py:171-241` — `website_context` hook
  (merged via `frappe.get_hooks()`); `frappe/website/page_renderers/base_template_page.py:69-75` —
  `update_website_context` hook
- `frappe/__init__.py:673-676` — `has_website_permission` hook
- `frappe/website/path_resolver.py:225-239` — `website_route_rules` hook
- [Desk UI](https://frappe.io/framework/desk-ui)
- [Frappe UI GitHub](https://github.com/frappe/frappe-ui)
