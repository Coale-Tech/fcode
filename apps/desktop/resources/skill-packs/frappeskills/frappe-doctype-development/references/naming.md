# DocType Naming Strategies

> Adopted from [lubusIN/frappe-skills](https://github.com/lubusIN/frappe-skills) (MIT) — `doctype-development/references/naming.md`.

## Overview
Frappe provides flexible auto-naming for documents. The naming pattern is configured in the DocType's `autoname` property.

## Naming Options

### Field-Based Naming
Use a field value as the document name.

```json
{
  "autoname": "field:customer_name"
}
```

**Use Case:** When field uniquely identifies the record (e.g., Customer name)

**Note:** Setting `autoname: "field:<fieldname>"` automatically forces `unique: 1`
on that field's DocField when the DocType is saved
(`validate_series`, `frappe/core/doctype/doctype/doctype.py`).

### Naming Series
Counter-based naming with prefixes.

```json
{
  "autoname": "naming_series:",
  "fields": [
    {
      "fieldname": "naming_series",
      "fieldtype": "Select",
      "options": "ORD-.YYYY.-\nORD-.YYYY.-.###",
      "default": "ORD-.YYYY.-"
    }
  ]
}
```

**Format Codes** (`parse_naming_series`, `frappe/model/naming.py`):
| Code | Description | Example |
|------|-------------|---------|
| `.YYYY.` | 4-digit year | 2026 |
| `.YY.` | 2-digit year | 26 |
| `.MM.` | 2-digit month | 02 |
| `.DD.` | 2-digit day | 12 |
| `.WW.` | ISO week number | 07 |
| `.JJJ.` | Day of year | 043 |
| `.timestamp.` | Unix timestamp | 1699999999 |
| `.#####` | Counter (5 digits) | 00001 |
| `.###` | Counter (3 digits) | 001 |
| `.{fieldname}.` | Substitutes the named field's value | `.customer.` -> ACME |

Apps can register additional custom tokens via the `naming_series_variables`
hook.

**Examples:**
- `ORD-.YYYY.-` → ORD-2026-00001
- `INV-.YY.MM.-` → INV-26.02-00001
- `PRJ-####` → PRJ-0001
- `SO-.YYYY.-.###` → SO-2026-001

### Format Strings
Template-based naming with placeholders.

```json
{
  "autoname": "format:PRJ-{customer_abbr}-{####}"
}
```

**Placeholders:**
- `{fieldname}` — Field value
- `{####}` — Counter with specified digits
- `{YYYY}`, `{YY}`, `{MM}`, `{DD}` — Date parts
- `{#####}` — Auto-incrementing counter

**Examples:**
```json
// Customer abbreviation + counter
"autoname": "format:{customer_abbr}-{#####}"
// Result: ACME-00001

// Type prefix + year + counter
"autoname": "format:{type_prefix}-{YYYY}-{###}"
// Result: SVC-2026-001
```

### Hash (Random)
Unique string; not purely random — a timestamp-derived prefix plus random
characters (`make_autoname`, `frappe/model/naming.py`), used as the fallback
when no other naming rule produces a name.

```json
{
  "autoname": "hash"
}
```

**Result:** short unique string, e.g. `5f3d8a91c2`

**Use Case:** When human-readable name isn't needed

### Autoincrement
Integer primary key using a native DB sequence.

```json
{
  "autoname": "autoincrement"
}
```

**Result:** `1`, `2`, `3`, ... (`frappe.db.get_next_sequence_val`, checked via
`is_autoincremented` in `frappe/model/naming.py`). Cannot be combined with
`issingle`, and the naming rule cannot be changed once records exist.

### UUID (v16)
Server-generated UUIDv7 as the document name.

```json
{
  "autoname": "UUID"
}
```

**Result:** e.g. `018f6c3e-8b2a-7c41-9d3e-1a2b3c4d5e6f` (`uuid7()`,
`frappe/model/naming.py`). If a name is supplied on insert it must already be
a valid UUID string, or Frappe raises `InvalidUUIDValue`.

### Prompt
Ask user to enter name manually.

```json
{
  "autoname": "Prompt"
}
```

**Use Case:** User-defined unique identifiers

### Custom Autoname
Define naming in the controller's `autoname()` method. This method is always
called by `frappe.model.naming.set_new_name` before the `autoname` property is
ever consulted — so no special `autoname` property value is needed or
recognized to enable it. Leave `autoname` unset (or `""`), which the DocType
form sets automatically when the naming rule is `By script`
(`validate_series`, `frappe/core/doctype/doctype/doctype.py`).

```json
{
  "naming_rule": "By script"
}
```

```python
from pypika.terms import CustomFunction
from frappe.query_builder.functions import Cast, IfNull, Max

class MyDoc(Document):
    def autoname(self):
        # Custom naming logic
        prefix = self.get_prefix()
        counter = self.get_next_counter()
        self.name = f"{prefix}-{counter:05d}"

    def get_prefix(self):
        return self.region[:3].upper()

    def get_next_counter(self):
        Table = frappe.qb.DocType("My Doc")
        substring_index = CustomFunction("SUBSTRING_INDEX", ["str", "delim", "count"])
        suffix = Cast(substring_index(Table.name, "-", -1), "UNSIGNED")
        row = (
            frappe.qb.from_(Table)
            .select(IfNull(Max(suffix), 0) + 1)
            .where(Table.name.like(f"{self.get_prefix()}-%"))
            .run()
        )
        return row[0][0]
```

## Naming Series Management

### Define Options
```json
{
  "fieldname": "naming_series",
  "fieldtype": "Select",
  "options": "ORD-.YYYY.-\nPO-.YYYY.-\nQUOT-.YYYY.-",
  "default": "ORD-.YYYY.-",
  "reqd": 1
}
```

### Set Default via Setup
Via Naming Series DocType:
1. Go to Setup > Naming Series
2. Select DocType
3. Add/modify series options
4. Set default series

### Company-Specific Series
```json
{
  "autoname": "naming_series:",
  "fields": [
    {
      "fieldname": "naming_series",
      "fieldtype": "Select",
      "options": "",
      "label": "Series"
    },
    {
      "fieldname": "company",
      "fieldtype": "Link",
      "options": "Company",
      "label": "Company"
    }
  ]
}
```

Configure per-company prefixes in Naming Series DocType.

## Advanced Naming

### Composite Names
```python
def autoname(self):
    # Customer + Year + Counter
    self.name = f"{self.customer}-{frappe.utils.nowdate()[:4]}-{self.get_counter():04d}"

def get_counter(self):
    key = f"{self.customer}-{frappe.utils.nowdate()[:4]}"
    return frappe.db.count("My Doc", {"name": ("like", f"{key}-%")}) + 1
```

### Slug-Based Names
```python
from frappe.utils import slug

def autoname(self):
    base_name = slug(self.title)
    self.name = self.get_unique_name(base_name)

def get_unique_name(self, base_name):
    name = base_name
    counter = 1
    while frappe.db.exists(self.doctype, name):
        name = f"{base_name}-{counter}"
        counter += 1
    return name
```

### Manual UUID Names
Legacy pattern for generating UUIDs via a controller `autoname()` method.
Prefer the native `autoname: "UUID"` naming rule (v16) unless a v13-v15 UUID
format (`uuid4`, not `uuid7`) is specifically required.
```python
import uuid

def autoname(self):
    self.name = str(uuid.uuid4())
```

## Renaming Documents

### Via Code
```python
frappe.rename_doc("Customer", "Old Name", "New Name")

## With merge
frappe.rename_doc("Customer", "Duplicate", "Original", merge=True)
```

### Rename Events
```python
class MyDoc(Document):
    def after_rename(self, old_name, new_name, merge=False):
        # Update references in other documents
        self.update_references(old_name, new_name)
```

### Prevent Rename
```python
class MyDoc(Document):
    def before_rename(self, old_name, new_name, merge=False):
        if self.status == "Closed":
            frappe.throw(_("Cannot rename closed documents"))
```

## Best Practices

### Naming Series Guidelines
| Use Case | Pattern | Example |
|----------|---------|---------|
| Orders | `{TYPE}-.YYYY.-` | ORD-2026-00001 |
| Invoices | `{COMPANY}-.YY.MM.-` | ACME-26.02-001 |
| Internal refs | `{TYPE}{#####}` | TKT00001 |
| Projects | `{CLIENT}-{YYYY}-{###}` | ACME-2026-001 |

### Avoid
- Spaces in names (use hyphens or underscores)
- Special characters that may cause URL issues
- Very long names (keep under 140 chars)
- Relying on name for business logic (use fields instead)

### Counter Reset
Counters reset based on the date pattern:
- `.YYYY.` — Resets annually
- `.YY.MM.` — Resets monthly
- `.YY.MM.DD.` — Resets daily
- No date pattern — Never resets

## Sources

- `apps/frappe/frappe/model/naming.py`, `apps/frappe/frappe/core/doctype/doctype/doctype.py`, `apps/frappe/frappe/model/rename_doc.py`
- Query builder: `apps/frappe/frappe/query_builder/functions.py` (`Cast`/`IfNull`/`Max` re-exports), `env/lib/python3.14/site-packages/pypika/terms.py:171` (`Term.like`), `env/lib/python3.14/site-packages/pypika/functions.py:114` (`Cast`)
