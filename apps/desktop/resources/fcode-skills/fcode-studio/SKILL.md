---
name: fcode-studio
description: "Frappe Studio: exported-app folder layout, watch-studio sync, build-studio-app, and deletion caveat."
---

# Frappe Studio

Studio is a visual frappe-ui app builder. Pages are assembled visually and
exported to a Frappe app's source tree. The Fcode Build tab shows the Studio
canvas at `http://localhost:<port>/studio`.

## Exported-app folder layout

```
apps/<frappe_app>/studio/<studio_app>/
  <studio_app>.json          # Studio App record
  studio_page/
    <page_name>/
      <page_name>.json       # Studio Page record
      <page_name>.ts         # Page script (TypeScript, hot-reloaded by Vite)
  studio_components/
    <component_name>.json    # Custom component record
```

Source: `studio/studio/sync_json.py` (`PAGE_FOLDER = "studio_page"`),
`studio/studio/export.py`. The watcher tracks every installed app's
`apps/<app>/studio/` folder.

## Live sync: watch-studio

`bench --site <site> watch-studio` (registered as a Studio command in
`studio/studio/commands/__init__.py:30-42`) watches all `studio/` source
folders for `.json` changes and imports them into the site DB automatically.

The Fcode Build tab starts watch-studio when Studio is selected. **Page scripts
(`.ts`) are hot-reloaded by Vite and do not need a sync step.**

## Building for production

```bash
bench --site <site> build-studio-app <frappe_app>
```

This compiles the frappe-ui bundle for the exported app and places the output
in the app's `public/` directory. Use `fcode_bench_run` with
`command: "build-studio-app"` and `args: ["<frappe_app>"]`.

## Deletion caveat

Deletions of Studio Pages and Studio Components are **not synced** by
watch-studio or migrate. To delete a record:

1. Delete the JSON file from the `studio_page/` folder (agent uses `write` to
   remove it, or you edit the file to empty and then `trash` via the FS).
2. Delete the DB record explicitly:

```json
{
  "method": "frappe.client.delete",
  "kwargs": { "doctype": "Studio Page", "name": "<page_name>" }
}
```

Call this via `fcode_bench_execute` (prompts, since it mutates).

## Checking page render

```
fcode_canvas_read { action: "snapshot" }
fcode_canvas { action: "navigate", url: "http://localhost:8000/studio/<app_path>" }
fcode_canvas_read { action: "screenshot" }
```

## Prerequisites for watch-studio

- `developer_mode: 1` in `sites/<site>/site_config.json`.
- `watchdog` Python package installed: `bench setup requirements --dev studio`.
- The Fcode Build tab shows the exit output as a preconditions checklist if
  either is missing.
