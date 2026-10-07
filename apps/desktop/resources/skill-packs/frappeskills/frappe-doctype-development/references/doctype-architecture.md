# DocType Architecture Reference

Detailed internals split out of [doctypes.md](doctypes.md): classification, system
fields, naming internals, docstatus, Single/Tree types, customization approaches,
and the verified DocType-level flags.

## DocType Classification

| Type | Description | Use Case |
|------|-------------|----------|
| **Master** | Entity records | Customer, Item, Employee |
| **Transactional** | Business operations | Sales Order, Invoice, Payment |
| **Submittable** | Documents with workflow states | Invoice, Journal Entry |
| **Single** | Singleton (one record only) | Settings, Configuration |
| **Child** | Table rows (no standalone form) | Invoice Item, Address |
| **Tree** | Hierarchical structure | Account, Territory |
| **Virtual** | Custom data source (no DB table) | External API data |

## Standard System Fields

Every DocType automatically includes:

| Field | Type | Description |
|-------|------|--------------|
| `name` | Data | Primary key (document ID) |
| `owner` | Link | User who created the document |
| `creation` | Datetime | When document was created |
| `modified` | Datetime | Last modification time |
| `modified_by` | Link | User who last modified |
| `docstatus` | Int | 0=Draft, 1=Submitted, 2=Cancelled |
| `idx` | Int | Sort order index |

Do NOT add `creation`, `modified`, `owner`, `modified_by`, or `docstatus` as
fields in the JSON — Frappe creates these automatically.

## DocType Files Structure

```
app_name/
└── module_name/
    └── doctype/
        └── doctype_name/
            ├── doctype_name.json    # DocType definition
            ├── doctype_name.py      # Server controller
            ├── doctype_name.js      # Client controller
            └── test_doctype_name.py # Test file
```

## Field Properties Reference

Full fieldtype list and per-type options: [field-types.md](field-types.md). Common
cross-cutting properties:

| Property | Description | Example |
|----------|-------------|---------|
| `fieldname` | Code reference name | `customer_name` |
| `label` | Display label | `Customer Name` |
| `fieldtype` | Data type | `Data`, `Link`, `Select` |
| `options` | Field-specific options | DocType name for Link |
| `reqd` | Required field | `1` or `0` |
| `default` | Default value | `Today`, `__user` |
| `unique` | Must be unique | `1` or `0` |
| `hidden` | Hidden from form | `1` or `0` |
| `read_only` | Cannot be edited | `1` or `0` |
| `in_list_view` | Show in list view | `1` or `0` |
| `in_standard_filter` | Show in filters | `1` or `0` |
| `in_global_search` | Include in search | `1` or `0` |
| `bold` | Display in bold | `1` or `0` |
| `allow_on_submit` | Editable after submit | `1` or `0` |
| `fetch_from` | Auto-fetch from linked doc | `customer.customer_name` |
| `fetch_if_empty` | Fetch only if empty | `1` or `0` |
| `depends_on` | Conditional visibility | `eval:doc.status=='Open'` |
| `mandatory_depends_on` | Conditional required | `eval:doc.type=='Sale'` |
| `read_only_depends_on` | Conditional read-only | `eval:doc.docstatus==1` |
| `permlevel` | Permission level | `0`, `1`, `2` |
| `precision` | Decimal places | `2` |
| `length` | Max character length | `140` |
| `non_negative` | Prevent negative values | `1` or `0` |
| `collapsible` | Section is collapsible | `1` or `0` |
| `collapsible_depends_on` | Conditional collapse | `eval:doc.items.length==0` |
| `not_nullable` (v16) | DB column gets `NOT NULL` instead of nullable | `1` or `0` |
| `mask` (v16) | Input mask pattern | `000-000` |
| `sticky` (v16) | Field stays pinned while scrolling a long form | `1` or `0` |
| `show_description_on_click` (v16) | Show description as a click popover instead of inline | `1` or `0` |

## Naming & Autoname Patterns

More patterns and renaming: [naming.md](naming.md).

### 9 Naming Methods

| # | Method | Config | Example Output |
|---|--------|--------|-----------------|
| 1 | **Set by User** | `autoname = ""` | User enters name |
| 2 | **Autoincrement** | `autoname = "autoincrement"` | 1, 2, 3... |
| 3 | **By Fieldname** | `autoname = "field:article_name"` | Field value |
| 4 | **Naming Series** | `autoname = "naming_series:"` | REQ-2024-00001 |
| 5 | **Format Expression** | `autoname = "format:PRE-{YYYY}-{#####}"` | PRE-2024-00001 |
| 6 | **Random Hash** | `autoname = "hash"` | a1b2c3d4e5 |
| 7 | **UUID (v16)** | `autoname = "UUID"` | 550e8400-e29b... |
| 8 | **Prompt** | `autoname = "Prompt"` | User prompted |
| 9 | **Custom (autoname hook)** | Override in controller | Custom logic |

### `naming_rule` (DocType JSON field, v16)

The DocType form stores the selection in the `naming_rule` field, which sets the
corresponding `autoname` value. Verified `naming_rule` options
(`apps/frappe/frappe/core/doctype/doctype/doctype.json`):

| `naming_rule` | Equivalent `autoname` |
|----------------|------------------------|
| `Set by user` | `""` (Prompt / user enters) |
| `Autoincrement` | `autoincrement` (integer PK, cannot be changed later) |
| `By fieldname` | `field:<fieldname>` |
| `By "Naming Series" field` | `naming_series:` |
| `Expression` | `format:...` |
| `Expression (old style)` | `PRE-.####` (legacy dot syntax) |
| `Random` | `hash` |
| `UUID` (v16) | `UUID` |
| `By script` | controller `autoname()` method / `before_naming` |

> `naming_series:.YYYY.-` style patterns support `.YYYY.`, `.YY.`, `.MM.`, `.DD.`,
> `.WW.` (week number), `.JJJ.` (day of year), `.###` (counter),
> `.{fieldname}.` tokens, and `.timestamp.`. Apps can register extra tokens via
> the `naming_series_variables` hook (`frappe/model/naming.py`,
> `parse_naming_series`).

## Docstatus & Document States

| Value | Status | Description |
|-------|--------|--------------|
| 0 | Draft | Fully editable |
| 1 | Submitted | Creates ledger entries, limited edits |
| 2 | Cancelled | Reversed, read-only |

```python
# Check status
if doc.docstatus == 0:  # Draft
if doc.docstatus == 1:  # Submitted
if doc.docstatus == 2:  # Cancelled

# Submit and cancel
doc.submit()
doc.cancel()

# Amend a cancelled document
amended_doc = frappe.copy_doc(doc)
amended_doc.amended_from = doc.name
amended_doc.insert()

# (v16) Discard a draft: docstatus 0 -> 2 via db_set; fires before_discard/on_discard,
# not validate/on_cancel. Throws unless draft (frappe/model/document.py Document.discard)
doc.discard()
```

## Single DocTypes

Singleton DocTypes for settings/configuration.

```yaml
issingle: 1
fields:
  - fieldname: "enable_feature"
    label: "Enable Feature"
    fieldtype: "Check"
  - fieldname: "api_key"
    label: "API Key"
    fieldtype: "Password"
```

```python
# Get single value
value = frappe.db.get_single_value("My Settings", "enable_feature")

# Get doc
settings = frappe.get_single("My Settings")
settings.enable_feature = 1
settings.save()
```

## Tree DocTypes

Hierarchical parent-child with nested set model.

```yaml
is_tree: 1
nsm_parent_field: "parent_account"
```

### Standard Tree Fields

| Field | Description |
|-------|--------------|
| `parent_[doctype]` | Link to parent record |
| `is_group` | Whether node has children |
| `lft` | Left value (nested set) |
| `rgt` | Right value (nested set) |

### Tree API

```python
# Get ancestors
from frappe.utils.nestedset import get_ancestors_of
ancestors = get_ancestors_of("Account", "Sales Expenses")

# Get descendants
descendants = frappe.get_all("Account",
    filters={"lft": [">", doc.lft], "rgt": ["<", doc.rgt]}
)
```

## Virtual DocTypes

No database table — data is supplied by the controller (external APIs, files, or
secondary databases). Required controller overrides and a full example:
[virtual-doctypes.md](virtual-doctypes.md).

## Child Tables

`istable: 1`, embedded in a parent via a `Table` field, no standalone
permissions. Full patterns: [child-tables.md](child-tables.md).

## Actions and Links

### Server Actions

```python
# In DocType JSON
{
    "actions": [
        {
            "label": "Send Email",
            "action_type": "Server Action",
            "action": "my_app.api.send_notification"
        }
    ]
}
```

### Document Links (Dashboard)

```python
# my_app/doctype/customer_request/customer_request_dashboard.py
def get_data():
    return {
        "fieldname": "customer_request",
        "non_standard_fieldnames": {
            "Payment Entry": "reference_name"
        },
        "transactions": [
            {
                "label": "Related",
                "items": ["Task", "Payment Entry"]
            }
        ]
    }
```

## Customization Approaches

| # | Approach | Description |
|---|----------|--------------|
| 1 | **Custom Field** | Add fields to existing DocTypes |
| 2 | **Property Setter** | Override field properties |
| 3 | **Client Script** | Additional client-side handlers |
| 4 | **Server Script** | Additional server-side logic |
| 5 | **Override DocType Class** | Override controller in custom app |
| 6 | **Hooks (doc_events)** | Cross-doctype automation |

### Override DocType Class

```python
# hooks.py
override_doctype_class = {
    "Sales Invoice": "my_app.overrides.CustomSalesInvoice"
}
```

```python
# my_app/overrides.py
from erpnext.accounts.doctype.sales_invoice.sales_invoice import SalesInvoice

class CustomSalesInvoice(SalesInvoice):
    def validate(self):
        super().validate()
        self.custom_validation()
```

### Extend DocType Class (v16 — mixin, preferred over full override)

`extend_doctype_class` injects a mixin into the standard controller's MRO without
replacing it, so multiple apps can layer behavior on the same DocType. Verified in
`apps/frappe/frappe/model/base_document.py` (`get_controller` reads
`get_hooks("extend_doctype_class")`).

```python
# hooks.py
extend_doctype_class = {
    "Task": "my_app.custom.task.CustomTaskMixin"
}
```

```python
# my_app/custom/task.py
class CustomTaskMixin:
    def validate(self):
        super().validate()      # runs the standard Task.validate
        self.custom_validation()
```

> Use `extend_doctype_class` (mixin, composable) when possible; use
> `override_doctype_class` (full replacement, only one app can win) only when you must
> replace the base controller entirely.

## Form & View Settings

| Setting | Description |
|---------|--------------|
| `title_field` | Field displayed as document title |
| `show_title_field_in_link` | Show title in Link fields |
| `image_field` | Image at top of form |
| `search_fields` | Searchable in list view (`"customer_name,email_id,phone"`) |
| `default_sort_field` | Default sort column |
| `default_sort_order` | `"desc"` or `"asc"` |

## DocType-Level Flags (verified Check fields)

Exact `Check` fieldnames on the DocType meta
(`apps/frappe/frappe/core/doctype/doctype/doctype.json`). Note the inconsistent
naming: `issingle` and `istable` have **no** underscore, while `is_submittable`,
`is_tree`, `is_virtual` do.

| Flag (JSON) | Description |
|-------------|--------------|
| `is_submittable` | Enable Draft/Submitted/Cancelled (docstatus workflow) |
| `issingle` | Single document only (stored in `tabSingles`) |
| `istable` | Child table DocType (no standalone form) |
| `is_tree` | Hierarchical tree (nested set: `lft`/`rgt`) |
| `is_virtual` | No DB table; controller supplies data |
| `track_changes` | Enable version history (Version doctype) |
| `track_seen` | Track which users have seen the doc |
| `track_views` | Track document views |
| `editable_grid` | Inline-editable child grid |
| `quick_entry` | Show quick-entry dialog for new docs |
| `allow_rename` | Allow renaming the document name |
| `allow_copy` | Allow "Duplicate" action |
| `allow_import` | Enable Data Import for this DocType |
| `in_create` | Only creatable via code/parent (hidden from New) |
| `custom` | Custom DocType (created in UI, stored in DB not files) |
| `read_only` | DocType is read-only |
| `has_web_view` | Has a public web view / route |
| `allow_guest_to_view` | Guests can view the web view |
| `index_web_pages_for_search` | Index web pages for website search |
| `queue_in_background` | Process submit/cancel in a background job |
| `make_attachments_public` | Attachments public by default |
| `allow_auto_repeat` | Enable Auto Repeat |
| `beta` | Marked as beta |
| `protect_attached_files` | Attachments can only be deleted while the document is in draft, or is cancelled (by users who can also delete the document) |
| `is_calendar_and_gantt` | Enables Calendar and Gantt views |
| `translated_doctype` | Translate Link fields shown for this DocType |
| `show_preview_popup` | Show a preview popup for linked documents |
| `email_append_to` | Allow document creation via incoming email |
| `show_name_in_global_search` | Make `name` searchable in Global Search |
| `force_re_route_to_default_view` | Force navigation back to the default view |
| `allow_bulk_edit` (v16) | Enable bulk update of fields across child table rows (only shown when `istable`) |

## Sources

Verified against Frappe v16.35.0 (`frappe/__init__.py` `__version__`):

- `apps/frappe/frappe/core/doctype/doctype/doctype.json` — DocType-level Check flags, `naming_rule` options
- `apps/frappe/frappe/model/naming.py` — naming series / autoname tokens
- `apps/frappe/frappe/model/base_document.py` — `get_controller`, `override_doctype_class` + `extend_doctype_class`

See [doctypes.md](doctypes.md) for the full verified source list.
