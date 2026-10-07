# Data Import Template Format

The exact contract the core Data Import tool (`frappe.core.doctype.data_import`)
expects from a CSV or XLSX file: header syntax, the ID/autoname column,
child-table row layout, Insert vs Update semantics, per-fieldtype value
coercion, and which warnings actually block an import.

## Header row: how columns are matched to fields

`build_fields_dict_for_column_matching(parent_doctype)` builds a single
lookup dict keyed by every string that is allowed to identify a column, and
this dict is what a header cell is looked up against. There is exactly one
header row; there is no second header row for types or options.

For the **parent doctype**, a field is matched by any of:

- The field's label (untranslated)
- The field's translated label
- The field's fieldname
- `"{Label} ({fieldname})"`
- `"{Translated Label} ({fieldname})"`

For a **child table field** (a field that lives on a child doctype attached
via a `Table` field on the parent), a column is matched by any of:

- `"{table_fieldname}.{fieldname}"` (dotted fieldname notation)
- `"{Label} ({Table Field Label or fieldname})"`
- `"{Translated Label} ({Translated Table Field Label})"`

If two fields on the same doctype share a label, the first one wins the bare
label key; only the fieldname-suffixed forms are guaranteed unique — prefer
those forms when a doctype has label collisions.

Fields whose fieldtype is in `no_value_fields` (`Section Break`, `Column
Break`, `Tab Break`, `Attachment Gallery`, `HTML`, `Table`, `Table
MultiSelect`, `Button`, `Image`, `Fold`, `Heading`) are never eligible column
targets — a `Table` field itself never gets a column; its child rows are
expressed as the child doctype's own fields (see "Child-table rows" below).

Two standard fields are always available in addition to the DocType's own
fields: `Owner` (`owner`) and `Document Status` (`docstatus`, Int) on the
parent; `Parent`, `Parent Type`, `Parent Field`, `Row Index` (`idx`) on any
child doctype.

### The ID column

Every doctype (parent or child) has an implicit ID field, matched by:

- Parent: `"name"` (fieldname), `"ID"` (label), or the translated `"ID"`
- Child: `"{table_fieldname}.name"`, `"ID ({Table Field Label})"`, or the
  translated equivalent

If the parent doctype's `autoname` is field-based (e.g. `field:item_code`),
extra aliases are added for that field: `"ID ({Autoname Field Label})"`, its
translated form, and — importantly — the bare `"ID"` / translated `"ID"` /
`"name"` headers also map directly to the autoname field instead of the
literal `name` column. In that case there is no separate need for a `name`
column; put the autoname value under the `ID` header.

The ID column is required when importing in **Update** mode (to find the
existing record) and optional in **Insert** mode (Frappe generates the name).

## Child-table rows: one document, one or more rows

A single logical document in the source file can span multiple physical
rows. `ImportFile.parse_next_row_for_import` builds one document per pass:

1. Take the first unconsumed row as the anchor row.
2. If the doctype has child tables, look at every following row's values in
   the **parent's own columns only**. As long as *all* of those values are
   blank/invalid (`INVALID_VALUES`), that row is treated as an additional
   child row belonging to the same document — not a new document.
3. The first following row that has *any* non-blank value in a parent column
   starts the next document; everything from there on is unconsumed.

Practical effect: to add three child-table rows to one parent record, write
one row with every parent-doctype column filled in and the first child row's
values, then two more rows with the parent-doctype columns **left completely
blank** and only the child-table columns filled in. There is no repeat-marker
column and no second file for child data — it is purely position + blank
parent columns.

If a doctype has more than one child table field, a single row can carry
values for more than one child table at once (each child table's columns are
independent), and rows can be blank-parent continuation rows for the whole
document, not per child table.

## Insert vs Update

`import_type` on the Data Import document (and `--type` on the CLI) is one of
two literal values: `"Insert New Records"` or `"Update Existing Records"`
(the CLI's `Insert`/`Update` choice maps to these). This changes row parsing:

- **Insert**: `frappe.new_doc(doctype, ...)` seeds each row with field
  defaults, then column values overwrite them. No ID lookup happens.
- **Update**: for a **parent** row, values are merged onto the referenced
  existing document (found by ID) during the save step. For a **child-table**
  row specifically, `Row._parse_doc` checks whether the ID value resolves to
  an existing child row (`frappe.db.exists(doctype, id_value)`): if found, it
  loads that document with `frappe.get_doc` and applies the new values on top
  (existing values for columns not present in the file are preserved); if not
  found, it creates a fresh doc with defaults and applies the values — so an
  Update-mode import can still insert new child rows alongside updates to
  existing ones, as long as those new rows have no ID value.

## Per-fieldtype value coercion and validation

Coercion (`Row.parse_value`) and validation (`Row.validate_value`) both run
per cell, keyed off the target field's fieldtype:

| Fieldtype | Validation | Coercion |
|---|---|---|
| `Select` | Value must exactly match one of the `\n`-split `options` strings (case-sensitive `cstr` comparison) | none (kept as string) |
| `Link` | `frappe.db.exists(options, value, cache=True)` must be true | none (kept as string) |
| `Date` | Parsed with the column's auto-guessed date format; failure to parse leaves it a string, which is itself the validation failure | parsed to a `date` |
| `Datetime` | Same as `Date`, guessed with time included | parsed to a `datetime` |
| `Duration` | Must match `^(?:(\d+d)?((^|\s)\d+h)?((^|\s)\d+m)?((^|\s)\d+s)?)$` — e.g. `2d 3h 15m 10s`, or any subset in that order | converted to total seconds |
| `Check` | none beyond coercion | `t`/`f`/`true`/`false`/`yes`/`no`/`y`/`n` (case-insensitive) map to `1`/`0`; anything else falls through to `cint` |
| `Int` | none beyond coercion | `cint(value)` |
| `Float`, `Percent`, `Currency` | none beyond coercion | `flt(value)` |
| everything else (Data, Text, Small Text, Link-less strings, etc.) | none | kept as string via `cstr` |

### The silent-zero gotcha

`flt()` and `cint()` never raise: `flt()` strips commas from a string, then
tries `float(s)`; on any exception it returns `0.0`. `cint()` tries `int(s)`,
then `int(float(s))`, then falls back to `0` (or a supplied `default`).
Neither of these failures produces a warning — a value like `"$1,234.50"`
(currency symbol not stripped, only commas are) becomes `0.0` with **no
error, no warning, and no blocked import**. Clean numeric cells of currency
symbols, units, and stray text before writing the file; the importer will not
catch this for you.

### Date format guessing

`Column.guess_date_format_for_column` samples every value in a `Date`,
`Datetime`, or `Time` column, guesses each one's format with
`frappe.utils.guess_date_format`, and picks the most frequent guess as the
column's format for every row. If more than one distinct format is guessed
across the column, an **info-level** warning is added (non-blocking) naming
the chosen default, but rows that don't fit that format still fail to parse
individually and are counted as a validation failure for that row. Write
every date in the same unambiguous format, `YYYY-MM-DD`, to avoid both the
info warning and any per-row misparse.

### Link case sensitivity

`Column.validate_values` (the eager pre-check for `Link` columns) lowercases
both sides of the comparison when the site's database is MariaDB, and
compares case-sensitively on every other backend. `Row.link_exists`, used
during actual per-value validation, calls `frappe.db.exists(options, value,
cache=True)` directly — whether that is case-insensitive depends on the same
backend behavior. Match the target Link value's case exactly regardless of
backend to avoid relying on this.

## Warning severity: what actually blocks an import

`ImportFile.get_warnings()` collects three sources: file-level warnings,
per-column warnings, and per-row warnings. `Importer.import_data()` filters
this list down to `[w for w in warnings if w.get("type") != "info"]` — if
that filtered list is non-empty, the entire import is aborted and **zero**
documents are written; nothing is partially imported.

Warnings marked `"type": "info"` (non-blocking, cosmetic):

- "Skipping Untitled Column" (blank header cell)
- The date-format-auto-chosen message when a column has mixed guessed formats

Warnings with no `"type"` key, or `"type": "warning"` (blocking):

- `Select` value not in the allowed options
- `Link` value that doesn't exist (both the eager column-level check and the
  per-row check)
- `Date`/`Datetime` value that fails to parse in the column's guessed format
- `Duration` value that fails the duration regex
- Row has a different number of values than there are columns

## Downloading a pre-filled template instead of hand-building one

`frappe.core.doctype.data_import.data_import.download_template` is a
whitelisted method that builds a file with the exact header syntax above via
`Exporter`, optionally pre-filled with existing records:

```python
download_template(
    doctype="Item",
    export_fields={"Item": ["item_code", "item_name"], "Item Price": ["price_list", "price_list_rate"]},
    export_records="all",          # "all" | "by_filter" | "blank_template"
    export_filters=None,
    file_type="CSV",               # or an XLSX-producing type
)
```

`Exporter.add_header` builds each header cell as `_(label or fieldname)` for
parent fields, or `"{translated label} ({translated child-table field label
or fieldname})"` for child fields — falling back to the raw fieldname (or
`"{child_table_fieldname}.{fieldname}"` for a child field) only if the label
collides with an already-used header. Generating a template this way and
filling in values guarantees header compatibility; hand-writing headers must
match the same rules exactly.

## CLI

```bash
bench --site <site> data-import \
  --file <path.csv-or-xlsx> \
  --doctype "<DocType>" \
  --type Insert|Update \
  [--submit-after-import] \
  [--mute-emails]
```

`--file` resolves relative paths from the `sites` directory. `--type` maps
`Insert`/`Update` to `"Insert New Records"`/`"Update Existing Records"`
internally. `--mute-emails` defaults to `True` (email notifications during
bulk import are suppressed unless explicitly disabled).

## Sources

- `apps/frappe/frappe/core/doctype/data_import/importer.py:1138-1278` (`build_fields_dict_for_column_matching`), `:545-588` (`ImportFile.parse_next_row_for_import`), `:675-720` (`Row._parse_doc`), `:722-797` (`Row.validate_value`), `:799-800` (`Row.link_exists`), `:802-826` (`Row.parse_value`), `:1006-1047` (`Column.guess_date_format_for_column`), `:1049-1077` (`Column.validate_values`), `:79-94` (`Importer.import_data` warning filter, `:86-87`), `:29-66` (`Importer.__init__`, `get_data_for_import_preview`), `:423-499` (`ImportFile.__init__`, `parse_data_from_template`), `:638-662` (`Row.__init__`), `:26` (`DURATION_PATTERN`)
- `apps/frappe/frappe/core/doctype/data_import/exporter.py:229-249` (`Exporter.add_header`)
- `apps/frappe/frappe/core/doctype/data_import/data_import.py:217-260` (`download_template`), `:326-347` (`import_file` helper, Insert/Update mapping)
- `apps/frappe/frappe/commands/utils.py:447-479` (`bench data-import` CLI)
- `apps/frappe/frappe/model/__init__.py:53-65` (`no_value_fields`), `:96` (`child_table_fields`), `:101` (`table_fields`)
- `apps/frappe/frappe/utils/data.py:1121-1161` (`flt`), `:1164-1190` (`cint`), `:2534` (`guess_date_format`)
