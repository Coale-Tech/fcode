# ERPNext Selling & Buying

The sell and buy document chains, their real mapper functions, item-detail
fetch, and pricing. Part of [erpnext-workflows.md](erpnext-workflows.md).
Controller hierarchy is in [erpnext-architecture.md](erpnext-architecture.md).

---

## Chains and mapper functions

Every "Create X" button in the UI calls a `@frappe.whitelist()` mapper that
wraps `frappe.model.mapper.get_mapped_doc` (`frappe/model/mapper.py:55`).
Fields with the same fieldname on both DocTypes auto-map; a field list under
`"field_no_map"` in the mapping table is explicitly excluded (e.g. Sales
Order → Delivery Note excludes `payment_terms_template`,
`sales_order.py:1459`). Always create the next document through its mapper,
not by copying fields by hand — mappers also carry over `field_no_map`
exclusions and per-row `postprocess` logic that plain copying misses.

### Sell: Lead → Opportunity → Quotation → Sales Order → Delivery Note → Sales Invoice

| From → To | Function | Source |
|---|---|---|
| Lead → Customer | `make_customer(source_name, target_doc=None)` | `crm/doctype/lead/lead.py:317` |
| Lead → Opportunity | `make_opportunity(source_name, target_doc=None)` | `lead.py:364` |
| Lead → Quotation | `make_quotation(source_name, target_doc=None)` | `lead.py:394` |
| Opportunity → Quotation | `make_quotation(source_name, target_doc=None)` | `crm/doctype/opportunity/opportunity.py:383` |
| Opportunity → Customer | `make_customer(source_name, target_doc=None)` | `opportunity.py:458` |
| Quotation → Sales Order | `make_sales_order(source_name, target_doc=None, args=None)` | `selling/doctype/quotation/quotation.py:356` |
| Sales Order → Delivery Note | `make_delivery_note(source_name, target_doc=None, kwargs=None)` | `selling/doctype/sales_order/sales_order.py:1155` |
| Sales Order → Sales Invoice | `make_sales_invoice(source_name, target_doc=None, ignore_permissions=False, args=None)` | `sales_order.py:1328` |
| Delivery Note → Sales Invoice | `make_sales_invoice(source_name, target_doc=None, args=None)` | `stock/doctype/delivery_note/delivery_note.py:849` |
| Sales Invoice → Delivery Note | `make_delivery_note(source_name, target_doc=None)` | `accounts/doctype/sales_invoice/sales_invoice.py:2396` |

### Buy: Material Request → RFQ/Supplier Quotation → Purchase Order → Purchase Receipt → Purchase Invoice

| From → To | Function | Source |
|---|---|---|
| Material Request → RFQ | `make_request_for_quotation(source_name, target_doc=None)` | `stock/doctype/material_request/material_request.py:566` |
| Material Request → Supplier Quotation | `make_supplier_quotation(source_name, target_doc=None)` | `material_request.py:721` |
| Material Request → Purchase Order | `make_purchase_order(source_name, target_doc=None, args=None)` | `material_request.py:489` |
| Purchase Order → Purchase Receipt | `make_purchase_receipt(source_name, target_doc=None, args=None)` | `buying/doctype/purchase_order/purchase_order.py:705` |
| Purchase Order → Purchase Invoice | `make_purchase_invoice(source_name, target_doc=None, args=None)` | `purchase_order.py:769` |
| Purchase Order → Subcontracting Order | `make_subcontracting_order(source_name, target_doc=None, save=False, submit=False, notify=False)` | `purchase_order.py:901` |
| Purchase Receipt → Purchase Invoice | `make_purchase_invoice(source_name, target_doc=None, args=None)` | `stock/doctype/purchase_receipt/purchase_receipt.py:1404` |

Returns (not their own DocTypes — reuse the same mapper with the source's
return fields already set): `Sales Invoice.make_sales_return` (`sales_invoice.py:2445`)
and `Purchase Receipt.make_purchase_return` (`purchase_receipt.py:1564`) build
a negative-qty document via `make_return_doc`, with `is_return=1` and
`return_against` set to the source name.

Other real mappers worth knowing: `Sales Order.make_material_request`
(`sales_order.py:1023`), `Sales Order.make_purchase_order` — drop ship
(`sales_order.py:1590`), `Sales Order.make_work_orders` (`sales_order.py:1775`),
`Delivery Note.make_shipment` (`delivery_note.py:1087`), and inter-company
mirrors (`make_inter_company_purchase_order`,
`make_inter_company_purchase_receipt`, etc.) that create the counterpart
document in a linked company.

## Overriding a mapper in a custom app

Do not monkey-patch the function. Point `override_whitelisted_methods` in
`hooks.py` at your own function that calls the original and mutates the
returned doc, or add `doc_events` on the target DocType's `before_insert` to
adjust fields the mapper just set (see
[erpnext-extending.md](erpnext-extending.md)).

## get_item_details

```python
from erpnext.stock.get_item_details import get_item_details
get_item_details(ctx, doc=None, for_validate=False, overwrite_warehouse=True)
# stock/get_item_details.py:59 — returns an ItemDetails dict (frappe._dict)
```

This is what fills price, UOM, tax template and warehouse defaults on an
item row whenever an item is picked or an item-affecting field changes on
the client. `ctx` is a dict of the current row/document context (item_code,
qty, company, price_list, customer/supplier, etc. — see
`ItemDetailsCtx`/`normalize_ctx_input` in the same file). **v16 renamed the
parameter from `args` to `ctx`**; the v15 baseline signature is `(args,
doc=None, for_validate=False, overwrite_warehouse=True)`
(`get_item_details.py:39` in the v15 baseline) — positional calls still work,
but a custom app passing `args=` as a keyword must switch to `ctx=`.

## Pricing Rule and Price List

```python
from erpnext.accounts.doctype.pricing_rule.pricing_rule import get_pricing_rule_for_item, apply_pricing_rule
get_pricing_rule_for_item(args, doc=None, for_validate=False)  # pricing_rule.py:393
apply_pricing_rule(args, doc=None)                             # pricing_rule.py:323
```

Precedence when multiple rules match: `priority` field first, then the more
specific rule (item code over item group over brand; customer over customer
group over territory) wins — see `pricing_rule/utils.py:555`
(`apply_pricing_rule_on_transaction`). `Price List` selects the base rate
before any pricing rule discount is applied; a Price List is
buying- or selling-scoped (`buying`/`selling` checkboxes), not shared blindly.

## Selling/Buying Settings

`Selling Settings` and `Buying Settings` singletons hold cross-cutting flags
consulted by the controllers above — e.g. whether a Sales Order is required
before Sales Invoice, default customer/supplier group, and role-based rate
editing (`maintain_same_rate`). Read them rather than hardcoding the
behaviour they gate.

## POS Invoice

`POS Invoice` (with `POS Invoice Item`, `POS Invoice Merge Log`, `POS Invoice
Reference`) is its own DocType in both v15 and v16 — not a mode of `Sales
Invoice` — used by the Point of Sale UI for high-volume, offline-tolerant
billing; `POS Invoice Merge Log` consolidates POS Invoices into regular
Sales Invoices for accounting.

## Blanket Order

A long-term customer/supplier commitment (`Blanket Order` +
`Blanket Order Item`) that Sales Order/Purchase Order rows can reference via
`blanket_order`/`blanket_order_rate`, tracked against the ordered quantity
over the blanket's date range rather than a single document.

## v16: Customer Number At Supplier

`Customer Number At Supplier` **(v16)** is a new child table on `Supplier`
recording the customer-facing account/reference number a specific supplier
uses for this company, for matching supplier invoices that quote their own
customer code rather than the Purchase Order number.

## v15 → v16: CRM DocTypes removed

`Lead Source` and `Frappe CRM Allowed User` exist only in the v15 baseline
(`apps/erpnext/erpnext/crm/doctype/`) and are absent from v16 — `Lead.source`
customizations that depended on the `Lead Source` link doctype need a
different link target or a Select field in v16.

## Sources

Verified against ERPNext v16.6.1 and the v15.119.0 baseline:

- `apps/frappe/frappe/model/mapper.py` — `get_mapped_doc` (:55)
- `apps/erpnext/erpnext/crm/doctype/lead/lead.py` — `make_customer` (:317), `make_opportunity` (:364), `make_quotation` (:394)
- `apps/erpnext/erpnext/crm/doctype/opportunity/opportunity.py` — `make_quotation` (:383), `make_customer` (:458)
- `apps/erpnext/erpnext/selling/doctype/quotation/quotation.py` — `make_sales_order` (:356)
- `apps/erpnext/erpnext/selling/doctype/sales_order/sales_order.py` — `make_delivery_note` (:1155), `make_sales_invoice` (:1328), `make_material_request` (:1023), `make_purchase_order` (:1590), `field_no_map` (:1459)
- `apps/erpnext/erpnext/stock/doctype/delivery_note/delivery_note.py` — `make_sales_invoice` (:849), `make_shipment` (:1087)
- `apps/erpnext/erpnext/accounts/doctype/sales_invoice/sales_invoice.py` — `make_delivery_note` (:2396), `make_sales_return` (:2445)
- `apps/erpnext/erpnext/stock/doctype/material_request/material_request.py` — `make_request_for_quotation` (:566), `make_supplier_quotation` (:721), `make_purchase_order` (:489)
- `apps/erpnext/erpnext/buying/doctype/purchase_order/purchase_order.py` — `make_purchase_receipt` (:705), `make_purchase_invoice` (:769), `make_subcontracting_order` (:901)
- `apps/erpnext/erpnext/stock/doctype/purchase_receipt/purchase_receipt.py` — `make_purchase_invoice` (:1404), `make_purchase_return` (:1564)
- `apps/erpnext/erpnext/stock/get_item_details.py` — `get_item_details` signature (v16 :59, v15 baseline :39), `ItemDetails`/`ItemDetailsCtx` (:31-32)
- `apps/erpnext/erpnext/accounts/doctype/pricing_rule/pricing_rule.py` — `get_pricing_rule_for_item` (:393), `apply_pricing_rule` (:323); `pricing_rule/utils.py` — `apply_pricing_rule_on_transaction` (:555)
- Directory listings: `crm/doctype/lead_source`, `crm/doctype/frappe_crm_allowed_user` present only under the v15 baseline path; `accounts/doctype/pos_invoice*`, `buying/doctype/customer_number_at_supplier` present in both/v16
