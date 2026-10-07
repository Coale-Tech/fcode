# ERPNext Accounting

Chart of Accounts, GL/Payment Ledger, invoices, tax templates and the v16
withholding-tax rework. Part of [erpnext-workflows.md](erpnext-workflows.md).
Posting mechanics (who calls `make_gl_entries`, event order) are in
[erpnext-architecture.md](erpnext-architecture.md); this file covers the
Accounting DocTypes and helper APIs themselves.

---

## Chart of Accounts

`Account` is a tree DocType (`is_group` marks a parent). `root_type` is one of
`Asset`, `Liability`, `Equity`, `Income`, `Expense`; `account_type` (e.g.
`Receivable`, `Payable`, `Bank`, `Stock`, `Tax`) drives validation elsewhere
(e.g. only a `Receivable`/`Payable` account can be a party account). A new
company can seed its tree from a template in
`accounts/doctype/account/chart_of_accounts/verified/` (country-specific
JSON/CSV charts picked in the Company setup wizard).

```python
frappe.get_all("Account", filters={"company": company, "is_group": 0},
    fields=["name", "account_type", "root_type"])
```

## GL Entry and Payment Ledger Entry

`GL Entry` is the immutable ledger row every submittable financial document
writes (never insert one directly — see
[erpnext-architecture.md](erpnext-architecture.md#general-ledger-posting-path)).
`Payment Ledger Entry` (PLE) is a second, party-centric ledger written
alongside GL Entry specifically for receivable/payable accounts; **outstanding
amounts are computed from PLE, not by summing GL Entry**, which is why
`accounting_dimension_doctypes` (`hooks.py:522`) lists both `GL Entry` and
`Payment Ledger Entry`.

```python
from erpnext.accounts.utils import get_balance_on
get_balance_on(account=None, date=None, party_type=None, party=None,
    company=None, in_account_currency=True, cost_center=None,
    ignore_account_permission=False)  # accounts/utils.py:201
```

## Sales and Purchase Invoice

Both subclass `SellingController`/`BuyingController`
([erpnext-architecture.md](erpnext-architecture.md)). Fields to know before
customizing:

| Field | Meaning |
|---|---|
| `is_return` | Credit/debit note; `return_against` links the original |
| `update_stock` | Invoice also posts a Delivery Note/Purchase Receipt-equivalent SLE |
| `is_pos` | Sales Invoice created from Point of Sale; pulls `POS Profile` |
| `debit_to` / `credit_to` | Party account resolved via `get_party_account` (`accounts/party.py:421`) |

## Payment Entry

```python
from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry
get_payment_entry(dt, dn, party_amount=None, bank_account=None, bank_amount=None,
    party_type=None, payment_type=None, reference_date=None,
    created_from_payment_request=False)  # payment_entry.py:2849
```

Returns a mapped, unsaved `Payment Entry` against the source document (Sales
Invoice, Purchase Invoice, Sales Order, etc.) with party, amounts and accounts
pre-filled — do not build a Payment Entry field-by-field by hand.

## Journal Entry

Generic double-entry voucher; `voucher_type` (e.g. `Journal Entry`, `Bank
Entry`, `Cash Entry`, `Contra Entry`, `Excise Entry`, `Write Off Entry`,
`Opening Entry`) is a Select on the DocType, not a hook. Used for entries that
don't map to a sales/purchase document — write-offs, contra, opening balances.

## Tax templates

`Sales Taxes and Charges Template` / `Purchase Taxes and Charges Template`
hold the rows applied to invoice/order taxes; `Item Tax Template` overrides
the rate per item. `Item Wise Tax Detail` **(v16)** is a new child table that
records the resolved tax amount per item row (previously only totals were
kept), giving reports item-level tax breakdowns without recomputation.

## Exchange rate

```python
from erpnext.setup.utils import get_exchange_rate
get_exchange_rate(from_currency, to_currency, transaction_date=None, args=None)
# setup/utils.py:95 — checks Currency Exchange records, falls back to the
# configured exchange rate provider (e.g. frankfurter.app) with caching.
```

## Accounting Dimensions

Custom dimensions (Cost Center-like fields such as Project, Territory, or a
fully custom one) attach to every doctype named in the `accounting_dimension_doctypes`
hook (`hooks.py:522` — GL Entry, Payment Ledger Entry, Sales/Purchase Invoice,
Payment Entry, Asset, Stock Entry, Budget, Delivery Note, and the child item
tables). A custom app adds its own transaction doctype to this same hook list
to make dimensions apply there too.

## Accounting Period and Period Closing

`Accounting Period` restricts which users can post/edit documents in a date
range. `Period Closing Voucher` transfers Income/Expense balances to a
retained-earnings account for a fiscal year. The `period_closing_doctypes`
hook (`hooks.py:315`) lists the doctypes checked for a closed period (`Sales
Invoice`, `Purchase Invoice`, `Journal Entry`, `Bank Clearance`, `Stock
Entry`, ...); add a custom financial doctype here to make it period-aware.

## Payment and Bank Reconciliation

`Payment Reconciliation` matches unreconciled Payment Entries/Journal Entries
against outstanding invoices for a party. `Bank Reconciliation Tool` matches
`Bank Transaction` rows against Payment Entries/Journal Entries using
`get_matching_queries` (`get_hooks("get_matching_queries")` — a customizable
hook list of query functions each returning candidate matches).

## Budget

`Budget` (company + fiscal year + cost center or Accounting Dimension) with
child table `Budget Account` (account + budgeted amount) enforces
`action_if_annual_budget_exceeded` / `action_if_accumulated_monthly_budget_exceeded`
(`Ignore`/`Warn`/`Stop`) at document validation. `Budget Distribution`
**(v16)** lets a budget be spread unevenly across months (replacing an even
12-way split) — attach it via the Budget's `budget_distribution` link, not by
overriding the monthly-check function.

## Deferred revenue/expense

Set `enable_deferred_revenue`/`enable_deferred_expense` and a schedule on an
invoice item row; the scheduled job processes bookings:

```python
from erpnext.accounts.deferred_revenue import process_deferred_accounting
process_deferred_accounting(posting_date=None)  # deferred_revenue.py:433
```

## Repost Accounting Ledger

There is no `repost_allowed_doctypes` hook. Which voucher types may be
reposted is configured on the **Repost Accounting Ledger Settings** singleton
(`Repost Allowed Types` child table), read by
`get_allowed_types_from_settings()`
(`accounts/doctype/repost_accounting_ledger/repost_accounting_ledger.py:217`).
`Repost Accounting Ledger` then re-derives GL/Payment Ledger entries for the
selected vouchers without deleting and reinserting them by hand.

## v16 withholding-tax rework

v15 tracked TDS/TCS via `Tax Withheld Vouchers` and `Advance Tax` +
`Advance Taxes and Charges`. **v16** replaces these with `Tax Withholding
Entry` and `Tax Withholding Group` (both new DocTypes); `Tax Withholding
Category` and `Tax Withholding Rate` are unchanged. If a custom report or
integration reads `Tax Withheld Vouchers`, it must be ported to `Tax
Withholding Entry` for v16.

## v16-only reporting DocTypes

`Financial Report Template` and `Financial Report Row` **(v16)** define
reusable structured financial-statement layouts (row ordering, formulas,
account ranges) that a Financial Statement report renders from, instead of
each report hardcoding its row layout. `Account Category` **(v16)** groups
accounts for higher-level reporting cuts independent of the Chart of
Accounts tree.

`Sales Invoice Reference` **(v16)** is a new child table on `Payment Entry`
recording which Sales Invoices a payment specifically references, beyond the
existing `Payment Entry Reference`.

## Sources

Verified against ERPNext v16.6.1 and the v15.119.0 baseline
(`apps/erpnext/erpnext/__init__.py`):

- `apps/erpnext/erpnext/accounts/utils.py` — `get_balance_on` (:201), `reconcile_against_document` (:507), `get_stock_and_account_balance` (:1801)
- `apps/erpnext/erpnext/accounts/doctype/payment_entry/payment_entry.py` — `get_payment_entry` (:2849)
- `apps/erpnext/erpnext/setup/utils.py` — `get_exchange_rate` (:95)
- `apps/erpnext/erpnext/accounts/deferred_revenue.py` — `process_deferred_accounting` (:433)
- `apps/erpnext/erpnext/accounts/doctype/repost_accounting_ledger/repost_accounting_ledger.py` — `get_allowed_types_from_settings` (:217)
- `apps/erpnext/erpnext/hooks.py` — `accounting_dimension_doctypes` (:522), `period_closing_doctypes` (:315), `invoice_doctypes` (:513), `advance_payment_payable_doctypes` (:511)
- DocType listings: `apps/erpnext/erpnext/accounts/doctype/` (v16: `budget_distribution`, `financial_report_template`, `financial_report_row`, `account_category`, `tax_withholding_entry`, `tax_withholding_group`, `item_wise_tax_detail`, `sales_invoice_reference`; v15-only: `tax_withheld_vouchers`, `advance_tax`, `advance_taxes_and_charges`)
