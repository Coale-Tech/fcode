# Cypress UI Testing

> Adopted from [lubusIN/frappe-skills](https://github.com/lubusIN/frappe-skills) (MIT) — `testing/references/cypress.md`.

## Overview
Frappe uses Cypress for end-to-end UI testing. Cypress tests simulate real user interactions with the Desk interface.

`bench run-ui-tests` installs Cypress and the plugins Frappe's own suite depends on
(`cypress@^13`, `@4tw/cypress-drag-drop`, `cypress-real-events`, `@testing-library/cypress`,
`@cypress/code-coverage`, `cypress-split`) into the `frappe` app's `node_modules` the first time
it runs, if they aren't already present (`frappe/commands/testing.py`, `run_ui_tests`).

## Setup

### Prerequisites
```bash
## Install Cypress for your app
cd apps/my_app
npm install cypress --save-dev

## Or use bench setup
bench setup requirements --dev
```

### Directory Structure
```
my_app/
├── cypress/
│   ├── fixtures/         # Test data files
│   ├── integration/      # Test files (Frappe's own specPattern, not the Cypress default e2e/)
│   │   └── my_app/
│   │       └── sample_doc.js
│   ├── plugins/          # Cypress plugins
│   ├── support/          # Custom commands
│   │   ├── commands.js
│   │   └── e2e.js
│   └── videos/           # Test recordings
├── cypress.config.js     # Cypress config (Cypress 10+; replaces the old cypress.json)
└── package.json
```

### Configuration
Modern Cypress (10+) configures via `cypress.config.js` with `defineConfig`, not the legacy
`cypress.json`. Frappe's own root config (`cypress.config.js`, abridged — the real file also
wires `cypress-split` and per-spec video cleanup in `setupNodeEvents`):

```javascript
const { defineConfig } = require("cypress");

module.exports = defineConfig({
	adminPassword: "admin",
	testUser: "frappe@example.com",
	defaultCommandTimeout: 20000,
	pageLoadTimeout: 15000,
	video: true,
	viewportHeight: 960,
	viewportWidth: 1400,
	retries: {
		runMode: 1,
		openMode: 1,
	},
	e2e: {
		setupNodeEvents(on, config) {
			return require("./cypress/plugins/index.js")(on, config);
		},
		testIsolation: false,
		baseUrl: "http://test_site:8000",
		specPattern: ["./cypress/integration/*.js"],
	},
});
```

`bench run-ui-tests` overrides `baseUrl`/`adminPassword` via `CYPRESS_baseUrl`/
`CYPRESS_adminPassword` environment variables at run time, so the file above only needs
placeholder values.

## Running Tests

### Via Bench
```bash
## Run all UI tests for app
bench --site testsite run-ui-tests my_app

## Run in headless mode
bench --site testsite run-ui-tests my_app --headless

## Run specific test file
bench --site testsite run-ui-tests my_app --spec "cypress/integration/my_app/sample_doc.js"

## Run in parallel (Cypress Cloud orchestrates the split)
bench --site testsite run-ui-tests my_app --headless --parallel

## Extra args after `my_app` pass straight through to the cypress binary
bench --site testsite run-ui-tests my_app --headless -- --browser firefox
```

`run-ui-tests` flags (`frappe/commands/testing.py`): `--headless`, `--parallel`,
`--with-coverage`, `--browser <name>` (default `chrome`), `--spec <path>`, `--ci-build-id`.

### Via Cypress CLI
```bash
## Open Cypress Test Runner
npx cypress open

## Run headless
npx cypress run

## Run specific test
npx cypress run --spec "cypress/integration/my_app/*.js"
```

## Writing Tests

### Basic Test Structure
```javascript
// cypress/integration/my_app/sample_doc.js

context("Sample Doc", () => {
    before(() => {
        cy.login();
        cy.visit("/desk/sample-doc");
    });

    it("creates a new Sample Doc", () => {
        cy.new_form("Sample Doc");

        cy.fill_field("title", "Test Document");
        cy.fill_field("status", "Open", "Select");

        cy.get_field("title").should("have.value", "Test Document");

        cy.save();
    });

    it("updates an existing Sample Doc", () => {
        cy.visit("/desk/sample-doc/Test Document");

        cy.fill_field("status", "In Progress", "Select");
        cy.save();

        cy.get_field("status").should("have.value", "In Progress");
    });
});
```

Desk routes use the `/desk/...` URL prefix (v16) — `/app/...` was the prefix through v15
(`frappe/public/js/frappe/router.js`, `is_app_route`); both are still accepted at runtime, but
new tests should use `/desk/`.

### Real Frappe Custom Commands

Frappe's own `cypress/support/commands.js` ships a much larger command set than a hand-rolled
one — reuse these instead of redefining `fill_field`/`login`/etc. in an app's own
`commands.js`, since `bench run-ui-tests` runs specs against the `frappe` app's support file:

```javascript
// Login — session-cached; defaults to Administrator / Cypress.env("adminPassword")
cy.login(email, password);

// Call a whitelisted method (adds CSRF header automatically)
cy.call("frappe.client.set_value", { doctype, name, fieldname: { status: "Closed" } });

// REST helpers
cy.get_list(doctype, fields, filters);          // GET /api/resource/<doctype>
cy.get_doc(doctype, name);                       // GET /api/resource/<doctype>/<name>
cy.insert_doc(doctype, args, ignore_duplicate);  // POST /api/resource/<doctype>
cy.update_doc(doctype, docname, args);           // PUT /api/resource/<doctype>/<docname>
cy.remove_doc(doctype, name, ignore_missing);    // DELETE /api/resource/<doctype>/<name>
cy.set_value(doctype, name, { fieldname: value });

// Form field helpers (fieldtype defaults to "Data"; handles Select/Link/Check/Date/Text Editor/Code)
cy.fill_field(fieldname, value, fieldtype);
cy.get_field(fieldname, fieldtype);
cy.fill_table_field(tablefieldname, row_idx, fieldname, value, fieldtype);
cy.get_table_field(tablefieldname, row_idx, fieldname, fieldtype);

// Navigation
cy.new_form(doctype);          // visits /desk/<doctype-slug>/new and waits for it to load
cy.go_to_list(doctype);        // visits /desk/<doctype-slug>
cy.select_form_tab(label);
cy.awesomebar(text);           // types into the nav search bar and hits enter

// Form/dialog actions
cy.save();                             // clicks Save and waits for the savedocs call
cy.dialog(options);                    // opens a frappe.ui.Dialog with the given options
cy.get_open_dialog();
cy.hide_dialog();
cy.clear_dialogs();
cy.clear_datepickers();

// List view
cy.select_listview_row_checkbox(row_no);
cy.click_listview_row_item(row_no);
cy.click_listview_primary_button(label);
cy.click_filter_button();
cy.open_list_filter();
cy.clear_filters();

// Users/roles
cy.switch_to_user(user);
cy.add_role(user, role);
cy.remove_role(user, role);

// Misc
cy.clear_cache();               // calls frappe.ui.toolbar.clear_cache() in-page
cy.create_records(doc);         // frappe.tests.ui_test_helpers.create_if_not_exists
cy.compare_document(expected_document);
```

`cy.login`, `cy.call`, `cy.get_list`/`cy.get_doc`/`cy.insert_doc`/`cy.update_doc` all read the
CSRF token off `window.frappe.csrf_token` before issuing the request — reproduce that pattern
if adding custom REST helpers.

### Writing an app-local custom command

Only add a command when Frappe's own set (above) doesn't cover it:

```javascript
// cypress/support/commands.js
Cypress.Commands.add("click_primary_action", () => {
    cy.get(".primary-action").click();
});
```

## Common Test Patterns

### Form Operations
```javascript
// Create new document
it("creates new document", () => {
    cy.new_form("Customer");
    cy.fill_field("customer_name", "Acme Corp");
    cy.fill_field("customer_type", "Company", "Select");
    cy.save();
    cy.url().should("not.contain", "new-customer-1");
});

// Edit document
it("edits existing document", () => {
    cy.visit("/desk/customer/CUST-001");
    cy.fill_field("customer_name", "Acme Corporation");
    cy.save();
});

// Delete document via API instead of the UI menu — faster and less brittle
it("deletes document", () => {
    cy.remove_doc("Customer", "CUST-TO-DELETE", true);
});
```

### List Operations
```javascript
// Filter list
it("filters list by status", () => {
    cy.go_to_list("Sales Order");
    cy.click_filter_button();
    cy.fill_field("status", "Draft", "Select");
    cy.get(".filter-action-buttons").contains("Apply").click();
    cy.get(".list-row").should("have.length.greaterThan", 0);
});

// Bulk action
it("performs bulk action", () => {
    cy.go_to_list("ToDo");
    cy.select_listview_row_checkbox(0);
    cy.select_listview_row_checkbox(1);
    cy.get(".actions-btn-group").click();
    cy.get(".dropdown-menu").contains("Delete").click();
});
```

### Dialog Interactions
```javascript
it("handles dialog prompt", () => {
    cy.visit("/desk/sales-order/SO-001");
    cy.click_custom_action_button("Request Approval");

    cy.get_open_dialog()
        .find("[data-fieldname='reason'] textarea")
        .type("Urgent customer request");

    cy.click_modal_primary_button("Submit");

    cy.get(".msgprint").should("contain", "Request sent");
});
```

### Child Table Operations
```javascript
it("adds child table rows", () => {
    cy.new_form("Sales Order");

    cy.get("[data-fieldname='items'] .grid-add-row").click();
    cy.fill_table_field("items", 0, "item_code", "ITEM-001", "Link");
    cy.fill_table_field("items", 0, "qty", "5");
});
```

## Test Data Management

### Fixtures
```javascript
// cypress/fixtures/customer.json
{
    "customer_name": "Test Customer",
    "customer_type": "Company",
    "territory": "All Territories"
}
```

```javascript
// Using fixtures
it("creates customer from fixture", function() {
    cy.fixture("customer").then((customer) => {
        cy.insert_doc("Customer", customer, true);
    });
});
```

### API Setup
```javascript
// Create test data via the insert_doc/remove_doc commands (CSRF-safe, no raw cy.request)
before(() => {
    cy.insert_doc("Customer", {
        customer_name: "Cypress Test Customer",
        customer_type: "Company",
    }, true);
});

after(() => {
    cy.remove_doc("Customer", "Cypress Test Customer", true);
});
```

## Best Practices

### Selectors
```javascript
// Don't: fragile selectors
cy.get(".btn-primary-dark").click();
cy.get("div > ul > li:nth-child(3)").click();

// Do: robust selectors
cy.get("[data-fieldname='customer']").click();
cy.get(".primary-action").contains("Save").click();
cy.get("[data-page-container]").contains("Customer").click();
```

### Waits
```javascript
// Don't: fixed waits (slow, unreliable)
cy.wait(5000);

// Do: conditional waits, or wait on a specific intercepted request (as cy.save() does)
cy.get(".indicator-pill").should("not.exist");
cy.get("[data-fieldname='name']").should("be.visible");
cy.url().should("contain", "/desk/customer/");
```

### Test Independence
```javascript
// Don't: tests depend on each other
it("creates customer", () => { /* creates CUST-001 */ });
it("edits customer", () => { /* assumes CUST-001 exists */ });

// Do: independent tests, cleaned up via the real API commands
beforeEach(() => {
    cy.insert_doc("Customer", { customer_name: "Test Customer" }, true);
});

afterEach(() => {
    cy.remove_doc("Customer", "Test Customer", true);
});
```

## Sources

Verified against Frappe v16.35.0 (`frappe/__init__.py` `__version__`):

- `apps/frappe/frappe/commands/testing.py` — `run-ui-tests` (Cypress/plugin install, `--headless`/`--parallel`/`--with-coverage`/`--browser`/`--spec`/`--ci-build-id` flags)
- `apps/frappe/cypress.config.js` — `defineConfig` options (`adminPassword`, `testUser`, timeouts, `retries`, `specPattern`, `cypress-split` wiring)
- `apps/frappe/cypress/support/commands.js` — custom `cy.*` command set (`login`, `call`, `get_list`/`get_doc`/`insert_doc`/`update_doc`/`remove_doc`/`set_value`, `fill_field`/`get_field`/`fill_table_field`/`get_table_field`, `new_form`/`go_to_list`/`select_form_tab`/`awesomebar`, `save`/`dialog`/`get_open_dialog`/`hide_dialog`/`clear_dialogs`/`clear_datepickers`, list-view and filter helpers, `switch_to_user`/`add_role`/`remove_role`, `clear_cache`/`create_records`/`compare_document`)
- `apps/frappe/frappe/public/js/frappe/router.js` — `/desk/...` vs `/app/...` route prefix
- `apps/frappe/frappe/tests/ui_test_helpers.py` — `create_if_not_exists` (backs `cy.create_records`)
