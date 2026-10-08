# ERPNext Workflows Complete Reference

Comprehensive reference for ERPNext modules: Accounting, Stock, Selling, Buying, Manufacturing, CRM, Projects, Assets, and workflow patterns. Split by topic; each topic file carries its own source citations.

## Document Lifecycle (docstatus)

| Value | Status | Description |
|-------|--------|-------------|
| 0 | Draft | Not submitted, fully editable |
| 1 | Submitted | Finalized, creates ledger entries, limited edits |
| 2 | Cancelled | Reversed, entries cancelled, read-only |

## Topics

- [erpnext-architecture.md](erpnext-architecture.md) — Architecture overview, controller inheritance chain (`StatusUpdater` → `TransactionBase` → `AccountsController` → `StockController` → `SellingController`/`BuyingController`), event ordering, GL/SLE posting paths, naming series, link-field query overrides, source citations
- [erpnext-accounting.md](erpnext-accounting.md) — Chart of Accounts, GL Entry vs Payment Ledger Entry, Sales/Purchase Invoice, Payment Entry, Journal Entry, tax templates, exchange rates, Accounting Dimensions, Budget, deferred revenue/expense, Repost Accounting Ledger, withholding tax
- [erpnext-stock.md](erpnext-stock.md) — Stock Entry, Bin, valuation APIs, Serial and Batch Bundle, Stock Reservation Entry, Repost Item Valuation, Inventory Dimensions, Landed Cost Voucher, Quality Inspection gating, Putaway/Pick List
- [erpnext-selling-buying.md](erpnext-selling-buying.md) — Sell chain (Lead→Opportunity→Quotation→Sales Order→Delivery Note→Sales Invoice) and buy chain (Material Request→RFQ→Purchase Order→Purchase Receipt→Purchase Invoice) mapper functions, `get_item_details`, Pricing Rule, POS Invoice, Blanket Order
- [erpnext-manufacturing.md](erpnext-manufacturing.md) — BOM, Work Order, Job Card, Production Plan, Manufacturing Settings, Subcontracting
- [erpnext-projects-assets-support.md](erpnext-projects-assets-support.md) — Projects, Assets and depreciation, Quality Management, Support (Issue/Warranty Claim), Maintenance
- [erpnext-extending.md](erpnext-extending.md) — Hook points ERPNext itself uses: `extend_doctype_class`/`override_doctype_class`, `override_whitelisted_methods`, `doc_events`, `scheduler_events`, `regional_overrides`, deprecation handling

See also [hrms-patterns.md](hrms-patterns.md) for Employee, leave, attendance, payroll and recruitment.

## Sources

Verified against ERPNext v16.6.1 (`apps/erpnext/erpnext/__init__.py` `__version__`) and Frappe v16.35.0 (`apps/frappe/frappe/__init__.py` `__version__`):

- `apps/frappe/frappe/model/docstatus.py` — `DocStatus.DRAFT`/`SUBMITTED`/`CANCELLED` = `0`/`1`/`2`
- Per-topic source citations live in each linked reference file (`erpnext-architecture.md`, `erpnext-accounting.md`, `erpnext-stock.md`, `erpnext-selling-buying.md`, `erpnext-manufacturing.md`, `erpnext-projects-assets-support.md`, `erpnext-extending.md`, `hrms-patterns.md`); this index file makes no additional standalone API claims
