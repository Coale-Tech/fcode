# Desk UI/UX Interaction Patterns (v16, source-verified)

How Frappe **Desk** UI actually behaves when a user interacts with it — child
tables (grids), report datatables, list views, forms, dialogs, and keyboard.
Use this to build custom Desk UI that matches native behavior, and to know what
events/APIs to hook. Scope: **Desk** (jQuery + `frappe.ui.*`). For Vue SPA
apps see [frappe-ui-components.md](../../frappe-frontend-development/references/frappe-ui-components.md); for tokens/styling see
[espresso-design-system.md](../../frappe-design-tokens/references/espresso-design-system.md).

> Terminology: a "table" inside a form is the **child-table Grid**
> (`frappe.ui.form.Grid`). A "table" in a Report/List datatable is the
> **`frappe.DataTable`** (frappe-datatable). They are different widgets with
> different interaction models — both covered below.

---

## 1. Child-table Grid — "clicking inside a table"

Source: `apps/frappe/frappe/public/js/frappe/form/grid.js`, `grid_row.js`,
`grid_row_form.js`, `grid_pagination.js`.

### Anatomy
- A grid = a header row + N data rows, each row an instance of `GridRow`.
- Each cell (`make_column`, `grid_row.js:981`) holds two layers:
  - `.static-area` — read-only ellipsized display of the value (default view).
  - `.field-area` — a real form control, shown only while the row/cell is being
    edited (`toggle(false)` by default, `grid_row.js:1141-1142`).
- The grid is inline-editable only when the DocType meta flag
  **`editable_grid`** is set (checked by `allow_on_grid_editing()`,
  `grid.js:61`) AND `is_editable()` (`display_status == "Write" && !static_rows`,
  `grid.js:1419`) is true. When not editable, cells stay static and editing
  happens in the expanded row form (§1.3).

### 1.1 Click a cell → inline edit
A `focusin` handler on each cell (`grid_row.js:1082`) calls `toggle_editable_row()`
(`grid_row.js:1174`), which swaps `.static-area` for `.field-area`, then focuses
the first input (`trigger_focus`, `grid_row.js:1065`). Specifics:
- **Link / Dynamic Link / Autocomplete** cells open an absolutely-positioned
  dropdown sized to the column, min 250px (`grid_row.js:1105-1107`), so
  the awesomplete list isn't clipped by the row.
- **Touch** (`event.pointerType == "touch"`, `grid_row.js:1130`) focuses the
  input and, for `Date`, opens the date picker explicitly (layout-shift avoidance).
- Only one row edits at a time: `frappe.ui.form.editable_row` tracks it; opening
  another toggles the previous off (`grid_row.js:1185-1198`).

### 1.2 Keyboard navigation inside an editing cell
`set_arrow_keys` (`grid_row.js:1293`) binds `keydown` on each cell input. Only
`TAB / UP / DOWN / ESCAPE` are intercepted; everything else types normally.

| Key | Behavior |
|---|---|
| **Tab** | Next cell. On the **last input of the last row** → auto-adds a new row (100 ms) and focuses it. Last column of a non-last row → drops to next row. (`grid_row.js:1343`) |
| **Shift+Tab** | Previous cell; at the first column → opens the previous row for editing. (`grid_row.js:1378`) |
| **↑ / ↓** | Move to same field in prev/next row. Skipped for multi-line fieldtypes (`Text, Small Text, Code, Text Editor, HTML Editor`) unless **Alt** is held — so arrows move the caret in text areas. (`grid_row.js:1319,1364,1371`) |
| **Esc** | If the row is untouched (`__unedited`) it is removed; otherwise closes edit. (`grid_row.js:1335`) |
| **Ctrl/Cmd + ↓** | Add a new row below / at end and focus it (`add_new_row_using_keys`, called `grid_row.js:1309`, defined `grid_row.js:1403`). |
| **Ctrl/Cmd + Shift + ↓** | Add row at the **end**; **Ctrl+Shift+↑** adds at the **start**. |
| **Shift + Alt + ↓** | Duplicate the current row (`duplicate_row_using_keys`, called `grid_row.js:1313`, defined `grid_row.js:1395`). |

Tabbing into an **empty** grid: focusing the header's first cell
(`tabIndex=0`, `grid_row.js:1156`) auto-creates the first row and focuses it
(`grid.js` `add_new_row`, `grid_row.js:1159`).

### 1.3 Expand a row → full row detail form
Clicking the row number / the **edit (pencil)** open-form button
(`add_open_form_button`, `grid_row.js:330`; Enter also triggers) calls
`toggle_view()` (`grid_row.js:1438`), which renders `GridRowForm`
(`grid_row_form.js`) — every field of the row laid out as a normal form, used
for rows with more fields than fit as columns. Only one detail form is open at a
time. Navigate between open rows with **Ctrl+↓ / Ctrl+↑**, wired in
`keyboard.js:254-274` to `has_next()`/`open_next()` and `has_prev()`/`open_prev()`
(`grid_row.js:1539-1553`). **Esc** closes it (`close_grid_and_dialog`,
`keyboard.js:331`, invoked from `handle_escape_key`, `keyboard.js:325`).

### 1.4 Adding, reordering, deleting rows
- **Add Row** button and **Add Multiple** (paste/insert N) — `add_new_row`
  (`grid.js:1026`); disabled when `df.cannot_add_rows` or `grid.cannot_add_rows`.
- **Drag to reorder**: `Sortable` on the rows container (`make_sortable`,
  `grid.js:753`), active only while editable; updates `idx`. Force
  reorder-only mode with `grid.only_sortable()` (`grid.js:1427`).
- **Move to position**: the row menu exposes a "Move to Row Number" action
  writing a target `idx` (`grid_row.js:160`).
- **Bulk delete**: per-row checkboxes (`toggle_checkboxes`, `grid.js:974`) +
  a "Delete" action in `.grid-bulk-actions`.

### 1.5 Bulk edit / paste from spreadsheet
When a child docfield has **`allow_bulk_edit`** (`setup_allow_bulk_edit`,
`grid.js:1459`), the grid gains **Download** (CSV template) / **Upload** so
users edit many rows in a spreadsheet and paste back — the idiomatic pattern for
large child tables.

### 1.6 Configure columns (per-user)
The column-settings (gear) button (`add_column_configure_button`,
`grid_row.js:373`) opens a dialog to choose which fields show as in-line columns
and their widths — persisted per user. `configure_columns: true` is the default
(`grid.js:456`).

### 1.7 Controlling a grid from a client script / controller
Access via `frm.fields_dict[<tablefield>].grid`. Verified public methods
(`grid.js`):

```js
const grid = frm.fields_dict.items.grid;
grid.update_docfield_property("rate", "read_only", 1);   // grid.js:1609
grid.toggle_reqd("qty", true);                            // 959
grid.toggle_enable("rate", false);                        // 964
grid.toggle_display("discount", false);                   // 969
grid.set_column_disp("batch_no", true);                   // 872
grid.get_field("warehouse");                              // 1002 -> docfield
grid.add_custom_button(__("Fetch"), () => {}, "bottom");  // 1588
grid.clear_custom_buttons();                              // 1604
grid.refresh();                                           // 496
// prevent adding rows:
frm.set_df_property("items", "cannot_add_rows", true);
```

Per-row: `frappe.ui.form.on(child_dt, fieldname, fn)` fires on grid-cell edits;
`frm.fields_dict.items.grid.grid_rows[i]` gives a `GridRow`.

### 1.8 Styling (Espresso)
Grids inherit Espresso tokens ([espresso-design-system.md](../../frappe-design-tokens/references/espresso-design-system.md)): row height, borders
(`--border-color`/`--outline-gray-2`), and the `.editable-row` class toggled on
editable rows (`grid_row.js:1189`, inside `toggle_editable_row`). Keep custom
grid CSS on Espresso variables, not hardcoded colors.

---

## 2. Report view — the DataTable

Source: `apps/frappe/frappe/public/js/frappe/ui/datatable.js` (`frappe.DataTable
= DataTable`, line 3), `views/report/report_view.js`. Report View renders the
**frappe-datatable** widget (a spreadsheet-like grid, distinct from the form
grid):
- **Click a cell** selects it; drag/Shift+click selects ranges; copy/paste works
  across cells.
- **Column** sort (click header), resize (drag border), reorder (drag header).
- **Inline edit** when the report is editable — the cell becomes an input;
  Enter/arrow keys move the active cell (spreadsheet-style).
- Checkbox column for row selection → bulk actions (see §3).
Build custom datatables with `new frappe.DataTable(el, { columns, data, ... })`.

---

## 3. List view interactions

Source: `list/list_view.js`, `list/bulk_operations.js`,
`model/indicator.js`. See also [listview-patterns.md](listview-patterns.md).
- **Row select** (checkboxes) reveals the bulk-action bar. Verified bulk ops
  (`bulk_operations.js`): `print`, `delete`, `assign` / assignment-rule apply,
  `submit`/`cancel`, `edit` (bulk field edit via
  `bulk_update.submit_cancel_or_update_docs`), `add_tags`, `export`.
- **Filters** (standard + saved), **sort** selector, **group by**, **page
  length** (load more / count), **sidebar** facets.
- **Status indicator** dot per row via `frappe.listview_settings[dt].get_indicator`
  (precedence in `model/indicator.js`).
- Inline like/comment/assignment counts per row.

---

## 4. Form interactions

Source: `form/form.js`, `form/layout.js`, `form/sidebar/`, `form/toolbar.js`.
- **Sections** collapse/expand (`collapsible`); **Tabs** across sections.
- **Dirty state**: editing sets `frm.doc.__unsaved`; the Save button and a
  "Not Saved" indicator appear; navigating away warns.
- **Docstatus** drives available actions: Draft (0) → Submit; Submitted (1) →
  Cancel / Amend; only `on_update_after_submit` fields stay editable.
- **Primary action** (Save/Submit) fires on **Ctrl+S** (§5).
- **Sidebar**: assignments (ToDo), tags, shares, likes, followers, attachments.
- **Dashboard/Connections**: linked-document counts + quick "＋" create.
- **Timeline**: comments, emails, edits, versions.
- **Quick Entry**: `frappe.ui.form.make_quick_entry` opens a minimal Dialog
  (mandatory fields only) for fast creation from Link fields / New.
- Field-level events: `frappe.ui.form.on(dt, fieldname, fn)`; row/grid events as
  in §1.7.

---

## 5. Global keyboard shortcuts

Source: `apps/frappe/frappe/public/js/frappe/ui/keyboard.js`,
`apps/frappe/frappe/public/js/frappe/ui/alt_keyboard_shortcuts.js`.

| Shortcut | Action |
|---|---|
| **Ctrl/Cmd + S** | Trigger primary action (Save/Submit); blurs active input first (`keyboard.js:202-212`) |
| **Ctrl/Cmd + K** | Open Awesomebar via `frappe.search.open_awesomebar_from_global_search_shortcut` (`keyboard.js:214-221`) |
| **Ctrl/Cmd + G** | Open the Global Search dialog via `frappe.search.open_global_search_from_navbar_shortcut` (`keyboard.js:223-230`) — a **different** action from Ctrl+K, not an alias for it |
| **Shift + /** (`?`) | Show the keyboard-shortcuts dialog (`keyboard.js:232-238`) |
| **Esc** | Close open grid row, else cancel current dialog, else blur (`handle_escape_key`/`close_grid_and_dialog`, `keyboard.js:240-246,325-329,331-345`) |
| **Enter** | Confirm the primary button of an open confirm-dialog (`keyboard.js:248-252`) |
| **Ctrl/Cmd + ↓ / ↑** | In an open grid-row detail: go to next / previous row (`keyboard.js:254-274`) |
| **Shift + Ctrl/Cmd + R** | Clear cache and reload (`keyboard.js:276-282`) |
| **Shift + T** (v16) | Open the System Console dropdown, if the user has write access to System Console (`keyboard.js:347-362`) |

**Removed in v16** (present in Frappe 15's `keyboard.js`, gone from 16 — no
replacement shortcut): fixed **Ctrl+H** ("Navigate Home"), fixed **Alt+S**
("Open Settings", used to click `.dropdown-navbar-user button`), and fixed
**Alt+H** ("Open Help", used to click `.dropdown-help button`). v15's Ctrl+G
opened the Awesomebar directly (`$("#navbar-search").focus()`); v16 repurposed
Ctrl+G for Global Search and moved the Awesomebar shortcut to Ctrl+K.

**Alt-key mnemonics are dynamic, not a fixed table.** `alt_keyboard_shortcuts.js`
installs a generic per-page mechanism (`frappe.ui.keys.AltShortcutGroup`,
`:95-169`): holding **Alt** underlines the first still-unclaimed letter of every
visible page-menu / actions-button / dropdown-item label registered via
`frappe.ui.keys.get_shortcut_group(page).add($target, $text_el)` (callers
include `ui/page.js:181,186,298,508` and `form/sidebar/form_sidebar.js:51`),
then pressing that letter clicks the element. Which letter maps to "Settings"
or "Help" depends on what else is on screen — there is no hardcoded
`alt+s`/`alt+h` binding in v16.

Register your own fixed shortcut: `frappe.ui.keys.add_shortcut({ shortcut,
action, description, ignore_inputs, page })` (`keyboard.js:32-82`), or
`frappe.ui.keys.on("ctrl+e", fn)` (`:186-191`). `frappe.ui.keyCode` exposes
named codes (`:313-323`).

---

## 6. Conventions when building custom Desk UI

- Reuse `frappe.ui.Dialog` + `FieldGroup` for input; don't hand-roll forms
  ([frappe-ui-components.md](../../frappe-frontend-development/references/frappe-ui-components.md)).
- Feedback: `frappe.show_alert()` / `frappe.msgprint()` / `frappe.throw()` for
  errors, `frappe.confirm()` before destructive actions.
- Empty/loading states and status indicators should match native (Espresso
  tokens, `frappe.get_indicator`).
- Respect docstatus + permissions in the UI (`frm.doc.docstatus`,
  `frappe.model.can_write`) — but never rely on UI gating for security
  ([authentication.md](../../frappe-api-development/references/authentication.md)).

---

## Sources
- `apps/frappe/frappe/public/js/frappe/form/grid.js` (allow_on_grid_editing:61, make_sortable/Sortable:752-753, set_column_disp:872, toggle_reqd:959, toggle_enable:964, toggle_display:969, toggle_checkboxes:974, get_field:1002, add_new_row:1026, is_editable:1419, only_sortable:1427, set_multiple_add:1434, setup_allow_bulk_edit:1459, add_custom_button:1588, clear_custom_buttons:1604, update_docfield_property:1609, configure_columns default:456, refresh:496)
- `apps/frappe/frappe/public/js/frappe/form/grid_row.js` (Move action:160, add_open_form_button:330, add_column_configure_button:373, make_column:981, trigger_focus:1065, focusin/click-to-edit:1082, empty-grid header tabIndex:1156, toggle_editable_row:1174, editable_row tracking:1185-1198, set_arrow_keys:1293, Tab:1343, Shift+Tab:1378, duplicate_row_using_keys:1395, add_new_row_using_keys:1403, toggle_view:1438, has_prev/open_prev:1539-1545, has_next/open_next:1546-1553)
- `apps/frappe/frappe/public/js/frappe/form/grid_row_form.js` (GridRowForm expanded detail)
- `apps/frappe/frappe/public/js/frappe/ui/keyboard.js` (global shortcuts, keyCode map; diffed against the Frappe 15 baseline tree's `keyboard.js:187-241`)
- `apps/frappe/frappe/public/js/frappe/ui/alt_keyboard_shortcuts.js` (AltShortcutGroup:95-169, get_shortcut_group callers)
- `apps/frappe/frappe/public/js/frappe/ui/datatable.js` (`frappe.DataTable`, line 3)
- `apps/frappe/frappe/public/js/frappe/list/bulk_operations.js` (print:7, delete:195, assign:237, apply_assignment_rule:276, edit/submit_cancel_or_update_docs:292,322, add_tags:460, export:498)
- `apps/frappe/frappe/public/js/frappe/model/indicator.js` (frappe.has_indicator:3, frappe.get_indicator precedence:26-124)
