# Excel-to-CSV Workflow

A concrete procedure for turning a raw, messy Excel sheet into a file that
matches the header syntax in
[data-import-template-format.md](data-import-template-format.md), using only
libraries already shipped with Frappe — `openpyxl` and `xlrd` are pinned
dependencies, `pandas` is not. No install step is needed inside a bench venv.

## 1) Read the raw sheet with `openpyxl`

Mirror the exact pattern Frappe's own attachment reader uses
(`read_xlsx_file_from_attached_file`): `data_only=True` reads computed
formula results instead of formula source strings, which matters for a sheet
built by hand with `=SUM(...)`/lookup formulas.

```python
from openpyxl import load_workbook

wb = load_workbook(filename="/path/to/raw.xlsx", data_only=True, read_only=True)
ws = wb.active  # or wb["Sheet Name"] for a specific sheet
rows = [[cell.value for cell in row] for row in ws.iter_rows()]
wb.close()

raw_header, *raw_rows = rows
print(raw_header)
print(raw_rows[:5])  # eyeball a sample before writing any mapping code
```

For a legacy `.xls` file, use `xlrd` the same way Frappe does:

```python
import xlrd

book = xlrd.open_workbook("/path/to/raw.xls")
sheet = book.sheets()[0]
raw_rows = [sheet.row_values(i) for i in range(sheet.nrows)]
raw_header, *raw_rows = raw_rows
```

A plain `.csv` source needs only the stdlib `csv` module — skip this step
entirely and read it with `csv.reader`.

## 2) Map raw columns to target fields

Build an explicit mapping from raw header text to the exact Data Import
header string the target field expects (see
[data-import-template-format.md](data-import-template-format.md) for the
matching rules). Do this explicitly, one dict, rather than trying to
auto-guess — a wrong guess silently drops a column instead of failing loudly:

```python
# raw column name -> Data Import header
column_map = {
    "Item No": "item_code",                       # parent field by fieldname
    "Description": "Item Name",                    # parent field by label
    "Rate": "Standard Rate",
    "Warehouse Qty": "Opening Stock",
    "Price List": "Price List (Item Price)",       # child-table field
    "Selling Rate": "Rate (Item Price)",            # child-table field
}
target_header = [column_map[c] for c in raw_header if c in column_map]
skipped = [c for c in raw_header if c not in column_map]
print("dropping unmapped raw columns:", skipped)
```

Any raw column not in `column_map` should be dropped explicitly and printed,
not silently carried through — an unrecognized header becomes an ignored
"Untitled"-adjacent column in the importer rather than an error.

## 3) Clean values per target fieldtype before writing

Do the coercion the importer will *not* warn you about yourself. This
mirrors the fieldtype table in
[data-import-template-format.md](data-import-template-format.md):

```python
import re
from datetime import datetime

def clean_currency(raw):
    """Strip symbols/units so flt() doesn't silently return 0.0."""
    if raw in (None, ""):
        return ""
    s = re.sub(r"[^\d.\-]", "", str(raw))  # drop $, commas, currency codes, spaces
    return s

def clean_date(raw, source_format=None):
    """Normalize to YYYY-MM-DD so the importer's per-column format guess is unambiguous."""
    if raw in (None, ""):
        return ""
    if isinstance(raw, datetime):
        return raw.strftime("%Y-%m-%d")
    parsed = datetime.strptime(str(raw).strip(), source_format or "%d/%m/%Y")
    return parsed.strftime("%Y-%m-%d")

def clean_select(raw, allowed_options):
    """Match Select fields exactly; Select comparison is case-sensitive."""
    raw = str(raw).strip()
    for option in allowed_options:
        if raw.lower() == option.lower():
            return option  # return the option's exact casing
    raise ValueError(f"{raw!r} is not one of {allowed_options}")
```

Pull `allowed_options` for a `Select` field straight from the meta instead of
hardcoding it:

```python
meta = frappe.get_meta("Item")
options = meta.get_field("item_group").options.split("\n")
```

## 4) Flatten child-table data into blank-parent continuation rows

If the raw sheet already has one row per parent record with repeated child
values in extra columns (e.g. `Price List 1`, `Rate 1`, `Price List 2`, `Rate
2`), pivot those into separate rows with the parent columns blanked out, per
the child-table row rule in
[data-import-template-format.md](data-import-template-format.md):

```python
def expand_child_rows(parent_row, parent_field_count, child_groups):
    """child_groups: list of tuples of raw values for each repeated child instance."""
    rows = [parent_row]
    for group in child_groups:
        if not any(group):
            continue
        blank_parent = [""] * parent_field_count
        rows.append(blank_parent + list(group))
    return rows
```

If the raw sheet already has one row per child instance (a normalized
export), no pivoting is needed — just leave the parent columns blank on every
row after the first for a given parent.

## 5) Write the CSV

Plain stdlib `csv`, no dependency:

```python
import csv

with open("/path/to/candidate.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(target_header)
    writer.writerows(target_rows)
```

Writing an `.xlsx` instead is just as direct with `openpyxl` (which can also
write, unlike `xlrd`):

```python
from openpyxl import Workbook

wb = Workbook()
ws = wb.active
ws.append(target_header)
for row in target_rows:
    ws.append(row)
wb.save("/path/to/candidate.xlsx")
```

CSV and XLSX are equally valid Data Import inputs — prefer CSV for a
script-generated file; there is no formatting/typing to preserve that XLSX
would add value for here.

## 6) Dry-run through the real importer

Do not hand-roll validation for `Select`/`Link`/`Date`/`Duration` — reuse
`Importer` itself, which already implements every rule in
[data-import-template-format.md](data-import-template-format.md):

```python
# bench console, or bench execute path.to.module.dry_run --kwargs '{"file_path": "...", "doctype": "..."}'
from frappe.core.doctype.data_import.importer import Importer

def dry_run(file_path, doctype, import_type="Insert New Records"):
    data_import = frappe.new_doc("Data Import")
    data_import.reference_doctype = doctype
    data_import.import_file = file_path
    data_import.import_type = import_type

    importer = Importer(doctype=doctype, file_path=file_path, data_import=data_import)
    importer.import_file.get_payloads_for_import()   # builds docs in memory; populates warnings
    warnings = importer.import_file.get_warnings()
    blocking = [w for w in warnings if w.get("type") != "info"]
    for w in blocking:
        print(w.get("row"), w.get("message"))
    return blocking

dry_run("/path/to/candidate.csv", "Item")
```

This performs no database writes (`get_payloads_for_import` only calls
`frappe.new_doc`, which is in-memory, plus read-only `frappe.db.exists`
lookups for `Link` fields). Never call `importer.import_data()` here — that
method performs the real insert once the same warning check comes back
clean.

Iterate: fix the generation script (step 2-4), regenerate the CSV, re-run
`dry_run`, until `blocking` is empty.

## 7) Run the real import

```bash
bench --site <site> data-import --file /path/to/candidate.csv --doctype "Item" --type Insert
```

Or upload through the Data Import Tool in Desk (New → Data Import) for a
progress UI and an errored-rows download if any row fails at commit time
(permission checks and DocType-level `validate` hooks run only at this step,
not during the dry run above).

## Sources

- `apps/frappe/frappe/utils/xlsxutils.py:642-661` (`read_xlsx_file_from_attached_file` — exact `openpyxl.load_workbook(data_only=True)` pattern), `:663-667` (`read_xls_file_from_attached_file` — `xlrd` pattern)
- `apps/frappe/frappe/core/doctype/data_import/importer.py:55-66` (`Importer.get_data_for_import_preview`), `:536-543` (`get_payloads_for_import`), `:79-94` (`import_data` — where the real insert happens after the same warning check)
- `apps/frappe/pyproject.toml` (`openpyxl~=3.1.5`, `xlrd~=2.0.2` as pinned dependencies; no `pandas` dependency)
