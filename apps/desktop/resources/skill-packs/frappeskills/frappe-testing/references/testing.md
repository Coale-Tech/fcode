# Testing

## File location

Tests live alongside the code they test:
```
apps/<app>/<app>/<module>/doctype/<doctype>/test_<doctype>.py
```

For feature-wise tests, place in the tests directory:
```
apps/<app>/<app>/tests/test_<feature>.py
```

Discovery only picks up files named `test_*.py` (`frappe/testing/discovery.py`).

## Writing tests

```python
import frappe
from frappe.tests import IntegrationTestCase

class TestExpense(IntegrationTestCase):
    def test_expense_creation(self):
        doc = frappe.get_doc(doctype="Expense", title="Test", amount=100)
        doc.insert()
        self.assertEqual(doc.amount, 100)

    def test_validation(self):
        doc = frappe.get_doc(doctype="Expense", title="Test", amount=-1)
        self.assertRaises(frappe.ValidationError, doc.insert)
```

Key patterns:
- Inherit from `frappe.tests.IntegrationTestCase` (not `unittest.TestCase`), defined in
  `frappe/tests/classes/integration_test_case.py`. It handles site connection, test-record
  loading, and rollback for you.
- `frappe.tests.utils.FrappeTestCase` is a deprecated compatibility shim (deprecated
  2024-08-20, removed in v17) — a standalone copy of the old pre-split base class, not the
  same object as `IntegrationTestCase`. It is "overwhelmingly API-compatible" per its own
  docstring, but new code should inherit `IntegrationTestCase`/`UnitTestCase` from
  `frappe.tests` directly (`frappe/deprecation_dumpster.py`). Tests still inheriting
  `FrappeTestCase` are silently bucketed into a legacy `old-frappe-test-class-category` by the
  runner and emit a `DeprecationWarning` (`frappe/testing/discovery.py`).
- Tests run inside a transaction that rolls back — no manual cleanup needed
  (`IntegrationTestCase.setUpClass` registers `frappe.db.rollback` as a class cleanup).

## Unit tests (no database)

For pure logic that doesn't need Frappe context or database:

```python
from frappe.tests import UnitTestCase

class TestExpenseUtils(UnitTestCase):
    def test_calculate_tax(self):
        self.assertEqual(calculate_tax(100, 0.1), 10)
```

`UnitTestCase` (`frappe/tests/classes/unit_test_case.py`) only sets `frappe.set_user`
in `setUpClass` — no `frappe.init()`/DB connection/test-record loading, unlike
`IntegrationTestCase`. Use it for utility functions, calculations, parsing logic.
`IntegrationTestCase` extends `UnitTestCase`, so integration tests get its assertions too.

The `--test-category {unit,integration,all}` flag on `run-tests` filters by which base class a
test inherits (`frappe/testing/discovery.py`), so `UnitTestCase` subclasses can be run alone
for a fast pre-check.

## Frappe-specific assertions

Beyond stdlib `unittest` assertions, `UnitTestCase` adds (`frappe/tests/classes/unit_test_case.py`):

```python
self.assertDocumentEqual(expected, actual)   # dict/BaseDocument vs. a Document, field-by-field
self.assertQueryEqual(sql_a, sql_b)          # compares normalized (formatted) SQL strings
self.assertSequenceSubset(larger, smaller)   # smaller is a subset of larger
```

`IntegrationTestCase` adds DB-connection-dependent context managers
(`frappe/tests/classes/integration_test_case.py`):

```python
with self.assertQueryCount(5):                    # fails if more than 5 SQL queries run
    ...
with self.assertRowsRead(100):                     # fails if more than 100 rows are read
    ...
with self.assertRedisCallCounts(3):                 # fails on a different Redis call count
    ...
with self.primary_connection():                     # switch to the primary DB connection
    ...
with self.secondary_connection():                    # open/switch to a secondary DB connection
    ...
```

## Test context managers

`frappe/tests/classes/context_managers.py` registers these as both instance/static methods on
`UnitTestCase`/`IntegrationTestCase` (`self.<name>(...)`) and as free functions importable from
`frappe.tests`:

```python
from frappe.tests import change_settings, set_user, freeze_time, patch_hooks, timeout

class TestExpense(IntegrationTestCase):
    def test_over_limit_blocked(self):
        with self.change_settings("Expense Settings", max_amount=1000):
            ...

    def test_as_restricted_user(self):
        with self.set_user("test_user@example.com"):
            self.assertFalse(frappe.has_permission("Expense", "delete"))
        # user is restored automatically on exit

    def test_uses_frozen_time(self):
        with self.freeze_time("2024-01-01 12:00:00"):
            self.assertEqual(frappe.utils.now_datetime().year, 2024)
```

| Context manager | Scope | Purpose |
|---|---|---|
| `change_settings(doctype, /, commit=False, **fields)` | `IntegrationTestCase` | Temporarily set fields on a Settings singleton, restored on exit |
| `set_user(user)` | `UnitTestCase` | Temporarily switch `frappe.session.user`, restored on exit |
| `freeze_time(time_to_freeze, is_utc=False)` | `UnitTestCase` | Freeze time via `freezegun` |
| `patch_hooks(overridden_hooks)` | `UnitTestCase` | Temporarily override `frappe.get_hooks()` results |
| `switch_site(site)` | `IntegrationTestCase` | Drop the current connection and connect to a different site |
| `enable_safe_exec()` | `UnitTestCase` | Temporarily enable server scripts for the test |
| `debug_on(*exceptions)` | `UnitTestCase` | Drop into `pdb` when one of `exceptions` is raised (default `AssertionError`) |
| `timeout(seconds=30)` / `timeout_context(seconds=30)` | `UnitTestCase` | Decorator / context manager that raises if the block exceeds the timeout |
| `trace_fields(...)` | `UnitTestCase` | Trace reads/writes of specific Document fields for debugging |

Prefer these over ad hoc `try/finally` restoration blocks — they are the idiomatic pattern and
are what `run-tests --debug` hooks into (it wraps every test method with `debug_on`).

## Test fixtures

For test data that multiple tests need, create `test_records` or use `setUp`:

```python
class TestExpense(IntegrationTestCase):
    def setUp(self):
        self.category = frappe.get_doc(doctype="Expense Category", category_name="Travel").insert()
```

Fixture helpers below insert with `ignore_permissions=True` because factory setup runs before
any permission scenario is under test; that bypass is expected in test code and does not need
a comment on every call (unlike application code, where each bypass needs its own justification).

### JSON/TOML test records

Automatically loaded before tests run, from `<app>/<module>/doctype/<doctype>/test_records.json`
or, (v16), `test_records.toml` (`frappe/tests/utils/generators.py`):

```json
[
    {"doctype": "Sample Doc", "name": "Test Record 1", "title": "First Test Document", "status": "Open"},
    {"doctype": "Sample Doc", "name": "Test Record 2", "title": "Second Test Document", "status": "Closed"}
]
```

```python
class TestSampleDoc(IntegrationTestCase):
    def test_fixture_loaded(self):
        doc = frappe.get_doc("Sample Doc", "Test Record 1")
        self.assertIsNotNone(doc)
```

Loading priority for a doctype's records (`_generate_records_for` in `generators.py`):
1. A `_make_test_records()` function in the doctype's `test_<doctype>.py` — full escape hatch.
2. A `test_records` list attribute in the same module.
3. `test_records.toml` next to the doctype (v16).
4. `test_records.json` (legacy format, still read if the above are absent).

Any `IntegrationTestCase` subclass can read already-loaded global test records without
re-querying the DB via `self.globalTestRecords["Sample Doc"]` (a `MappingProxyType` populated
in `setUpClass`, `frappe/tests/classes/integration_test_case.py`).

### Dependency fixtures

Declare DocTypes that must be loaded first:

```python
# my_app/doctype/sales_order/test_sales_order.py
EXTRA_TEST_RECORD_DEPENDENCIES = ["Customer", "Item", "Warehouse"]
IGNORE_TEST_RECORD_DEPENDENCIES = ["Territory"]  # skip auto-discovered link-field dependencies
```

The older names `test_dependencies`/`test_ignore` still work but are deprecated (target
removal v17, migration script linked in the warning) — use `EXTRA_TEST_RECORD_DEPENDENCIES`/
`IGNORE_TEST_RECORD_DEPENDENCIES` in new code (`frappe/tests/utils/generators.py`,
`get_missing_records_module_overrides`). `frappe/tests/__init__.py` also declares
`global_test_dependencies = ["User"]` — `User` test records are always available.

### Factory functions

```python
# my_app/tests/fixtures.py
import frappe
from frappe.utils import random_string

def create_test_customer(name=None, **kwargs):
    customer = frappe.get_doc({
        "doctype": "Customer",
        "customer_name": name or f"Test Customer {random_string(5)}",
        "customer_type": "Company",
        "territory": "_Test Territory",
        **kwargs
    })
    customer.insert(ignore_permissions=True)
    return customer

def create_test_order(customer, items, **kwargs):
    order = frappe.get_doc({
        "doctype": "Sales Order",
        "customer": customer.name,
        "delivery_date": frappe.utils.add_days(frappe.utils.nowdate(), 7),
        "items": [{"item_code": item.name, "qty": 1, "rate": 100} for item in items],
        **kwargs
    })
    order.insert(ignore_permissions=True)
    return order
```

```python
from my_app.tests.fixtures import create_test_customer, create_test_order

class TestSalesWorkflow(IntegrationTestCase):
    def test_order_submission(self):
        customer = create_test_customer()
        order = create_test_order(customer, items=[])
        order.submit()
        self.assertEqual(order.docstatus, 1)
```

### Fixture best practices

Use unique names to avoid collisions with existing or parallel test data:

```python
from frappe.utils import random_string

# Do: unique name prevents collisions
create_test_customer(name=f"Test Cust {random_string(8)}")

# Don't: fixed name may collide with other tests
create_test_customer(name="Test Customer")
```

Track and clean up ad hoc records instead of leaking them:

```python
class TestWithCleanup(IntegrationTestCase):
    def setUp(self):
        self.created_docs = []

    def tearDown(self):
        for doctype, name in self.created_docs:
            frappe.delete_doc(doctype, name, force=True, ignore_permissions=True)

    def track_for_cleanup(self, doc):
        self.created_docs.append((doc.doctype, doc.name))
        return doc
```

Load the minimum data a test needs — a `setUpClass` that creates a thousand records to test
pagination is slow for every test in the class; create the bulk data inside the one test that
needs it instead.

### Shared fixtures module

```python
# my_app/tests/fixtures/__init__.py
from .customers import create_test_customer, get_test_customer
from .items import create_test_item, get_test_items
from .orders import create_test_order

__all__ = [
    "create_test_customer", "get_test_customer",
    "create_test_item", "get_test_items",
    "create_test_order",
]
```

Cache factory output by key when several tests in a module need the same record:

```python
# my_app/tests/fixtures/customers.py
_test_customers = {}

def create_test_customer(key=None, **kwargs):
    if key and key in _test_customers:
        return _test_customers[key]
    customer = frappe.get_doc({"doctype": "Customer", **kwargs})
    customer.insert(ignore_permissions=True)
    if key:
        _test_customers[key] = customer
    return customer
```

### Loading external data

```python
import csv
import json

def load_test_data_from_csv(csv_path, doctype):
    with open(csv_path) as f:
        for row in csv.DictReader(f):
            frappe.get_doc({"doctype": doctype, **row}).insert(ignore_permissions=True)

def load_test_data_from_json(json_path):
    with open(json_path) as f:
        for record in json.load(f):
            frappe.get_doc(record).insert(ignore_permissions=True)
```

### Fixture isolation (savepoint rollback)

For a test that needs to roll back mid-suite instead of relying on the outer test transaction:

```python
class TestWithRollback(IntegrationTestCase):
    def setUp(self):
        frappe.db.savepoint("test_start")

    def tearDown(self):
        frappe.db.rollback(save_point="test_start")
```

## Test site

Run tests on a **separate site** from the one the user is actively working on. Tests create, modify, and delete data — running them on the development site will pollute it.

Convention: if the dev site is `expense.localhost`, create `expense-test.localhost` for tests:
```bash
bench new-site expense-test.localhost --admin-password admin
bench --site expense-test.localhost install-app <app-name>
bench --site expense-test.localhost set-config allow_tests 1 --parse
```

Always run tests against the test site:
```bash
bench --site expense-test.localhost run-tests --app <app-name>
```

## Running tests

```bash
# All tests for an app
bench --site <site> run-tests --app <app-name>

# Specific DocType
bench --site <site> run-tests --doctype "Expense"

# Specific test file
bench --site <site> run-tests --module <app>.<module>.doctype.<doctype>.test_<doctype>

# Specific test method
bench --site <site> run-tests --module <app>.<module>.doctype.<doctype>.test_<doctype> --test test_expense_creation

# Only unit tests (UnitTestCase, no DB) or only integration tests
bench --site <site> run-tests --app <app-name> --test-category unit
bench --site <site> run-tests --app <app-name> --test-category integration
```

`--doctype`, `--doctype-list-path`, `--module-def`, and `--module` are mutually exclusive
(`frappe/commands/testing.py`).

Other `run-tests` flags worth knowing (`frappe/commands/testing.py`):

| Flag | Effect |
|---|---|
| `--case <TestCaseClass>` | Run only the named `TestCase` class |
| `--profile` | Run under `cProfile`, print cumulative stats |
| `--coverage` | Produce a coverage report via `frappe.coverage.CodeCoverage` |
| `--junit-xml-output <path>` | Write a JUnit XML report |
| `--failfast` | Stop on first failure |
| `--debug` | Disable output buffering, drop into `pdb` on any exception |
| `--skip-before-tests` | Skip the app's `before_tests` hook |
| `--lightmode` | Skip most environment setup for a faster, less isolated run |
| `--skip-test-records` | DEPRECATED, no longer has an effect |

### Parallel tests

`bench run-parallel-tests` splits an app's test files across N build shards by weight
(`frappe/parallel_test_runner.py`):

```bash
bench --site <site> run-parallel-tests --app <app-name> \
  --build-number 1 --total-builds 4
```

Flags: `--build-number`, `--total-builds`, `--with-coverage` (env `CAPTURE_COVERAGE`),
`--use-orchestrator` (delegate splitting to Frappe Cloud's parallel test orchestrator),
`--dry-run`, `--lightmode`.

UI tests: [references/cypress.md](cypress.md).

## Testing permissions

Switch user context to exercise role-based access, using the `set_user` context manager so the
original user is always restored, even on failure:

```python
class TestPermissions(IntegrationTestCase):
    def test_permission_denied(self):
        doc = frappe.get_doc({"doctype": "Sales Order", "customer": "_Test Customer"}).insert()
        with self.set_user("test_user@example.com"):
            self.assertFalse(frappe.has_permission("Sales Order", "delete"))
            doc.customer = "Other"
            self.assertRaises(frappe.PermissionError, doc.save)
```

## Common pitfalls

- If tests fail with "DocType not found", run `bench --site <site> migrate` first.
- Test files must be named `test_*.py` to be discovered.
- Missing `frappe.db.rollback()`/transaction isolation causes flaky, order-dependent tests.
- Asserting on internal method calls or field wiring instead of observable behaviour makes tests brittle.
- Hardcoded fixed test-record names collide with existing or parallel test data — use unique names.
- Testing only as `Administrator` skips permission bugs — assert role-restricted behaviour too.
- `EXTRA_TEST_RECORD_DEPENDENCIES`/`test_dependencies` only affects fixture loading order, not
  test execution order; don't rely on it for anything else.

## Sources

Verified against Frappe v16.35.0 (`frappe/__init__.py` `__version__`):

- `apps/frappe/frappe/testing/discovery.py` — test discovery (`test_*.py` file matching), `--test-category` filtering by base class
- `apps/frappe/frappe/tests/classes/unit_test_case.py`, `apps/frappe/frappe/tests/classes/integration_test_case.py` — `UnitTestCase`/`IntegrationTestCase`, Frappe-specific assertions, `assertQueryCount`/`assertRowsRead`/`assertRedisCallCounts`/connection context managers
- `apps/frappe/frappe/tests/classes/context_managers.py` — `change_settings`, `set_user`, `freeze_time`, `patch_hooks`, `switch_site`, `enable_safe_exec`, `debug_on`, `timeout`/`timeout_context`, `trace_fields`
- `apps/frappe/frappe/tests/__init__.py` — `global_test_dependencies`
- `apps/frappe/frappe/deprecation_dumpster.py` — `FrappeTestCase` deprecated compatibility shim
- `apps/frappe/frappe/tests/utils/generators.py` — test-record loading priority, `EXTRA_TEST_RECORD_DEPENDENCIES`/`IGNORE_TEST_RECORD_DEPENDENCIES`
- `apps/frappe/frappe/commands/testing.py` — `run-tests` CLI flags and mutual exclusivity of `--doctype`/`--doctype-list-path`/`--module-def`/`--module`
- `apps/frappe/frappe/parallel_test_runner.py` — `run-parallel-tests` sharding flags
