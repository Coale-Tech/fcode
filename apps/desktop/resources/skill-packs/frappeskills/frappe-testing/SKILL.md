---
name: frappe-testing
description: Write and run Frappe tests including unit tests, test records and factories, CI pipelines, and Cypress UI tests. Use when proving behaviour, preventing regressions, or wiring test automation.
---

# Frappe Testing

Prove the behaviour you changed, and keep it proven.

## When to use

- Writing unit or integration tests for controllers, APIs, or jobs
- Building test data factories and fixtures
- Wiring CI for an app
- Writing Cypress UI tests for Desk or a portal

## Inputs required

- The contract under test (what a consumer observes)
- The site to run tests against (never production)
- Existing test conventions in the app

## Procedure

### 0) Decide whether a test is warranted

A test earns its place when a plausible bug would fail it: behaviour,
boundaries, invariants, transitions, precedence, real errors. Wiring, defaults
and field copies do not need tests — use a throwaway script instead.

### 1) Write the test

```python
import frappe
from frappe.tests import IntegrationTestCase

class TestSampleDoc(IntegrationTestCase):
    def test_negative_amount_rejected(self):
        doc = frappe.get_doc({"doctype": "Sample Doc", "amount": -5})
        with self.assertRaises(frappe.ValidationError):
            doc.insert()
```

Patterns, factories and fixtures:
[references/testing.md](references/testing.md),
[references/test-patterns.md](references/test-patterns.md).

### 2) Run it

```bash
bench --site <site> run-tests --app <app>
bench --site <site> run-tests --module <app>.tests.test_sample_doc
bench --site <site> run-tests --doctype "Sample Doc"
```

`run-tests` exits with "Testing is disabled for the site!" unless the site has
`allow_tests` set (`bench --site <site> set-config allow_tests true`) or the
`CI` env var is present. Use a dedicated test site; each test class rolls back
its writes. Parallel CI: `bench run-parallel-tests --app <app> --build-number
<n> --total-builds <n>` (there is no `--split`).

### 3) Add UI coverage where it matters

Cypress for flows a Python test cannot cover — form interactions, list actions:
[references/cypress.md](references/cypress.md).

### 4) Wire CI

GitHub Actions setup with MariaDB/Redis services and bench bootstrap:
[references/ci-testing.md](references/ci-testing.md).

## Verification

- [ ] The new test fails before the fix and passes after it
- [ ] Tests pass from a clean site, not only locally
- [ ] No test depends on another test's leftover data
- [ ] Tests do not hit external services (mocked or skipped)
- [ ] CI run is green on a fresh checkout
- [ ] Suite runtime stays acceptable

## Failure modes / debugging

- **`DoesNotExistError` on test data**: dependency records not created; use a factory or `test_records`
- **Tests pass alone, fail in the suite**: shared state or an uncommitted transaction leaking between tests
- **"Testing is disabled for the site!"**: `allow_tests` not set on the site
- **Cypress can't log in**: test user fixtures missing, or the site URL is wrong
- **CI fails only in CI**: missing service (Redis/MariaDB) or a timezone/locale difference
- **Slow suite**: real network calls or unnecessary document creation per test

## Escalation

- Behaviour is unclear before testing it → [`frappe-deep-research`](../frappe-deep-research/SKILL.md)
- Whole-app quality sweep → [`frappe-app-audit`](../frappe-app-audit/SKILL.md)
- Environment isolation for tests → [`frappe-manager`](../frappe-manager/SKILL.md)

## References

- [references/testing.md](references/testing.md) - Test runner, structure, assertions
- [references/test-patterns.md](references/test-patterns.md) - Factories, fixtures, mocking
- [references/ci-testing.md](references/ci-testing.md) - CI pipelines for Frappe apps
- [references/cypress.md](references/cypress.md) - UI testing

## Guardrails

- **Never run tests against production**: the runner writes and deletes data
- **Test observable contracts**, not implementation details or source text
- **Deterministic and isolated**: no ordering dependencies, no shared mutable state
- **No external network calls** in tests
- **Delete tests that pin wording or implementation** rather than re-pinning them

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| Asserting on internal fields | Breaks on refactor | Assert consumer-visible behaviour |
| Tests depending on execution order | Flaky suite | Independent setup per test |
| Real API calls in tests | Slow and flaky | Mock the boundary |
| Writing a test to "have tests" | Maintenance load, no signal | Throwaway script instead |
| Running tests on the live site | Data loss | Dedicated test site |
| Pinning exact error strings | Breaks on translation | Assert the exception type |
| `from frappe.tests.utils import FrappeTestCase` | Deprecated compat shim, removed in v17 | `from frappe.tests import IntegrationTestCase` (or `UnitTestCase`) |
