# ERPNext Projects, Assets, Quality, Support & Maintenance

The remaining transactional modules that are not accounting, stock, sell/buy
or manufacturing. Part of [erpnext-workflows.md](erpnext-workflows.md).

---

## Projects

`Project.percent_complete_method` (Select: `Manual`, `Task Completion`,
`Task Progress`, `Task Weight` — `project.json:112`) controls whether the
project's own `percent_complete` is set by hand or rolled up from its Tasks;
`Task.progress` (Percent, `task.json:191-194`) is the per-task input that
feeds `Task Progress`/`Task Weight` mode. `Project.status` is `Open`,
`Completed`, `Cancelled` (`project.json:86`) — there is no separate
"In Progress" project status; progress is tracked via `percent_complete`,
not a status value.

`Timesheet` bills logged time to a customer:

```python
from erpnext.projects.doctype.timesheet.timesheet import make_sales_invoice
make_sales_invoice(source_name, item_code=None, customer=None, currency=None)  # timesheet.py:412
```

`Activity Cost` sets a billing/costing rate per Activity Type + Employee,
consumed when a Timesheet row computes its billing amount.

## Assets

`Asset.status` (Select, `asset.json:350`) is exactly: `Draft`, `Submitted`,
`Cancelled`, `Partially Depreciated`, `Fully Depreciated`, `Sold`,
`Scrapped`, `In Maintenance`, `Out of Order`, `Issue`, `Receipt`,
`Capitalized`, `Work In Progress` — a wider lifecycle than most custom
integrations assume (do not treat `Submitted` as terminal).

Depreciation is computed into `Asset Depreciation Schedule` /
`Depreciation Schedule` child rows (present in both v15 and v16) per
`Asset.depreciation_method`, and posted by a scheduled job:

```python
# hooks.py:476 — scheduler_events daily
"erpnext.assets.doctype.asset.depreciation.post_depreciation_entries"
```

Asset lifecycle DocTypes: `Asset Movement` (+ `Asset Movement Item`,
location/employee transfer without a GL entry), `Asset Capitalization` (+
`Asset Capitalization Asset Item`/`Service Item`/`Stock Item`, converts WIP
stock/service costs into a capitalized Asset), `Asset Repair` (+
`Asset Repair Consumed Item`, non-capitalized maintenance spend) and
`Asset Value Adjustment` (manual revaluation up or down, with its own GL
entry). **`Asset Repair Purchase Invoice` (v16)** links an Asset Repair to
the Purchase Invoice(s) that billed the repair — absent from the v15
baseline, where repair costs were not linked to a Purchase Invoice this way.

## Quality Management

`quality_management/doctype/` covers ISO-9001-style process management, not
inbound inspection: `Quality Procedure` (+ `Quality Procedure Process`,
nestable process steps), `Quality Goal` (+ `Quality Goal Objective`),
`Quality Review` (+ `Quality Review Objective`), `Quality Meeting` (+
`Quality Meeting Agenda`/`Minutes`), `Quality Action` (+ `Quality Action
Resolution`), `Quality Feedback` (+ `Quality Feedback Parameter`,
`Quality Feedback Template` + `Template Parameter`) and `Non Conformance`.
These are independent of `Quality Inspection`.

`Quality Inspection` (in `stock/doctype/`) is the inbound/outbound item check
gated by `Item.inspection_required_before_purchase` /
`inspection_required_before_delivery` and `Item.quality_inspection_template`
(`item.json:116-118`) — when set, Purchase Receipt/Delivery Note validation
requires a submitted Quality Inspection referencing that item before the
stock document itself can be submitted. `Quality Inspection Template` (+
`Item Quality Inspection Parameter`) defines the reusable parameter checklist
an inspection is scored against.

## Support

`Issue` (+ `Issue Priority`, `Issue Type`) is the ticket DocType; its SLA
behaviour comes from `Service Level Agreement` — see
[sla-patterns.md](../../frappe-enterprise-patterns/references/sla-patterns.md).
`Warranty Claim` tracks a claim against a sold Item/Serial No independent of
Issue — it is not built on top of Issue.

## Maintenance

`Maintenance Schedule` (+ `Maintenance Schedule Detail`, `Maintenance
Schedule Item`) plans recurring preventive maintenance visits for
Items/Serial Nos sold to a customer; `Maintenance Visit` (+
`Maintenance Visit Purpose`) records each actual visit, optionally against a
Maintenance Schedule Detail row. Both are independent of the `Asset` module's
`In Maintenance` status, which tracks an owned asset, not a sold item under a
customer maintenance contract.

## Sources

Verified against ERPNext v16.6.1 and the v15.119.0 baseline:

- `apps/erpnext/erpnext/projects/doctype/project/project.json` — `percent_complete_method` options (:112), `status` options (:86)
- `apps/erpnext/erpnext/projects/doctype/task/task.json` — `progress` field (:191-194)
- `apps/erpnext/erpnext/projects/doctype/timesheet/timesheet.py` — `make_sales_invoice` (:412)
- `apps/erpnext/erpnext/assets/doctype/asset/asset.json` — `status` options (:350), `depreciation_method` (:268)
- `apps/erpnext/erpnext/hooks.py` — `post_depreciation_entries` scheduler event (:476)
- Directory listing: `apps/erpnext/erpnext/assets/doctype/` — `asset_depreciation_schedule`, `depreciation_schedule`, `asset_movement(+item)`, `asset_capitalization(+asset_item,+service_item,+stock_item)`, `asset_repair(+consumed_item)`, `asset_repair_purchase_invoice` (v16-only, absent from v15 baseline listing), `asset_value_adjustment`
- Directory listing: `apps/erpnext/erpnext/quality_management/doctype/` — full module list
- `apps/erpnext/erpnext/stock/doctype/item/item.json` — `inspection_required_before_purchase`/`inspection_required_before_delivery`/`quality_inspection_template` (:116-118)
- Directory listing: `apps/erpnext/erpnext/support/doctype/` — `issue(+priority,+type)`, `warranty_claim`
- Directory listing: `apps/erpnext/erpnext/maintenance/doctype/` — `maintenance_schedule(+detail,+item)`, `maintenance_visit(+purpose)`
