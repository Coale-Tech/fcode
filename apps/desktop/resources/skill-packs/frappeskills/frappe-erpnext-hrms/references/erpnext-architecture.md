# ERPNext Architecture & Transaction Lifecycle

Controller inheritance, event ordering, and GL/SLE posting paths. Part of
[erpnext-workflows.md](erpnext-workflows.md).

---

## Architecture Overview

### Document Lifecycle (docstatus)

| Value | Status | Description |
|-------|--------|-------------|
| 0 | Draft | Not submitted, fully editable |
| 1 | Submitted | Finalized, creates ledger entries, limited edits |
| 2 | Cancelled | Reversed, entries cancelled, read-only |

```python
if doc.docstatus == 0:   # Draft
if doc.docstatus == 1:   # Submitted
if doc.docstatus == 2:   # Cancelled

doc.submit()
doc.cancel()

# Amend cancelled document
amended = frappe.copy_doc(doc)
amended.amended_from = doc.name
amended.insert()
```

### Module Overview

| Module | Key DocTypes | Purpose |
|--------|-------------|---------|
| **Accounts** | Sales Invoice, Purchase Invoice, Payment Entry, Journal Entry, GL Entry | Financial transactions |
| **Stock** | Stock Entry, Delivery Note, Purchase Receipt, Stock Ledger Entry | Inventory management |
| **Selling** | Quotation, Sales Order, Customer, Sales Partner | Sales pipeline |
| **Buying** | Supplier Quotation, Purchase Order, Supplier, Request for Quotation | Procurement |
| **Manufacturing** | BOM, Work Order, Job Card, Production Plan | Production |
| **CRM** | Lead, Opportunity, Campaign, Prospect | Customer acquisition |
| **Projects** | Project, Task, Timesheet, Activity Type | Project delivery |
| **Assets** | Asset, Asset Movement, Asset Depreciation Entry | Fixed assets |
| **Quality** | Quality Inspection, Quality Procedure, Quality Goal | Quality assurance |

### Company Setup

```python
company = frappe.defaults.get_user_default("Company")
company_doc = frappe.get_doc("Company", company)
companies = frappe.get_all("Company", fields=["name", "abbr", "default_currency"])
```

**Verified `get_default` / company helpers** (`erpnext/__init__.py`, cache-backed):

```python
import erpnext

erpnext.get_default_company(user=None)      # __init__.py:12  user default -> Global Defaults.default_company
erpnext.get_default_currency()              # __init__.py:28  currency of default company
erpnext.get_default_cost_center(company)    # __init__.py:35  Company.cost_center (cached via frappe.flags)
erpnext.get_company_currency(company)       # __init__.py:47  Company.default_currency (cached)
erpnext.is_perpetual_inventory_enabled(company)  # __init__.py:78  gates stock -> GL posting
erpnext.get_default_finance_book(company)   # __init__.py:93  Company.default_finance_book
```

These wrap `frappe.get_cached_value("Company", ...)` and stash results on `frappe.flags` /
`frappe.local` — prefer them over re-querying `Company` in loops. For a warehouse default,
read the item/company setting (`Stock Settings.default_warehouse`, or Item's `item_defaults`
child table) rather than hardcoding a warehouse name.

---

## Controller Hierarchy (verified v16.6.1)

ERPNext transaction DocTypes do **not** subclass `frappe.model.document.Document` directly.
They inherit a chain of controllers, each adding a layer of behavior. Confirmed against
`apps/erpnext/erpnext/controllers/` and `apps/erpnext/erpnext/utilities/transaction_base.py`:

```
frappe.model.document.Document
└── StatusUpdater              erpnext/controllers/status_updater.py:180
    └── TransactionBase        erpnext/utilities/transaction_base.py:20   (NOT under controllers/)
        └── AccountsController  erpnext/controllers/accounts_controller.py:103
            └── StockController erpnext/controllers/stock_controller.py:56
                ├── SellingController        erpnext/controllers/selling_controller.py:18
                └── SubcontractingController erpnext/controllers/subcontracting_controller.py:26
                    └── BuyingController     erpnext/controllers/buying_controller.py:29
```

> **Naming note (corrects common assumptions):** there is **no** class named
> `TransactionController` or `TaxesAndTotalsController` in the source. Tax/total math lives in
> the helper class `calculate_taxes_and_totals` (`erpnext/controllers/taxes_and_totals.py:27`),
> which is instantiated by `AccountsController.calculate_taxes_and_totals()`
> (`accounts_controller.py:733`) — it is a plain helper, not a controller subclass.

### What each layer provides

| Class | File | Responsibility (verified methods) |
|-------|------|-----------------------------------|
| **StatusUpdater** | `controllers/status_updater.py:180` | `update_prevdoc_status`, `update_qty`, over-delivery/over-billing validation, percent-billed/received status. Raises `OverAllowanceError`. |
| **TransactionBase** | `utilities/transaction_base.py:20` | `validate_posting_time`, contact/address fetch, UOM & duplicate-row validation, rate/currency helpers shared by all transactions. |
| **AccountsController** | `controllers/accounts_controller.py:103` | Core: `validate()` (217), `set_missing_values()` (726), `calculate_taxes_and_totals()` (733), `validate_qty_is_not_zero()` (1443), payment schedule, party accounts, multi-currency, advances, `on_cancel()` (1955). Raises `AccountMissingError`, `InvalidQtyError`. |
| **StockController** | `controllers/stock_controller.py:56` | `validate()` (57), `make_gl_entries()` (215) for stock/COGS GL, serial/batch bundle, quality inspection (`QualityInspectionRequiredError`), `repost_future_sle_and_gle`, valuation. |
| **SellingController** | `controllers/selling_controller.py:18` | `validate()` (59), `set_missing_values()` (109), `set_total_in_words()` (194), `update_stock_ledger()` (650) for outward stock, selling price list, customer/commission logic. |
| **SubcontractingController** | `controllers/subcontracting_controller.py:26` | Subcontracting BOM/raw-material consumption; base for `BuyingController`. |
| **BuyingController** | `controllers/buying_controller.py:29` | `validate()` (33), `set_missing_values()` (208), `set_total_in_words()` (384), `update_stock_ledger()` (732) for inward stock, `on_submit()` (928)/`on_cancel()` (942), supplier defaults, landed cost. |
| `calculate_taxes_and_totals` (helper) | `controllers/taxes_and_totals.py:27` | Item amount, tax rows, grand total, rounding, in-words — invoked from `AccountsController`. |

### Which controller a DocType subclasses (verified)

| DocType | Base class | File |
|---------|-----------|------|
| Sales Invoice | `SellingController` | `accounts/doctype/sales_invoice/sales_invoice.py:57` |
| Sales Order | `SellingController` | `selling/doctype/sales_order/sales_order.py:53` |
| Delivery Note | `SellingController` | `stock/doctype/delivery_note/delivery_note.py:24` |
| Purchase Invoice | `BuyingController` | `accounts/doctype/purchase_invoice/purchase_invoice.py:53` |
| Purchase Order | `BuyingController` | `buying/doctype/purchase_order/purchase_order.py:35` |
| Stock Entry | `StockController, SubcontractingInwardController` | `stock/doctype/stock_entry/stock_entry.py:87` |

### When to subclass which

- **New buying/selling transaction with items + GL + stock** → subclass `SellingController`
  (outward) or `BuyingController` (inward). You get taxes, party accounts, stock ledger, and GL
  posting essentially for free; override `validate`/`on_submit` and call `super()`.
- **Stock-only movement (no party invoice)** → subclass `StockController` (e.g. Stock Entry).
- **Accounting document with GL but no stock** (Journal Entry, Payment Entry) → subclass
  `AccountsController` directly.
- **Always call `super().validate()` / `super().on_submit()`** first — each layer's logic
  (status update, tax calc, GL/SLE posting) runs through the MRO chain. Skipping `super()`
  silently drops ledger postings.

---

## Transaction Lifecycle & Ledger Posting (verified v16.6.1)

### Event order on a submittable transaction

Frappe fires controller events in this order (framework: `frappe/model/document.py`):

```
before_validate → validate → before_save → (insert/save)
... on submit ...
before_submit → on_submit → on_update_after_submit
... on cancel ...
before_cancel → on_cancel → on_update_after_submit
```

ERPNext controllers hang their ledger logic off `validate` and `on_submit`. The **stock ledger
is always written before the general ledger**, because GL stock/COGS values depend on the
valuation computed while writing SLEs.

### Delivery Note `on_submit` (concrete, verified)

`stock/doctype/delivery_note/delivery_note.py:460-492` — canonical outward-stock + GL order:

```python
def on_submit(self):
    ...
    self.update_prevdoc_status()      # StatusUpdater: mark Sales Order delivered qty
    self.update_billing_status()
    ...
    self.update_stock_ledger()        # SellingController.update_stock_ledger() -> make_sl_entries()
    self.make_gl_entries()            # StockController.make_gl_entries()      -> make_gl_entries()
    self.repost_future_sle_and_gle()  # reposts later-dated entries if backdated
```

The comment in source is explicit: *"Updating stock ledger should always be called after
updating prevdoc status, because updating reserved qty in bin depends upon updated delivered
qty in SO"* (`delivery_note.py:488`). `on_cancel` mirrors this and calls
`make_gl_entries_on_cancel()` instead.

### General Ledger posting path

`erpnext/accounts/general_ledger.py`:

| Function | Line | Role |
|----------|------|------|
| `make_gl_entries(gl_map, cancel=False, adv_adj=False, ...)` | 29 | Entry point. Validates, processes, and writes GL Entry rows. |
| `process_gl_map(gl_map, merge_entries=True, ...)` | 189 | Round-off, drop zero-value rows, merge. |
| `merge_similar_entries(gl_map, ...)` | 274 | Collapse rows with same account/party/dimensions. |
| `make_entry(args, adv_adj, update_outstanding, ...)` | 425 | Creates one `GL Entry` doc (`ignore_permissions = 1`). |

Controllers build a `gl_map` (list of dicts, usually via `self.get_gl_dict(...)`) and call
`make_gl_entries(gl_map)`. **Never insert `GL Entry` docs by hand** — go through the parent
transaction's `make_gl_entries()`.

### Stock Ledger posting path

`erpnext/stock/stock_ledger.py`:

| Function | Line | Role |
|----------|------|------|
| `make_sl_entries(sl_entries, allow_negative_stock=False, ...)` | 57 | Entry point; writes `Stock Ledger Entry` rows and updates `Bin`. |
| `make_entry(args, ...)` | 229 | Creates one `Stock Ledger Entry` doc. |
| `update_entries_after(...)` | — | Recomputes running qty/valuation for all SLEs after a given point (backdated/repost). |

`SellingController.update_stock_ledger()` (`selling_controller.py:650`) and
`BuyingController.update_stock_ledger()` (`buying_controller.py:732`) assemble the `sl_entries`
list and call `make_sl_entries()`. Perpetual inventory (`is_perpetual_inventory_enabled(company)`,
`erpnext/__init__.py:78`) gates whether stock movements also produce GL entries.

### Party details (`erpnext/accounts/party.py`)

| Function | Line | Purpose |
|----------|------|---------|
| `get_party_details(party, party_type="Customer", ...)` | 59 | `@frappe.whitelist()` — resolve address, contact, tax template, payment terms, currency, price list for a customer/supplier. Called from client forms. |
| `get_party_account(party_type, party, company, ...)` | 421 | Receivable/Payable account: party record → group → company default. |
| `validate_party_accounts(doc)` | 579 | Ensures party account currency matches company. |
| `get_due_date(posting_date, party_type, party, ...)` | 624 | Due date from the party's Payment Terms Template. |
| `set_taxes(party, party_type, posting_date, ...)` | 721 | Resolve the applicable tax template for a party. |

### Naming series

Transaction names come from the DocType's `naming_series` field (autoname `naming_series:`),
editable per-company via **Stock/Selling/Buying Settings** and the **Naming Series** tool.
Series prefixes (e.g. `ACC-SINV-.YYYY.-`) are defined in each DocType JSON's `naming_series`
options. Amendments append `-1`, `-2` to the original via `amended_from`. Do not hardcode
`name`; let the series generate it.

### Link-field query overrides

`erpnext/controllers/queries.py` supplies the search functions behind Link fields
(`item_query` :177, `employee_query` :24, `lead_query` :94, `tax_account_query` :130,
`get_batch_no` :402, `warehouse_query` :731, `get_filtered_dimensions` :652). Each has the
standard link-query signature `(doctype, txt, searchfield, start, page_len, filters)` and is
wired to a field via `"query"` in the DocType JSON's Link field options, not a hook.

To override which query function backs a link field **without editing core**, use Frappe's
`standard_queries` hook (`frappe/hooks.py:169`, consumed by `frappe/desk/search.py:123-126`) —
ERPNext itself only sets it for `User`. A custom app can add its own entry keyed by DocType to
redirect the default link search to a custom function.

---

## Sources

Verified against ERPNext v16.6.1 (`apps/erpnext/erpnext/__init__.py:9`):

- `apps/erpnext/erpnext/controllers/status_updater.py` — `StatusUpdater(Document)` (:180)
- `apps/erpnext/erpnext/utilities/transaction_base.py` — `TransactionBase(StatusUpdater)` (:20)
- `apps/erpnext/erpnext/controllers/accounts_controller.py` — `AccountsController(TransactionBase)` (:103), `validate` (:217), `set_missing_values` (:726), `calculate_taxes_and_totals` (:733), `on_cancel` (:1955)
- `apps/erpnext/erpnext/controllers/stock_controller.py` — `StockController(AccountsController)` (:56), `make_gl_entries` (:215)
- `apps/erpnext/erpnext/controllers/selling_controller.py` — `SellingController(StockController)` (:18), `update_stock_ledger` (:650)
- `apps/erpnext/erpnext/controllers/subcontracting_controller.py` — `SubcontractingController(StockController)` (:26)
- `apps/erpnext/erpnext/controllers/buying_controller.py` — `BuyingController(SubcontractingController)` (:29), `update_stock_ledger` (:732), `on_submit` (:928)
- `apps/erpnext/erpnext/controllers/taxes_and_totals.py` — `calculate_taxes_and_totals` helper (:27)
- `apps/erpnext/erpnext/accounts/general_ledger.py` — `make_gl_entries` (:29), `process_gl_map` (:189), `make_entry` (:425)
- `apps/erpnext/erpnext/stock/stock_ledger.py` — `make_sl_entries` (:57), `make_entry` (:229)
- `apps/erpnext/erpnext/accounts/party.py` — `get_party_details` (:59), `get_party_account` (:421), `validate_party_accounts` (:579), `get_due_date` (:624), `set_taxes` (:721)
- `apps/erpnext/erpnext/__init__.py` — `get_default_company` (:12), `get_default_currency` (:28), `get_default_cost_center` (:35), `is_perpetual_inventory_enabled` (:78)
- `apps/erpnext/erpnext/controllers/queries.py` — `item_query` (:177), `employee_query` (:24), `warehouse_query` (:731), `get_filtered_dimensions` (:652)
- `apps/frappe/frappe/hooks.py` — `standard_queries` (:169); `apps/frappe/frappe/desk/search.py` (:123-126)
- `apps/erpnext/erpnext/hooks.py` — `doc_events` (:336)
- DocType bases: `sales_invoice.py:57`, `sales_order.py:53`, `delivery_note.py:24` (`on_submit` :460), `purchase_invoice.py:53`, `purchase_order.py:35`, `stock_entry.py:87`
