# ERPNext Stock

Stock Entry, Bin, valuation, serial/batch, and reposting. Part of
[erpnext-workflows.md](erpnext-workflows.md). Posting mechanics are in
[erpnext-architecture.md](erpnext-architecture.md#stock-ledger-posting-path).

---

## Stock Entry

`purpose` (Select, `stock_entry.json:133`) is one of: `Material Issue`,
`Material Receipt`, `Material Transfer`, `Material Transfer for Manufacture`,
`Material Consumption for Manufacture`, `Manufacture`, `Repack`, `Send to
Subcontractor`, `Disassemble`, `Receive from Customer`, `Return Raw Material
to Customer`, `Subcontracting Delivery`, `Subcontracting Return`. Purpose
drives which `s_warehouse`/`t_warehouse` combination is required per row and
which controller validations run (`stock/doctype/stock_entry/stock_entry.py`,
`StockEntry(StockController, SubcontractingInwardController)`).

## Bin

One `Bin` per item/warehouse holds running quantities (`bin.json`):

| Field | Meaning |
|---|---|
| `actual_qty` | Physical qty on hand (from Stock Ledger Entry) |
| `reserved_qty` | Reserved against Sales Order via `update_stock` or Stock Reservation |
| `reserved_qty_for_production` / `_for_sub_contract` / `_for_production_plan` | Reserved by manufacturing/subcontracting demand |
| `ordered_qty` | On open Purchase Orders |
| `indented_qty` | On open Material Requests |
| `planned_qty` | On open Work Orders |
| `projected_qty` | `actual_qty + ordered_qty + indented_qty + planned_qty - reserved_qty*` |

Never write `Bin` directly; it is maintained by SLE posting and the
reservation/requisition documents above.

## Valuation

Set per item (`Item.valuation_method`: FIFO or Moving Average; LIFO was
removed from ERPNext). Key read APIs, all in `erpnext/stock/`:

```python
from erpnext.stock.utils import get_stock_balance, get_latest_stock_qty, get_stock_value_on
get_stock_balance(item_code, warehouse, posting_date=None, posting_time=None,
    with_valuation_rate=False, with_serial_no=False)      # utils.py:95
get_latest_stock_qty(item_code, warehouse=None)           # utils.py:168
get_stock_value_on(warehouse=None, posting_date=None, item_code=None)  # utils.py:58

from erpnext.stock.stock_ledger import get_previous_sle, get_valuation_rate
get_previous_sle(args, for_update=False, extra_cond=None)  # stock_ledger.py:1781
get_valuation_rate(item_code, warehouse, voucher_type, voucher_no,
    allow_zero_rate=False, currency=None, company=None,
    raise_error_if_no_rate=True, batch_no=None,
    serial_and_batch_bundle=None)                          # stock_ledger.py:1905
```

`get_incoming_rate(args, raise_error_if_no_rate=True)` (`stock/utils.py:240`)
is what controllers call to price an inward stock row (purchase receipt,
stock entry receive) before it hits the ledger.

## Serial and Batch Bundle

`Serial and Batch Bundle` (with child `Serial and Batch Entry`) exists in
both v15 and v16 as the structured replacement for the legacy `serial_no`
newline-text field and bare `batch_no` link on transaction item rows: one
bundle groups the exact serials/batches and quantities consumed or produced
by a single row. `Stock Settings.use_serial_batch_fields`
(`stock_settings.json:446`) toggles whether the UI still shows the legacy
flat `serial_no`/`batch_no` fields (auto-building a bundle behind the scenes)
or requires picking a bundle directly — it does not change what is actually
stored on submit.

## Stock Reservation Entry

Reserves specific serial/batch/qty against a Sales Order before delivery
(`Stock Settings.enable_stock_reservation`). Distinct from the plain
`reserved_qty` a Sales Order without reservation puts on `Bin` — reservation
entries are their own ledger, checked by
`SellingController.has_unreserved_stock()`/`has_reserved_stock()`
(`selling_controller.py`, surfaced via `onload` in
[erpnext-architecture.md](erpnext-architecture.md)).

## Repost Item Valuation

A backdated or edited stock document invalidates every later-dated SLE for
that item/warehouse. `Repost Item Valuation` records get created and
processed (`erpnext/stock/stock_ledger.py`: `repost_future_sle`:244,
`get_items_to_be_repost`:451) to recompute valuation and running qty forward
from the edit point, then `repost_future_sle_and_gle()` (called from
`Controller.on_submit`, see
[erpnext-architecture.md](erpnext-architecture.md#delivery-note-on_submit-concrete-verified))
regenerates the dependent GL entries. Never hand-edit an old SLE's `qty_after_transaction`.

## Inventory Dimensions

`Inventory Dimension` lets a site add a custom stock-splitting dimension
(e.g. Cold Storage Location) beyond Warehouse/Batch/Serial; it auto-adds the
dimension's field to Stock Entry, transaction item tables, and `Stock Ledger
Entry`/`Bin` so valuation and quantity tracking stay dimension-aware.

## UOM conversion

Every item row carries `uom`, `conversion_factor` and `stock_qty =
qty * conversion_factor`; `stock_qty` (not `qty`) is what SLE/valuation and
Bin quantities use. Ledger and reporting code should read `stock_qty`, never
recompute conversion by hand.

## Landed Cost Voucher

Distributes additional cost (freight, customs) across a Purchase
Receipt/Invoice's item rows by updating their valuation rate and reposting
the affected SLEs (`via_landed_cost_voucher=True` on the SLE functions above).

## Quality Inspection

If `Item.inspection_required_before_purchase`/`...before_delivery` is set,
the controller requires a submitted `Quality Inspection` referencing the
transaction row before it can be submitted, raising
`QualityInspectionRequiredError` / `QualityInspectionRejectedError`
(`controllers/stock_controller.py:40-48`).

## Putaway Rule and Pick List

`Putaway Rule` auto-suggests warehouse/qty split on inward stock (capacity
per item/warehouse). `Pick List` (+ `Pick List Item`) batches multiple Sales
Orders/Material Requests into one warehouse picking run, then generates
Delivery Notes/Stock Entries from the picked quantities.

## Perpetual inventory

`erpnext.is_perpetual_inventory_enabled(company)` (`erpnext/__init__.py:78`,
see [erpnext-architecture.md](erpnext-architecture.md)) gates whether stock
movements also produce GL entries against the item's `Item Group`/`Item`
stock/COGS accounts; with it off, ERPNext tracks quantity only, no
accounting impact.

## v15 → v16: Closing Stock Balance removed

`Closing Stock Balance` (a snapshot DocType for faster stock-balance
reporting) exists only in the v15 baseline
(`apps/erpnext/erpnext/stock/doctype/closing_stock_balance/`) and is gone in
v16 — nothing in v16 replaces it by name; stock balance reporting reads
`Stock Ledger Entry`/`Bin` directly via the APIs above.

## Sources

Verified against ERPNext v16.6.1 and the v15.119.0 baseline:

- `apps/erpnext/erpnext/stock/doctype/stock_entry/stock_entry.json` — `purpose` options (:133)
- `apps/erpnext/erpnext/stock/doctype/bin/bin.json` — field list
- `apps/erpnext/erpnext/stock/utils.py` — `get_stock_balance` (:95), `get_latest_stock_qty` (:168), `get_incoming_rate` (:240), `get_stock_value_on` (:58)
- `apps/erpnext/erpnext/stock/stock_ledger.py` — `get_previous_sle` (:1781), `get_valuation_rate` (:1905), `repost_future_sle` (:244), `get_items_to_be_repost` (:451)
- `apps/erpnext/erpnext/stock/doctype/stock_settings/stock_settings.json` — `use_serial_batch_fields` (:446)
- `apps/erpnext/erpnext/controllers/stock_controller.py` — quality inspection errors (:40-48)
- Directory listings: `apps/erpnext/erpnext/stock/doctype/` on both benches — `closing_stock_balance` present only under the v15 baseline path
