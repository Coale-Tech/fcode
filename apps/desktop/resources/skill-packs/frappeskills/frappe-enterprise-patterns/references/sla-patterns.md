# SLA Implementation Patterns

## Overview

Frappe core ships **no** SLA doctype, no breach-detection job, and no
business-hours calendar. Service Level Agreements are an application-layer
concept in this ecosystem:

- **ERPNext** (Support module) ships a real `Service Level Agreement` doctype
  (`erpnext/support/doctype/service_level_agreement`) plus `Service Level
  Priority`, `Service Day`, `Pause SLA On Status`, and `SLA Fulfilled On
  Status` child tables, wired into the `Issue` doctype.
- **Frappe Helpdesk** ships its own `HD Service Level Agreement`.
- **Frappe CRM** ships its own `CRM Service Level Agreement`, generic over
  `apply_on` (any DocType, not hardcoded to one), with a `condition`/
  `condition_json` dual-field pattern worth reusing even outside CRM — see
  [SLA condition builder pattern](#sla-condition-builder-pattern) below and
  [frappe-crm-app/references/crm-permissions-sla.md](../../frappe-crm-app/references/crm-permissions-sla.md)
  for full details.

**If any of these apps is installed, reuse its doctype** — do not reinvent SLA
tracking against a doctype name (`Service Level Agreement`) that may already
exist in the site with a different shape than the one below.

The rest of this page is a **build-your-own** design for a standalone Frappe
app that has neither ERPNext nor Helpdesk installed, using only verified core
primitives. Field names below (`sla_name`, `response_time`, etc.) are an
example design, not a copy of ERPNext's actual schema — rename your own
doctype (e.g. `App SLA`) to avoid colliding with ERPNext's `Service Level
Agreement` if that app is ever installed alongside yours.

## Example SLA doctype design

### Main SLA definition

```json
{
  "doctype": "DocType",
  "name": "App SLA",
  "fields": [
    {"fieldname": "sla_name", "fieldtype": "Data", "reqd": 1},
    {"fieldname": "enabled", "fieldtype": "Check", "default": "1"},
    {"fieldname": "document_type", "fieldtype": "Link", "options": "DocType", "reqd": 1},
    {"fieldname": "is_default", "fieldtype": "Check"},
    {"fieldname": "condition", "fieldtype": "Code", "options": "PythonExpression"},
    {"fieldname": "apply_sla_for_resolution", "fieldtype": "Check"},
    {"fieldname": "priorities", "fieldtype": "Table", "options": "App SLA Priority"}
  ]
}
```

`fieldtype: "Code"` with `"options": "PythonExpression"` is the real option
Frappe core uses for editable Python-expression fields (see
`assignment_rule.json`'s `assign_condition` and Notification's `condition`) —
it is not a made-up option.

### SLA Priority child table

```json
{
  "doctype": "DocType",
  "name": "App SLA Priority",
  "istable": 1,
  "fields": [
    {"fieldname": "priority", "fieldtype": "Link", "options": "..."},
    {"fieldname": "response_time", "fieldtype": "Duration"},
    {"fieldname": "resolution_time", "fieldtype": "Duration"}
  ]
}
```

`Duration` is a real Frappe fieldtype (stored as seconds); `Link` `options`
should point at your own priority doctype/Select, not a doctype that doesn't
exist in your app.

## SLA condition builder pattern

A `condition` field typed `Code`/`PythonExpression` (as above) is powerful
but not user-friendly to hand-edit. Frappe CRM's real
`CRM Service Level Agreement` doctype pairs it with a second, parallel
field: `condition_json` (also `Code`), populated by a visual rule-builder
widget in its frontend. Verified from the installed app
(`crm/fcrm/doctype/crm_service_level_agreement/`):

- The visual builder writes both fields: it compiles whatever rule tree the
  user assembles into a plain Python boolean expression string, saved to
  `condition` — and separately serializes its own JSON rule-tree
  representation to `condition_json`, purely so the widget can rehydrate
  itself when the record is reopened.
- **Only `condition` is ever evaluated server-side.** CRM's
  `validate_condition()` calls `frappe.safe_eval(self.condition, None,
  get_context(temp_doc))` at save time — `condition_json` never reaches
  `safe_eval` anywhere in the app. Editing `condition_json` directly (e.g.
  via the API or a data migration) with no matching `condition` update has
  no effect on SLA behaviour.
- The same doctype reuses the identical pair on `Assignment Rule`: CRM's own
  `install.py` adds `assign_condition_json`/`unassign_condition_json`
  custom fields alongside Assignment Rule's real, evaluated
  `assign_condition`/`unassign_condition` fields
  (`crm/install.py:558-608`).

**Reuse this shape** whenever a condition field needs a visual builder: add
one hidden `<fieldname>_json` `Code` field next to the real evaluated
expression field, have the builder widget write both, and never evaluate
the `_json` field server-side — it is UI state, not logic.

## SLA application logic

Every function below only calls verified Frappe APIs:
`frappe.get_all`, `frappe.get_doc`, `frappe.safe_eval` (signature
`safe_eval(code, eval_globals=None, eval_locals=None)`,
`frappe/utils/safe_exec.py`), and `frappe.utils.add_to_date` /
`now_datetime` / `time_diff_in_seconds` (`frappe/utils/data.py`).

```python
# sla_controller.py
import frappe
from frappe.utils import now_datetime, time_diff_in_seconds, add_to_date

class SLAController:
    def __init__(self, doc):
        self.doc = doc
        self.sla = self.get_applicable_sla()

    def get_applicable_sla(self):
        """Find the first enabled SLA matching the document's condition."""
        slas = frappe.get_all("App SLA",
            filters={"document_type": self.doc.doctype, "enabled": 1},
            order_by="is_default asc")  # non-default rows checked first

        for sla in slas:
            sla_doc = frappe.get_doc("App SLA", sla.name)
            if self.check_sla_condition(sla_doc):
                return sla_doc
        return None

    def check_sla_condition(self, sla):
        if not sla.condition:
            return True
        return frappe.safe_eval(sla.condition, eval_locals={"doc": self.doc})

    def apply_sla(self):
        if not self.sla:
            return

        priority_row = self.get_priority_row()
        if not priority_row:
            return

        now = now_datetime()
        if priority_row.response_time:
            self.doc.response_by = self.calculate_due_date(now, priority_row.response_time)
        if self.sla.apply_sla_for_resolution and priority_row.resolution_time:
            self.doc.resolution_by = self.calculate_due_date(now, priority_row.resolution_time)

        self.doc.app_sla = self.sla.name

    def get_priority_row(self):
        for row in self.sla.priorities:
            if row.priority == self.doc.priority:
                return row
        return None

    def calculate_due_date(self, start, duration_seconds):
        support_hours = self.get_support_hours()
        if support_hours:
            return self.calculate_with_support_hours(start, duration_seconds, support_hours)
        return add_to_date(start, seconds=duration_seconds)
```

`Document.response_by`/`resolution_by`/`app_sla` above are fields you add to
your own target doctype — they are not inherited from anywhere.

## Business hours

Frappe core has no `Support Hours`/business-calendar doctype. ERPNext's real
equivalent is the `Service Day` child table on its `Service Level Agreement`
(field `support_and_resolution`), holding `workday` (Select of weekday
names), `start_time`, and `end_time` (Time fields). If you are not depending
on ERPNext, design your own child table the same shape:

```json
{
  "doctype": "DocType",
  "name": "App SLA Day",
  "istable": 1,
  "fields": [
    {"fieldname": "workday", "fieldtype": "Select",
     "options": "Monday\nTuesday\nWednesday\nThursday\nFriday\nSaturday\nSunday"},
    {"fieldname": "start_time", "fieldtype": "Time"},
    {"fieldname": "end_time", "fieldtype": "Time"}
  ]
}
```

```python
def calculate_business_hours(start_dt, end_dt, day_rows):
    """Elapsed business-hours seconds between two datetimes, given a list of
    App SLA Day rows for the applicable SLA."""
    from datetime import datetime, timedelta, time

    total_seconds = 0
    current = start_dt
    by_day = {row.workday: row for row in day_rows}

    while current < end_dt:
        day_row = by_day.get(current.strftime("%A"))
        if day_row:
            day_start = datetime.combine(current.date(), day_row.start_time)
            day_end = datetime.combine(current.date(), day_row.end_time)
            overlap_start = max(current, day_start)
            overlap_end = min(end_dt, day_end)
            if overlap_start < overlap_end:
                total_seconds += (overlap_end - overlap_start).total_seconds()
        current = datetime.combine(current.date() + timedelta(days=1), time.min)

    return total_seconds
```

## SLA breach detection

Run this from a scheduled job registered in `hooks.py`'s `scheduler_events`
(e.g. under `"cron"` or `"all"`; see
[references/background-jobs.md](../../frappe-app-development/references/background-jobs.md)
for the hook syntax — `frappe/utils/scheduler.py` is what invokes these
handlers).

```python
def check_sla_breaches():
    """Scheduled job to check for SLA breaches."""
    now = now_datetime()

    breached_response = frappe.get_all("Ticket", filters={
        "status": ["not in", ["Closed", "Resolved"]],
        "first_responded_on": ["is", "not set"],
        "response_by": ["<", now],
    })
    for doc in breached_response:
        mark_sla_breach(doc.name, "response")

    breached_resolution = frappe.get_all("Ticket", filters={
        "status": ["not in", ["Closed", "Resolved"]],
        "resolution_by": ["<", now],
    })
    for doc in breached_resolution:
        mark_sla_breach(doc.name, "resolution")


def mark_sla_breach(docname, breach_type):
    doc = frappe.get_doc("Ticket", docname)
    field = "response_sla_status" if breach_type == "response" else "resolution_sla_status"
    doc.db_set(field, "Breached", update_modified=False)
    send_breach_notification(doc, breach_type)
```

`Document.db_set(fieldname, value=None, update_modified=True, notify=False,
commit=False)` (`frappe/model/document.py`) writes directly to the database
and to the in-memory object without running `validate`/`save` hooks — correct
for a background job updating one status field, wrong if you need controller
side effects too.

Rather than a custom scheduled scan, consider a `Notification`
(`frappe/email/doctype/notification`) with `event = "Days After"` pointed at
`response_by`/`resolution_by` — Frappe's own `trigger_daily_alerts`/
`trigger_offset_alerts` scheduler jobs already do this scan for you (see
[enterprise-patterns.md](enterprise-patterns.md#notifications-and-escalations)).

## SLA status tracking

```python
def update_sla_status(doc, method):
    now = now_datetime()

    if doc.first_responded_on:
        doc.response_sla_status = (
            "Fulfilled" if doc.first_responded_on <= doc.response_by else "Breached"
        )
    elif doc.response_by and now > doc.response_by:
        doc.response_sla_status = "Breached"
    else:
        doc.response_sla_status = "Ongoing"

    if doc.resolution_date:
        doc.resolution_sla_status = (
            "Fulfilled" if doc.resolution_date <= doc.resolution_by else "Breached"
        )
    elif doc.resolution_by and now > doc.resolution_by:
        doc.resolution_sla_status = "Breached"
    else:
        doc.resolution_sla_status = "Ongoing"
```

## SLA pause/resume

```python
def pause_sla(doc):
    """Pause the SLA clock, e.g. while a ticket waits on the customer."""
    if not doc.sla_paused_on:
        doc.db_set("sla_paused_on", now_datetime())
        doc.db_set("sla_paused", 1)

def resume_sla(doc):
    if doc.sla_paused_on:
        paused_duration = time_diff_in_seconds(now_datetime(), doc.sla_paused_on)
        if doc.response_by:
            doc.db_set("response_by", add_to_date(doc.response_by, seconds=paused_duration))
        if doc.resolution_by:
            doc.db_set("resolution_by", add_to_date(doc.resolution_by, seconds=paused_duration))
        doc.db_set("sla_paused_on", None)
        doc.db_set("sla_paused", 0)
```

ERPNext's real pause implementation keys off a `Pause SLA On Status` child
table (which document statuses count as "paused") rather than a boolean flag
set by hand — that is a stronger pattern if you have several "waiting"
statuses; model `sla_paused` as a computed property of `doc.status` rather
than a separately-maintained flag if so.

## Holiday handling

Frappe core has no `Holiday`/`Holiday List` doctype — that is ERPNext (HR
module, `erpnext/setup/doctype/holiday_list`). If ERPNext is installed you
may depend on it directly:

```python
def is_holiday(date, holiday_list):
    if not holiday_list:
        return False
    return frappe.db.exists("Holiday", {"parent": holiday_list, "holiday_date": date})
```

If you cannot depend on ERPNext, maintain your own holiday child table on
your SLA doctype (or a standalone `App Holiday` doctype) with the same
`{"parent": ..., "holiday_date": ...}` shape and query it the same way; the
`is_holiday` function above is unchanged either way — only the doctype name
differs.

## SLA reporting

```python
from pypika import Case
from pypika.terms import CustomFunction, LiteralValue
from frappe.query_builder.functions import Avg, Count, Sum

def get_sla_performance(filters):
    """Aggregate SLA performance metrics for the fixed Ticket doctype."""
    Ticket = frappe.qb.DocType("Ticket")
    timestamp_diff = CustomFunction("TIMESTAMPDIFF", ["unit", "start", "end"])
    seconds = LiteralValue("SECOND")
    return (
        frappe.qb.from_(Ticket)
        .select(
            Ticket.app_sla,
            Count(Ticket.name).as_("total"),
            Sum(Case().when(Ticket.response_sla_status == "Fulfilled", 1).else_(0)).as_("response_met"),
            Sum(Case().when(Ticket.resolution_sla_status == "Fulfilled", 1).else_(0)).as_("resolution_met"),
            Avg(timestamp_diff(seconds, Ticket.creation, Ticket.first_responded_on)).as_("avg_response_time"),
            Avg(timestamp_diff(seconds, Ticket.creation, Ticket.resolution_date)).as_("avg_resolution_time"),
        )
        .where(Ticket.creation.between(filters["from_date"], filters["to_date"]))
        .groupby(Ticket.app_sla)
        .run(as_dict=True)
    )
```

Prefer a Script Report (`report_type = "Script Report"` on the `Report`
doctype) over a raw whitelisted SQL endpoint for anything Desk-facing — it
gets filters, export, and permission enforcement for free.

## Sources

- Core primitives verified against Frappe 16 (`frappe/utils/data.py`,
  `frappe/model/document.py`, `frappe/utils/safe_exec.py`,
  `frappe/email/doctype/notification`).
- Real SLA schema for reference: ERPNext Support module
  (`erpnext/support/doctype/service_level_agreement`) and Frappe Helpdesk.
- Frappe CRM `condition`/`condition_json` pattern verified against
  `crm/fcrm/doctype/crm_service_level_agreement/crm_service_level_agreement.py`
  (`validate_condition`) and `crm/install.py:558-608`
  (`Assignment Rule` custom fields).
- Query builder: `apps/frappe/frappe/query_builder/functions.py:88` (`CustomFunction` pattern for dialect-specific SQL functions), `env/lib/python3.14/site-packages/pypika/terms.py:574,1389` (`LiteralValue`, `CustomFunction`), `env/lib/python3.14/site-packages/pypika/terms.py:1255` (`Case`)
