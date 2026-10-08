# Reports — Report Builder, Query Reports, Script Reports

> Adopted from [lubusIN/frappe-skills](https://github.com/lubusIN/frappe-skills) (MIT) — `reports/SKILL.md`,
> then verified against Frappe 16.35.0 source.

## Frappe Reports

Build reports using Report Builder, Query Reports (SQL), Script Reports (Python + JS), or Custom
Reports (a saved column/filter overlay on another report). Types come from the `Report` DocType's
`report_type` Select field: `Report Builder`, `Query Report`, `Script Report`, `Custom Report`
(`frappe/core/doctype/report/report.json`).

### When to use

- Creating data analysis or summary reports
- Building SQL-based query reports
- Implementing complex reports with Python logic and JS UI
- Adding custom filters, formatters, and charts to reports
- Creating printable report formats

### Inputs required

- Report purpose and data requirements
- Source DocType(s) for the report
- Filter requirements
- Column definitions (fields, types, formatting)
- Whether report is standard (app-bundled) or custom (site-specific)

### Procedure

#### 0) Choose report type

| Type | Complexity | Code Required | Best For |
|------|-----------|---------------|----------|
| Report Builder | Low | None | Ad-hoc field selection, grouping, sorting, saved as JSON |
| Query Report | Medium | SQL only | Direct SQL queries, joins, aggregations |
| Script Report | High | Python + JS | Complex logic, computed fields, dynamic filters |
| Custom Report | Low | None | Saving extra columns/filters on top of an existing report |

#### 1) Report Builder

Create via UI with no code — the Report list view's built-in grid saves its column/filter/sort
state as `Report.json` through `frappe.desk.reportview.save_report` (`frappe/desk/reportview.py`).
That endpoint forces `report_type = "Report Builder"`, refuses edits to standard reports, and
requires the caller to own the report or have write permission on it.

1. Navigate to the Report list → New Report (or type "new report" in the awesomebar)
2. Select Reference DocType
3. Choose Report Type = "Report Builder"
4. Add columns, filters, sorting, and grouping via the builder UI

Server-side rendering (`Report.run_standard_report`) reads that JSON for `fields`/`columns`,
`filters`, `sort_by`/`sort_order` (with an optional `sort_by_next`), and `group_by`; a top-level
`add_totals_row: true` key appends a totals row via `frappe.desk.reportview.append_totals_row`.
This JSON-level `add_totals_row` is independent from the `Report.add_total_row` checkbox used by
Query/Script/Custom reports below.

#### 2) Query Report

Reports using raw SQL. The query is validated server-side by `check_safe_sql_query`
(`frappe/utils/safe_exec.py`): it must start with `select` or `explain`, or with `with` when the
site database is MariaDB (CTE); anything else — including `into outfile`/`into dumpfile` — raises
`frappe.PermissionError`.

1. Create Report → Type = "Query Report"
2. Set Reference DocType (controls permissions)
3. Write SQL query

```sql
SELECT
    `tabSales Order`.name AS "Sales Order:Link/Sales Order:200",
    `tabSales Order`.customer AS "Customer:Link/Customer:200",
    `tabSales Order`.transaction_date AS "Date:Date:120",
    `tabSales Order`.grand_total AS "Grand Total:Currency:150",
    `tabSales Order`.status AS "Status:Data:100"
FROM `tabSales Order`
WHERE `tabSales Order`.docstatus = 1
    {% if filters.company %}
    AND `tabSales Order`.company = %(company)s
    {% endif %}
    {% if filters.from_date %}
    AND `tabSales Order`.transaction_date >= %(from_date)s
    {% endif %}
ORDER BY `tabSales Order`.transaction_date DESC
```

**Column format in SELECT**: `"Label:Fieldtype/Options:Width"` — at most 3 colon-separated parts;
a 4th part is ignored. If the report has rows in its **Columns** table those win; otherwise columns
come from these `AS` aliases, and if neither is set, from the raw DB cursor column names
(`Report.execute_query_report`).

**Filter variables**: Use `%(filter_name)s` for parameterized queries — never string-interpolate
filter values into SQL.

#### 3) Script Report (standard, file-based)

For app-bundled reports with full Python + JS control:

**Create the report structure:**
```
my_app/
└── my_module/
    └── report/
        └── sales_summary/
            ├── sales_summary.json    # Report metadata
            ├── sales_summary.py      # Python data logic
            └── sales_summary.js      # JS filters and UI
```

**`execute()` return contract** (`frappe/desk/query_report.py:generate_report_result`): the
function returns a tuple right-padded to 6 elements with `None` —
`columns, data, message, chart, report_summary, skip_total_row`. Only `columns, data` are
required; the rest are optional trailing elements.

| Position | Name | Type | Purpose |
|---|---|---|---|
| 0 | `columns` | list | column defs — string `"Label:Type/Options:Width"` or dict form |
| 1 | `data` | list | rows — list of dicts or list of lists/tuples |
| 2 | `message` | str \| None | raw HTML shown above the table (hidden for prepared reports) |
| 3 | `chart` | dict \| None | `frappe.Chart`-shaped config: `{"data": {...}, "type": "bar"}` |
| 4 | `report_summary` | list \| None | summary cards, see [data-visualization.md](data-visualization.md) |
| 5 | `skip_total_row` | 0/1 \| None | forces the totals row off even if `add_total_row` is checked |

```python
import frappe
from frappe import _
from frappe.query_builder.functions import Count, Sum

def execute(filters=None):
    columns = get_columns()
    data = get_data(filters)
    chart = get_chart(data)
    return columns, data, None, chart

def get_columns():
    return [
        {
            "label": _("Customer"),
            "fieldname": "customer",
            "fieldtype": "Link",
            "options": "Customer",
            "width": 200
        },
        {
            "label": _("Total Orders"),
            "fieldname": "total_orders",
            "fieldtype": "Int",
            "width": 120
        },
        {
            "label": _("Total Amount"),
            "fieldname": "total_amount",
            "fieldtype": "Currency",
            "width": 150
        }
    ]

def get_data(filters):
    SO = frappe.qb.DocType("Sales Order")
    total_orders = Count(SO.name).as_("total_orders")
    total_amount = Sum(SO.grand_total).as_("total_amount")
    query = (
        frappe.qb.from_(SO)
        .select(SO.customer, total_orders, total_amount)
        .where(SO.docstatus == 1)
        .groupby(SO.customer)
        .orderby(total_amount, order=frappe.qb.desc)
    )
    if filters.get("company"):
        query = query.where(SO.company == filters["company"])
    if filters.get("from_date"):
        query = query.where(SO.transaction_date >= filters["from_date"])
    return query.run(as_dict=True)

def get_chart(data):
    if not data:
        return None
    return {
        "data": {
            "labels": [d.customer for d in data[:10]],
            "datasets": [{"name": _("Total Amount"), "values": [d.total_amount for d in data[:10]]}]
        },
        "type": "bar"
    }
```

**JavaScript script** (`sales_summary.js`) — see [Script Report client settings](#script-report-client-settings-frappequery_reports) below for every key `frappe.query_reports[...]` accepts:

```javascript
frappe.query_reports["Sales Summary"] = {
    filters: [
        {
            fieldname: "company",
            label: __("Company"),
            fieldtype: "Link",
            options: "Company",
            default: frappe.defaults.get_user_default("Company"),
            reqd: 1
        }
    ],
    onload(report) {
        // Custom initialization, called once after the report loads
    },
    formatter(value, row, column, data, default_formatter) {
        value = default_formatter(value, row, column, data);
        if (column.fieldname === "total_amount" && data.total_amount > 100000) {
            value = `<span style="color: green; font-weight: bold">${value}</span>`;
        }
        return value;
    }
};
```

**Report JSON** (`sales_summary.json`):

```json
{
    "name": "Sales Summary",
    "doctype": "Report",
    "report_type": "Script Report",
    "ref_doctype": "Sales Order",
    "module": "My Module",
    "is_standard": "Yes",
    "disabled": 0
}
```

Standard reports are only saved this way when `developer_mode` is on; saving triggers
`export_to_files` plus boilerplate generation for the `.py`/`.js` files
(`Report.export_doc`/`create_report_py`).

#### 4) Script Report (inline, non-standard)

A site-specific Script Report needs no files at all: set `report_type = "Script Report"` and
`is_standard = "No"`, then write Python directly into the Report document's **Script**
(`report_script`) field and JS into **Javascript** (`javascript`). Creating or editing this way
requires the **Script Manager** role (`Report.validate`).

`report_script` runs through `safe_exec` with locals `filters`, `data`, `result` pre-seeded
(`Report.execute_script`). Either:

- set `result = [...]` and let the report's configured **Columns** table supply column defs, or
- set the old-style `data = [columns], [result]` to control both explicitly.

#### 5) Custom Report

A Custom Report is a saved overlay of extra columns/filters on top of another report — created
from the Report view's "Add Column"/"Save As" actions, or via
`frappe.desk.query_report.save_report(reference_report, report_name, columns, filters)`. It is
always `is_standard = "No"`, `report_type = "Custom Report"`, with `reference_report` pointing at
the source Query/Script report and `json` holding `{"columns": [...], "filters": [...]}`. At run
time `get_report_doc` loads the referenced report, merges in the custom `columns`/`filters`, and
executes it — a Custom Report has no `execute()` of its own. Its own `prepared_report` checkbox is
independent and takes priority over the referenced report's when set.

#### 6) Prepared Report (background execution)

For reports too slow to run synchronously, check **Prepared Report** on the `Report` document.
Running it then creates a `Prepared Report` document instead of returning data directly:

- `Prepared Report.after_insert` enqueues `generate_report` on the `long` queue with
  `timeout=Report.timeout or REPORT_TIMEOUT` (`REPORT_TIMEOUT = 25 * 60` seconds — this is the
  1500-second default the `Report.timeout` field description refers to)
  (`frappe/core/doctype/prepared_report/prepared_report.py`).
- Status (`Prepared Report.status`) is one of `Queued`, `Started`, `Completed`, `Error`; deleting a
  queued/running document cancels or stops its RQ job (`PreparedReport.on_trash`).
- The result is gzip-compressed JSON attached to the document; `get_prepared_data()` decompresses
  it, and `enqueue_json_to_csv_conversion` converts it to CSV on demand.
- **Auto-enable**: for Script Reports (not already prepared, and without
  `disable_prepared_report_automation` checked) `Report.execute_script_report` starts a 15-second
  `threading.Timer`. If the synchronous run is still going when it fires, the report is flipped to
  `prepared_report = 1` in the background so future runs queue automatically.

#### 7) Add report print format

Create `sales_summary.html` in the report folder for a custom print layout:

```html
<h2>Sales Summary Report</h2>
<table class="table table-bordered">
    <tr>
        <th>Customer</th>
        <th>Orders</th>
        <th>Total</th>
    </tr>
    {% for row in data %}
    <tr>
        <td>{{ row.customer }}</td>
        <td>{{ row.total_orders }}</td>
        <td>{{ frappe.format(row.total_amount, {fieldtype: 'Currency'}) }}</td>
    </tr>
    {% endfor %}
</table>
```

#### 8) Register and permit

Standard reports are auto-discovered by their folder convention; no `hooks.py` entry is needed.
Two independent checks gate access (`frappe/desk/query_report.py:get_report_doc`):

- `frappe.has_permission(ref_doctype, "report")` — the user needs the `report` permission level on
  the Reference DocType.
- The Report's own **Roles** table (`Has Role`, `Report.is_permitted`) — if empty, any user who
  passes the check above may run it; if set, the user's roles must intersect it (a Custom Role
  override can further replace this list).

Newly-created reports default their Roles table to every role with `permlevel = 0` on the
Reference DocType (`Report.set_doctype_roles`).

### Column definitions

Rows in the Report's **Columns** table (`Report Column` doctype,
`frappe/core/doctype/report_column/report_column.json`) accept: `fieldname` (reqd), `label`
(reqd), `fieldtype` (reqd — one of `Check`, `Currency`, `Data`, `Date`, `Datetime`, `Duration`,
`Dynamic Link`, `Float`, `Fold`, `Int`, `Link`, `Select`, `Time`), `options`, `width`. This is a
narrower fieldtype set than the full DocType field list; `execute()`-returned column dicts are not
restricted to it.

For the old-style `"Label:Fieldtype/Options:Width"` string columns returned from `execute()`,
`get_column_as_dict` (`frappe/desk/query_report.py`) splits on `:` — at most 3 parts are read — and
derives `fieldname` from `frappe.scrub(label)` if a dict column omits it.

### Report Filter definitions

Rows in the Report's **Filters** table (`Report Filter` doctype,
`frappe/core/doctype/report_filter/report_filter.json`) accept: `label` (reqd), `fieldtype` (reqd —
same 13-value set as columns above, no `Duration`), `fieldname` (reqd), `mandatory`,
`wildcard_filter` (wraps the value in `%...%`), `options`, `default`.

### Script Report client settings (`frappe.query_reports[...]`)

Every key below is read by `frappe/public/js/frappe/views/reports/query_report.js`:

| Key | Signature | Purpose |
|---|---|---|
| `filters` | array of docfield-like objects | rendered as the filter row; `fieldtype: "Break"` inserts a layout break and is skipped; each entry also accepts `get_query` and `on_change(report)` — `on_change` replaces the default auto-refresh-on-change behavior |
| `onload(report)` | fn | runs once after the report first loads |
| `formatter(value, row, column, data, default_formatter)` | fn → string | per-cell HTML; call `default_formatter(...)` first, then adjust |
| `get_datatable_options(options)` | fn → options | mutate the Frappe DataTable init options before construction |
| `tree` | boolean | render results as a tree (parent/child rows); disables the auto-inserted total row |
| `parent_field` | string | fieldname on each row pointing at its parent, used with `tree` |
| `initial_depth` | number | default expand depth for tree reports; `0` shows a collapsed root |
| `after_datatable_render(datatable)` | fn | runs after the DataTable instance is built |
| `get_chart_data(columns, result)` | fn → chart config | client-computed chart, overrides the `chart` returned by `execute()` |
| `get_pdf_format(report, html_format)` | async fn → html | custom print format used only for PDF export |
| `after_refresh(report)` | fn | runs after every `refresh()` completes |
| `separate_check_filters` | boolean | moves `Check`-type filters into their own row |
| `collapsible_filters` | boolean | hides filters behind an expand/collapse toggle |
| `export_hidden_cols` | boolean | include hidden columns when exporting |

`html_format` and `execution_time` on this same object are populated server-side by
`get_script` (`frappe/desk/query_report.py`) — do not set them yourself.

### Verification

- [ ] Report appears in Report list
- [ ] Filters work correctly and affect results
- [ ] Columns display with proper formatting
- [ ] Chart renders (if applicable)
- [ ] Permissions respected (only authorized users see data)
- [ ] Print format works
- [ ] Performance acceptable for expected data volume; prepared report kicks in for slow runs

### Failure modes / debugging

- **Report not found**: Check module path and `is_standard` setting; run `bench --site <site> migrate`
- **`Unsafe SQL query`**: Query Report SQL must start with `select`/`explain` (or `with` on
  MariaDB); rewrite instead of trying to work around it
- **No data returned**: Check `docstatus` filter; verify filters match data
- **Permission denied**: Verify the Reference DocType's `report` permission for the user's role,
  and any Report-level Roles table
- **Slow query**: Add indexes; use Query Builder; limit result set; consider Prepared Report

### Escalation

- For DocType schema → `frappe-doctype-development`
- For API endpoints (report data via API) → `frappe-api-development`
- For Desk UI customization → `frappe-desk-customization`

### References

- [references/reports.md](reports.md) — Report types, creation, and examples
- [references/data-visualization.md](data-visualization.md) — charts, dashboards, report summary cards

### Guardrails

- **Validate filters**: Check filter values before building queries; handle empty/invalid input
- **Handle empty results**: Always handle case where query returns no data; show appropriate message
- **`frappe.qb` always, never `frappe.db.sql`**: for a query the query builder can express (see [database.md](../../frappe-api-development/references/database.md#never-use-frappedbsql-by-default))
- **Limit result sets**: Add LIMIT clause or pagination for large datasets
- **Check permissions in execute**: Verify user has permission to see the data

### Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| `frappe.db.sql` for a query `frappe.qb` can express | Injection risk; bypasses dialect handling | Rewrite with `frappe.qb` |
| Untyped columns | No formatting or links | Set `fieldtype` |
| Including drafts unintentionally | Inflated totals | Filter `docstatus = 1` |
| Joins before aggregation | Duplicated rows | Aggregate, then join |
| Python loop over rows for sums | Slow reports | `frappe.qb` aggregation (`Sum`, `Count`, `groupby`) |
| Query not starting with `select`/`explain` | `check_safe_sql_query` throws | Rewrite as a read-only statement |
| Not handling None in aggregations | Errors or wrong totals | Wrap with `frappe.query_builder.functions.IfNull` |

## Sources

Verified against Frappe 16.35.0 (`apps/frappe`):

- `apps/frappe/frappe/query_builder/functions.py:4` (re-exports `pypika.functions.{Count,Sum}`), `functions.py` `IfNull` wrapper
- `apps/frappe/frappe/desk/query_report.py` — `check_safe_sql_query`, report return contract
