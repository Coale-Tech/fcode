# Enterprise Application Patterns

Architectural patterns for building production-grade enterprise applications
(CRM, Helpdesk, HRMS, and similar multi-entity systems) on Frappe. Patterns
that depend on ERPNext or Helpdesk say so explicitly.

## When to use

- Building CRM, Helpdesk, HRMS, or similar multi-entity systems
- Designing SLA-driven workflows (see [sla-patterns.md](sla-patterns.md))
- Implementing assignment and queue management
- Building audit trails and activity logs
- Integrating with external systems (email, telephony, CRM)

## Inputs required

- System type (CRM/Helpdesk/custom)
- Core entities and relationships
- SLA requirements
- Workflow states and transitions
- Integration points

## Data model design

Start with clear, normalized DocTypes:

```
Ticket (parent)
├── customer (Link: Customer)
├── assigned_to (Link: User)
├── status (Select: Open, In Progress, Resolved, Closed)
├── priority (Link: Priority)
└── response_by, resolution_by (Datetime)
```

- Use Link fields for relationships; Dynamic Link when the target DocType
  varies per row (`fieldtype: "Dynamic Link"`, `options` pointing at the
  Select/Link field that names the target DocType — see `reference_name` on
  Communication, `frappe/core/doctype/communication/communication.json`).
- Use child tables (`istable: 1`) for activities, timelines, line items.
- `autoname` patterns for identification: `naming_series:`, `field:fieldname`,
  `hash`, or `format:` (e.g. `format:SLA-{document_type}-{service_level}`,
  used by ERPNext's Service Level Agreement doctype). Hash-based names suit
  high-volume transactional records; human-readable series suit
  customer-facing entities.

## State machine

**Option A: Workflow DocType** — create a Workflow linked to your DocType with
states and role-based transitions (Desk: Workflow list).

**Option B: `docstatus` for submission flow** (built into every submittable
DocType, `frappe/model/document.py`):

| docstatus | Meaning |
|-----------|---------|
| 0 | Draft |
| 1 | Submitted |
| 2 | Cancelled |

**Option C: custom status field with validation**

```python
def validate(self):
    allowed = get_allowed_transitions(self.status, frappe.session.user)
    if self.status not in allowed:
        frappe.throw(f"Cannot transition to {self.status}")
```

Use a Workflow for human-driven transitions and a status field driven by code
for machine transitions — never both for the same field; they will fight.

For full state-machine and approval-chain design, see
[references/workflow-patterns.md](../../frappe-doctype-development/references/workflow-patterns.md).

## Permissions

**Row-level filtering**: User Permissions restrict Link/Dynamic Link fields to
specific records (e.g. only a user's own Company or Territory); combine with
Role Permissions Manager for field-level control via permlevel.

**Always re-check in whitelisted methods** — the Desk UI enforces permissions
on save, but RPC endpoints must check explicitly:

```python
@frappe.whitelist()
def update_ticket(name, status):
    doc = frappe.get_doc("Ticket", name)
    if not frappe.has_permission("Ticket", "write", doc):
        frappe.throw("Not permitted", frappe.PermissionError)
    doc.status = status
    doc.save()
```

`frappe.has_permission(doctype=None, ptype="read", doc=None, user=None,
throw=False, *, parent_doctype=None, debug=False,
ignore_share_permissions=False)` (`frappe/__init__.py`). `ptype` is one of
`read`, `write`, `create`, `submit`, `cancel`, `amend`. Pass `parent_doctype`
when checking a child DocType without a `doc` instance.

For complex permission logic, implement the `has_permission` doctype hook; see
[references/advanced-permissions.md](../../frappe-doctype-development/references/advanced-permissions.md).

## Activity and audit trail

Frappe gives you three built-in, code-free tracking mechanisms before you
reach for a custom child table:

**1. Automatic version diffs** — set `"track_changes": 1` in the DocType
JSON. Every save writes a `Version` document (`frappe/core/doctype/version`)
with `ref_doctype`, `docname`, and a `data` field holding the JSON diff
produced by `get_diff(old, new)`. No controller code needed; view history from
the document's "..." menu or `frappe.get_all("Version", filters={...})`.

**2. Field-value milestones** — create a **Milestone Tracker** document
(`frappe/automation/doctype/milestone_tracker`) with `document_type` and
`track_field`. On every save where that field's value changed, Frappe
auto-inserts a **Milestone** record (`reference_type`, `reference_name`,
`track_field`, `value`, `milestone_tracker`) — this replaces
hand-written `has_value_changed` status-history code for simple field
tracking.

**3. `track_seen` / `track_views`** — set these DocType meta flags to record
who has seen a document (`_seen` field, shown as avatar stack) or count views,
without extra fields.

**When you need a custom trail** (multi-field composite events, business
narrative), write to **Activity Log** (`frappe/core/doctype/activity_log`).
Its real fields are `subject`, `content`, `reference_doctype`,
`reference_name`, `operation` (`Login`/`Logout`/`Impersonate`), `status`,
`user` — there is no `action` or `data` field:

```python
def on_update(doc, method):
    if doc.has_value_changed("status"):
        before = doc.get_doc_before_save()
        # System-owned audit record written by a trusted hook, not the acting
        # user; the user may lack create permission on Activity Log.
        frappe.get_doc({
            "doctype": "Activity Log",
            "reference_doctype": doc.doctype,
            "reference_name": doc.name,
            "subject": "Status Change",
            "content": f"{before.status if before else ''} -> {doc.status}",
        }).insert(ignore_permissions=True)
```

`has_value_changed(fieldname)` and `get_doc_before_save()` are Document
methods (`frappe/model/document.py`); `get_doc_before_save()` returns `None`
for a new insert, so guard against it.

**Comments** (`frappe/core/doctype/comment`) are the built-in place for
internal notes and are what `doc.add_comment()` writes; **Communication**
(`frappe/core/doctype/communication`) is the built-in place for customer-facing
interactions (email, calls), linked back via `reference_doctype` /
`reference_name`.

**Data retention**: `Log Settings` (`frappe/core/doctype/log_settings`) holds
a `logs_to_clear` child table (`ref_doctype`, retention `days`) and a
scheduled job clears rows past retention for any doctype whose controller
implements `clear_old_logs(days)` (see `Activity Log.clear_old_logs` and
`Version` for real examples). Apps pre-populate this table via the
`default_log_clearing_doctypes` hook in `hooks.py`:

```python
# hooks.py
default_log_clearing_doctypes = {
    "My App Sync Log": 30,  # days to retain
}
```

`Deleted Document` (`frappe/core/doctype/deleted_document`) and `Access Log`
(`frappe/core/doctype/access_log`) are further built-in audit surfaces: the
former restores a JSON snapshot of anything deleted, the latter records
report/file export access.

## SLA and escalation

Frappe core has **no** SLA doctype. ERPNext ships `Service Level Agreement`
(Support module, `erpnext/support/doctype/service_level_agreement`) and
Frappe Helpdesk ships `HD Service Level Agreement`. If either app is
installed, reuse it rather than rebuilding SLA tracking from scratch. If you
are shipping a standalone Frappe app, see
[references/sla-patterns.md](sla-patterns.md) for a build-your-own design on
core primitives (Duration fields, `frappe.utils` datetime helpers,
`frappe.safe_eval` conditions, scheduled breach checks).

**Escalation without a bespoke doctype**: a `Notification`
(`frappe/email/doctype/notification`) with `event = "Days After"` /
`"Days Before"` (relative to a reference date field) or `event = "Value
Change"` (on a specific field) covers most SLA-breach and escalation-chain
needs — see the Notifications section below for the full event vocabulary.
Only build a custom scheduled job when the condition can't be expressed as a
Notification (e.g. multi-level chains with per-level delay).

## Assignment and queues

**Assignment Rule** (`frappe/automation/doctype/assignment_rule`) is the
built-in automatic-assignment engine — do not build a custom "queue member"
doctype before checking whether this covers the need. Real fields:
`document_type`, `priority` (rule execution order), `assign_condition` /
`unassign_condition` / `close_condition` (Python expressions), `rule` (Select:
`Round Robin`, `Load Balancing`, `Based on Field`, `Weighted Distribution`),
`users` (Table MultiSelect of `Assignment Rule User`, for Round Robin/Load
Balancing), `weighted_users` (for Weighted Distribution), `field` (for Based
on Field), `assignment_days` (Table of `Assignment Rule Day`),
`due_date_based_on`. It assigns by creating **ToDo** documents through
`frappe.desk.form.assign_to` (`frappe/automation/doctype/assignment_rule/assignment_rule.py`
calls `assign_to._add(...)` and `assign_to.clear(...)`), so assignment state
lives in the standard ToDo list — query it with
`frappe.get_all("ToDo", filters={"reference_type": doctype, "reference_name": name, "status": ("!=", "Cancelled")})`.

Programmatic assign/unassign uses the same module
(`frappe/desk/form/assign_to.py`):

```python
from frappe.desk.form import assign_to

assign_to.add({
    "doctype": "Ticket",
    "name": ticket_name,
    "assign_to": [user],
    "description": "Escalated ticket",
})
```

`assign_to.add(args)` and `assign_to.remove(doctype, name, assign_to)` are
whitelisted; `assign_to.close_all_assignments(doctype, name)` closes every
open assignment (sets each open ToDo's `status` to `Closed`, not
`Cancelled`). `add`/`_add` raise `DuplicateToDoError` if the user is already
assigned.

If Assignment Rule's conditions genuinely can't express your distribution
logic, a custom round-robin over your own queue-membership doctype is
reasonable — just don't reach for it first:

```python
def get_next_agent(queue):
    """Round-robin assignment within a custom queue-membership doctype."""
    agents = frappe.get_all("Queue Member",
        filters={"queue": queue, "available": 1},
        fields=["user", "current_load"],
        order_by="current_load asc")
    return agents[0].user if agents else None
```

`Queue Member` above is an example custom doctype, not a Frappe built-in.

## Notifications and escalations

`Notification` (`frappe/email/doctype/notification`) fields:

- `channel`: `Email`, `Slack`, `System Notification`, `SMS`
- `event` (`Send Alert On`): `New`, `Save`, `Submit`, `Cancel`, `Days After`,
  `Days Before`, `Minutes After`, `Minutes Before`, `Value Change`, `Method`,
  `Custom`
- `method` (only for `event = "Method"`): a controller hook name, e.g.
  `before_insert`
- `date_changed` + `days_in_advance` (only for `Days After`/`Days Before`):
  reference date field and offset
- `value_changed` (only for `Value Change`): the field to watch
- `condition`: a Python expression (`doc.status == "Open"`), evaluated like an
  assignment-rule condition
- `recipients`: child table `Notification Recipient`, or
  `send_to_all_assignees` to notify current ToDo assignees instead
- `message`: Jinja template

Escalation chains are multiple Notification documents on the same
`document_type` with increasing `days_in_advance` or per-level `condition`s
pointing at an escalation-level field you maintain — there is no built-in
"escalation chain" construct beyond composing Notifications.

## External integrations

Centralize connectors and use background jobs so sync never blocks a web
request:

```python
# my_app/integrations/email_connector.py
def sync_emails():
    # Fetch from Email Account, create Communications, link to Tickets
    ...
```

```python
frappe.enqueue(
    "my_app.integrations.email_connector.sync_emails",
    queue="long",
    timeout=600,
)
```

`frappe.enqueue(method, queue="default", timeout=None, ...)` —
`frappe/utils/background_jobs.py`. See
[references/integration-patterns.md](../../frappe-api-development/references/integration-patterns.md)
for retry/idempotency design and
[references/queue-patterns.md](../../frappe-app-development/references/queue-patterns.md)
for queue selection.

| System | Pattern |
|--------|---------|
| Email | Email Account + Communication |
| Telephony | Webhook + custom Call Log doctype |
| External CRM | REST connector + sync job |
| Chat | Webhook + realtime events (`frappe.publish_realtime`) |

## Multi-tenancy

Frappe's tenancy unit is the **site**: each site is a separate database
(and, for single-tenant deploys, an isolated bench process). There is no
built-in single-database multi-tenant row-partitioning layer — `frappe.init`
(`frappe/__init__.py`) sets `frappe.local.site` from `sites_path` and site
config, and `frappe.connect` (`site=None, db_name=None,
set_admin_as_user=True`) opens the database connection for that site. Most
"multi-tenant SaaS on Frappe" deployments are one site per tenant behind a
shared bench, provisioned with `bench new-site`.

Within a single site shared by multiple business units (e.g. multiple
companies), use **User Permissions** to restrict a user's visible Company /
Territory / other entity Link values — this is row-level isolation inside one
database, not tenancy. Combine with Role Permissions for what actions each
role may take on the entity.

## Reporting and analytics

- Frappe's `Report` doctype (`frappe/core/doctype/report`) has
  `report_type`: `Report Builder`, `Query Report`, `Script Report`, `Custom
  Report`. Query Reports run one SQL query; Script Reports run arbitrary
  Python and return columns/data.
- Build dashboards with Number Cards and Dashboard Charts (Desk built-ins)
  rather than bespoke aggregation pages.
- Use `frappe.get_list`/`frappe.get_all` with explicit `fields` and
  `order_by`; never fetch unbounded result sets for a report page — paginate
  with `limit_start`/`limit_page_length`.

Full reporting reference:
[references/reports.md](../../frappe-reports/references/reports.md)

## Performance considerations

- Index columns you filter on (`in_list_view`, or explicit indexes via
  `frappe.db.add_index` in `on_doctype_update`).
- Use `frappe.db.get_value(..., for_update=True)` to lock rows you are about
  to update inside a transaction, avoiding race conditions
  (`frappe/database/database.py`).
- Cache configuration that changes infrequently (SLA priorities, assignment
  rules) rather than re-querying per document.
- Chunk bulk operations and background jobs; never block a web request with a
  long-running loop.

## Verification

- [ ] Workflow transitions work for all roles
- [ ] Permissions enforced at API level, not just in the Desk UI
- [ ] Activity/version trail captures the changes you actually need
- [ ] SLA calculation correct on a worked business-hours example
- [ ] Notifications fire on the right event with the right recipients
- [ ] Integration sync runs without errors and is safe to replay

## Failure modes / debugging

- **Permission bypass**: whitelisted methods missing an explicit
  `frappe.has_permission` check
- **SLA/escalation not firing**: verify the scheduler is running
  (`bench doctor`) and the Notification's `condition`/`event` actually match
- **Activities not logging**: check `has_value_changed` usage and that
  `get_doc_before_save()` isn't `None` (new documents have no "before")
  version
- **Assignment not happening**: check `assign_condition` on the Assignment
  Rule and that a higher-`priority` rule isn't matching first and stopping
  evaluation
- **Notifications not sending**: check the Notification is `enabled`, the
  `condition` evaluates true, and the Email Queue/RQ worker is processing

## Escalation

- For complex permission patterns, see [references/advanced-permissions.md](../../frappe-doctype-development/references/advanced-permissions.md)
- For queue optimization, see [references/queue-patterns.md](../../frappe-app-development/references/queue-patterns.md)
- For UI/UX patterns → `frappe-ui-patterns`

## References

- [references/workflow-patterns.md](../../frappe-doctype-development/references/workflow-patterns.md) - State machine design
- [references/sla-patterns.md](sla-patterns.md) - SLA build-your-own patterns; ERPNext/Helpdesk pointers
- [references/integration-patterns.md](../../frappe-api-development/references/integration-patterns.md) - External systems

## Guardrails

- **Follow CRM/Helpdesk UI patterns**: for CRUD apps, follow `frappe-ui-patterns`, which documents app shell, navigation, list views, and form patterns from official Frappe apps.
- **Use Frappe UI for frontends**: custom enterprise frontends should use Frappe UI (Vue 3 + TailwindCSS) rather than vanilla JS/jQuery.
- **Prefer built-in tracking before custom code**: `track_changes`, Milestone Tracker, and `track_seen` cover most audit needs without a hand-rolled child table.
- **Prefer Assignment Rule before a custom queue doctype**: it already does round-robin, load balancing, weighted distribution, and field-based routing.
- **Design workflows carefully**: map all states and transitions before implementation; plan rollback paths.
- **Use background jobs for heavy operations**: never block a web request with a long-running task.
- **Log critical operations**: use `frappe.log_error()` and the audit mechanisms above for traceability.

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| Writing `action`/`data` fields to Activity Log | Those fields don't exist on the doctype | Use `subject`/`content`, or a custom child table for structured data |
| Custom round-robin before checking Assignment Rule | Duplicates a built-in with worse edge-case handling | Use Assignment Rule's `Round Robin`/`Load Balancing`/`Weighted Distribution` |
| Treating "Service Level Agreement" as core Frappe | It's ERPNext/Helpdesk only | Confirm the app is installed, or build on primitives per sla-patterns.md |
| Workflow and code both own status | Conflicting transitions | Single owner per status field |
| Missing error handling in integrations | Silent failures, data inconsistency | Wrap external calls in try/except; log errors; retry with backoff |
| Race conditions in document updates | Data corruption | `frappe.db.get_value(..., for_update=True)` for locks |
| SLA without timezone handling | Wrong calculations for global users | Store and compare via `now_datetime()`/`convert_utc_to_timezone`, not naive local time |
| Not using queues for bulk operations | Timeouts, memory issues | `frappe.enqueue()` for operations touching many records |
| Hardcoded role names | Breaks on role changes | Use constants/settings for role names |
| Using vanilla JS/jQuery for custom frontends | Maintenance burden, ecosystem mismatch | Use Frappe UI with Vue 3 |

## Sources

Verified against Frappe v16.35.0 (`apps/frappe/frappe/__init__.py` `__version__`):

- `apps/frappe/frappe/core/doctype/communication/communication.json` — `reference_doctype` (Link)/`reference_name` (Dynamic Link) as the Dynamic Link example
- `apps/frappe/frappe/model/naming.py:141-230` — `autoname` dispatch (`field:`, `naming_series:`, `format:`, hash fallback); `apps/erpnext/erpnext/support/doctype/service_level_agreement/service_level_agreement.json` — `autoname: "format:SLA-{document_type}-{service_level}"`
- `apps/frappe/frappe/__init__.py:600` — `has_permission()` signature
- `apps/frappe/frappe/core/doctype/version/version.json` — Version fields (`ref_doctype`, `docname`, `data`)
- `apps/frappe/frappe/automation/doctype/milestone_tracker/milestone_tracker.py`, `apps/frappe/frappe/automation/doctype/milestone/milestone.json` — Milestone Tracker `apply()`; Milestone's real persisted fields are `reference_type`, `reference_name`, `track_field`, `value`, `milestone_tracker` (a `from_value` local variable is computed in `apply()` but is not a Milestone doctype field)
- `apps/frappe/frappe/model/document.py:1485,1771,1786` — `track_seen`/`track_views` meta flag handling; `apps/frappe/frappe/core/doctype/doctype/doctype.json` — `track_changes`/`track_seen`/`track_views` meta fields
- `apps/frappe/frappe/core/doctype/activity_log/activity_log.json` — Activity Log real fields incl. `subject`, `content`, `reference_doctype`, `reference_name`, `operation` (options `Login`/`Logout`/`Impersonate`), `status`, `user`
- `apps/frappe/frappe/core/doctype/log_settings/log_settings.json` — `logs_to_clear` child table; `apps/frappe/frappe/core/doctype/deleted_document/`, `apps/frappe/frappe/core/doctype/access_log/` — existence confirmed
- `apps/frappe/frappe/automation/doctype/assignment_rule/assignment_rule.json` — fields incl. `document_type`, `priority`, `assign_condition`/`unassign_condition`/`close_condition`, `rule` (options `Round Robin`/`Load Balancing`/`Based on Field`/`Weighted Distribution`), `users`, `weighted_users`, `field`, `assignment_days`, `due_date_based_on`
- `apps/frappe/frappe/automation/doctype/assignment_rule/assignment_rule.py:79-111` — calls into `assign_to.clear()`/`_add()`/`close_all_assignments()`
- `apps/frappe/frappe/desk/form/assign_to.py` — `add()`, `_add()`, `remove()`, `close_all_assignments()` (sets ToDo `status="Closed"`, not `Cancelled`), `DuplicateToDoError`
- `apps/frappe/frappe/email/doctype/notification/notification.json` — `channel`/`event`/`method`/`date_changed`/`days_in_advance`/`value_changed`/`condition`/`recipients`/`send_to_all_assignees`/`message` fields and their option lists
- `apps/frappe/frappe/utils/background_jobs.py:76` — `enqueue()` signature
- `apps/frappe/frappe/__init__.py:144,230` — `init()`/`connect()` signatures
- `apps/frappe/frappe/core/doctype/report/report.json` — `report_type` options (`Report Builder`/`Query Report`/`Script Report`/`Custom Report`)
- `apps/frappe/frappe/database/database.py:527,606` — `for_update` parameter on `get_value`/`get_values`
