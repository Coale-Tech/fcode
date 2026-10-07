# Data Visualization Reference

Comprehensive reference for Frappe Charts (lightweight SVG charting), report summary cards,
Desk dashboards (Number Card / Dashboard Chart), and Frappe Insights (BI platform).

---

## Frappe Charts

### Overview

- **Rendering**: SVG-based (no Canvas)
- **Types**: 7 chart types — `line`, `bar`, `axis-mixed`, `pie`, `donut`, `percentage`, `heatmap`
  (verified against the bundled `frappe-charts` build; no `scatter` type ships)
- **Bundled version**: `frappe-charts@2.0.0-rc27` (`apps/frappe/package.json`)
- **GitHub**: https://github.com/frappe/charts

### Installation

```bash
npm install frappe-charts
# or
yarn add frappe-charts
```

```javascript
import { Chart } from 'frappe-charts'
import 'frappe-charts/dist/frappe-charts.min.css'
```

### CDN Usage

```html
<script src="https://cdn.jsdelivr.net/npm/frappe-charts@2/dist/frappe-charts.umd.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/frappe-charts@2/dist/frappe-charts.min.css">
```

### In Desk (bundled global — not npm)

Inside Frappe Desk, `frappe-charts` is already bundled and re-exported as the **`frappe.Chart`** global — there is
**no `frappe.ui.Chart`**. Use `frappe.Chart` directly in Desk scripts/client scripts; there is also a
`frappe.ui.RealtimeChart` subclass for socket-fed charts.

```javascript
// Desk (client script / bundle) — no import needed:
const chart = new frappe.Chart("#chart", { data, type: "line", height: 300 })

// Socket-driven realtime chart (extends frappe.Chart):
const rt = new frappe.ui.RealtimeChart("#chart", "my_event", 8, initialData)
```

> Source: `apps/frappe/frappe/public/js/frappe/ui/chart.js` —
> `import { Chart } from "frappe-charts/dist/frappe-charts.esm"; frappe.Chart = Chart;`
> In a standalone Vue SPA you still `import { Chart } from 'frappe-charts'` as shown below.

---

### Chart Types

#### 1. Line Chart

```javascript
const chart = new Chart("#chart", {
    title: "Sales Trend",
    data: {
        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
        datasets: [
            {
                name: "Revenue",
                type: "line",
                values: [18000, 25000, 22000, 30000, 28000, 35000]
            }
        ]
    },
    type: "line",
    height: 300,
    colors: ["#171717"],  // Black/minimal palette
    lineOptions: {
        showDots: 1,        // set 0 to hide points (older docs call this `hideDots`, inverted)
        dotSize: 4,          // default 4
        hideLine: 0,         // set 1 to draw only points, no connecting line
        hideDotBorder: 0,
        regionFill: 1,        // fill area under line
        heatline: 0,
        spline: 0,            // curved lines
        trailingDot: 1        // highlight dot that follows the last value
    }
})
```

#### 2. Bar Chart

```javascript
const chart = new Chart("#chart", {
    title: "Monthly Sales",
    data: {
        labels: ["Q1", "Q2", "Q3", "Q4"],
        datasets: [
            { name: "2023", values: [50000, 60000, 55000, 70000] },
            { name: "2024", values: [65000, 75000, 70000, 85000] }
        ]
    },
    type: "bar",
    height: 300,
    colors: ["#737373", "#171717"],
    barOptions: {
        stacked: 0,
        spaceRatio: 0.5
    }
})
```

#### 3. Axis Mixed Chart

```javascript
const chart = new Chart("#chart", {
    title: "Revenue vs Orders",
    data: {
        labels: ["Jan", "Feb", "Mar", "Apr"],
        datasets: [
            { name: "Revenue", type: "bar", values: [50000, 60000, 55000, 70000] },
            { name: "Orders", type: "line", values: [120, 150, 130, 180] }
        ]
    },
    type: "axis-mixed",
    height: 300,
    colors: ["#E5E5E5", "#171717"]
})
```

#### 4. Pie Chart

```javascript
const chart = new Chart("#chart", {
    title: "Sales by Region",
    data: {
        labels: ["East Africa", "West Africa", "Southern Africa", "North Africa"],
        datasets: [{ values: [45, 25, 20, 10] }]
    },
    type: "pie",
    height: 300,
    colors: ["#171717", "#525252", "#A3A3A3", "#D4D4D4"]
})
```

#### 5. Donut Chart

```javascript
const chart = new Chart("#chart", {
    title: "Order Status",
    data: {
        labels: ["Completed", "In Progress", "Pending", "Cancelled"],
        datasets: [{ values: [65, 20, 10, 5] }]
    },
    type: "donut",
    height: 300,
    colors: ["#171717", "#525252", "#A3A3A3", "#D4D4D4"]
})
```

#### 6. Percentage Chart

```javascript
const chart = new Chart("#chart", {
    title: "Task Completion",
    data: {
        labels: ["Done", "In Progress", "Pending"],
        datasets: [{ values: [70, 20, 10] }]
    },
    type: "percentage",
    height: 50,
    colors: ["#171717", "#737373", "#D4D4D4"]
})
```

#### 7. Heatmap Chart

```javascript
const chart = new Chart("#chart", {
    title: "Activity Heatmap",
    data: {
        dataPoints: {
            1704067200: 5,   // Unix timestamps
            1704153600: 10,
            1704240000: 3,
            // ... more data points
        },
        start: new Date("2024-01-01"),
        end: new Date("2024-12-31")
    },
    type: "heatmap",
    height: 200,
    discreteDomains: 1,
    countLabel: "Activities"
})
```

---

### Chart Configuration

```javascript
const chart = new Chart("#chart", {
    title: "Chart Title",
    data: { ... },
    type: "line",
    height: 300,
    colors: ["#171717", "#737373"],
    animate: 1,
    truncateLegends: 1,
    axisOptions: {
        xAxisMode: "tick",       // "tick" or "span"
        yAxisMode: "span",
        xIsSeries: 0
        // also: numberFormatter, seriesLabelSpaceRatio, shortenYAxisNumbers, yAxisRange
    },
    tooltipOptions: {
        formatTooltipX: d => d.toUpperCase(),
        formatTooltipY: d => `$${d.toLocaleString()}`
    },
    isNavigable: 1,  // Enable click events
    valuesOverPoints: 0
})
```

### Dynamic Updates

```javascript
// Update entire dataset
chart.update({
    labels: ["Jan", "Feb", "Mar"],
    datasets: [{ values: [100, 200, 300] }]
})

// Add data point
chart.addDataPoint("Apr", [400])

// Remove data point
chart.removeDataPoint(0)  // Remove first point

// Export
chart.export()  // Downloads as PNG
```

### Events

```javascript
// Click on data point
chart.parent.addEventListener('data-select', (e) => {
    console.log(e.index, e.values, e.label)
})
```

---

### Vue.js Integration

```vue
<template>
  <div class="p-6">
    <h2 class="text-xl font-semibold text-gray-900 mb-4">Sales Dashboard</h2>
    <div ref="chartContainer" class="border border-gray-200 rounded-lg p-4"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { createResource } from 'frappe-ui'
import { Chart } from 'frappe-charts'

const chartContainer = ref(null)
let chartInstance = null

const salesData = createResource({
  url: 'my_app.api.get_sales_trend',
  auto: true,
  onSuccess(data) {
    renderChart(data)
  }
})

function renderChart(data) {
  if (chartInstance) {
    chartInstance.update(data)
  } else {
    chartInstance = new Chart(chartContainer.value, {
      title: "Sales Trend",
      data: data,
      type: "line",
      height: 300,
      colors: ["#171717"],
      lineOptions: { regionFill: 1 }
    })
  }
}

onMounted(() => {
  if (salesData.data) renderChart(salesData.data)
})
</script>
```

---

## Report Summary Cards (`report_summary`)

Element 4 of the `execute()` return tuple documented in
[reports.md](reports.md#3-script-report-standard-file-based) — a list of small stat cards rendered
above the report table by `render_summary()` / `frappe.utils.build_summary_item`
(`frappe/public/js/frappe/utils/utils.js`, `frappe/public/js/frappe/views/reports/query_report.js`).
The same renderer backs the summary row on the Dashboard chart widget
(`frappe/public/js/frappe/widgets/chart_widget.js`).

Each item is a dict:

| Key | Purpose |
|---|---|
| `value` | the number/text shown, formatted per `datatype` |
| `label` | card title |
| `datatype` | any docfield fieldtype passed to `frappe.format`; `"Currency"` also reads `currency` |
| `currency` | 3-letter code, used only when `datatype == "Currency"` |
| `indicator` / `color` | CSS color/indicator class for the value (`indicator` takes priority) |
| `type: "separator"` | renders a plain divider cell instead of a label/value pair |

```python
def get_report_summary(data):
    total = sum(d.total_amount for d in data)
    return [
        {"value": total, "label": "Total Sales", "datatype": "Currency", "currency": "USD", "indicator": "green"},
        {"value": len(data), "label": "Customers", "datatype": "Int"},
    ]
```

---

## Frappe Dashboard Charts (Desk)

### Number Card

```python
nc = frappe.get_doc({
    "doctype": "Number Card",
    "label": "Total Revenue",
    "type": "Document Type",             # Document Type | Report | Custom
    "document_type": "Sales Invoice",
    "function": "Sum",                   # Count | Sum | Average | Minimum | Maximum
    "aggregate_function_based_on": "grand_total",
    "filters_json": '{"docstatus": 1}',
    "is_standard": 1,
    "show_percentage_stats": 1,
    "stats_time_interval": "Monthly"     # Daily | Weekly | Monthly | Yearly
}).insert()
```

> `Number Card` has no `autoname` in its DocType JSON. Naming is handled by a custom
> `autoname()` controller method that sets `name = label`, appending a numeric suffix via
> `append_number_if_name_exists` if that name is already taken — do not also pass `name`
> (`frappe/desk/doctype/number_card/number_card.py`). `type == "Report"` additionally requires
> `report_name`, `report_field`, and `report_function` (`Sum`/`Average`/`Minimum`/`Maximum`);
> `type == "Custom"` requires a whitelisted `method` returning
> `{"value": ..., "fieldtype": "Currency", "route": [...], "route_options": {...}}`.
> Fields verified against `apps/frappe/frappe/desk/doctype/number_card/number_card.json` and
> `number_card.py`.

### Dashboard Chart

```python
dc = frappe.get_doc({
    "doctype": "Dashboard Chart",
    "chart_name": "Monthly Sales",
    "chart_type": "Sum",       # Count | Sum | Average | Group By | Custom | Report
    "document_type": "Sales Invoice",
    "based_on": "posting_date",
    "value_based_on": "grand_total",   # required when chart_type = Sum/Average
    "timespan": "Last Year",   # Last Year | Last Quarter | Last Month | Last Week | Select Date Range
    "time_interval": "Monthly",# Yearly | Quarterly | Monthly | Weekly | Daily
    "filters_json": '{"docstatus": 1}',
    "type": "Bar",             # Line | Bar | Percentage | Pie | Donut | Heatmap
    "is_standard": 1
}).insert()
```

Additional `chart_type` values beyond Count/Sum/Average:

- `"Group By"` — use `group_by_based_on` + `group_by_type` (`Count`/`Sum`/`Average`, with
  `aggregate_function_based_on` when not `Count`) and optional `number_of_groups`, instead of
  `based_on`/`value_based_on`.
- `"Report"` — set `report_name`; either check `use_report_chart` to reuse the report's own
  `execute()`-returned chart, or leave it off and configure `x_field` plus a `y_axis` child table
  (`Dashboard Chart Field`) to plot specific report columns.
- `"Custom"` — set `source` to a **Dashboard Chart Source** document, which points at a whitelisted
  method that returns chart data (`frappe/desk/doctype/dashboard_chart_source/`).

Other fields: `timeseries` (Check, forced off for `Group By`/`Report`), `from_date`/`to_date` (only
when `timespan == "Select Date Range"`), `show_values_over_chart` (Bar/Line only), `roles` (`Has
Role` table — if set, only those roles may view the chart regardless of DocType/Report
permissions), `currency`, `last_synced_on` (read-only). Fields verified against
`apps/frappe/frappe/desk/doctype/dashboard_chart/dashboard_chart.json`.

### Dashboard (container)

A `Dashboard` document (`autoname: field:dashboard_name`) groups charts and cards for the
Desk dashboard view: `charts` (`Dashboard Chart Link` table), `cards` (`Number Card Link` table),
`is_default`, `chart_options` (JSON applied as default options to every chart on the dashboard,
e.g. `{"colors": ["#d1d8dd", "#ff5858"]}`), and the usual `is_standard`/`module` pair for
app-bundled dashboards (`frappe/desk/doctype/dashboard/dashboard.json`).

---

## Frappe Insights

### Overview

Frappe Insights is a full BI (Business Intelligence) platform built on Frappe.

> **Note:** Insights is a **separate installable app**, not part of the Frappe framework core (it is not present
> on this bench). Its DocTypes/API (e.g. `Insights Data Source`) track the Insights release, not
> Frappe's — verify against the installed Insights version before relying on the snippets below.

- **Repository**: https://github.com/frappe/insights
- **Features**: Visual query builder, dashboards, sharing, scheduled reports
- **Data Sources**: MariaDB, PostgreSQL, SQLite, external databases

### Installation

```bash
bench get-app insights
bench --site my-site install-app insights
```

### Query Builder

```python
# Programmatic query via API
import frappe
from frappe.query_builder.functions import Avg, Count, Sum
from frappe.utils import add_months, nowdate

@frappe.whitelist()
def get_insights_data():
    SI = frappe.qb.DocType("Sales Invoice")
    total_sales = Sum(SI.grand_total).as_("total_sales")
    query = (
        frappe.qb.from_(SI)
        .select(
            SI.customer,
            total_sales,
            Count(SI.name).as_("invoice_count"),
            Avg(SI.grand_total).as_("avg_sale"),
        )
        .where(SI.docstatus == 1)
        .where(SI.posting_date >= add_months(nowdate(), -12))
        .groupby(SI.customer)
        .orderby(total_sales, order=frappe.qb.desc)
        .limit(10)
    )
    return query.run(as_dict=True)
```

### Dashboard Configuration

Insights dashboards are configured via the web UI at `/insights`. Key features:

- Drag-and-drop chart placement
- Multiple data sources per dashboard
- Filters that apply across charts
- Auto-refresh intervals
- Share with roles/users
- Export as PDF

### Data Sources

```python
# Add external data source via API
ds = frappe.new_doc("Insights Data Source")
ds.title = "Analytics DB"
ds.database_type = "MariaDB"
ds.host = "analytics-db.example.com"
ds.port = 3306
ds.database_name = "analytics"
ds.username = "reader"
ds.password = "secure_password"
ds.insert()
```

---

## Best Practices

1. **Use Frappe Charts** for simple embedded visualizations (SVG, no Canvas)
2. **Use Frappe Insights** for complex BI dashboards and ad-hoc analysis
3. **Apply black/minimal design tokens** to chart colors (`#171717`, `#737373`, `#D4D4D4`)
4. **Use createResource** for loading chart data in Vue.js
5. **Always use Query Builder** (`frappe.qb`, PyPika) — never `frappe.db.sql` — for chart data queries
6. **Add loading states** while chart data fetches
7. **Make charts responsive** with percentage-based widths
8. **Export functionality** - use `chart.export()` for PNG downloads
9. **Use heatmaps** for time-series activity data
10. **Use percentage charts** for simple proportion displays

## Sources

Verified against Frappe 16.35.0 (`apps/frappe`):
- `apps/frappe/frappe/public/js/frappe/ui/chart.js` — `frappe.Chart` global + `frappe.ui.RealtimeChart`
- `apps/frappe/node_modules/frappe-charts/dist/frappe-charts.esm.js` — chart types and option keys
- `apps/frappe/frappe/desk/query_report.py`, `frappe/public/js/frappe/views/reports/query_report.js`,
  `frappe/public/js/frappe/utils/utils.js` — `report_summary` contract and rendering
- `apps/frappe/frappe/desk/doctype/dashboard_chart/dashboard_chart.json` — chart_type/type/timespan options
- `apps/frappe/frappe/desk/doctype/number_card/number_card.json`, `number_card.py` — function/type/naming
- `apps/frappe/frappe/desk/doctype/dashboard/dashboard.json` (Dashboard container)
- `apps/frappe/frappe/desk/doctype/dashboard_chart_source/dashboard_chart_source.json` (Custom chart source)
- Query builder: `apps/frappe/frappe/query_builder/functions.py:4` (re-exports `pypika.functions.{Avg,Count,Sum}` via `frappe.query_builder.functions`), `apps/frappe/frappe/utils/data.py:330,428` (`add_months`, `nowdate`)
- Frappe Insights is an external app: https://github.com/frappe/insights (not on this bench)
