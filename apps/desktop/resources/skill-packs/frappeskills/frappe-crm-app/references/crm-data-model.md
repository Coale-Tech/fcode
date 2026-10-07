# Frappe CRM Data Model

Frappe CRM (`crm`, app title "Frappe CRM") is a standalone product built on
Frappe Framework and frappe-ui — not the same thing as ERPNext's bundled
`crm` module (Lead/Opportunity, see
[erpnext-selling-buying.md](../../frappe-erpnext-hrms/references/erpnext-selling-buying.md)).
Every DocType here is prefixed `CRM ` and lives under `crm/fcrm/doctype/`.

## Pipeline: Lead and Deal

`CRM Lead` and `CRM Deal` are the two pipeline objects; a Lead converts into a
Deal once qualified, it does not go through an Opportunity stage.

`CRM Lead` key fields: `status` (Link to `CRM Lead Status`), `lead_owner`,
`source` (Link to `CRM Lead Source`), `organization`, `converted` (Check),
`industry`, `territory`, plus an SLA block (`sla`, `sla_status`,
`response_by`, `first_response_time`, `first_responded_on`,
`communication_status`) and `status_change_log`
(`fcrm/doctype/crm_lead/crm_lead.json`).

`CRM Deal` key fields: `organization`, `deal_owner`, `status` (Link to
`CRM Deal Status`), `probability`, `next_step`, `lead` (back-reference to the
originating Lead), `contacts` (child table `CRM Contacts`), plus the same SLA
block as Lead (`fcrm/doctype/crm_deal/crm_deal.json`).

## Lead → Deal conversion

```python
# fcrm/doctype/crm_lead/crm_lead.py:523
@frappe.whitelist()
def convert_to_deal(lead, doc=None, deal=None, existing_contact=None, existing_organization=None):
    ...
```

Sequence: permission check (`frappe.has_permission("CRM Lead", "write",
lead)` unless the caller set `doc.flags.ignore_permissions`) → sets
`CRM Lead.status = "Qualified"` and `converted = 1` via `db_set` (no
`validate` re-run) → `lead.create_contact(...)` and
`lead.create_organization(...)` → `lead.create_deal(contact, organization,
deal)`.

`create_deal` (`crm_lead.py:337`) copies every Lead field to the new Deal
except a fixed `restricted_fieldtypes` list (Tab Break, Section Break, Column
Break, HTML, Button, Attach) and a fixed `restricted_map_fields` list
(`name`, `naming_series`, `status`, `sla`/SLA fields, `status_change_log`,
etc. — status and SLA state do **not** carry over blindly). Field-name
translation goes through `get_deal_fieldname`:

1. `LEAD_DEAL_FIELD_MAP = {"lead_owner": "deal_owner"}` (`crm_lead.py:18`) —
   the one hardcoded rename.
2. Same fieldname on both DocTypes — direct copy.
3. A custom field (`fieldname` starts with `custom_`, or `is_custom_field`)
   with a **matching label and fieldtype** on the Deal side — matched by
   `is_matching_custom_field` (`crm_lead.py:565`), and only if exactly one
   Deal field matches.

A custom Lead field only survives conversion into a custom Deal field with
the identical label and fieldtype — renaming one side without the other
silently drops the value.

Deal SLA state carries over only if the Lead had already received a first
response (`self.first_responded_on`); otherwise the new Deal starts its own
SLA clock. Any user assigned to the Lead (via `get_assigned_users`) is
re-assigned to the new Deal unless they are already its `deal_owner`.

## Supporting DocTypes

- `CRM Organization` / `CRM Contacts` (child table linking a Lead/Deal to one
  or more `Contact` records) — Contact itself is Frappe core's `Contact`,
  extended via `override_doctype_class` (see
  [crm-customization.md](crm-customization.md)), not a CRM-specific DocType.
- `CRM Lead Status`, `CRM Deal Status`, `CRM Lead Source`, `CRM Lost Reason`,
  `CRM Industry`, `CRM Territory` — simple lookup/master DocTypes; a Deal
  reaching a lost status records the reason via `validate_lost_reason` on
  the source doctype's controller.
- `CRM Task`, `fcrm Note` — per-record task/note child records, independent
  of Frappe's generic `ToDo`/`Comment` (which CRM also hooks into for
  assignment and activity-feed purposes, see
  [crm-customization.md](crm-customization.md)).
- `CRM Call Log`, `CRM Telephony Agent`, `CRM Telephony Phone` — call
  records and agent/phone-number registration for the telephony
  integrations (see [crm-integrations.md](crm-integrations.md)).
- `CRM Notification` — in-app notification feed, with its own
  `permission_query_conditions`/`has_permission` hooks
  (`fcrm/doctype/crm_notification/crm_notification.py`).
- `CRM Dashboard`, `CRM Sales Hierarchy` — reporting rollups and the
  org-hierarchy tree consumed by the permission model (see
  [crm-permissions-sla.md](crm-permissions-sla.md)).

## Default list and kanban views

Every pipeline DocType ships a `default_list_data()` and
`default_kanban_settings()` static method on its controller
(`crm_lead.py:447`, `:514`) returning the columns/rows JSON and kanban
`column_field`/`title_field`/`kanban_fields` the frontend falls back to when
no `CRM View Settings` record exists yet for that user — e.g. Lead's kanban
groups by `status` with `lead_name` as the card title. A DocType-specific
default view lives in Python next to the controller, not hardcoded in the
Vue frontend.

## Sources

Verified against the installed Frappe CRM app (`crm/fcrm/doctype/`):

- `crm_lead/crm_lead.json` — Lead field list
- `crm_deal/crm_deal.json` — Deal field list
- `crm_lead/crm_lead.py` — `convert_to_deal` (:523), `create_deal` (:337), `get_deal_fieldname`/`is_matching_custom_field` (:551-577), `LEAD_DEAL_FIELD_MAP` (:18), `default_list_data`/`default_kanban_settings` (:447, :514)
- Directory listing: `crm/fcrm/doctype/` — full DocType inventory
- `crm/fcrm/doctype/crm_notification/crm_notification.py` — permission hooks referenced from `hooks.py:141,147`
