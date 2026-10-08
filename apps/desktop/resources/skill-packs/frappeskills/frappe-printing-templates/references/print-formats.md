# Print Formats, Email Templates & Jinja

Print formats, email templates, portal pages, and PDF export are all rendered
through one Jinja environment (`frappe/utils/jinja.py`). This reference
covers the doctypes involved, the exact context a print format template
receives, which `frappe.*` calls are whitelisted for templates, and PDF
generation.

## Doctypes involved

| Doctype | Purpose | Key fields |
|---|---|---|
| `Print Format` | One print layout for a DocType (or a Report) | `doc_type`, `standard`, `custom_format`, `print_format_type` (`Jinja`/`JS`), `html`, `raw_printing`, `raw_commands`, `format_data` (JSON, builder-generated), `print_format_builder`, `print_format_builder_beta`, `pdf_generator` (`wkhtmltopdf`/`chrome`, default `wkhtmltopdf`), `margin_top/bottom/left/right`, `font`, `font_size`, `page_number`, `css`, `disabled`, `absolute_value`, `align_labels_right`, `show_section_headings`, `line_breaks`, `default_print_language` |
| `Print Settings` | Site-wide single doctype for print defaults | `send_print_as_pdf`, `repeat_header_footer`, `pdf_page_size`/`pdf_page_height`/`pdf_page_width`, `with_letterhead`, `allow_print_for_draft`, `allow_print_for_cancelled`, `add_draft_heading`, `allow_page_break_inside_tables`, `enable_print_server`/`server_printer`, `enable_raw_printing`, `print_style`, `font`, `font_size`, `pdf_generator` |
| `Letter Head` | Header/footer HTML or image for print/PDF | `letter_head_name`, `source` (`Image`/`HTML`), `image`, `content` (header HTML), `footer` (footer HTML), `header_script`, `footer_script`, `is_default`, `disabled` |
| `Print Style` | Reusable named CSS block, selected via Print Settings | `print_style_name`, `css`, `standard`, `disabled` |
| `Print Format Field Template` | Reusable HTML snippet keyed by doctype/field, used by the beta Print Format Builder | `document_type`, `field`, `template` (or `template_file` when `standard`), `module` |

Source: `frappe/printing/doctype/{print_format,print_settings,letter_head,print_style,print_format_field_template}/*.json`.

## Choosing a format type

| Type | How to create | Storage | User-customizable |
|---|---|---|---|
| Standard (auto-generated) | none — Frappe derives it from the DocType layout | not a document | No |
| Print Format Builder (classic) | "New Print Format" → check `print_format_builder` | DB, `format_data` JSON on the `Print Format` doc | Yes (drag-and-drop) |
| Print Format Builder (beta) | check `print_format_builder_beta` | DB; renders via `frappe/utils/weasyprint.py` (WeasyPrint), not the standard Jinja engine | Yes |
| Custom HTML (Jinja) | check `custom_format`, set `print_format_type = Jinja`, write `html` | DB, or exported to files as a standard format | Full control |
| Custom Raw Printing | check `custom_format` + `raw_printing`, write `raw_commands` (Jinja) | DB | For ESC/POS-style printers; rendered but sent as text, not HTML/PDF |

### Create a Jinja print format

1. Awesomebar → "New Print Format".
2. Set a unique name and the target `doc_type`.
3. Check `custom_format`. Set `print_format_type = Jinja`.
4. Write the `html` field.
5. Optionally check `standard = Yes` with Developer Mode on to export it as files
   instead of a database record — see below.

### Standard format file export

When `standard = Yes` and the format's module is not a "custom" module,
Frappe looks for the template on disk before the `html` field
(`frappe/www/printview.py::get_print_format`):

```
<app>/<module>/print_format/<scrubbed_name>/<scrubbed_name>.html
```

If that file is missing it falls back to `raw_commands` (when `raw_printing`)
or the `html` field, then raises `frappe.TemplateNotFoundError`.

```jinja
<div class="print-format">
    <h1>{{ doc.name }}</h1>
    <p><strong>{{ _("Customer") }}:</strong> {{ doc.customer }}</p>
    <p><strong>{{ _("Date") }}:</strong> {{ frappe.format_date(doc.transaction_date) }}</p>

    <table class="table table-bordered">
        <thead>
            <tr>
                <th>{{ _("Item") }}</th>
                <th>{{ _("Qty") }}</th>
                <th class="text-right">{{ _("Amount") }}</th>
            </tr>
        </thead>
        <tbody>
            {% for item in doc.items %}
            <tr>
                <td>{{ item.item_name }}</td>
                <td>{{ item.qty }}</td>
                <td class="text-right">{{ frappe.format(item.amount, {'fieldtype': 'Currency'}) }}</td>
            </tr>
            {% endfor %}
        </tbody>
    </table>
</div>
```

## Template context

`get_rendered_template` (`frappe/www/printview.py`) builds this context dict
for every Jinja print format render:

| Variable | Contents |
|---|---|
| `doc` | The full `Document` object being printed (`in_print` flag set, `print_heading`/`sub_heading` guaranteed present) |
| `meta` | `frappe.get_meta(doc.doctype)` |
| `layout` | Hierarchical field layout built by `make_layout()` — only populated for the standard/builder path, not needed in a custom Jinja format |
| `letter_head` | Rendered letter head HTML (already passed through Jinja with `{"doc": doc.as_dict()}`), or `None` |
| `footer` | Rendered letter head footer HTML, or `None` |
| `no_letterhead` | Whether the letterhead is suppressed for this render |
| `trigger_print` | Truthy when the browser should auto-open the print dialog |
| `print_settings` | `Print Settings` as a dict, merged with any per-call overrides |

Before rendering, the controller's `before_print(print_settings)` method (if
defined) runs on `doc`, and draft/cancelled documents are blocked unless
`Print Settings.allow_print_for_draft` / `allow_print_for_cancelled` is set.

## Whitelisted `frappe.*` API in templates

Templates run in a `jinja2.sandbox.SandboxedEnvironment` (`frappe/utils/jinja.py::_get_jenv`)
with `undefined=DebugUndefined` (undefined variables render as
`{{ varname }}` rather than raising). The `frappe` object available inside a
template is **not** the real Python module — it is a restricted namespace
built by `frappe/utils/safe_exec.py`.

By default (site config key `disable_render_safe_exec` unset or `0`), Jinja
gets the **same globals as Server Scripts** (`get_safe_globals` /
`exec_safe_globals`): `frappe.get_doc` returns a real `Document`,
`frappe.get_meta` returns a real `Meta` (so `meta.get_field('status')`
works), and `frappe.sendmail`, `frappe.get_print`, `frappe.attach_print`,
`frappe.enqueue`, `frappe.new_doc`, `frappe.delete_doc` are all callable from
a template. If a site sets `disable_render_safe_exec: 1` in
`common_site_config.json`, templates fall back to the narrower
`render_safe_globals()`: `get_doc`/`get_last_doc`/`get_cached_doc` return a
`SafeDoc` (dict-like, no arbitrary methods), `get_meta` returns a plain dict
(`meta.get_field(...)` then fails), and `sendmail`/`get_print`/`attach_print`/
`enqueue`/`call` are not available at all. Both modes exist in v15 too — this
is a site-level hardening switch, not new in v16.

**Data fetching:**

```jinja
{% set customer = frappe.get_doc('Customer', doc.customer) %}
{{ customer.customer_name }}

{# get_all always ignores permissions (limit_page_length=0 unless given) #}
{% set open_orders = frappe.get_all('Sales Order',
    filters={'customer': doc.customer, 'status': 'To Deliver and Bill'},
    fields=['name', 'grand_total'],
    order_by='creation desc',
    page_length=5) %}

{# get_list is permission-aware #}
{% set my_tasks = frappe.get_list('Task', filters={'owner': frappe.session.user}) %}

{% set abbr = frappe.db.get_value('Company', doc.company, 'abbr') %}
{% set timezone = frappe.db.get_single_value('System Settings', 'time_zone') %}
{% set meta = frappe.get_meta('Task') %}
```

**Formatting** (`frappe.format` is an alias for `frappe.format_value`):

```jinja
{{ frappe.format(50000, {'fieldtype': 'Currency'}) }}
{{ frappe.format_date(doc.posting_date) }}
```

**Session, request, translation:**

```jinja
{{ frappe.session.user }}
{{ frappe.get_fullname() }}
{{ frappe.lang }}
{{ frappe.form_dict.get('search') }}
<input type="hidden" name="csrf_token" value="{{ frappe.session.csrf_token }}">
{{ _("Translatable string") }}
```

**URLs and rendering:**

```jinja
<a href="{{ frappe.get_url() }}/desk/sales-order/{{ doc.name }}">View Order</a> <!-- (v16) desk prefix is /desk; v15 used /app, /app still redirects -->
{{ frappe.render_template('templates/includes/footer.html', {}) }}
```

**Dozens of `frappe.utils.data` helpers** are exposed under `frappe.utils.*`
(`frappe/utils/safe_exec.py::VALID_UTILS`) — dates (`add_days`, `date_diff`,
`getdate`, `nowdate`), numbers (`flt`, `cint`, `fmt_money`,
`money_in_words`), strings (`strip_html`, `escape_html`, `md_to_html`), and
URLs (`get_url`, `get_link_to_form`). Prefer these over hand-rolled Jinja
string logic.

## Extending the Jinja API from an app

Register custom whitelisted globals and filters in `hooks.py`:

```python
jinja = {
    "methods": ["my_app.utils.jinja.get_active_promotions"],
    "filters": ["my_app.utils.jinja.currency_symbol"],
}
```

A module path (rather than a function path) exposes every function in that
module as a global — this is how Frappe registers its own built-ins
(`jinja = {"methods": "frappe.utils.jinja_globals", "filters": [...]}` in
`frappe/hooks.py`). Frappe's own filter hooks are `global_date_format`,
`markdown`, and `abs_url`. Custom filters registered this way, plus the
built-in `json`, `len`, `int`, `str`, `flt` filters, come from
`frappe/utils/jinja.py::set_filters`.

## Built-in template helpers (`frappe/utils/jinja_globals.py`)

These are bare globals (no `frappe.` prefix) available in every template:

- `include_script(path)`, `include_style(path, rtl=None)`, `include_icons(path)` — emit `<script>`/`<link>`/icon-sprite tags for a bundled asset, resolving RTL and cache-busted URLs.
- `web_block(template, values=None, **kwargs)` / `web_blocks(blocks)` — render one or more reusable "web block" templates.
- `get_dom_id(seed=None)` — a random `id-xxxxxxxxxxxx` string.
- `is_rtl(rtl=None)` — whether the current language is right-to-left.
- `resolve_class(*classes)` — normalize a mix of strings/lists/dicts into a CSS class string (Vue-style class binding).

## Jinja syntax quick reference

```jinja
{{ doc.title }}              {# attribute/item access #}
{{ name|upper }}              {# filter #}

{% for item in items %}
  {{ loop.index }} {{ loop.first }} {{ loop.last }}
{% else %}
  No items found
{% endfor %}

{% if doc.status == 'Open' %}...{% elif doc.status == 'Closed' %}...{% else %}...{% endif %}
{% set total = 0 %}

{% extends "templates/web.html" %}
{% block content %}{{ super() }}{% endblock %}

{% include "templates/includes/header.html" %}
{% from "templates/macros.html" import input_field %}

{% macro field_row(label, value) %}
<tr><td>{{ _(label) }}</td><td>{{ value }}</td></tr>
{% endmacro %}
```

## Built-in Jinja filters

Standard Jinja2 filters (`upper`, `lower`, `title`, `truncate`, `striptags`,
`safe`, `join`, `length`, `first`, `last`, `default`, `dictsort`, `round`,
`int`, `tojson`) are all available, plus Frappe's `json`, `len`, `str`,
`flt` and the hook filters `global_date_format`, `markdown`, `abs_url`.

## Email templates

Two mechanisms exist:

1. **`Email Template` doctype** — a DB record with `subject`/`response`
   Jinja fields, rendered via `frappe.get_email_template(name, doc)`
   (`frappe/email/doctype/email_template/email_template.py`).
2. **File-based** — `frappe.sendmail(..., template="order_confirmation", args={"doc": doc})`
   looks up `templates/emails/order_confirmation.html` (and an optional
   `.txt` sibling for the plain-text part) in each installed app
   (`frappe/utils/jinja.py::get_email_from_template`).

```jinja
Dear {{ doc.customer_name }},

Your order {{ doc.name }} has been confirmed.
{% for item in doc.items %}
- {{ item.item_name }} x {{ item.qty }}
{% endfor %}

Total: {{ frappe.format(doc.grand_total, {'fieldtype': 'Currency'}) }}
```

## Generate PDFs programmatically

```python
import frappe

pdf_content = frappe.get_print(
    doctype="Sales Invoice",
    name="SINV-001",
    print_format="Custom Invoice",
    as_pdf=True,
)

frappe.attach_print(
    doctype="Sales Invoice",
    name="SINV-001",
    print_format="Custom Invoice",
    file_name="invoice.pdf",
)

frappe.sendmail(
    recipients=["customer@example.com"],
    subject="Your Invoice",
    message="Please find attached your invoice.",
    attachments=[{"fname": "invoice.pdf", "fcontent": pdf_content}],
)
```

`frappe.get_print(doctype, name, print_format=None, style=None, as_pdf=False,
doc=None, output=None, no_letterhead=0, password=None, pdf_options=None,
letterhead=None, pdf_generator=None)` renders the printview page internally
and, for `as_pdf=True`, hands the HTML to a PDF generator
(`frappe/utils/print_utils.py`).

### PDF generators

`Print Format.pdf_generator` (and `Print Settings.pdf_generator`) selects
between two engines:

- **`wkhtmltopdf`** (default) — `frappe.utils.pdf.get_pdf()`, wraps `pdfkit`.
- **`chrome`** (v16) — `frappe.utils.pdf.get_chrome_pdf()`, a headless-Chrome
  PDF generator built into core (`frappe/utils/pdf_generator/{browser,chrome_pdf_generator,cdp_connection,page,pdf_merge}.py`).
  In v15, `pdf_generator: "chrome"` only worked if an external app (e.g.
  `print_designer`) registered a `pdf_generator` hook — v15 core has no
  `frappe/utils/pdf_generator/` package. The hook mechanism
  (`frappe.get_hooks("pdf_generator")`, called from `get_print` when
  `pdf_generator != "wkhtmltopdf"`) still exists in v16 for apps that want to
  plug in a third engine.

```python
from frappe.utils.pdf import get_pdf

html = frappe.get_print("Sales Order", name, print_format="My Format")
pdf = get_pdf(html)  # wkhtmltopdf path directly
```

## Letter Head

- `Letter Head.source` is `Image` or `HTML`. For `HTML`, `content` (header)
  and `footer` are Jinja templates rendered with `{"doc": doc.as_dict()}`
  before being inlined into the print output; `header_script`/`footer_script`
  are appended as raw `<script>` tags.
- Resolution order (`frappe/www/printview.py::get_letter_head`): the
  document's own `letter_head` field, else the `Letter Head` with
  `is_default = 1`, else none.
- `no_letterhead` (print URL/`get_print` arg) suppresses it entirely;
  otherwise it defaults from `Print Settings.with_letterhead`.

## Security notes

- **Autoescaping is off.** The sandboxed Jinja environment does not set
  `autoescape=True` (`frappe/utils/jinja.py::_get_jenv`), so `{{ doc.field }}`
  emits raw HTML. Escape user-generated content explicitly with
  `{{ value | e }}` (or wrap trusted-only HTML with `|safe` to make that
  intent explicit) — do not rely on Frappe to auto-escape for you.
- The environment is a `SandboxedEnvironment` subclass that blocks
  `UNSAFE_ATTRIBUTES` (dunder/private attribute access), but with the
  default (unrestricted) globals a template can still call `frappe.sendmail`,
  `frappe.get_print`, and mutate documents through the real `frappe.get_doc` —
  treat print format / email template editing as a privileged action, same as
  a Server Script.
- `frappe.get_all` always ignores permissions; use `frappe.get_list` when the
  result must respect the viewing user's access.

## Pitfalls

- **Missing fields**: guard with `{{ doc.field or '' }}` or `{% if doc.field %}`; `DebugUndefined` prints the raw `{{ expr }}` for genuinely undefined names, and `None` prints as the string `None`.
- **PDF styling**: prefer inline styles and `<table>` layout; wkhtmltopdf and Chrome print differ from a modern browser in flex/grid support.
- **Template syntax errors**: check `{{ }}` / `{% %}` delimiters and unclosed blocks; preview in Print View before exporting PDF.
- **Standard format not picking up file changes**: confirm the module is not a "custom" module and the path matches `<module>/print_format/<scrubbed_name>/<scrubbed_name>.html` exactly.

## Sources

Verified against Frappe v16.35.0 (`apps/frappe/frappe/__init__.py` `__version__`):

- `apps/frappe/frappe/printing/doctype/{print_format,print_settings,letter_head,print_style,print_format_field_template}/*.json` — doctype fields, `pdf_generator` options (`wkhtmltopdf`/`chrome`, default `wkhtmltopdf`)
- `apps/frappe/frappe/www/printview.py` — `get_print_format` (standard format file lookup and fallback order), `get_rendered_template` (context dict: `doc`, `meta`, `layout`, `no_letterhead`, `trigger_print`, `letter_head`, `footer`, `print_settings`), `get_letter_head` (resolution order)
- `apps/frappe/frappe/utils/jinja.py` — `_get_jenv`/`get_jenv` (`FrappeSandboxedEnvironment`, `DebugUndefined`, no `autoescape`), `get_email_from_template`, `set_filters`
- `apps/frappe/frappe/utils/safe_exec.py` — `get_safe_globals` (alias of `exec_safe_globals`, l.1016), `render_safe_globals`, `VALID_UTILS`, `UNSAFE_ATTRIBUTES`, `RENDER_EXEC_CONFIG_KEY = "disable_render_safe_exec"`
- `apps/frappe/frappe/utils/jinja_globals.py` — `include_script`, `include_style`, `include_icons`, `web_block`/`web_blocks`, `get_dom_id`, `is_rtl`, `resolve_class`
- `apps/frappe/frappe/hooks.py:158-164` — core `jinja` hook registration (`global_date_format`, `markdown`, `abs_url` filters)
- `apps/frappe/frappe/email/doctype/email_template/email_template.json`, `apps/frappe/frappe/email/doctype/email_template/email_template.py:70` — `get_email_template`
- `apps/frappe/frappe/utils/print_utils.py:15` — `get_print` signature; `:80` — `pdf_generator` hook lookup for third-party engines
- `apps/frappe/frappe/utils/pdf.py` — `get_pdf` (wraps `pdfkit`), `get_chrome_pdf`
- `apps/frappe/frappe/utils/pdf_generator/` — `browser.py`, `cdp_connection.py`, `chrome_pdf_generator.py`, `page.py`, `pdf_merge.py`
- https://frappeframework.com/docs/user/en/api/jinja
- https://jinja.palletsprojects.com/en/3.1.x/templates/
