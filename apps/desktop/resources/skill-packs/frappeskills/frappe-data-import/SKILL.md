---
name: frappe-data-import
description: Convert a raw or messy Excel/CSV sheet into a Frappe Data Import template and load it with the core Data Import tool. Use when a user hands you a spreadsheet to bulk-create or bulk-update records.
---

# Frappe Data Import

Turn an arbitrary spreadsheet into records in a DocType, using the framework's
own Data Import tool instead of a hand-rolled importer script.

## When to use

- A user provides a raw Excel/CSV export (from another system, a manual sheet,
  a client dump) and wants it loaded into a DocType
- Bulk-creating or bulk-updating records where the source columns do not match
  Frappe field labels or fieldnames
- One-off migrations that do not justify a custom Patch or API endpoint

## Inputs required

- The raw spreadsheet (`.xlsx`, `.xls`, or `.csv`)
- Target DocType, and whether this is an insert or an update of existing
  records
- Which raw columns map to which DocType fields (including child-table
  columns, if any)

## Procedure

### 1) Inspect the target DocType

Read the target meta before touching the spreadsheet — it is the source of
truth for fieldnames, labels, fieldtypes, mandatory fields, and child tables:

```python
# bench console
meta = frappe.get_meta("Item")
for df in meta.fields:
    print(df.fieldname, df.label, df.fieldtype, df.reqd)
for df in meta.get_table_fields():
    print(df.fieldname, "->", df.options)  # child table doctype
```

Note which fields are mandatory, which are `Select`/`Link`/`Date`/`Duration`
(the fieldtypes with strict value validation), and the fieldnames of any
child tables you need to populate.

### 2) Read the raw spreadsheet

Use `openpyxl` (already a Frappe dependency — no install needed inside a
bench venv) to inspect the raw sheet's actual columns and sample values
before deciding on a mapping. See
[references/excel-to-csv-workflow.md](references/excel-to-csv-workflow.md).

### 3) Build the header row using the exact matching rules

The importer matches each column header against the target DocType's fields
by label, fieldname, or a disambiguated `"Label (fieldname)"` form; child-table
columns use `"Label (Child Table Label)"` or `"table_fieldname.fieldname"`
dotted notation. Getting the header text right avoids "column not mapped"
warnings entirely. Full matching rules, the ID/autoname column, and the
child-table row-continuation rule (blank-parent-column rows belong to the
previous document) are in
[references/data-import-template-format.md](references/data-import-template-format.md).

### 4) Clean values before writing the CSV, not after

The importer does not raise on a malformed number — `flt("$1,234.50")`
silently becomes `0.0`. Strip currency symbols, normalize dates to
`YYYY-MM-DD`, and match `Select` options exactly (case-sensitive) while still
in Python, before the file ever reaches the importer. See the fieldtype
coercion table in
[references/data-import-template-format.md](references/data-import-template-format.md).

### 5) Write the CSV

Use the stdlib `csv` module with the header row from step 3. See
[references/excel-to-csv-workflow.md](references/excel-to-csv-workflow.md) for
the exact pattern, including flattening one-to-many child-table data into
blank-parent-column continuation rows.

### 6) Dry-run the candidate file through the real importer

Before touching the UI or the CLI, run the candidate CSV through Frappe's own
`Importer` in a console session and read its warnings — this reuses the exact
validation the real import will do, instead of re-implementing it:

```python
# bench console
from frappe.core.doctype.data_import.importer import Importer

data_import = frappe.new_doc("Data Import")
data_import.reference_doctype = "Item"
data_import.import_file = "/path/to/candidate.csv"
data_import.import_type = "Insert New Records"  # or "Update Existing Records"

importer = Importer(doctype="Item", file_path=data_import.import_file, data_import=data_import)
importer.import_file.get_payloads_for_import()      # builds docs in memory, populates warnings
warnings = importer.import_file.get_warnings()
[w for w in warnings if w.get("type") != "info"]     # non-empty -> import would be blocked
```

Never call `importer.import_data()` in this step — it performs the real
insert once no blocking warnings remain. Fix the CSV and re-run until the
blocking list is empty.

### 7) Run the real import

```bash
bench --site <site> data-import --file /path/to/candidate.csv --doctype "Item" --type Insert
```

Or upload the file through the Data Import Tool in Desk for a preview UI with
per-row status. Use `--type Update` to update existing records by ID instead
of inserting.

## Verification

- [ ] Column headers match target fields by the importer's own rules (step 3)
      — no "column not mapped" warnings in the dry run
- [ ] Every `Select` value matches an option string exactly
- [ ] Every `Link` value exists in the target doctype (case rules depend on
      the database backend)
- [ ] Dates are unambiguous (`YYYY-MM-DD` recommended) and parse consistently
      across the whole column
- [ ] Numeric columns have no stray currency symbols or unit suffixes
- [ ] Child-table rows use the correct blank-parent-column continuation
      pattern, not a duplicated header or a second file
- [ ] Dry-run warning list (step 6) has zero non-`info` entries
- [ ] Row count in the target DocType matches the expected record count after
      import (compare `frappe.db.count`) or the errored-rows count is
      understood and acceptable

## Failure modes / debugging

- **"Skipping Untitled Column" warning**: a header cell is blank — this is
  informational only and the column is ignored, not an error
- **Value silently becomes `0` or `0.0`**: numeric coercion (`cint`/`flt`)
  failed and defaulted rather than raising — clean the raw value before import,
  the importer will not catch this for you
- **Whole import blocked, no rows inserted**: a non-`info` warning exists
  somewhere in the file (bad `Select`/`Link`/`Date`/`Duration` value) — run
  the dry run in step 6 to find every offending row before retrying
- **Date column parsed wrong for only some rows**: the importer guesses one
  date format per column from a sample of values — mixed formats in one
  column are unreliable; normalize to `YYYY-MM-DD` first
- **Child rows became separate top-level documents**: a child row's parent
  columns were not left blank — the importer treats any row with a
  non-blank parent-column value as the start of a new document
- **Update mode created new rows instead of updating**: the ID column value
  did not match any existing record — check autoname vs `name` field mapping

## Escalation

- Recurring migration needing custom transformation logic beyond column
  mapping → a one-off Patch, not this workflow
  ([`frappe-app-development`](../frappe-app-development/SKILL.md))
- Need a downloadable template pre-filled with existing data →
  `download_template` whitelisted method (see reference), not a hand-built
  CSV
- DocType itself needs new fields to hold the incoming data →
  [`frappe-doctype-development`](../frappe-doctype-development/SKILL.md)

## References

- [references/data-import-template-format.md](references/data-import-template-format.md) - Exact header syntax, child-table row rules, ID/autoname resolution, Insert vs Update semantics, per-fieldtype value coercion and validation, warning severity model
- [references/excel-to-csv-workflow.md](references/excel-to-csv-workflow.md) - Reading raw Excel with `openpyxl`, mapping and cleaning columns, writing the CSV, dry-run validation loop

## Guardrails

- **Read the target meta first**: never guess fieldnames or labels
- **Clean numeric and date values before writing the file**: the importer
  silently defaults bad numbers to zero instead of warning
- **Dry-run with `get_payloads_for_import()` + `get_warnings()`, never
  `import_data()`**, when validating in a console session — the latter
  performs the real insert
- **No pandas dependency**: use stdlib `csv` and the already-installed
  `openpyxl`/`xlrd` inside a bench venv
- **`Select` matching is case-sensitive**; `Link` matching is case-insensitive
  only on MariaDB
- **Always pass `--site`** to `bench data-import`

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| Using the raw spreadsheet's original column names verbatim | Importer can't map them to fields | Rename headers to label, fieldname, or `"Label (fieldname)"` |
| Leaving currency symbols in numeric cells | `flt`/`cint` silently return 0 | Strip symbols before writing the CSV |
| Mixed date formats in one column | Importer guesses one format per column | Normalize to `YYYY-MM-DD` |
| Repeating parent values on every child row | Breaks the blank-row child continuation rule, creates duplicate documents | Blank the parent columns on child-only rows |
| Calling `import_data()` to "preview" in a console session | Actually performs the insert | Use `get_payloads_for_import()` + `get_warnings()` for a dry run |
| Assuming `pandas` is available in the bench venv | Not a Frappe dependency | Use stdlib `csv` and `openpyxl` |
