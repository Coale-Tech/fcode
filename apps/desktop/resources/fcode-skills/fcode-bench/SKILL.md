---
name: fcode-bench
description: "Fcode host tools: fcode_bench_execute, fcode_bench_execute_read, fcode_bench_run, fcode_studio, fcode_canvas, fcode_canvas_read — when to use each and what is auto-approved."
---

# Fcode host tools

Fcode registers six host tools in omp. Use these to interact with the active
bench and the embedded canvas instead of raw shell commands. `fcode_studio`
(Studio publish/export, always prompts) is documented in the `fcode-studio` skill.

## fcode_bench_execute_read

**Auto-approved.** Calls `bench --site <site> execute <method> --kwargs <json>`
for read-only method prefixes:

- `frappe.client.get` / `frappe.client.get_list`
- `frappe.db.get_value` / `frappe.db.count`
- `frappe.utils.*`
- `studio.api.get_*` / `studio.api.list_*`
- `builder.api.get_*` / `builder.api.list_*`

```json
{
  "method": "frappe.client.get_list",
  "kwargs": { "doctype": "Customer", "fields": ["name", "customer_name"], "limit": 10 }
}
```

Use this for inspection, listing, and reading records. For any method outside
these prefixes, use `fcode_bench_execute`.

## fcode_bench_execute

**Prompts.** Same interface as `fcode_bench_execute_read`, for methods that
mutate the site (insert, update, delete, sync). The user sees site + method +
kwargs in the approval card.

```json
{
  "method": "builder.export_import_standard_page.sync_standard_builder_pages"
}
```

## fcode_bench_run

**Always prompts.** Runs a bench CLI command through the supervisor. Allow-list
of verbs: `migrate`, `clear-cache`, `build`, `build-studio-app`, `list-apps`,
`install-app`.

```json
{ "command": "migrate" }
{ "command": "build-studio-app", "args": ["<studio_app_name>"] }
{ "command": "list-apps", "args": ["-f", "json"] }
```

`start`, `console`, `serve`, `execute`, `watch-studio`, and every other verb
are rejected — they are either long-running (managed by the Bench tab) or have
a dedicated tool.

## fcode_canvas

**Prompts.** Controls the embedded Build canvas (Studio or Builder view in the
Build tab). Actions: `navigate`, `reload`, `click`, `fill`, `evaluate`.

```json
{ "action": "navigate", "url": "http://localhost:8000/studio" }
{ "action": "click", "uid": "button-save" }
{ "action": "fill", "uid": "input-title", "text": "My Page" }
{ "action": "reload" }
{ "action": "evaluate", "expression": "document.title" }
```

## fcode_canvas_read

**Auto-approved.** Inspects the current canvas state without changing it.
Actions: `snapshot`, `console`, `screenshot`.

```json
{ "action": "snapshot" }
{ "action": "console", "limit": 50 }
{ "action": "screenshot" }
```

`snapshot` returns the flattened AX (accessibility) tree plus the current URL
and title. Use it to verify what is rendered before making changes with
`fcode_canvas`.

## Typical sequences

**Check what's on the page, then click:**
```
fcode_canvas_read { action: "snapshot" }   → read AX tree, find uid
fcode_canvas { action: "click", uid }      → click the element
fcode_canvas_read { action: "snapshot" }   → verify result
```

**Run migrate then reload canvas:**
```
fcode_bench_run { command: "migrate" }
fcode_canvas { action: "reload" }
```

**Read a list of records:**
```
fcode_bench_execute_read {
  method: "frappe.client.get_list",
  kwargs: { doctype: "Builder Page", fields: ["name", "route", "is_standard"], limit: 20 }
}
```
