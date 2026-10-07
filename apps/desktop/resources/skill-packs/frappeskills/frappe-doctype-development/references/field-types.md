# Field Types Reference

> Adopted from [lubusIN/frappe-skills](https://github.com/lubusIN/frappe-skills) (MIT) — `doctype-development/references/field-types.md`.

## Overview
Frappe DocTypes use typed fields to define schema. Each field type has specific behavior, validation, and UI rendering.

## Data Fields

### Data
- **Purpose**: Single-line text input
- **Storage**: `varchar`, length 1-1000 (`length` property), default 140 characters. Values under 64 are forced up to 64 by the DB layer (InnoDB row-size guard)
- **Options**: restricts to a validation pattern — only `Email`, `Name`, `Phone`, `URL`, `Barcode`, `IBAN` are recognized (`data_field_options`, `frappe/model/__init__.py`); any other value triggers an "Invalid Data Field" warning
- **Example**:
```json
{
  "fieldname": "email",
  "fieldtype": "Data",
  "options": "Email",
  "label": "Email Address"
}
```

### Autocomplete
- **Purpose**: Single-line text input with a client-side suggestion dropdown (not backed by a DocType, unlike Link)
- **Storage**: `varchar` (same as Data)
- **Options**: newline-separated list of suggestion strings, or the literal value `Installed Applications` (special-cased to populate the list with installed app names)

### Small Text
- **Purpose**: Multi-line text, limited length
- **Max Length**: 255 characters
- **Use Case**: Short descriptions, notes

### Text
- **Purpose**: Multi-line text, unlimited length
- **Storage**: TEXT column in database
- **Use Case**: Detailed descriptions, content

### Long Text
- **Purpose**: Extended text content
- **Storage**: LONGTEXT column
- **Use Case**: Very large text blocks

### Text Editor
- **Purpose**: Rich text editing with HTML
- **Features**: WYSIWYG editor, formatting toolbar
- **Storage**: Stores HTML content

### Markdown Editor
- **Purpose**: Markdown text with preview
- **Use Case**: Documentation, formatted content

### Code
- **Purpose**: Code editing with syntax highlighting
- **Options**: Language (Python, JavaScript, HTML, CSS, JSON, etc.)
- **Example**:
```json
{
  "fieldname": "custom_script",
  "fieldtype": "Code",
  "options": "Python",
  "label": "Custom Script"
}
```

### HTML Editor
- **Purpose**: Direct HTML editing
- **Use Case**: Email templates, custom HTML content

## Numeric Fields

### Int
- **Purpose**: Integer values
- **Storage**: INT column
- **Validation**: Rounds floats to integers

### Float
- **Purpose**: Decimal numbers
- **Precision**: Standard float precision

### Currency
- **Purpose**: Money values with currency formatting
- **Options**: Currency field reference or default currency
- **Display**: Formatted with currency symbol
- **Example**:
```json
{
  "fieldname": "amount",
  "fieldtype": "Currency",
  "options": "currency",
  "label": "Amount"
}
```

### Percent
- **Purpose**: Percentage values
- **Display**: Shows % symbol
- **Range**: 0-100 (soft limit)

## Date & Time Fields

### Date
- **Purpose**: Date only (no time)
- **Format**: YYYY-MM-DD
- **UI**: Date picker

### Time
- **Purpose**: Time only (no date)
- **Format**: HH:MM:SS

### Datetime
- **Purpose**: Date and time combined
- **Format**: YYYY-MM-DD HH:MM:SS
- **Storage**: DATETIME column

### Duration
- **Purpose**: Time duration in seconds
- **Display**: Formatted as HH:MM:SS or days (toggle via `hide_days`/`hide_seconds` DocField properties)
- **Storage**: `decimal(21,9)`, value in seconds

## Selection Fields

### Select
- **Purpose**: Dropdown selection from predefined options
- **Options**: Newline-separated values
- **Example**:
```json
{
  "fieldname": "status",
  "fieldtype": "Select",
  "options": "Open\nIn Progress\nClosed",
  "default": "Open"
}
```

### Check
- **Purpose**: Boolean checkbox
- **Storage**: 0 or 1
- **Example**:
```json
{
  "fieldname": "is_active",
  "fieldtype": "Check",
  "default": 1
}
```

## Link Fields

### Link
- **Purpose**: Reference to another DocType
- **Options**: Target DocType name
- **Features**: Autocomplete, navigation to linked record
- **Example**:
```json
{
  "fieldname": "customer",
  "fieldtype": "Link",
  "options": "Customer",
  "reqd": 1
}
```

### Dynamic Link
- **Purpose**: Link where target DocType varies
- **Options**: Field containing the DocType name
- **Example**:
```json
{
  "fieldname": "link_doctype",
  "fieldtype": "Link",
  "options": "DocType",
  "label": "Link DocType"
},
{
  "fieldname": "link_name",
  "fieldtype": "Dynamic Link",
  "options": "link_doctype",
  "label": "Link Name"
}
```

### Table
- **Purpose**: Child table (one-to-many relationship)
- **Options**: Child DocType name (must have `istable: 1`)
- **Example**:
```json
{
  "fieldname": "items",
  "fieldtype": "Table",
  "options": "Sales Order Item",
  "label": "Items"
}
```

### Table MultiSelect
- **Purpose**: Multi-select via a hidden child table (many-to-many)
- **Options**: child DocType name; that child DocType must have `istable: 1` and at least one `Link` field, or validation throws (`frappe/core/doctype/doctype/doctype.py`)
- **Use Case**: Many-to-many relationships

## Media Fields

### Attach
- **Purpose**: Single file attachment
- **Storage**: File URL path
- **Features**: Upload, preview

### Attach Image
- **Purpose**: Image attachment with preview
- **Features**: Image preview in form

### Image
- **Purpose**: Display image from another field
- **Options**: Field containing image URL
- **Read Only**: Yes

### Signature
- **Purpose**: Digital signature capture
- **Storage**: Base64-encoded image data

### Attachment Gallery
- **Purpose**: Display-only grid of the document's attached files
- **Storage**: no-value field — not a database column (`no_value_fields`, `frappe/model/__init__.py`)
- **Options**: `link_filters` (JSON) filters which attachments are shown, same mechanism as Link

## Special Fields

### Password
- **Purpose**: Sensitive value storage (API keys, secrets)
- **Display**: Masked input; the saved doc shows `"*" * len(value)`, never the real value
- **Storage**: `text` column on the DocType's own table, but that column only ever holds a masked placeholder (`"*" * len(value)`) once saved — the real value is encrypted with Fernet (`frappe.utils.password.encrypt`/`decrypt`) and kept in the separate `__Auth` table, keyed by doctype/name/fieldname. Read back with `doc.get_password(fieldname)`. This is reversible encryption, not a one-way hash

### Read Only
- **Purpose**: Display computed/derived values
- **Note**: Value must be set via controller

### Geolocation
- **Purpose**: Geographic coordinates
- **Storage**: GeoJSON format
- **Features**: Map picker

### Color
- **Purpose**: Color selection
- **Storage**: Hex code (#RRGGBB)
- **UI**: Color picker

### Rating
- **Purpose**: Star rating input
- **Storage**: `decimal(3,2)`, always normalized/clamped to a 0.0-1.0 fraction server-side (`Document._fix_rating_value`, `frappe/model/document.py`) regardless of what is written to the field
- **Options**: number of stars to display, default 5 (`this.df.options || 5` in the Rating control) — this only changes the UI, not the stored range

### Barcode
- **Purpose**: Renders a scannable barcode from the field's value using JsBarcode
- **Options**: a JSON object of JsBarcode options, e.g. `{"format": "CODE128"}` — symbologies only (CODE128, EAN, UPC, ITF, MSI, codabar, pharmacode); JsBarcode does not generate QR codes

### JSON
- **Purpose**: JSON data storage and editing
- **Storage**: native `json` column (mariadb and postgres), not TEXT
- **UI**: JSON editor

### HTML
- **Purpose**: Display static HTML content
- **Options**: HTML content to display
- **Note**: Not editable by user

### Heading
- **Purpose**: Section heading label
- **Note**: Display only, no data

### Icon
- **Purpose**: Icon picker
- **Options**: `Emojis` (special case, shows emoji picker instead of the icon set)
- **Storage**: `varchar` (same as Data) — a real DB column; despite the picker UI, Icon is a `data_fieldtypes` entry, not a no-value field

### Phone
- **Purpose**: Phone number input with a country-code picker
- **Storage**: `varchar` (same as Data)
- **Default country**: taken from `frappe.sys_defaults.country` unless overridden

### Button
- **Purpose**: Triggers a client-script or server-method action; no stored value
- **Storage**: no-value field
- **Options** (v16): `button_color` DocField property sets the button style — `Default`, `Primary`, `Info`, `Success`, `Warning`, `Danger`

## Layout Fields

### Section Break
- **Purpose**: Start new form section
- **Options**: Collapsible, hidden by default
- **Example**:
```json
{
  "fieldname": "details_section",
  "fieldtype": "Section Break",
  "label": "Details",
  "collapsible": 1
}
```

### Column Break
- **Purpose**: Start new column within section
- **Note**: Creates multi-column layout

### Tab Break
- **Purpose**: Start new tab (v14+)
- **Example**:
```json
{
  "fieldname": "settings_tab",
  "fieldtype": "Tab Break",
  "label": "Settings"
}
```

### Fold
- **Purpose**: Collapse section below by default
- **Note**: All fields after Fold are hidden until expanded

### No-Value Fieldtypes
These render UI but never hold document data — no DB column is created and they cannot be `reqd`: `Section Break`, `Column Break`, `Tab Break`, `Table`, `Table MultiSelect`, `Button`, `Image`, `HTML`, `Heading`, `Attachment Gallery`, `Fold` (`no_value_fields`, `frappe/model/__init__.py`). `Icon` looks similar in the form builder but is a real `varchar` column (`data_fieldtypes`), not a no-value field.

## Field Properties

### Common Properties
| Property | Type | Description |
|----------|------|-------------|
| `fieldname` | String | API name (snake_case) |
| `fieldtype` | String | Field type |
| `label` | String | Display label |
| `reqd` | Int | Required (0/1) |
| `default` | Mixed | Default value |
| `hidden` | Int | Hidden (0/1) |
| `read_only` | Int | Read only (0/1) |
| `unique` | Int | Unique constraint (0/1) |
| `in_list_view` | Int | Show in list view |
| `in_standard_filter` | Int | Show in filter panel |
| `bold` | Int | Bold label |
| `allow_on_submit` | Int | Editable after submit |
| `depends_on` | String | Visibility condition |
| `mandatory_depends_on` | String | Required condition |
| `read_only_depends_on` | String | Read-only condition |
| `not_nullable` (v16) | Int | Adds a `NOT NULL` DB column constraint |
| `mask` (v16) | Int | Check (0/1): marks the field as maskable for permission-based data masking (`get_masked_fields`); the pattern is not a user-supplied string |
| `sticky` (v16) | Int | Keeps the field pinned while scrolling a long form |
| `show_description_on_click` (v16) | Int | Shows the description as a popover on click instead of inline |

### Conditional Visibility
```json
{
  "fieldname": "discount",
  "fieldtype": "Currency",
  "depends_on": "eval:doc.apply_discount",
  "mandatory_depends_on": "eval:doc.apply_discount && doc.discount_type=='Fixed'"
}
```

## Field Naming Conventions

- Use `snake_case` for fieldnames
- Prefix with verb for actions: `is_`, `has_`, `can_`
- Use consistent suffixes: `_date`, `_time`, `_by`, `_at`
- Avoid reserved names: `name`, `owner`, `creation`, `modified`, `docstatus`

## Sources

Verified against Frappe v16.35.0 (`frappe/__init__.py` `__version__`):

- `apps/frappe/frappe/model/__init__.py` — `data_fieldtypes`, `no_value_fields`, `data_field_options`
- `apps/frappe/frappe/core/doctype/docfield/docfield.json` — DocField properties (`not_nullable`, `mask`, `sticky`, `show_description_on_click`, `hide_days`, `hide_seconds`, `link_filters`, `button_color`)
- `apps/frappe/frappe/core/doctype/doctype/doctype.py` — Table/Table MultiSelect `istable`/Link-field validation, Data field options warning
- `apps/frappe/frappe/database/schema.py:452-453` — Data field length forced to a 64-char minimum (InnoDB row-size guard)
- `apps/frappe/frappe/database/database.py:91` — `VARCHAR_LEN = 140` default
- `apps/frappe/frappe/database/mariadb/database.py:173-210` — per-fieldtype column type map (Rating `decimal(3,2)`, Duration `decimal(21,9)`, Icon/Phone/Color `varchar`, Password `text`, JSON `json`)
- `apps/frappe/frappe/model/document.py:881-885` — `_fix_rating_value` clamps Rating to 0.0-1.0
- `apps/frappe/frappe/model/base_document.py:1349-1380` — `_save_passwords`/`get_password`/`is_dummy_password`
- `apps/frappe/frappe/utils/password.py` — Fernet encryption, `__Auth` table storage
- `apps/frappe/frappe/model/meta.py:199-218` — `get_masked_fields` (permission-based `mask` property)
- `apps/frappe/frappe/public/js/frappe/form/controls/rating.js`, `barcode.js`, `autocomplete.js`, `icon.js`, `phone.js`, `button.js` — client-side options/defaults (`options || 5`, `Installed Applications`, `Emojis`, country-code fallback, `button_color` map)
