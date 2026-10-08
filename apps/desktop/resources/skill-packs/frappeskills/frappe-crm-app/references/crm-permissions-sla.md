# Frappe CRM Permissions and SLA

Two backend systems specific to this app: an org-hierarchy row-permission
layer over `CRM Lead`/`CRM Deal`, and a self-contained SLA engine
independent of both ERPNext's `Service Level Agreement` and Frappe
Helpdesk's `HD Service Level Agreement` (see
[sla-patterns.md](../../frappe-enterprise-patterns/references/sla-patterns.md)
for how all three compare).

## Org-hierarchy row permissions

`permission_query_conditions`/`has_permission` for `CRM Lead` and
`CRM Deal` both delegate to `crm/permissions/org_hierarchy.py`. Behaviour
depends on `FCRM Settings.enable_sales_hierarchy`
(`hierarchy_enabled()`) and whether the requesting user has a
`CRM Sales Hierarchy` row (`_in_hierarchy`, checks `frappe.db.exists("CRM
Sales Hierarchy", {"user": user})`):

- `Administrator` / `System Manager` role: unrestricted (empty condition /
  `True`).
- `Sales Manager` role, **not** in the hierarchy tree: unrestricted — the
  hierarchy feature does not narrow a plain Sales Manager unless they are
  explicitly placed in the tree.
- User is in the hierarchy tree: sees records they own (`lead_owner`/
  `deal_owner`), records owned by anyone in their subtree
  (`_team_mem_query`), and anything assigned to them or their subtree via
  `ToDo` (excluding cancelled ToDos).
- Everyone else (plain Sales User, not in the tree): sees only records they
  own or are directly assigned via `ToDo` — no subtree visibility.

`has_lead_permission`/`has_deal_permission` re-run the same condition as a
single-row existence check for document-level `has_permission`, so list
filtering and single-document access always agree (`org_hierarchy.py`).
Building a custom row-permission layer on a new CRM DocType should follow
this same query-condition-plus-has-permission-pair shape rather than one
without the other, or list views and direct-link access will disagree.

## CRM Service Level Agreement

`CRM Service Level Agreement` (`fcrm/doctype/crm_service_level_agreement/`):
`apply_on` (Link to DocType — generic, not hardcoded to Lead/Deal),
`enabled`, `default`, `condition` (Code, Python expression),
`condition_json` (Code, populated by a visual condition builder in the
frontend), `priorities` (Table `CRM Service Level Priority`),
`working_hours`, `start_date`/`end_date`, `holiday_list` (Link to
`CRM Holiday List`, not ERPNext's `Holiday List`), `rolling_responses`.

**`condition_json` is never evaluated server-side** — only `condition` is
(`validate_condition()` runs `frappe.safe_eval(self.condition, None,
get_context(temp_doc))` at save time, `crm_service_level_agreement.py:65`).
The frontend's visual builder writes both fields, compiling its JSON rule
tree down into the plain Python expression string that ends up in
`condition`; `condition_json` only rehydrates the builder UI on reopen. The
`Assignment Rule` doctype gets `assign_condition_json`/
`unassign_condition_json` custom fields the same way, added by this app's
own `install.py` (`install.py:558-608`) — this "hidden JSON twin field next
to the real evaluated expression field" is the reusable pattern for adding
a visual condition builder on top of any `frappe.safe_eval`-based condition
field, in this app or elsewhere.

### Selecting and applying an SLA

```python
# fcrm/doctype/crm_service_level_agreement/utils.py
def get_sla(doc: Document) -> Document:
    ...
```

Candidates are `CRM Service Level Agreement` rows where `apply_on ==
doc.doctype`, `enabled`, and `now` falls inside `start_date`/`end_date` (both
optional). If the Lead/Deal has a `communication_status`, only SLAs whose
`CRM Service Level Priority` child rows include a matching `priority` value
qualify. The row with `default = 1` is moved to the end of the candidate
list so a more specific SLA is tried first; the first candidate whose
`condition` is blank or evaluates true via `frappe.safe_eval(cond, None,
get_context(doc))` wins. `get_context(doc)` builds the `safe_eval` locals
from `frappe.utils.safe_exec.get_safe_globals()` plus the document — the
same sandboxing Frappe core uses everywhere else it evaluates a
user-authored condition string (Notification, Assignment Rule).

`CRM Rolling Response Time` (child table: `response_time`, `responded_on`,
`status`) is `rolling_responses`' storage — enabling it tracks a response
time per status transition instead of a single first-response clock,
letting the SLA measure "time to respond after each customer message," not
just "time to first response."

## Sources

Verified against the installed Frappe CRM app:

- `crm/permissions/org_hierarchy.py` — `_permission_query_conditions`, `_has_permission`, `hierarchy_enabled`, `_in_hierarchy`
- `crm/hooks.py` — `permission_query_conditions`/`has_permission` registration (:138-148)
- `crm/fcrm/doctype/crm_service_level_agreement/crm_service_level_agreement.json` — field list
- `crm/fcrm/doctype/crm_service_level_agreement/crm_service_level_agreement.py` — `validate_condition` (:65-72)
- `crm/fcrm/doctype/crm_service_level_agreement/utils.py` — `get_sla`, `get_context`
- `crm/fcrm/doctype/crm_rolling_response_time/crm_rolling_response_time.json` — field list
- `crm/install.py` — `assign_condition_json`/`unassign_condition_json` custom fields on `Assignment Rule` (:558-608)
