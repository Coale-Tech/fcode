# Workflow Patterns

> Adopted from [lubusIN/frappe-skills](https://github.com/lubusIN/frappe-skills) (MIT) — `enterprise-patterns/references/workflow-patterns.md`.

## Overview
Production-grade workflow patterns for enterprise Frappe applications.

## Workflow DocType schema

A Workflow attaches to exactly one `document_type`; checking `is_active` on save
deactivates every other Workflow for that **same** `document_type`
(`Workflow.set_active`, `frappe/workflow/doctype/workflow/workflow.py`) — only one
workflow can be active per DocType at a time.

| Workflow field | Notes |
|---|---|
| `document_type` | Link DocType this workflow governs |
| `is_active` | Deactivates sibling workflows for the same `document_type` |
| `override_status` | "Don't Override Status" — skip driving the list-view status indicator from workflow state |
| `send_email_alert` | Email users about the next possible actions |
| `enable_action_confirmation` (v16) | Require a confirm dialog before running a workflow action |
| `states` | Table of `Workflow Document State` |
| `transitions` | Table of `Workflow Transition` |
| `workflow_state_field` | Fieldname holding the current state; defaults to `workflow_state` (auto-created as a hidden Custom Field if absent) |

`Workflow Document State` (each row in `states`):

| Field | Notes |
|---|---|
| `state` | Link to `Workflow State` (master: `workflow_state_name`, `icon`, `style`) |
| `doc_status` | `"0"` Draft / `"1"` Submitted / `"2"` Cancelled |
| `allow_edit` | Role allowed to edit the doc while in this state (required) |
| `update_field` / `update_value` / `evaluate_as_expression` | Optionally set another field when this state is reached; `evaluate_as_expression` runs `update_value` through the same sandboxed evaluator as transition conditions |
| `is_optional_state` | No `Workflow Action` ToDo-style record is created for this state |
| `send_email` | Email on entering this state (default checked) |
| `next_action_email_template` | Link to `Email Template` |

`Workflow Transition` (each row in `transitions`):

| Field | Notes |
|---|---|
| `state` / `next_state` | Link to `Workflow State` |
| `action` | Link to `Workflow Action Master` |
| `allowed` | Role allowed to perform this transition |
| `allow_self_approval` | **Checked by default** — see Self-approval below |
| `send_email_to_creator` | Only shown when `allow_self_approval` is checked |
| `condition` | Python expression evaluated against `doc` |
| `transition_tasks` (v16) | Link to a `Workflow Transition Tasks` record — see Transition tasks below |

```json
{
  "workflow_name": "Request Approval Workflow",
  "document_type": "Request",
  "is_active": 1,
  "override_status": 1,
  "states": [
    {"state": "Draft", "doc_status": "0", "allow_edit": "Employee"},
    {"state": "Pending Approval", "doc_status": "0", "allow_edit": "Manager", "next_action_email_template": "Approval Required"},
    {"state": "Approved", "doc_status": "1", "allow_edit": "", "message": "Request has been approved"}
  ],
  "transitions": [
    {"state": "Draft", "action": "Submit for Approval", "next_state": "Pending Approval", "allowed": "Employee", "condition": "doc.amount > 0"},
    {"state": "Pending Approval", "action": "Approve", "next_state": "Approved", "allowed": "Manager", "allow_self_approval": 0, "condition": "doc.amount <= 10000"}
  ]
}
```

## Applying a workflow programmatically

```python
from frappe.model.workflow import get_transitions, apply_workflow

doc = frappe.get_doc("Request", "REQ-0001")
transitions = get_transitions(doc)  # transitions from doc's current state whose `allowed` role the user has and whose `condition` is truthy
apply_workflow(doc, "Approve")      # @frappe.whitelist(); validates the action, updates workflow_state_field, drives docstatus, adds a "Workflow" comment
```

Both are `@frappe.whitelist()`, callable from a client script or REST
(`/api/method/frappe.model.workflow.apply_workflow`). `condition` and `update_value`
(when `evaluate_as_expression`) run through `frappe.safe_eval` with a restricted
global namespace exposing only `frappe.db.get_value`, `frappe.db.get_list`,
`frappe.session`, and `frappe.utils.{now_datetime,add_to_date,get_datetime,now}`
(`get_workflow_safe_globals`) — arbitrary imports are not reachable from a condition.

## Self-approval

`allow_self_approval` on `Workflow Transition` defaults to **checked**, so by
default the document's owner CAN approve their own transitions:

```python
def has_approval_access(user, doc, transition):
    return user == "Administrator" or transition.get("allow_self_approval") or user != doc.get("owner")
```

Approval is blocked only when the acting user is the doc's `owner`, is not
Administrator, and `allow_self_approval` is explicitly unchecked on that
transition — uncheck it on any approval transition where the creator must not be
the approver.

## Docstatus transitions

`apply_workflow` maps the target state's `doc_status` to a real docstatus change:
Draft to Draft calls `doc.save()`; Draft to Submitted calls `doc.submit()` (queued
in the background instead if `meta.queue_in_background` and the scheduler is
active); Submitted to Submitted calls `doc.save()`; Submitted to Cancelled calls
`doc.cancel()`. Any other doc_status jump (e.g. Draft to Cancelled) raises
`frappe.throw` — model the intermediate state instead.

## Transition tasks (v16)

A transition's `transition_tasks` field can point at a `Workflow Transition Tasks`
record containing `Workflow Transition Task` rows, each naming a task
(`Webhook`, `Server Script`, or a custom name registered via `hooks.py`), a `link`
to the Webhook/Server Script/etc, and `asynchronous`. `apply_workflow` runs
synchronous tasks inline in the same transaction and enqueues asynchronous ones
with `frappe.enqueue(..., enqueue_after_commit=True)`:

```python
# hooks.py
workflow_methods = [
    {"name": "Notify Finance", "method": "my_app.workflows.notify_finance"}
]
```

```python
# my_app/workflows.py
def notify_finance(doc):
    frappe.sendmail(recipients=["finance@example.com"], subject=f"{doc.doctype} {doc.name} approved")
```

`GET /api/method/frappe.workflow.doctype.workflow.workflow.get_workflow_methods`
lists every available task name (`Webhook`, `Server Script`, plus your
`workflow_methods` hook entries) for building a transition-task picker UI.

## Email alerts and bulk actions

`send_email_alert` (Workflow-level) queues an email to users with roles allowed to
act on the document's current state, listing the possible next actions; toggle it
off per-state with `send_email` on the `Workflow Document State` row (checked by
default). `bulk_workflow_approval(docnames, doctype, action)`
(`@frappe.whitelist(methods=["POST"])`, `frappe/model/workflow.py`) applies one
action to up to 500 documents at once and reports per-document success/failure.

## Multi-Level Approval

### Tiered Approval Matrix
```python
def get_required_approvers(doc):
    """Determine approvers based on document amount"""
    if doc.amount <= 1000:
        return [{"role": "Team Lead", "required": 1}]
    elif doc.amount <= 10000:
        return [
            {"role": "Team Lead", "required": 1},
            {"role": "Manager", "required": 1}
        ]
    elif doc.amount <= 100000:
        return [
            {"role": "Manager", "required": 1},
            {"role": "Director", "required": 1}
        ]
    else:
        return [
            {"role": "Director", "required": 1},
            {"role": "CEO", "required": 1}
        ]
```

### Approval Tracking DocType
```json
{
  "doctype": "Approval Entry",
  "fields": [
    {"fieldname": "reference_doctype", "fieldtype": "Link", "options": "DocType"},
    {"fieldname": "reference_name", "fieldtype": "Dynamic Link", "options": "reference_doctype"},
    {"fieldname": "approval_level", "fieldtype": "Int"},
    {"fieldname": "approver", "fieldtype": "Link", "options": "User"},
    {"fieldname": "status", "fieldtype": "Select", "options": "Pending\nApproved\nRejected"},
    {"fieldname": "approved_on", "fieldtype": "Datetime"},
    {"fieldname": "comments", "fieldtype": "Text"}
  ]
}
```

### Controller Integration
```python
class RequestDocument(Document):
    def on_update(self):
        if self.workflow_state == "Pending Approval":
            self.create_approval_entries()
    
    def create_approval_entries(self):
        approvers = get_required_approvers(self)
        for level, approver_config in enumerate(approvers):
            frappe.get_doc({
                "doctype": "Approval Entry",
                "reference_doctype": self.doctype,
                "reference_name": self.name,
                "approval_level": level + 1,
                "approver": self.get_approver_for_role(approver_config["role"]),
                "status": "Pending"
            }).insert(ignore_permissions=True)  # controller-owned workflow tracking record, not a direct user insert
    
    def check_all_approvals(self):
        pending = frappe.db.count("Approval Entry", {
            "reference_doctype": self.doctype,
            "reference_name": self.name,
            "status": "Pending"
        })
        return pending == 0
```

## Simulating Parallel Approval Tracks

Frappe's native `Workflow` DocType supports only **one active workflow per
`document_type`** (`Workflow.set_active` deactivates every sibling workflow for
the same `document_type` on save) — there is no built-in way to run several
independent workflow state machines concurrently against the same document type.
To require several independent approval tracks (e.g. Finance AND HR AND Legal)
before a document proceeds, build it yourself on top of a single workflow: track
each track's status on the document instead of activating multiple `Workflow`
records.

### Custom multi-track status flags
```python
def handle_parallel_workflows(doc, method):
    """Track independent approval tracks as plain fields, driven by a single Workflow"""
    tracks = [
        {"flag": "finance_approved", "condition": lambda d: d.requires_finance},
        {"flag": "hr_approved", "condition": lambda d: d.requires_hr},
        {"flag": "legal_approved", "condition": lambda d: d.amount > 100000}
    ]

    required = [t["flag"] for t in tracks if t["condition"](doc)]
    doc.db_set("required_tracks", ",".join(required))


def all_tracks_approved(doc):
    required = (doc.required_tracks or "").split(",")
    return all(doc.get(flag) for flag in required if flag)
```

Gate the workflow's final transition `condition` on `all_tracks_approved(doc)` so
the single native workflow only reaches its terminal state once every required
custom track flag is set.

## Escalation Patterns

### Time-Based Escalation
```python
def check_escalations():
    """Run via scheduler"""
    pending_docs = frappe.get_all("Request", filters={
        "workflow_state": "Pending Approval",
        "modified": ["<", add_days(nowdate(), -3)]
    })
    
    for doc in pending_docs:
        escalate_to_next_level(doc.name)
```

### Escalation Rules
```json
{
  "doctype": "Escalation Rule",
  "fields": [
    {"fieldname": "workflow_state", "fieldtype": "Data"},
    {"fieldname": "wait_days", "fieldtype": "Int"},
    {"fieldname": "escalate_to", "fieldtype": "Link", "options": "Role"},
    {"fieldname": "notification_template", "fieldtype": "Link", "options": "Email Template"}
  ]
}
```

## Workflow State Change Hooks

```python
## hooks.py
doc_events = {
    "Request": {
        "on_change": "my_app.workflows.handle_workflow_state_change"
    }
}

## workflows.py
def handle_workflow_state_change(doc, method):
    if doc.has_value_changed("workflow_state"):
        old_state = doc.get_doc_before_save().workflow_state
        new_state = doc.workflow_state
        
        # Log transition
        log_workflow_transition(doc, old_state, new_state)
        
        # Trigger state-specific actions
        state_handlers = {
            "Approved": on_approved,
            "Rejected": on_rejected,
            "Completed": on_completed
        }
        
        handler = state_handlers.get(new_state)
        if handler:
            handler(doc)
```

## Workflow Visualization

### Generate Workflow Diagram
```python
def generate_workflow_diagram(workflow_name):
    """Generate Mermaid diagram for workflow"""
    workflow = frappe.get_doc("Workflow", workflow_name)
    
    lines = ["graph TD"]
    for t in workflow.transitions:
        lines.append(f"    {t.state.replace(' ', '_')} -->|{t.action}| {t.next_state.replace(' ', '_')}")
    
    return "\n".join(lines)
```

## Best Practices

1. **Keep states descriptive** - Use verb-based names like "Pending Approval", "Under Review"
2. **Limit transitions** - Each state should have 2-3 max transitions
3. **Use conditions wisely** - Keep conditions simple, move complex logic to Python
4. **Document state purposes** - Add help text explaining what each state means
5. **Test edge cases** - Test all possible state transitions

## Sources

Verified against Frappe v16.35.0 (`frappe/__init__.py` `__version__`):

- `apps/frappe/frappe/model/workflow.py` — `get_transitions`, `apply_workflow`, `get_workflow_safe_globals`, `has_approval_access`, `bulk_workflow_approval`
- `apps/frappe/frappe/workflow/doctype/workflow/workflow.py:35-143` — `Workflow.set_active`, `validate_docstatus`, `get_workflow_methods`
- `apps/frappe/frappe/workflow/doctype/workflow/workflow.json` — `override_status`, `send_email_alert`, `enable_action_confirmation`, `workflow_state_field` (default `workflow_state`)
- `apps/frappe/frappe/workflow/doctype/workflow_transition/workflow_transition.json` — `allow_self_approval` (default checked), `send_email_to_creator`, `transition_tasks`, `condition`
- `apps/frappe/frappe/workflow/doctype/workflow_document_state/workflow_document_state.json` — `doc_status`, `allow_edit`, `update_field`/`update_value`/`evaluate_as_expression`, `is_optional_state`, `send_email` (default checked), `next_action_email_template`
