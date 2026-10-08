# Web Forms Reference

A Web Form (`frappe/website/doctype/web_form/web_form.py`, a `WebsiteGenerator`)
renders a public or logged-in form bound to one DocType, without writing any
desk code. This reference covers the doctype schema, the create/read/update/
delete lifecycle, and the client/server scripting API.

## Web Form doctype — key fields

| Field | Notes |
|---|---|
| `title`, `route`, `doc_type` | Target DocType the form creates/edits |
| `module`, `is_standard` | `is_standard = 1` marks a form exported to app files (see below) |
| `introduction_text`, `success_message`, `success_url` | Shown/used after submit |
| `login_required` | Guest access blocked entirely when set |
| `allow_multiple` | Logged-in user may create more than one document |
| `allow_edit`, `allow_delete` | Owner may edit / delete their own submissions |
| `allow_incomplete` | Skip required-field validation on partial saves |
| `allow_print`, `print_format` | Let submitters print their own record |
| `allow_comments` | Show a comment thread on the document |
| `show_list` | Show a list view of the user's own submissions at `/<route>` |
| `list_columns`, `list_title` | Columns/title for that list view |
| `condition_json` | Filters restricting which existing docs a user may access |
| `web_form_fields` | Child table of fields (see below) |
| `custom_css` | Extra CSS scoped to this form |
| `breadcrumbs`, `website_sidebar`, `show_sidebar` | Portal chrome (`website_sidebar` links a Website Sidebar when `show_sidebar` is set) |
| `apply_document_permissions` | Enforce the DocType's own permission rules instead of the form's own owner-only rule |
| `published` | Visibility |
| `client_script` | Jinja-rendered inline JS, only used when `is_standard = 0` (non-standard/DB-only forms); there is no `server_script` field — for standard forms JS/logic lives in files instead (see below) |
| `key_required` | Enables key-based guest access via `Web Form Request` (no login) |
| `anonymous` | Do not attribute a guest submission to a Contact/User |
| `allowed_embedding_domains` | Domains permitted to `<iframe>`-embed this form |

There is no `show_as_card` (or similarly named "card" display) field on `Web
Form` in v15 or v16 — do not reference one.

Source: `frappe/website/doctype/web_form/web_form.json`.

### Web Form Field child table

Each row (`Web Form Field` doctype) is close to a DocField: `fieldname`,
`label`, `fieldtype`, `options`, `reqd`, `read_only`, `hidden`,
`depends_on`, `default`, `description`, `max_length`, `show_in_filter`
(exposes the field as a list-view filter), `allow_read_on_all_link_options`.
`Column Break` and `Section Break` rows control the multi-step layout — a
`Section Break` with `Page Break` starts a new wizard page.

## Creating a Web Form

**Via the desk (DB-only form):**

1. New → Web Form. Set `doc_type` and `route`.
2. Add fields in `web_form_fields` (or click "Get Fields" to pull them from
   the target DocType).
3. Configure `login_required`, `allow_multiple`, `allow_edit`, `allow_delete`
   as needed.
4. Optionally write `client_script` / `server_script` directly on the
   document (only read for `is_standard = 0` forms).

**Standard form exported to app files** (`is_standard = 1`, requires
Developer Mode): on save, Frappe scaffolds
`<app>/<module>/web_form/<scrubbed_name>/`:

- `<name>.json` — the Web Form document itself.
- `<name>.js` — client script; must call `frappe.ready(...)` (auto-created if missing).
- `<name>.py` — server module; must define `get_context(context)` (auto-created if missing).

## Server-side: `get_context(context)`

For a standard web form, `WebForm.add_custom_context_and_script()`
(`frappe/website/doctype/web_form/web_form.py`) calls
**`get_context(context)` in the app's `<name>.py` module** and merges
whatever dict it returns back into the page context. This is the *only*
function the framework calls from that module — there is no framework hook
that calls a `validate(doc)` function from the web form's Python module.

```python
# my_app/my_module/web_form/contact_us/contact_us.py
import frappe

def get_context(context):
    context.no_cache = 1
    context.company_list = frappe.get_all("Company", pluck="name")
    return context
```

Server-side validation of the submitted document (require a field, enforce a
business rule, reject a submission) belongs on the **target DocType**, via a
standard controller hook or `hooks.py doc_events` — the same place it would
live for any other way of creating that document:

```python
# hooks.py
doc_events = {
    "Contact Us Request": {
        "validate": "my_app.my_module.doctype.contact_us_request.contact_us_request.validate_submission",
    }
}
```

```python
# my_app/my_module/doctype/contact_us_request/contact_us_request.py
import frappe
from frappe import _

def validate_submission(doc, method):
    if not doc.email:
        frappe.throw(_("Email is required"))
```

## Client-side: `<name>.js`

The standard form's JS file is loaded and run against a `frappe.web_form`
instance (`WebForm` class, `frappe/public/js/frappe/web_form/web_form.js`).
Register hooks with `frappe.ready(...)`:

```js
frappe.ready(function () {
    // fires when this field's value changes: on(fieldname, handler)
    frappe.web_form.on("status", (field, value) => {
        frappe.web_form.set_df_property("resolution", "reqd", value === "Closed");
    });

    // client-side validation before save; return false (or throw) to block it
    frappe.web_form.validate = () => {
        if (frappe.web_form.get_value("email") && !frappe.web_form.get_value("consent")) {
            frappe.msgprint(__("Please accept the consent checkbox"));
            return false;
        }
        return true;
    };

    frappe.web_form.after_load = () => {
        // form and its fields are ready
    };

    frappe.web_form.after_save = () => {
        frappe.msgprint(__("Thank you for your submission!"));
    };
});
```

`on(fieldname, handler)` binds to that specific field's change event and
calls `handler(field, field.value)` — it is not a generic `"field_change"`
event name. `frappe.web_form.events` is a separate internal event bus that
also fires `"after_load"` / `"after_save"`, which is what `after_load` /
`after_save` are wired through.

Other instance methods commonly used from a script: `get_value(fieldname)`,
`get_values()`, `set_value(fieldname, value)`, `set_df_property(fieldname,
property, value)` (inherited from the shared `FieldGroup` base, e.g.
toggling `reqd`/`hidden`/`read_only` — this already re-renders the field via
an internal `field.refresh()` call, so no separate refresh method is needed),
`validate_section()`. There is no `refresh_field(fieldname)` method on
`frappe.web_form` — that method exists on the desk `Form` class
(`frappe/public/js/frappe/form/form.js`), not the web form's `FieldGroup`
base.

## Whitelisted endpoints

`frappe/website/doctype/web_form/web_form.py` exposes:

- `accept(web_form, data, web_form_request_key=None)` — `POST`/`PUT`,
  `allow_guest=True`, rate-limited (10/min). Saves the submitted document;
  the actual save path this method uses is a real `frappe.get_doc(...).insert()`
  / `.save()`, so ordinary controller `validate`/`before_save` hooks on the
  target DocType still run.
- `delete(web_form_name, docname, web_form_request_key=None)` —
  `POST`/`DELETE`, `allow_guest=True`, rate-limited, honors `allow_delete`.
- `get_web_form_list(...)`, `get_form_data(...)`, `get_web_form_filters(...)`,
  `get_link_options(...)` — read endpoints backing the list view, edit view,
  filters, and link-field autocomplete respectively.

## Guest access without login (`key_required`)

Setting `key_required` (without `login_required`) lets Frappe generate a
per-document `Web Form Request` record with a random key; a link containing
`?web_form_request_key=<key>` grants a specific guest read/edit/delete access
to that one document without requiring a session — used for things like
"complete your onboarding form" emails sent to non-users. Combine with
`anonymous` when the submission should not be tied to a Contact/User record.

## Multi-step forms

A `Section Break` field row with its `Page Break` option checked starts a new
page; the built-in wizard renders a progress indicator and Next/Previous
controls automatically — no extra configuration is required beyond adding
the section breaks.

## Guardrails

- Do not write `validate(doc)` in a standard web form's `<name>.py` expecting
  the framework to call it — it will not run. Validate via `doc_events` on
  the target DocType instead.
- `apply_document_permissions = 0` (default) means access is governed purely
  by the web form's own `login_required`/owner-matching logic, *not* the
  DocType's permission rules — set it to `1` deliberately if you need real
  DocType-level permission checks (roles, user permissions, sharing) enforced
  on top of the web form.
- `client_script` is only read when `is_standard = 0`; editing it on a
  standard (`is_standard = 1`) form has no effect — edit the `.js`/`.py`
  files instead. There is no `server_script` field on Web Form.

## Sources

Verified against Frappe v16.35.0 (`apps/frappe/frappe/__init__.py` `__version__`):

- `apps/frappe/frappe/website/doctype/web_form/web_form.json` — doctype fields; confirmed no `show_as_card`, `sidebar_settings`, `published_score`, or `server_script` fields exist (real fields are `website_sidebar`, `published`, `client_script` only)
- `apps/frappe/frappe/website/doctype/web_form_field/web_form_field.json` — Web Form Field child table fields
- `apps/frappe/frappe/website/doctype/web_form/web_form.py:187,193,603-632` — `get_context(context)` module hook, `add_custom_context_and_script` (only reads `.js`/`.css` files for `is_standard` forms, never a `server_script` field)
- `apps/frappe/frappe/website/doctype/web_form/web_form.py:740-875` — `accept()` (`POST`/`PUT`, `allow_guest=True`, `@rate_limit(limit=10, seconds=60)`, calls real `doc.insert()`/`doc.save()`)
- `apps/frappe/frappe/website/doctype/web_form/web_form.py:878-917` — `delete()`/`delete_multiple()` (`POST`/`DELETE`, `allow_guest=True`, rate-limited)
- `apps/frappe/frappe/website/doctype/web_form/web_form.py:952-1143` — `get_web_form_filters`, `get_web_form_list`, `get_form_data`, `get_link_options`
- `apps/frappe/frappe/website/doctype/web_form_request/` — `Web Form Request` doctype backing `key_required`/`web_form_request_key` guest access
- `apps/frappe/frappe/public/js/frappe/web_form/web_form.js:5,38-52,129,215,381,391,423` — `WebForm extends frappe.ui.FieldGroup`; `on(fieldname, handler)` sets `field.df.change`; `this.validate`/`this.after_load`/`this.after_save` call sites; `validate_section()`; page-break/multi-step handling (`set_page_breaks`, l.71-83)
- `apps/frappe/frappe/public/js/frappe/ui/field_group.js:139-251` — `FieldGroup.get_value`/`get_values`/`set_value`/`set_df_property` (no `refresh_field` method on this base)
- `apps/frappe/frappe/public/js/frappe/form/form.js:1463` — `refresh_field(fname)` exists only on the desk `Form` class, not `FieldGroup`
- https://frappeframework.com/docs/user/en/website/web-form
