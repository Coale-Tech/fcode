# Extending Frappe CRM Without Editing Core

Frappe CRM's Vue3 SPA renders forms, lists and kanban boards from
DocType-agnostic components, so the no-core-edit primitives are different
from a plain Desk app: instead of Client Scripts and List View settings you
get three CRM-specific DocTypes plus the standard Frappe `hooks.py`
mechanisms for the backend side.

## CRM Fields Layout

`CRM Fields Layout` (`fcrm/doctype/crm_fields_layout/`) stores the JSON tab
layout the Vue frontend renders for a given DocType + view type. `type` is
one of `Quick Entry`, `Side Panel`, `Data Fields`, `Grid Row`, `Required
Fields` (`crm_fields_layout.json`). The whitelisted
`get_fields_layout(doctype, type, parent_doctype=None)`
(`crm_fields_layout.py`) looks up `{"dt": doctype, "type": type}`; if no
layout row exists it falls back to a generated default from the DocType's
meta. Add or reorder fields shown on a Lead/Deal side panel by writing a
`CRM Fields Layout` row (via fixtures in a custom app) rather than editing
the Vue component that renders it.

## CRM Form Script

`CRM Form Script` (`fcrm/doctype/crm_form_script/`) is the client-script
equivalent for the Vue frontend: `dt` (target DocType), `view` (`Form` or
`List`), `script` (Code field, JS executed by the frontend), `enabled`,
`is_standard`. `is_standard` scripts (shipped by the app) can only have
`enabled` toggled outside developer mode — `validate()`
(`crm_form_script.py`) reverts any other field change and throws unless
`frappe.conf.developer_mode` is set, mirroring how Frappe core protects
standard Client Scripts.

## CRM View Settings

`CRM View Settings` (`fcrm/doctype/crm_view_settings/`) persists a saved
list/kanban view: `type` is `list`, `group_by`, or `kanban`; `columns`,
`rows`, `filters`, `order_by`, `kanban_columns`, `kanban_fields`,
`column_field`, `group_by_field` are all Code fields holding JSON
(`crm_view_settings.json`). `is_standard`/`public`/`pinned`/`user` control
whether a view is a shipped default, shared, pinned, or private to one user.
A DocType controller's `default_list_data()`/`default_kanban_settings()`
static methods (see [crm-data-model.md](crm-data-model.md)) are the
fallback when no `CRM View Settings` row matches yet — that is where a
custom app should add a *default* column/kanban layout for a DocType it
introduces, rather than only shipping a `CRM View Settings` fixture that one
user can edit away.

## override_doctype_class

```python
# hooks.py:154
override_doctype_class = {
    "Contact": "crm.overrides.contact.CustomContact",
    "Email Template": "crm.overrides.email_template.CustomEmailTemplate",
}
```

`CustomContact(Contact)` (`overrides/contact.py`) adds a
`default_list_data()` static method (Contact needs one too, since it's a
first-class list in the CRM sidebar) — this is the pattern for reusing a
Frappe-core DocType inside the CRM UI: subclass it, add the CRM-specific
static methods, register via `override_doctype_class`, do not fork the
DocType. `doc_events["Contact"]["validate"] = ["crm.api.contact.validate"]`
(`hooks.py:165`) adds CRM-only validation on top without needing the class
override for that part.

## doc_events table

Full backend hook map from `hooks.py:163-219` — the extension points a
custom app building on CRM should follow the same shape for, rather than
inventing a new mechanism:

| DocType | Events | Purpose |
|---|---|---|
| `Contact` | `validate` | CRM-specific contact validation |
| `Notification Log` | `before_insert` | routes into `CRM Notification` |
| `ToDo` | `after_insert`, `on_update` | assignment/task sync |
| `Communication` | `after_insert`, `on_update` | email timeline sync |
| `Comment` | `after_insert`, `on_update` | activity feed sync |
| `WhatsApp Message` | `validate`, `on_update` | WhatsApp timeline sync |
| `CRM Deal` | `on_update` | ERPNext Customer creation bridge |
| `Sales Order` | `before_validate` | ERPNext Customer bridge (reverse) |
| `Item`, `User Permission`, `DocShare` | full CRUD set | ERPNext product/permission mirroring |
| `User` | `before_validate`, `validate_reset_password` | live-demo account guards |

`ignore_links_on_delete = ["Failed Lead Sync Log"]` (`hooks.py:270`) lets a
Lead/Contact/Organization be deleted even while a failed sync log still
references it — a log row is diagnostic, not a real link that should block
deletion.

## Sources

Verified against the installed Frappe CRM app:

- `crm/fcrm/doctype/crm_fields_layout/crm_fields_layout.json` — `type` options
- `crm/fcrm/doctype/crm_fields_layout/crm_fields_layout.py` — `get_fields_layout`
- `crm/fcrm/doctype/crm_form_script/crm_form_script.py` — `CRMFormScript.validate`
- `crm/fcrm/doctype/crm_view_settings/crm_view_settings.json` — field list
- `crm/overrides/contact.py` — `CustomContact(Contact)`
- `crm/hooks.py` — `override_doctype_class` (:154), `doc_events` (:163-219), `ignore_links_on_delete` (:270)
