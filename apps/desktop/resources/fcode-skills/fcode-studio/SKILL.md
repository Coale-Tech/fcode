---
name: fcode-studio
description: "Frappe Studio: driving pages with agents (files + fcode_studio publish/export), exported-app layout, watch-studio sync, build-studio-app, and deletion caveat."
---

# Frappe Studio

Studio is a visual frappe-ui app builder. Pages are assembled visually and
exported to a Frappe app's source tree. The Fcode Build tab shows the Studio
canvas at `http://localhost:<port>/studio`.

## Exported-app folder layout

```
apps/<frappe_app>/studio/<studio_app>/
  <scrubbed_studio_app>.json # Studio App record (name lowercased, `-` → `_`)
  studio_page/
    <scrubbed_page_title>/
      <scrubbed_page_title>.json # Studio Page record
      <scrubbed_page_title>.ts   # Page script (TypeScript, hot-reloaded by Vite)
  studio_components/
    <component_name>.json    # Custom component record
```

Source: `studio/studio/sync.py`, `sync_json.py` (`PAGE_FOLDER = "studio_page"`),
`export.py`. The watcher tracks every installed app's `apps/<app>/studio/` folder.

## Live sync: watch-studio

`bench --site <site> watch-studio` (registered as a Studio command in
`studio/studio/commands/__init__.py:30-42`) watches all `studio/` source
folders for `.json` changes and imports them into the site DB automatically.

The Fcode Build tab starts watch-studio when Studio is selected. **Page scripts
(`.ts`) are hot-reloaded by Vite and do not need a sync step.**

## Building for production

```bash
bench --site <site> build-studio-app <studio_app>
```

The argument is the **Studio App name** (`frappe.get_doc("Studio App", name)`),
not the Frappe app. Use `fcode_bench_run` with `command: "build-studio-app"` and
`args: ["<studio_app>"]`. A failed build exits non-zero; the detail is in the Error
Log named in the output.

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

## Driving Studio (build and edit pages)

Studio's editor loads a page from `draft_blocks`, falling back to `blocks`
(`studioStore.ts`). Publishing copies `draft_blocks` into `blocks` and clears it.
The page tree is a JSON array holding one root block.

**Standard workflow — always through files, so the open editor live-updates:**

1. Find the app and page:
   ```
   fcode_bench_execute_read { method: "frappe.client.get_list",
     kwargs: { doctype: "Studio App", fields: ["name", "is_standard", "frappe_app"] } }
   fcode_bench_execute_read { method: "frappe.client.get_list",
     kwargs: { doctype: "Studio Page", filters: { studio_app: "<app>" },
               fields: ["name", "page_title", "route", "published", "is_standard"] } }
   ```
2. If the app is not exported (`is_standard` = 0) there are no files: ask before
   calling `fcode_studio { action: "enable_export", app, target_app }`, which
   moves the app's source of truth into `apps/<target_app>/studio/`.
3. Read the page JSON file, edit it, save it. **Edit `draft_blocks` when the file
   has a non-empty one, otherwise `blocks`** — the editor shows `draft_blocks` first,
   so an edit to `blocks` under a live draft is invisible.
4. `watch-studio` imports the file (`[watch-studio] synced Studio Page from <file>`)
   and Studio pushes a realtime event, so an open editor rebuilds that page with no
   reload and no migrate. This needs the realtime preconditions below; without them
   the DB still updates and a reload shows the edit.
5. Verify with `fcode_canvas_read { action: "screenshot" }`.

A block is `{ componentId, componentName, originalElement?, blockName?,
componentProps, baseStyles, mobileStyles, tabletStyles, componentSlots,
componentEvents, visibilityCondition, children[] }`. Keep every existing
`componentId`; new blocks need unique ones. Read one existing page first and mimic
its shape. Custom-component and data-source (`resources`) rows live in the same
page/component JSON files.

If the page is open in the editor, the synced file replaces the canvas (unsaved
canvas edits are lost, `useLiveEditor.ts`) — tell the user before editing a page
they may be mid-edit on.

### `fcode_studio` (always prompts)

| action | args | effect |
|---|---|---|
| `publish_page` / `unpublish_page` | `page` | `draft_blocks` → `blocks`; set/clear `published` |
| `revert_page` | `page` | drop `draft_blocks`, back to the published version |
| `publish_app` / `unpublish_app` | `app` | every page, then rebuilds the app bundle |
| `enable_export` | `app`, `target_app` | export the app into a Frappe app's `studio/` folder |
| `disable_export` | `app` | move scripts back into the DB |

Only these seven actions exist; reads use `fcode_bench_execute_read`, edits use files.

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
- Dev editor: `yarn dev` in `apps/studio/frontend` serves Vite on
  `8080 + (webserver_port - 8000)` (8114 for webserver_port 8034), not on the bench
  port; `/studio` on the bench port 404s until `yarn build` has produced
  `studio/www/studio.html`.
- Live editor refresh: the socket.io service must run and the browser host must
  equal the site name (the dev client joins namespace `/<hostname>`). A site named
  `coale` browsed as `localhost` gets "Invalid namespace"; use a site named
  `<x>.localhost` and browse `http://<x>.localhost:<vite port>`.
