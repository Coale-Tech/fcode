---
name: fcode-builder
description: "Frappe Builder: DB-first page storage, is_standard + app + developer_mode preconditions, builder_files layout, and file-to-DB sync."
---

# Frappe Builder

Builder is a low-code website builder for public pages served through Frappe's
website layer (`website_path_resolver`). It is separate from Studio: Builder
produces public web pages; Studio produces in-product frappe-ui app pages.

The Fcode Build tab shows the Builder canvas at
`http://localhost:<port>/<builder_path>` where `builder_path` comes from
`sites/common_site_config.json` (default `"builder"`).

## Storage model: DB first

Builder pages live **primarily in the database**. Files under `builder_files/`
are only generated when:

- `developer_mode` is on in `sites/<site>/site_config.json`, **and**
- the page has both `is_standard: 1` and `app` set.

A page that lacks either flag exists only in the DB; file edits are not
possible for it.

## builder_files layout

```
apps/<app>/<app>/
  builder_files/
    pages/
      <page_name>.json         # Builder Page record
    components/
      <component_name>.json    # Builder Component record
    client_scripts/
      <script_name>.json       # Builder Client Script record
    fonts/
    variables/
```

Source: `builder/builder/export_import_standard_page.py:92-97`
(`frappe.get_app_path(app)` is the root).

## File → DB sync

Files are synced into the DB only during:

- `bench --site <site> migrate` (via `builder/hooks.py:73` →
  `builder/install.py:19-30` → `sync_standard_builder_pages()`).
- `builder.export_import_standard_page.sync_standard_builder_pages` called
  explicitly.

**Editing a file and reloading the canvas without syncing shows stale content.**

To sync after a file edit:

```json
{
  "method": "builder.export_import_standard_page.sync_standard_builder_pages"
}
```

Call via `fcode_bench_execute` (prompts). The Build tab "Sync files → site"
button does the same.

Alternatively, run migrate:
```json
{ "command": "migrate" }
```
Via `fcode_bench_run`.

## DB → file export

Files are written back from the DB automatically when a standard page is saved
in the Builder UI (if `developer_mode` is on and `is_standard + app` are set).

To export everything manually:
```json
{ "method": "builder.export_import_standard_page.sync_standard_builder_pages" }
```

## Checking current state of a page

```
fcode_bench_execute_read {
  method: "frappe.client.get",
  kwargs: { doctype: "Builder Page", name: "<page_name>" }
}
```

```
fcode_canvas_read { action: "snapshot" }
```

Use `fcode_canvas { action: "navigate", url: "http://localhost:<port>/<route>" }`
to open the live page in the Build tab canvas.

## Deleting a page

```json
{
  "method": "frappe.client.delete",
  "kwargs": { "doctype": "Builder Page", "name": "<page_name>" }
}
```

Via `fcode_bench_execute`. Then remove the corresponding JSON from
`builder_files/pages/` if it exists, so the file and DB stay in sync.
