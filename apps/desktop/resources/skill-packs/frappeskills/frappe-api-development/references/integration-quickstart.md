# Frappe Integration Quickstart

Quick-start bridge for connecting backend DocTypes to frontend Vue.js pages. For deep dives, see the specialized reference files.

> **Deep References:**
> - DocType field types, naming, hooks, permissions → `doctype-patterns.md`
> - REST API, Database API, Query Builder, Background Jobs → `api-patterns.md`
> - ERPNext module workflows (Accounting, Stock, Selling) → [erpnext-workflows.md](../../frappe-erpnext-hrms/references/erpnext-workflows.md)
> - Custom fields on standard DocTypes → `fixtures-guide.md`
> - Vue.js components and frappe-ui → [frappe-ui-components.md](../../frappe-frontend-development/references/frappe-ui-components.md)

---

## Backend-First Workflow

Always follow this order:

```
1. DocType JSON + Controller  →  doctype-patterns.md
2. API Endpoints              →  api-patterns.md
3. Hooks (doc_events, etc.)   →  api-patterns.md (Hooks section)
4. Frontend Vue Pages         →  frappe-ui-components.md
5. Workspace / Navigation     →  workspace-patterns.md
```

---

## Minimal DocType + API + Frontend Example

### 1. DocType JSON (abridged)

**File:** `my_app/my_module/doctype/task/task.json`

```json
{
  "name": "Task",
  "module": "My Module",
  "fields": [
    { "fieldname": "title", "fieldtype": "Data", "label": "Title", "reqd": 1 },
    { "fieldname": "status", "fieldtype": "Select", "label": "Status",
      "options": "Open\nIn Progress\nCompleted", "default": "Open" },
    { "fieldname": "assigned_to", "fieldtype": "Link", "label": "Assigned To",
      "options": "User" },
    { "fieldname": "due_date", "fieldtype": "Date", "label": "Due Date" }
  ],
  "permissions": [
    { "role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1 }
  ],
  "sort_field": "modified",
  "sort_order": "DESC"
}
```

### 2. Controller

**File:** `my_app/my_module/doctype/task/task.py`

```python
import frappe
from frappe.model.document import Document

class Task(Document):
    def validate(self):
        if self.status == "Completed" and not self.due_date:
            frappe.throw("Due date required for completed tasks")

    def on_update(self):
        frappe.publish_realtime("task_updated", {"name": self.name})
```

### 3. API Endpoint

**File:** `my_app/my_module/api.py`

```python
import frappe

@frappe.whitelist()
def get_tasks(status=None, limit_page_length=20):
    filters = {}
    if status:
        filters["status"] = status
    return frappe.get_all("Task",
        fields=["name", "title", "status", "assigned_to", "due_date"],
        filters=filters,
        order_by="creation desc",
        limit_page_length=limit_page_length
    )

@frappe.whitelist()
def update_task_status(name, status):
    doc = frappe.get_doc("Task", name)
    doc.status = status
    doc.save()
    return doc.as_dict()
```

### 4. Frontend (Vue.js + frappe-ui)

```vue
<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-semibold text-gray-900">Tasks</h1>
      <Button variant="solid" @click="showCreate = true">New Task</Button>
    </div>
    <div v-if="tasks.loading" class="text-gray-500">Loading...</div>
    <div v-else-if="tasks.data?.length">
      <div v-for="task in tasks.data" :key="task.name"
           class="p-4 border border-gray-200 rounded mb-2">
        <div class="font-medium">{{ task.title }}</div>
        <Badge :theme="statusTheme(task.status)">{{ task.status }}</Badge>
      </div>
    </div>
    <div v-else class="text-gray-400">No tasks found</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Button, Badge, createResource } from 'frappe-ui'

const tasks = createResource({
  url: 'my_app.my_module.api.get_tasks',
  auto: true
})

function statusTheme(status) {
  return { Open: 'gray', 'In Progress': 'blue', Completed: 'green' }[status] || 'gray'
}
</script>
```

### 5. Hooks Registration

**File:** `my_app/hooks.py`

```python
website_route_rules = [
    {"from_route": "/tasks/<path:app_path>", "to_route": "task"}
]
```

---

## Field Type → Component Mapping

| DocType Field | Frontend Component | Key Props |
|---------------|-------------------|-----------|
| Data | `FormControl` | `type="text"` |
| Text / Long Text | `FormControl` | `type="textarea"` |
| Link | `Combobox` `(v1)` / `Autocomplete` (0.1.x, deprecated in v1) | No core link-picker component exists — wrap the combobox with a `createResource` search resource; see [frappe-ui-core-components.md](../../frappe-frontend-development/references/frappe-ui-core-components.md) |
| Select | `FormControl` | `type="select"`, `options` |
| Date / DateTime | `FormControl` | `type="date"` / `type="datetime"` |
| Check | `FormControl` | `type="checkbox"` |
| Currency / Float / Int | `FormControl` | `type="number"` |
| Table | Custom data grid | Child table component |
| Text Editor | `Editor` from `frappe-ui/editor` `(v1)` | Top-level `TextEditor` still works but is deprecated |

---

## Essential ORM Quick Reference

```python
# Get document
doc = frappe.get_doc("Task", "TASK-001")

# Get list
tasks = frappe.get_all("Task", fields=["name", "title"], filters={"status": "Open"})

# Create
doc = frappe.new_doc("Task")
doc.title = "New Task"
doc.insert()

# Update
frappe.db.set_value("Task", "TASK-001", "status", "Completed")

# Delete
frappe.delete_doc("Task", "TASK-001")

# Check existence
exists = frappe.db.exists("Task", {"title": "New Task"})

# Count
count = frappe.db.count("Task", {"status": "Open"})
```

> **For more:** Query Builder (PyPika), Background Jobs, Scheduler → `api-patterns.md`

---

## Permission Quick Reference

```python
# Check permission
frappe.has_permission("Task", "read", "TASK-001")

# In API endpoints - always check
@frappe.whitelist()
def my_method(name):
    if not frappe.has_permission("Task", "read", name):
        frappe.throw("Not permitted", frappe.PermissionError)

# Permission query (restrict list views)
# hooks.py:
permission_query_conditions = {
    "Task": "my_app.utils.get_task_conditions"
}
```

> **For more:** Role-based permissions, Custom Permission Queries → `doctype-patterns.md`

---

## Cross-Reference Map

| Need | Reference File |
|------|---------------|
| All field types | [field-types.md](../../frappe-doctype-development/references/field-types.md) |
| Naming/autoname strategies | [naming.md](../../frappe-doctype-development/references/naming.md) |
| Controller lifecycle hooks | [controllers.md](../../frappe-doctype-development/references/controllers.md) |
| Whitelisted API patterns | [api.md](api.md) |
| REST resource API | [rest-api.md](rest-api.md) |
| Database API and Query Builder | [database.md](database.md) |
| Background Jobs & Scheduler | [background-jobs.md](../../frappe-app-development/references/background-jobs.md) |
| Hooks system (doc_events, overrides) | [hooks.md](../../frappe-app-development/references/hooks.md) |
| ERPNext modules (Accounting, Stock) | [erpnext-workflows.md](../../frappe-erpnext-hrms/references/erpnext-workflows.md) |
| Custom fields on standard DocTypes | [fixtures.md](../../frappe-app-development/references/fixtures.md) |
| Vue.js + frappe-ui components | [frappe-ui-components.md](../../frappe-frontend-development/references/frappe-ui-components.md) |
| Data visualization & charts | [data-visualization.md](../../frappe-reports/references/data-visualization.md) |
| HR & Payroll | [hrms-patterns.md](../../frappe-erpnext-hrms/references/hrms-patterns.md) |
| Bench CLI commands | [bench.md](../../frappe-bench-operations/references/bench.md) |
| Outbound webhooks on doc events | [webhooks.md](webhooks.md) |
| Throttling a public endpoint | [rate-limiting.md](rate-limiting.md) |
| Third-party sync connectors, FrappeClient | [integration-patterns.md](integration-patterns.md) |
| v15/v16 differences | [v15-v16-compatibility.md](../../frappe-project-triage/references/v15-v16-compatibility.md) |

## Sources

Verified against Frappe v16.35.0 at `<bench>/apps/frappe` (all cross-referenced files confirmed present in `references/`):
- `apps/frappe/frappe/model/document.py` — `Document` base class (controller lifecycle)
- `apps/frappe/frappe/realtime.py` — `publish_realtime`
- `apps/frappe/frappe/permissions.py` + `apps/frappe/frappe/__init__.py` — `has_permission`
- Custom-field fixture workflow → see [fixtures.md](../../frappe-app-development/references/fixtures.md) (`create_custom_fields`, `export-fixtures --app`)
