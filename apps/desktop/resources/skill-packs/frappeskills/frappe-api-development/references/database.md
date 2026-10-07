# Database & ORM

## Architecture note (v16)

`frappe.get_list`/`frappe.get_all` (and therefore `frappe.db.get_list`/`frappe.db.get_all`,
which just delegate to them) now build their query through `frappe.model.qb_query.DatabaseQuery`,
which calls the same PyPika-based `frappe.qb.get_query()` Engine (`frappe/database/query.py`)
used directly in the examples below — not the legacy `frappe.model.db_query.DatabaseQuery`
used pre-v16. Practical effect: the nested `and`/`or` filter groups and doctype-qualified
4-element filters documented under **Filters syntax** now work through `get_list`/`get_all`
too, not just `frappe.qb.get_query`. The old `db_query.py` module still exists but is only
used internally for a handful of standalone helpers (date-range filters, `mask_field_value`,
etc.); its `DatabaseQuery` class itself is no longer the list-query code path.


## Reading data

```python
# Get single document
doc = frappe.get_doc("Expense", "EXP-0001")

# Get single value
amount = frappe.db.get_value("Expense", "EXP-0001", "amount")

# Get multiple fields
name, amount = frappe.db.get_value("Expense", "EXP-0001", ["name", "amount"])

# Get all matching records
expenses = frappe.db.get_all("Expense",
    filters={"status": "Draft"},
    fields=["name", "title", "amount", "link_field.field"],
    order_by="creation desc",
    limit=20
)

# Get list (same as get_all but respects permissions)
expenses = frappe.db.get_list("Expense", filters={"status": "Draft"}, fields=["*"])

# Count
count = frappe.db.count("Expense", {"status": "Draft"})

# Check existence
exists = frappe.db.exists("Expense", "EXP-0001")
exists = frappe.db.exists("Expense", {"title": "Lunch", "status": "Draft"})
```

## `get_all` vs `get_list`

- `frappe.db.get_all` — ignores permissions, returns all matching records
- `frappe.db.get_list` — respects user permissions, applies filters based on role

Use `get_all` for server-side logic. Use `get_list` in user-facing APIs.

## Writing data

```python
# Create
doc = frappe.get_doc({"doctype": "Expense", "title": "Lunch", "amount": 50})
doc.insert()

# Update via doc
doc = frappe.get_doc("Expense", "EXP-0001")
doc.amount = 75
doc.save()

# Quick update (single field, skips controller hooks)
# Use for derived/cached fields, counters, timestamps — NOT for fields with validation logic or status transitions
frappe.db.set_value("Expense", "EXP-0001", "amount", 75)

# Bulk update
frappe.db.set_value("Expense", {"status": "Draft"}, "status", "Cancelled")
```

## Filters syntax

```python
# Dict style (simple equality)
filters = {"status": "Draft", "amount": 100}

# List style (operators)
filters = [
    ["status", "=", "Draft"],
    ["amount", ">", 50],
    ["title", "like", "%lunch%"],
    ["creation", "between", ["2024-01-01", "2024-12-31"]]
]

# Supported operators: =, !=, >, <, >=, <=, like, not like, in, not in, between, is (for NULL)

# Nested AND/OR groups (v16) — join condition lists with "and"/"or" literals.
# Works with frappe.get_list/get_all and frappe.qb.get_query alike (same Engine).
filters = [
    ["status", "=", "Open"],
    "or",
    ["status", "=", "Closed"],
]

# Doctype-qualified filters for joined/child tables (v16) — 4-element form
# [doctype, fieldname, operator, value] instead of the usual 3-element form.
filters = [
    ["Sales Order Item", "item_code", "=", "ITEM-001"],
]
```


## `frappe.qb.get_query` (preferred for complex queries)

Use instead of `get_all` when you need: joins via linked/child fields, aggregations, OR conditions, subqueries, or record locking. Docs: https://docs.frappe.io/framework/get_query

```python
# Basic usage
query = frappe.qb.get_query("User", fields=["name", "email"], filters={"enabled": 1})
users = query.run(as_dict=True)

# Linked document fields (auto-joins via dot notation)
query = frappe.qb.get_query("Sales Order",
    fields=["name", "customer.customer_name as customer_name"],
    filters={"customer.territory": "North America"}
)

# Child table fields
query = frappe.qb.get_query("Sales Order",
    fields=["name", {"items": ["item_code", "qty", "rate"]}],
    filters={"items.item_code": "Item A"},
    distinct=True
)

# Aggregations
query = frappe.qb.get_query("Expense",
    fields=["category", {"SUM": "amount", "as": "total"}],
    group_by="category"
)

# OR conditions
query = frappe.qb.get_query("User", filters=[
    ["first_name", "=", "Admin"],
    "or",
    ["first_name", "=", "Guest"],
])

# Pagination
query = frappe.qb.get_query("User", fields=["name"], limit=20, offset=40)

# frappe.qb.get_query defaults to ignore_permissions=True (query.py:233) because
# it's a low-level builder used internally by permission-aware callers like
# get_list/get_all; pass ignore_permissions=False to opt into a permission_query_conditions-filtered query
query = frappe.qb.get_query("Expense", ignore_permissions=False)

# Record locking
query = frappe.qb.get_query("Stock Entry", filters={"name": "SE-001"}, for_update=True)

# Large datasets — iterate without loading all into memory
with frappe.db.unbuffered_cursor():
    for row in query.run(as_iterator=True, as_dict=True):
        process(row)
```

### When to use what

| Need | Use |
|------|-----|
| Simple CRUD, single doc | `frappe.get_doc`, `frappe.db.get_value`, `frappe.db.set_value` |
| List with simple filters | `frappe.db.get_all` / `frappe.db.get_list` |
| Joins, aggregations, OR logic, child table queries | `frappe.qb.get_query` |
| Composable query — pass query object to other functions to add clauses | `frappe.qb.get_query` |

## Transactions

Frappe manages transactions automatically. You almost never need `frappe.db.commit()` or `frappe.db.rollback()`.

- **POST/PUT web requests**: auto-commit after successful completion. GET requests do NOT commit.
- **Background/scheduled jobs**: auto-commit after successful completion.
- **Patches**: auto-commit after successful `execute()`.
- **Uncaught exceptions**: auto-rollback in all contexts (web requests, background jobs, patches).

`frappe.db.commit()` is only needed in rare cases like flushing writes mid-script so a subsequent `frappe.enqueue` call can read them.

```python
# Use savepoints for partial rollback within a transaction
frappe.db.savepoint("before_risky_op")
try:
    ...
except Exception:
    frappe.db.rollback(save_point="before_risky_op")
```

## PyPika query builder (`frappe.qb`)

You may encounter `frappe.qb.DocType("...")` in existing codebases — this is the lower-level PyPika builder. Prefer `frappe.qb.get_query` (documented above) for new code, but recognize and maintain this style when editing existing code:

```python
Expense = frappe.qb.DocType("Expense")
query = (
    frappe.qb.from_(Expense)
    .select(Expense.name, Expense.amount)
    .where(Expense.status == "Draft")
    .orderby(Expense.creation, order=frappe.qb.desc)
    .limit(20)
)
results = query.run(as_dict=True)
```

## Anti-patterns

### Never use frappe.db.sql by default

**Always use `frappe.qb` (or `frappe.get_all`/`frappe.get_list`) — never
`frappe.db.sql`, even parameterized, for a query the query builder can
express.** Raw SQL bypasses `frappe.qb`'s automatic multitenancy-safe table
naming, dialect handling (MariaDB/Postgres/SQLite), and composability, and is
one accidental edit away from SQL injection. This covers UPDATE/INSERT/DELETE
too — `frappe.qb.from_(Table).delete().where(...)` and
`frappe.qb.update(Table)` both work (`frappe/database/query.py:290`).
Dialect-specific SQL functions (`TIMESTAMPDIFF`, `SUBSTRING_INDEX`, etc.) are
expressible via `pypika.terms.CustomFunction("FN_NAME", ["arg1", "arg2"])`,
matching the pattern `frappe.query_builder.functions` itself uses. CTEs are
also supported — pypika's `QueryBuilder.with_(selectable, name)` renders a
real `WITH name AS (...)` clause (`pypika/queries.py:850,1397`), so a CTE is
not a reason to drop to raw SQL either.

The one legitimate exception is an operator `frappe.qb`/PyPika does not
expose at all — e.g. a `REGEXP`/dialect-specific match operator. Frappe core
itself drops to `frappe.db.sql` for exactly this reason in
`append_number_if_name_exists` (`frappe/model/naming.py:531-537`, matching
`frappe.db.REGEX_CHARACTER` in a `WHERE` clause with no query-builder
equivalent). Comment why at the call site when you hit this.

- **UPDATE via `frappe.qb`, not raw SQL:**
  ```python
  # BAD
  frappe.db.sql("UPDATE `tabExpense` SET `amount` = `amount` + 1 WHERE name = %s", (name,))
  # GOOD
  Expense = frappe.qb.DocType("Expense")
  frappe.qb.update(Expense).set(Expense.amount, Expense.amount + 1).where(Expense.name == name).run()
  ```
- **Don't make multiple queries when one will do.** Use OR filters via `frappe.qb.get_query` instead of chaining `frappe.db.get_value(...) or frappe.db.get_value(...)`.
- **Use `frappe.db.delete` for bulk deletion when the DocType has no `on_trash`/`after_delete` hooks.** It runs a single DELETE query. Use `frappe.delete_doc` in a loop only when controller trash hooks need to fire.
- **Batch-fetch related records instead of querying in a loop.**
  ```python
  # BAD — N+1
  for exp in expenses:
      exp.category_label = frappe.db.get_value("Expense Category", exp.category, "label")
  # GOOD
  cat_ids = {e.category for e in expenses if e.category}
  cat_map = {c.name: c.label for c in frappe.get_all("Expense Category", filters={"name": ["in", list(cat_ids)]}, fields=["name", "label"])}
  for exp in expenses:
      exp.category_label = cat_map.get(exp.category)
  ```

---

## Database API

### Get Values

```python
# Single value
name = frappe.db.get_value("Customer", {"email": "test@example.com"}, "name")

# Multiple values
name, email = frappe.db.get_value("Customer", "CUST-001", ["name", "email_id"])

# As dict
data = frappe.db.get_value("Customer", "CUST-001",
    ["name", "email_id", "territory"], as_dict=True)
```

### Get List

```python
# Get all — ignores permissions, returns every matching row unless limited
docs = frappe.get_all("Customer",
    fields=["name", "customer_name", "territory"],
    filters={"status": "Active"},
    order_by="creation desc",
    limit_start=0,
    limit_page_length=20
)

# Get list — checks the caller's read permission on the doctype/rows
docs = frappe.get_list("Customer",
    fields=["name", "customer_name"],
    filters={"disabled": 0}
)
```

`limit_start`/`limit_page_length` (and the `frappe.qb.get_query`-level `start`/`page_length`
aliases) are deprecated in favor of `offset`/`limit` — passing the old names still works but
emits a deprecation warning (`frappe/model/qb_query.py`, graduating in v17). Prefer:

```python
docs = frappe.get_list("Customer", filters={"disabled": 0}, limit=20, offset=0)
```

Omitting both the limit and offset args on `get_list`/`get_all` returns **every** matching
row — there is no implicit page size, despite some framework docstrings saying "Default 20".
Always pass an explicit `limit`/`limit_page_length` on endpoints backed by user input.


### Set Value

```python
# Set single field
frappe.db.set_value("Customer", "CUST-001", "status", "Active")

# Set multiple fields
frappe.db.set_value("Customer", "CUST-001", {
    "status": "Active",
    "territory": "Kenya"
})
```

### Existence & Count

```python
# Check existence
exists = frappe.db.exists("Customer", "CUST-001")
exists = frappe.db.exists("Customer", {"email_id": "test@example.com"})

# Count
count = frappe.db.count("Customer", {"status": "Active"})
```

### Single DocType Values

```python
# frappe.db.* form (always hits/refreshes via DB layer)
value = frappe.db.get_single_value("My Settings", "enable_feature")
frappe.db.set_single_value("My Settings", "enable_feature", 1)

# v16: top-level cached getter (frappe.get_single_value -> get_cached_value)
# Prefer this for reads; it is cache-backed.
value = frappe.get_single_value("My Settings", "enable_feature")

# Full single document
settings = frappe.get_single("My Settings")   # == frappe.get_doc("My Settings", "My Settings")
settings.enable_feature = 1
settings.save()
```

### Cached Reads (v16)

```python
# Cached full document (1h TTL, invalidated on save)
doc = frappe.get_cached_doc("Customer", "CUST-001")

# Cached field(s) without materializing the whole doc
name = frappe.get_cached_value("Customer", "CUST-001", "customer_name")
row  = frappe.get_cached_value("Customer", "CUST-001",
    ["customer_name", "territory"], as_dict=True)

# Lazy-loaded doc: defers load_from_db until a field is accessed
doc = frappe.get_lazy_doc("Customer", "CUST-001")
```

### Query builder, not raw SQL

See [Never use frappe.db.sql by default](#never-use-frappedbsql-by-default) —
the queries a `frappe.db.sql` call like this used to run are `frappe.qb`:

```python
Customer = frappe.qb.DocType("Customer")
results = (
    frappe.qb.from_(Customer)
    .select(Customer.name, Customer.status)
    .where(Customer.territory == "Kenya")
    .where(Customer.status == "Active")
    .orderby(Customer.creation, order=frappe.qb.desc)
    .run(as_dict=True)
)

# Single value — frappe.db.count, not a raw COUNT(*) query
value = frappe.db.count("Customer")
```

### Bulk Operations & DDL

```python
# Multi-row UPDATE with per-row differing values in one query (CASE-based).
# doc_updates is a dict keyed by docname, not a list of dicts.
frappe.db.bulk_update("Customer", {
    "CUST-001": {"territory": "Kenya"},
    "CUST-002": {"territory": "Uganda"},
}, chunk_size=100)

# Bulk INSERT of raw rows (bypasses controller hooks and validation entirely)
frappe.db.bulk_insert("Customer", fields=["name", "customer_name"], values=[
    ("CUST-101", "Acme"), ("CUST-102", "Globex"),
])

# Single-query DELETE — no on_trash/after_delete hooks fire
frappe.db.delete("Customer", filters={"status": "Disabled"})

# Drop all rows without logging individual deletes (DDL, not transactional in most engines)
frappe.db.truncate("Log Table")

# frappe.db.multisql — for syntax that genuinely diverges per dialect, not
# just a different function name (those go through pypika CustomFunction
# instead). Real core example: random ordering has no portable SQL syntax.
results = frappe.db.multisql({
    "mariadb": "SELECT name FROM `tabCustomer` ORDER BY RAND() LIMIT %s",
    "postgres": '''SELECT name FROM "tabCustomer" ORDER BY RANDOM() LIMIT %s''',
}, (10,))

# DDL statements (CREATE/ALTER/DROP) — separate from frappe.db.sql for clarity
frappe.db.sql_ddl("ALTER TABLE `tabCustomer` ADD INDEX idx_territory (territory)")
```

A module-level `savepoint` context manager (`frappe.database.savepoint`) is also available
as an alternative to the string-based `frappe.db.savepoint("label")` /
`frappe.db.rollback(save_point="label")` pair shown under **Transactions** — note it is
imported directly, not called as `frappe.db.savepoint(...)`:

```python
from frappe.database import savepoint

with savepoint(catch=Exception):
    doc.save()
```


### Transaction Management

See [`## Transactions`](#transactions) above — Frappe auto-commits/auto-rolls-back
web requests, background jobs, and patches, so manual `frappe.db.commit()` is
rarely needed. When it genuinely is (e.g. a long-running `bench execute` batch
script that must persist partial progress before continuing), always pair it
with rollback-on-error and log the failure:

```python
# bench execute script: commit after each successful doc so a later failure
# doesn't lose already-processed work
try:
    doc1.save()
    doc2.save()
    frappe.db.commit()
except Exception as e:
    frappe.db.rollback()
    frappe.log_error(f"Error: {e}")
    frappe.throw(str(e))
```

---

## Query Builder (PyPika)

Type-safe queries using the PyPika library. Preferred over raw SQL.

### Basic Queries

```python
from frappe.query_builder import DocType

Customer = DocType("Customer")

# Simple select
query = (
    frappe.qb.from_(Customer)
    .select(Customer.name, Customer.customer_name, Customer.territory)
    .where(Customer.status == "Active")
    .orderby(Customer.creation, order=frappe.qb.desc)
    .limit(20)
)
results = query.run(as_dict=True)
```

### Filters and Conditions

```python
from frappe.query_builder.functions import Count, Sum, IfNull

# Multiple conditions
query = (
    frappe.qb.from_(Customer)
    .select(Customer.name)
    .where(Customer.status == "Active")
    .where(Customer.territory == "Kenya")
    .where(Customer.creation >= "2024-01-01")
)

# OR conditions
query = (
    frappe.qb.from_(Customer)
    .select(Customer.name)
    .where(
        (Customer.territory == "Kenya") | (Customer.territory == "Uganda")
    )
)

# IN operator
query = (
    frappe.qb.from_(Customer)
    .select(Customer.name)
    .where(Customer.status.isin(["Active", "Lead"]))
)

# LIKE
query = (
    frappe.qb.from_(Customer)
    .select(Customer.name)
    .where(Customer.customer_name.like("%Corp%"))
)

# IS NULL / IS NOT NULL
query = (
    frappe.qb.from_(Customer)
    .select(Customer.name)
    .where(Customer.phone.isnotnull())
)
```

### Joins

```python
Customer = DocType("Customer")
SalesInvoice = DocType("Sales Invoice")

# Inner join
query = (
    frappe.qb.from_(Customer)
    .join(SalesInvoice)
    .on(Customer.name == SalesInvoice.customer)
    .select(Customer.name, SalesInvoice.grand_total)
    .where(SalesInvoice.docstatus == 1)
)

# Left join
query = (
    frappe.qb.from_(Customer)
    .left_join(SalesInvoice)
    .on(Customer.name == SalesInvoice.customer)
    .select(Customer.name, Count(SalesInvoice.name).as_("invoice_count"))
    .groupby(Customer.name)
)
```

### Aggregations

```python
from frappe.query_builder.functions import Count, Sum, Avg, Max, Min

SalesInvoice = DocType("Sales Invoice")

query = (
    frappe.qb.from_(SalesInvoice)
    .select(
        SalesInvoice.customer,
        Count(SalesInvoice.name).as_("total_invoices"),
        Sum(SalesInvoice.grand_total).as_("total_amount"),
        Avg(SalesInvoice.grand_total).as_("avg_amount"),
    )
    .where(SalesInvoice.docstatus == 1)
    .groupby(SalesInvoice.customer)
    .having(Sum(SalesInvoice.grand_total) > 100000)
    .orderby(Sum(SalesInvoice.grand_total), order=frappe.qb.desc)
)
```

### Subqueries

```python
# Subquery
subquery = (
    frappe.qb.from_(SalesInvoice)
    .select(SalesInvoice.customer)
    .where(SalesInvoice.docstatus == 1)
    .distinct()
)

query = (
    frappe.qb.from_(Customer)
    .select(Customer.name)
    .where(Customer.name.isin(subquery))
)
```

---

## Sources

Verified against Frappe v16.35.0 (`frappe/__init__.py` `__version__ = "16.35.0"`):

- `apps/frappe/frappe/__init__.py` — `whitelist`, `get_list`/`get_all`/`get_value`, `delete_doc`, `rename_doc`, `get_hooks`, and the `frappe.model.document` re-exports (`get_doc`, `new_doc`, `get_cached_doc`, `get_cached_value`, `get_single_value`, `get_last_doc`, `get_single`, `get_lazy_doc`); `cache` / `client_cache` globals
- `apps/frappe/frappe/model/document.py` — `get_doc` (singledispatch), `new_doc`, `get_cached_doc`, `get_single_value`, `get_last_doc`, `db_set`
- `apps/frappe/frappe/model/qb_query.py` — `DatabaseQuery.execute()`, the v16 `get_list`/`get_all` code path, and the `limit_start`/`limit_page_length`/`start`/`page_length` deprecation warnings
- `apps/frappe/frappe/database/query.py` — `Engine.get_query()`/`Engine.apply_filters()` (nested AND/OR groups, 4-element doctype-qualified filters, `ignore_permissions` default, `for_update`/`skip_locked`/`wait`)
- `apps/frappe/frappe/database/database.py` — `get_value`, `set_value`, `get_single_value`, `exists`, `count`, `bulk_update`, `bulk_insert`, `delete`, `truncate`, `multisql`, `sql_ddl`, `savepoint`
- `apps/frappe/frappe/query_builder/` — `frappe.qb`, `DocType`, `get_query`
- Query builder enforcement: `apps/frappe/frappe/database/query.py:290` (`.delete()` support), `apps/frappe/frappe/query_builder/functions.py` (`CustomFunction`/`ImportMapper` wrapping dialect-specific SQL), `apps/frappe/frappe/model/naming.py:531-537` (`append_number_if_name_exists`, the one real `REGEXP`-operator exception), `env/lib/python3.14/site-packages/pypika/queries.py:850,1397` (`QueryBuilder.with_`/`_with_sql` — CTE support), `apps/frappe/frappe/utils/make_random.py:42-44` (real core `multisql` use for `RAND()`/`RANDOM()` — genuine per-dialect syntax divergence, not just a function-name difference)
- `apps/frappe/frappe/utils/background_jobs.py` — `enqueue`/`enqueue_doc` signatures, `get_queues_timeout` (short/default=300s, long=1500s), `is_job_enqueued`, `job_name` deprecation
- `apps/frappe/frappe/hooks.py` — framework `doc_events`, `scheduler_events`, and hook-key surface
- `apps/frappe/frappe/utils/boilerplate.py` — `hooks_template` (canonical `bench new-app` hooks.py)
- `apps/frappe/frappe/core/doctype/scheduled_job_type/scheduled_job_type.json` — scheduler frequency options
- `apps/frappe/frappe/utils/redis_wrapper.py` + `frappe/utils/caching.py` — `frappe.cache`, `client_cache`, `request_cache`/`site_cache`/`redis_cache`
