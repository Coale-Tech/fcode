# Learned Patterns

Patterns discovered during real Frappe development and debugging. Entries are
captured automatically at breakpoints (after debugging, implementation, or
exploration) and promoted to main reference files once validated.

**Format**: Each entry needs Discovered date, Confidence (low/medium/high),
Uses counter, and Evidence. See SKILL.md "Self-Enhancement Protocol" for
capture rules, promotion triggers, and pruning criteria.

See [learned-patterns-ops.md](learned-patterns-ops.md) for Build/Deployment,
Permissions, and Caching/Asset patterns.

---

## Debugging Patterns

### [Debugging] DocType directory must match frappe.scrub(DocType name)
- **Discovered**: 2026-05-03
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: `bench --site <site> install-app my_chat` failed with `No module named 'my_chat.my_chat.doctype.m_pesa_payout'` — the directory was named `mpesa_payout/` but Frappe expected `m_pesa_payout/`
- **Pattern**: Frappe derives the module path from the DocType name via `frappe.scrub()`, which converts ALL non-alphanumeric characters (including hyphens) to underscores. So DocType "M-Pesa Payout" → directory `m_pesa_payout/`, NOT `mpesa_payout/`. The JSON filename inside the directory must also match. Root cause: hyphens in DocType names silently break directory conventions.
- **Evidence**: `frappe/modules/utils.py:308` — `load_doctype_module()` raises `ImportError` when the directory doesn't match `frappe.scrub(doctype_name)`

## API & ORM Patterns

### [API] Guard singleton settings access before migration
- **Discovered**: 2026-04-03
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: Auditing the payroll app's engine/hooks.py — `frappe.get_cached_doc("Settings DocType")` in a doc_event hook crashes if called before the DocType is synced via bench migrate
- **Pattern**: Always add `if not frappe.db.exists("DocType Name"): return` before `frappe.get_cached_doc()` on singleton settings in hooks that run on external DocTypes (e.g., doc_events on Salary Slip)
- **Evidence**: `engine/hooks.py:14` — `on_salary_slip_validate` would crash during app install if Salary Slip is validated before the payroll app's DocTypes are synced

### [API] Guard cached doc lookups for components that may not exist
- **Discovered**: 2026-04-03
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: Auditing the payroll app's engine/hooks.py — `frappe.get_cached_doc("Salary Component", name)` crashes if component not created yet
- **Pattern**: Before `frappe.get_cached_doc(DocType, name)` for a dynamically-referenced record, check `frappe.db.exists()` first. Log error and return gracefully instead of crashing the parent document's save
- **Evidence**: `engine/hooks.py:58` — appending missing salary component to Salary Slip deductions would crash if setup hadn't run

### [API] Disabled country should return silently, not throw
- **Discovered**: 2026-04-03
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: The payroll app's doc_event hook was throwing `frappe.throw()` when a country was disabled — this blocks ALL salary slip saves for that country's employees
- **Pattern**: In doc_event hooks, use silent `return` for non-critical configuration issues (disabled country, missing calculator). Reserve `frappe.throw()` for data integrity violations. A disabled country means "skip processing", not "block the document"
- **Evidence**: `engine/hooks.py:22-25` — throwing on disabled country prevented HR from saving any salary slips for employees in that country, even if they wanted to process manually

### [API] Data fields raise on overflow — they never truncate
- **Discovered**: 2026-08-18
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: `myapp` built `App Action.title` (a `Data` field) verbatim from an agent finding message. One 264-invoice IRN message ran 168 chars and `CharacterLengthExceededError` aborted the whole `reconcile_actions` loop — no actions were created for *any* bucket that run.
- **Pattern**: `Document.db_insert`/`save` raise `frappe.exceptions.CharacterLengthExceededError` when a `Data` value exceeds its length; Frappe does **not** silently clip. A `Data` field with no explicit `length` caps at **140** (`frappe.model.meta.DEFAULT_VARCHAR_LEN` / `varchar(140)`), not 255. Any field fed machine-generated prose needs a bounded formatter at the *source* (clip on a sentence boundary, else hard-clip with an ellipsis) or the fieldtype changed to `Small Text`. Renaming the fieldname to widen it is a schema migration, not a fix.
- **Evidence**: `frappe/utils/messages.py:59` `_raise_exception` → `frappe/model/base_document.py` length validation; observed live as `App Action APP-A-00043: <strong>Action</strong> (264 sales invoices…) will get truncated, as max characters allowed is 140`
- **Corrected (v16.35)**: the constant is `Database.VARCHAR_LEN = 140` in `frappe/database/database.py:91`, not `frappe.model.meta.DEFAULT_VARCHAR_LEN` (no such name exists anywhere in the v16.35.0 source). The 140-char default and the `CharacterLengthExceededError` behavior are otherwise accurate.

### [API] `lines` is a MariaDB reserved word — never use it as a SQL alias
- **Discovered**: 2026-08-18
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: A purchase-invoice scan used `SELECT COUNT(*) AS lines, ...` and died with a bare `Syntax error in query`. `safe_run` caught it, so the agent returned `status: unknown` with an empty findings list — a silent no-op that looked like clean data.
- **Pattern**: MariaDB 10.6+ reserves `LINES` (from `LOAD DATA ... LINES TERMINATED BY`). It is legal as a column name but **not** as a bare `AS` alias in a select list. Same trap: `rows`, `groups`, `rank`, `system`. Prefer an explicit prefix (`total_lines`, `po_lines`). Because agents wrap scans in a `safe_run`-style guard, a reserved-word slip degrades to an empty result rather than a crash — assert on expected non-empty metrics in verification, never just on "no exception".
- **Evidence**: `mariadb.com/kb/en/reserved-words/` lists `LINES` reserved since 10.6; observed as `Syntax error in query: SELECT COUNT(*) AS lines, COALESCE(SUM(...)) AS no_po FROM tabPurchase Invoice Item`

### [API] Select fields hard-throw on any value outside `options`
- **Discovered**: 2026-08-18
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: `myapp`'s fallback report writer set `health_status = "unknown"` on a Select whose `options` were only `green\namber\nred`. Every other layer already spoke `unknown` — the API defaulted reads to it, the Desk JS had a `STATUS_COLOR.unknown` and a "no data" legend segment — so the gap was invisible until the fallback path actually ran, which by construction only happens when the pipeline is *already* broken.
- **Pattern**: `_validate_selects` calls `frappe.throw` for any non-empty value not in `options`; there is no coercion and no warning. So a Select is a closed enum shared by the schema, the controller, the API and the client, and adding a state to any one of them without the JSON is a latent `ValidationError`. Grep the fieldname across all four layers when introducing a state. Empty string is always allowed (the check short-circuits on falsy), which is why a leading `\n` in `options` is the idiom for "optional". Listing the neutral state **first** makes it the form default — correct for a "not yet computed" state. Test the enum against the schema (`frappe.get_meta(dt).get_field(f).options.split("\n")`) rather than restating the literals, so the test fails when the JSON drifts.
- **Evidence**: `frappe/model/base_document.py:1101-1129` `_validate_selects()` — `frappe.throw(_('{0} {1} cannot be "{2}". It should be one of "{3}"'))`; skipped only under `frappe.flags.in_import`. Reproduced: `health_status='unknown'` → `ValidationError`, `health_status='amber'` → inserted.

### [API] A stale `required_apps` entry makes another app permanently un-uninstallable
- **Discovered**: 2026-08-18
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: `bench --site <site> uninstall-app dependency_app` printed `App dependency_app is a dependency of my_app. Uninstall my_app first.` and **exited 0**. `my_app` listed `dependency_app` in `required_apps` but imported none of its code — it only mirrored its conventions (severity ladder, client shape). The declaration was aspirational and had become a hard lock on the other app.
- **Pattern**: `remove_app` walks every installed app and refuses if any declares the target in `required_apps`; the refusal is a `click.secho` + bare `return`, so it is a **silent no-op with a success exit code** — CI and scripts see nothing wrong. `force=True` does *not* help: it only guards the earlier "not installed" test, never the dependency check. `required_apps` is a real uninstall lock, so it must list only apps whose code you actually import. Grep before declaring (`grep -rn "<app>" --include=*.py --include=*.json`); a convention you copied is not a dependency.
- **Evidence**: `frappe/installer.py:421-425` (`is_required_by` → `click.secho(...); return`), with `force` checked separately at `:416-420`; `parse_required_app_name` at `:270`.

### [API] `before_uninstall` cleanup that can hit foreign references belongs in `after_uninstall`
- **Discovered**: 2026-08-18
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: `app_a.before_uninstall` hard-deleted the `CFO` role it created on install. But `CFO` had become shared infrastructure — `app_b` carried CFO DocPerms on two of its own DocTypes plus a CFO grant on its `weekly-report` Desk page. The delete raised, aborting the whole uninstall *after* the backup had already been taken.
- **Pattern**: `Role` declares a `disabled` field and has **no `on_trash`**, so its `Has Role` grants survive into the link check and `delete_doc` rewrites `LinkExistsError` into the misleading `"You can disable this Role instead of deleting it."` — a message that names no app and looks like a permissions problem. Any `before_uninstall` step touching a shared entity (roles, custom fields, workflows) runs *before* the app's own doctypes/pages/reports are deleted, so its references are still present and indistinguishable from foreign ones. Defer such cleanup to `after_uninstall`, where the app's own records are already gone, and gate the delete on `check_if_doc_is_linked` (which only raises, never mutates — safe to probe with). Own the entities your permissions depend on in your *own* `after_install`/`after_migrate` rather than inheriting them from a sibling app.
- **Evidence**: `frappe/model/delete_doc.py:170-181` (the `enabled`/`disabled` field rewrite); `frappe/installer.py:445-446` runs `before_uninstall` after the backup at `:437-441`, while `after_uninstall` runs at `:462-463` after `_delete_modules`/`_delete_doctypes` at `:453-454`; `frappe/core/doctype/role/role.py` defines no `on_trash`.

### [API] `uninstall-app --dry-run` really mutates, and the real run discards its icon/sidebar cleanup
- **Discovered**: 2026-08-18
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: A `--dry-run` uninstall permanently deleted two `Workflow` documents. The subsequent real uninstall then left orphan `Desktop Icon` and `Workspace Sidebar` rows (`Finance`, `Analytics`) pointing at Workspaces it had just deleted — dead 404 entries in the Desk sidebar.
- **Pattern**: Two inverted guards in the same flow. (1) `before_uninstall` / `after_uninstall` hooks are invoked **unguarded by `dry_run`**, so a dry run executes every side effect an app's hooks perform — treat `--dry-run` as read-only only for doctype/table drops, never for hooks. (2) `delete_desktop_icon_and_sidebar` deletes the rows but its only `frappe.db.commit()` sits behind `if dry_run:`, so in a real uninstall the deletes are never committed and roll back at process exit. Expect to sweep `Desktop Icon` (matched on `name`/`parent_icon` == app title) and `Workspace Sidebar` (matched on `app`) by hand after any real uninstall. Rows created without stamping `app` are missed even by a fixed sweep, so always set `app` when an install hook creates a `Workspace Sidebar`.
- **Evidence**: `frappe/installer.py:445-449` and `:462-466` (no `dry_run` guard); `frappe/utils/install.py:225-232` — `sidebar_to_be_deleted = frappe.get_all("Workspace Sidebar", filters={"app": app_name})` then `if dry_run: frappe.db.commit()`. Verified live: a custom app's `Workspace Sidebar` survived a real uninstall; `bench migrate`'s own orphan sweep also deleted the surviving `Desktop Icon` before `after_migrate` recreated it.

### [API] `frappe.utils.add_seconds` does not exist in v16 — and `set_single_value` on a Datetime wants a string
- **Discovered**: 2026-08-18
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: `from frappe.utils import add_seconds` sat in a token-persistence path that no test ever reached; the module imported fine at edit time and only exploded when the test runner tried to discover it (`TestRunnerError: cannot import name 'add_seconds'`). Any real token save would have raised `ImportError` on the first sign-in.
- **Pattern**: `frappe/utils/data.py` exports `add_to_date`, `add_days`, `add_months`, `add_years` — there is no `add_seconds`/`add_minutes`/`add_hours`. Use `add_to_date(base, seconds=n)`. Two follow-ons: (1) `add_to_date` returns a `datetime` object, but `frappe.db.set_single_value` is typed `str | int | None`, so pass `as_string=True, as_datetime=True` — `as_string=True` alone silently drops the time component (`if as_string: if as_datetime: DATETIME_FORMAT else DATE_FORMAT`); (2) a bad import inside a *function body* is invisible to `py_compile` and to a plain module import, so it survives every check short of actually executing that line. `bench run-tests --module` catches it because discovery imports the module graph — cheapest way to smoke a new module's imports.
- **Evidence**: `frappe/utils/data.py:282-332` (`add_to_date` signature and the `add_days`/`add_months` wrappers; no seconds helper); `:315-319` for the `as_string`/`as_datetime` branch. Verified live: `add_to_date(now_datetime(), seconds=3600, as_string=True, as_datetime=True)` -> `'2026-08-18 20:18:58.764217'` (`str`).

### [API] Microsoft and OpenAI device-code flows have opposite body encodings and undocumented error codes
- **Discovered**: 2026-08-18
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: Porting an existing RFC 8628 device-login card (OpenAI/Codex) to Microsoft Entra for OneDrive. Reusing the working flow's request shape produced `HTTP 400 AADSTS900144: The request body must contain the following parameter: 'client_id'` even though `client_id` was present.
- **Pattern**: Both providers implement RFC 8628, but the wire details are inverted, so a "shared device-login helper" is a trap — keep one module per provider. Microsoft (`login.microsoftonline.com/{tenant}/oauth2/v2.0/devicecode` and `/token`) requires **form encoding** (`data=`); a JSON body yields AADSTS900144 as if the parameter were missing. OpenAI's Codex backend requires **JSON** (`json=`). Two more Microsoft deltas from the published reference: `verification_uri` returns `https://login.microsoft.com/device`, *not* the widely-quoted `microsoft.com/devicelogin`, so always send the operator to the value in the response; and a stale/unknown `device_code` answers `invalid_grant` (AADSTS7000014), *not* the `bad_verification_code` in the spec's error table — treating only the documented code as terminal leaves the card polling forever. A blank tenant must fall back to the literal `common`, or the URL degrades to `//oauth2/v2.0/devicecode` and 404s. Device codes are single-use: clear the cached code on success or the next poll re-exchanges it and gets `invalid_grant`. Refresh responses may omit `refresh_token` — persist the existing one rather than blanking it.
- **Evidence**: Swept live against `login.microsoftonline.com` on 2026-08-18: form body -> HTTP 200 with `user_code`; JSON body -> HTTP 400 `AADSTS900144`; tampered `device_code` -> HTTP 400 `invalid_grant` / `AADSTS7000014`; response `verification_uri` = `https://login.microsoft.com/device`, `verification_uri_complete` absent. Contract pinned in `myapp/tests/test_onedrive_auth.py`.


### [API] `Document.get(key, filters=..., limit=1)` on a child table returns Document rows, not dicts
- **Discovered**: 2026-08-19
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: myapp per-section AI-explain feature — a helper read `doc.get("sections", {"section_key": key}, limit=1)[0]` to fetch one child row, then did `section["headline"]`, which raised `TypeError: 'WeeklyReportSection' object is not subscriptable`.
- **Pattern**: `BaseDocument.get(key, filters=None, limit=None, default=None)` (`frappe/model/base_document.py:327`) filters the child table and returns the matching **Document objects** (child rows loaded via `append()`/ORM hydration are full `Document` instances, not plain dicts) — unlike `frappe.get_all(...)` or a raw SQL `as_dict` row. Document objects support `.get("field")` (inherited dict-like accessor) but NOT `obj["field"]` subscripting. Any helper meant to work on both a live child-table row and a plain dict (e.g. shared between ORM code and a JSON-loaded snapshot) must use `.get(...)` exclusively.
- **Evidence**: `frappe/model/base_document.py:327-345` (`get()` returns `self._filter(self.get_all_children(), filters, limit=limit)` — no dict coercion); reproduced live on frappe 16.27.1, a site: `type(doc.get("sections", {"section_key": "sales"}, limit=1)[0]).__name__` == `'WeeklyReportSection'`, a `Document` subclass.

### [API] Number Card `filters_json` cannot hold relative dates — bareword `Today`/`This Month` is invalid JSON that silently defers the crash to render time
- **Discovered**: 2026-09-05
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: `my_app/setup_dashboard.py` shipped 8 Number Cards (`eTIMS Sales Today`, `...Sales This Month`, `...Purchase Today/This Month`, `...Sales Amount Today/Month`, `...Stock Entries Today`, `eTIMS Failed Today`) with `filters_json` string literals like `'[["Sales Invoice","posting_date","=",Today]]'` — `Today`/`This Month` typed as bare, unquoted words. `frappe.get_doc(doc_data).insert()` succeeded silently for all 8 every migrate (`filters_json` is untyped text, never validated on save); the break only surfaced when something actually rendered the card and called `get_result()`, which crashed with an `orjson.JSONDecodeError` inside `frappe.parse_json()` — both server-side (`bench execute`) and client-side (the Workspace widget's own `JSON.parse(doc.filters_json)` throws identically in the browser, so this is not a probe-script artifact).
- **Pattern**: `filters_json`/`dynamic_filters_json` are NOT interchangeable relative-date mechanisms. `dynamic_filters_json` values are raw JS-expression STRINGS (e.g. `"frappe.defaults.get_user_default(\"Company\")"`) `eval()`'d ONLY client-side by `frappe.dashboard_utils.get_all_filters()` (`dashboard_utils.js:204-249`) — invisible to any server-side caller (`bench execute`, a report, a scheduled job). The correct, server-AND-client-safe way to express "today"/"this month"/etc. in a STATIC `filters_json` literal is Frappe's own `"Timespan"` filter operator: a normal 4-tuple `[doctype, fieldname, "Timespan", "<value>"]` where `<value>` is one of the exact lowercase strings in `frappe.utils.data`'s `TimespanOptions` (`"today"`, `"yesterday"`, `"this week"`, `"this month"`, `"this quarter"`, `"this year"`, `"last N days"`, `"next month"`, etc. — full enum at `data.py:40-52`). `db_query.py:906-908` rewrites ANY filter whose operator lowercases to `"previous"`/`"next"`/`"timespan"` into a concrete `between` range via `get_timespan_date_range(value)` (`data.py:909-1004`) BEFORE the query runs — fully server-side, no eval, no browser required, and it re-resolves fresh on every render instead of freezing at creation time. Real ERPNext ships exactly this pattern, e.g. `erpnext/crm/number_card/new_opportunity_(last_1_month)/*.json`: `"filters_json": '[["Opportunity","creation","Timespan","last month"]]'`. Never hand-write a relative date into `filters_json` as a literal value (bareword or even a pre-computed `nowdate()` string) — always use the `Timespan` operator.
- **Evidence**: `frappe/desk/doctype/number_card/number_card.py:152` `get_result()` -> `frappe.parse_json(filters)` -> `frappe/utils/data.py:2620` `orjson.loads(val)`, reproduced live: calling `get_result()` against `eTIMS Sales Amount Today` raised `orjson.JSONDecodeError` before the fix. `frappe/public/js/frappe/widgets/number_card_widget.js:165-167` (`get_filters()` -> `frappe.dashboard_utils.get_all_filters(this.card_doc)`, which does `JSON.parse(doc.filters_json)` first) confirms the Workspace widget hits the identical parse failure in-browser. `frappe/model/db_query.py:906-908` and `frappe/utils/data.py:909-1004` (`get_timespan_date_range`, `match timespan: case "today"/"this month"`) are the resolvers. After rewriting all 8 `filters_json` strings to the `Timespan` form and re-running `create_number_cards()` live on `vigilante`: all 8 rendered real numbers (`get_result()` returned e.g. `{"eTIMS Sales Today": 3.0, "eTIMS Sales This Month": 3.0, "eTIMS Sales Amount Today": 17208.0, ...}`) with zero new Error Log entries (`eTIMS: number card create failed` count stayed at its pre-existing 8, all from before this fix).

## Frontend Patterns

### [Frontend Patterns] Desk Page `.js` edits need a localStorage purge, not just clear-cache
- **Discovered**: 2026-08-18
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: After editing `page/weekly_report/weekly_report.js`, `bench --site <site> clear-cache` + a hard browser reload still rendered the old string. `getpage` proved the server was already returning the new script (`statutory: True`), so the staleness was entirely client-side.
- **Pattern**: `Page.load_assets` reads the `.js` off disk on every `getpage` (it sets `_dynamic_page = True`, so the server never caches it), but the Desk boot caches the returned page script in **`localStorage`** and reuses it across reloads. Verifying a Desk Page script change in a browser requires `localStorage.clear()` (or a fresh profile) before the reload — `bench --site <site> clear-cache`, `bench build`, and Cmd-Shift-R are all insufficient. Confirm server-side first via `/api/method/frappe.desk.desk_page.getpage?name=<page>` and grep the `script` field, so you know whether you are chasing a build problem or a client-cache problem.
- **Evidence**: `frappe/core/doctype/page/page.py:143-197` `load_assets()` re-reads `page_name + ".js"` per request and sets `self._dynamic_page = True`; browser only picked up the change after `localStorage.clear()`

### [Frontend Patterns] Espresso ink ramps are not monotonic — `--ink-blue-4` is grey and `--ink-gray-6`/`-7` are identical
- **Discovered**: 2026-08-18
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: Fixing 8 WCAG AA text-contrast failures on the weekly report. The instinct "the token is too light, step one number darker" silently produced a *grey* link and a no-op grey change, because two ramps break the pattern the names imply.
- **Pattern**: Measure every candidate token's computed value before swapping it; never reason from the token name's number. Verified live on a v16 Desk page (ratios against white):
  `--ink-gray-5` = `rgb(124,124,124)` = **4.17:1** → fails AA for all body text. `--ink-gray-6` = `--ink-gray-7` = `rgb(82,82,82)` = **7.81:1** — the *same colour*, so there is no passing tier between them; a tertiary text rank has to be carried by size/weight, not colour.
  `--ink-blue-3` = `--blue-600` = `rgb(0,123,224)` = **4.28:1** → fails. `--ink-blue-4` = `rgb(82,82,82)` — **not blue at all**; it is the grey ramp. The lightest blue that clears AA as text is `--blue-700` = `rgb(0,112,204)` = **5.01:1**.
  Status colours: `--amber-600` (3.16:1) and `--green-600` (3.09:1) both fail as text; `--amber-700` (5.05:1) and `--green-800` (5.42:1) pass. `--red-600` (5.36:1) already passes. Those darker values still clear the 3:1 WCAG 1.4.11 non-text floor, so one value can serve small text, a large score, and an 8px dot — no need for a parallel "dot colour" set.
  Resolve tokens at runtime to check: append a probe element, set `style.color = 'var(--token)'`, read `getComputedStyle(probe).color`.
- **Evidence**: live computed values on `/app/weekly-report` (frappe 16.27.1). Generic audit walking every visible text node under `.app-wr` across 5 tabs: 8 failures before, **0 / 679 after**; hover states included (`.app-open:hover` 4.28 → 5.01).

### [Frontend Patterns] Browser geometry checks silently pass on hidden panes, and `getClientRects()[0]` returns a border box
- **Discovered**: 2026-08-18
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: A viewport sweep "confirmed" a table-overflow fix with `overflow: []` and `bleed: 0` at every width. Both numbers were meaningless: the tab pane was `display: none`, so every `getBoundingClientRect()` returned zeros and every comparison trivially passed. Separately, a correctly centred status dot measured 10.5px off on exactly the rows whose label wrapped to two lines.
- **Pattern**: Two distinct traps when verifying layout through a headless browser on a tabbed Desk page:
  1. **Hidden-pane zeros.** `display: none` yields all-zero rects, so *any* "is X inside Y" or "is offset 0" assertion passes. Click the tab, wait, then assert the pane is actually visible (`width > 0`) before trusting a single number. Also scope `querySelector` to the visible pane — with repeated markup (e.g. several `.app-tbl`), a bare `document.querySelector` grabs the first in DOM order, which is usually a hidden one.
  2. **Border box vs line box.** `el.getClientRects()[0]` on a *block* element is its border box, so on a 2-line element it appears to start half a line higher than line 1 and any "aligned to the first line" check reports a false failure. To measure the true first line box, range over the text node: `const r = document.createRange(); r.selectNodeContents(textNode); r.getClientRects()[0]`. That also gives an exact wrap-line count (`getClientRects().length`), which is the honest way to detect a crushed text column.
- **Evidence**: same sweep re-run with the pane visible reported real values (`+376px` page escape at 768px, 8-line wraps in a 120px column) that the hidden-pane run reported as `0`. Range-based measurement returned drift `0` for all 14 rows including both wrapped labels, where the element-rect method reported `-10.5`.

### [Frontend Patterns] frappe-ui 0.1.142 already ships AxisChart/DonutChart/FunnelChart/NumberChart/ListView — but three of them are traps
- **Discovered**: 2026-07-31
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: Auditing 23k LOC of custom intelligence dashboards found 39 `:style="{height|width}"` div-bar "charts", 14 raw SVG charts with hand-written coordinate maths, 18 hand-built ECharts option objects, and ZERO frappe-ui chart components in use. The full chart set had been available in the pinned version the whole time. Adopting it removed hundreds of lines of SVG arithmetic and gained axes, gridlines, tooltips, legends and responsive resize for free. But three components had to be REFUSED on evidence, so "use the library" is not unconditional.
- **Pattern**: Available and exported from `frappe-ui/src/index.ts` even in old 0.1.142: `AxisChart`, `DonutChart`, `FunnelChart`, `NumberChart`, `ECharts`, plus the whole `ListView` family. Each chart takes ONE `config` prop and needs an explicit height class or it collapses. `AxisChart` config: `{data, title, xAxis{key,type}, yAxis, y2Axis?, swapXY?, stacked?, series[{name,type:'bar'|'line'|'area',color?,axis?,...}]}`; `series[].name` MUST match a key in each data row; `swapXY` THROWS for non-bar series or `axis:'y2'`. Colour: `config.colors` is applied as the global ECharts palette via `eChartOptions.ts:31` and `series[].color` overrides per series.
  **REFUSE `FunnelChart`**: `funnelChartOptions.ts:33` hardcodes `blueGradient` and ignores `config.colors`, and line 57 hardcodes `sort: 'descending'`. It cannot be themed and it reorders stages by magnitude, so any non-monotonic funnel is misrepresented. Use `AxisChart` with `swapXY: true` and reversed data.
  **REFUSE `NumberChart`**: raw `bg-white` (unthemeable) and `text-green-500` / `text-red-500` for the delta; `green-500` is #46B37E = 2.62:1 on white, failing WCAG AA.
  **REFUSE `ListView` for data tables**: zero `role`, `<th>`, `scope` or `aria-*` anywhere under `components/ListView/`. It is a flexbox div grid, so swapping semantic `<table scope>` markup for it regresses WCAG 1.3.1 header association.
  Also: ECharts paints to a canvas, so a `var(--token)` colour renders as NOTHING. Resolve theme tokens at runtime with `getComputedStyle(document.documentElement).getPropertyValue(token)`; that also keeps a `[data-theme]` switch working. And a canvas is invisible to assistive tech, so pair every chart with an `.sr-only` table (with `<caption>` and `scope`) or an adjacent visible table carrying the same series.
  Finally: do NOT convert single-value progress bars into charts. A "% of target" or health-score meter is the correct lighter affordance; only genuine multi-point or multi-category series belong in a chart.
- **Evidence**: `node_modules/frappe-ui/src/index.ts:49-61,75-79` (exports); `Charts/types.ts` (configs); `funnelChartOptions.ts:33,57`; `Charts/NumberChart.vue` delta classes; `grep -rnoE 'role=|<th|scope=|aria-' components/ListView/*.vue` returns nothing. 21 charts converted and verified rendering in a live browser across 14 routes with zero console errors; `bench build --app insights` exit 0.

### [Debugging Patterns] vue-tsc does NOT catch an unbalanced Vue template; only the build does
- **Discovered**: 2026-07-31
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: A chart conversion replaced a wrapper element but left its `</div>` behind in `SalesIntelligence.vue`. `yarn lint` passed, `vue-tsc --noEmit` reported its usual 180 errors with none in that file, and `vitest` passed 20/20. `bench build` then failed with `Invalid end tag` and a stack trace pointing at the LAST line of the template, ~50 lines away from the actual surplus tag.
- **Pattern**: A malformed SFC template is a compile-time failure that typecheck and unit tests both miss, and the reported line is where the parser gave up, not where the imbalance is. Two things follow. (1) After any template-structure edit, run the real build or at minimum parse every SFC: `require('@vue/compiler-sfc').parse(src, {filename}).errors`. That is a fast whole-tree gate worth running before `bench build`. (2) To locate the real imbalance, scan the template with interpolations, comments and quoted attribute values blanked out (otherwise `Record<string, number>` inside `{{ }}` parses as a tag), match tags GLOBALLY rather than per line (multi-line `<Select\n …\n/>` is invisible to a line-based scanner), and find the first point where nesting depth returns to 0 before the end. The surplus tag is immediately after it.
- **Evidence**: `SalesIntelligence.vue` line 1661 held a stray `</div>`; the compiler reported `Invalid end tag @ 1710`; depth analysis showed the root closing at 1686 instead of 1710. After removal, all 226 SFCs parsed clean and the build succeeded.

### [Frontend Patterns] apiCall unwraps the {status,data} envelope but createResource does NOT — swapping them renders zeros everywhere
- **Discovered**: 2026-07-31
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: After migrating 21 custom intelligence dashboards from a hand-rolled `apiCall()` pattern to a `createResource`-based composable, every dashboard rendered structurally correctly but with all-zero values: "Total Headcount 0", "Avg. Salary KES 0", "No composition data available". No console error, no failed request, HTTP 200 throughout. Nothing looked broken; the numbers were simply wrong. Only a live browser smoke test caught it, because unit tests mocked the resource layer and the typecheck was satisfied by the (equally wrong) payload interfaces.
- **Pattern**: `insights/api/response.py` (and the same convention in many Frappe apps) wraps endpoint output as `{"status": "success", "data": {...}}`. The local `apiCall()` helper silently unwrapped it (`return response?.data ?? response`), so components read `payload.field` directly. frappe-ui's `createResource` sets `resource.data` to the RAW `message` value, i.e. the whole envelope, so the same component code reads `envelope.field` -> `undefined` -> every `?? 0` fallback fires and the UI fills with confident zeros. FIX: decode the envelope in exactly ONE exported helper and call it from both paths, treating `status === "error"` on a 200 as a real error state. Keep the two paths sharing one decoder or they drift again. Guard when migrating any Frappe frontend between `call`/`apiCall` and `createResource`/`useDoc`: check whether the endpoint wraps, and verify a real number renders in a browser, not just that the request succeeded.
- **Evidence**: `/api/method/insights.api.ml.get_hr_overview` returned `{message: {status, data}}` (probed from an authenticated browser session); `frappe-ui/src/resources/resources.js` assigns the response to `out.data` with no unwrapping; HR dashboard showed 0 for every metric before the fix and 17 headcount with a 52.9/47.1 gender split after a single change in the shared composable.

### [Frontend Patterns] A whitelisted endpoint that does not exist returns HTTP 417 ValidationError, not 404
- **Discovered**: 2026-07-31
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: The Marketing & CRM dashboard rendered a header and nothing else. Its data call pointed at `insights.api.ml.marketing_intelligence.get_marketing_overview`, but the module on disk is `marketing.py`; no `marketing_intelligence.py` has ever existed. The browser console showed only `Failed to load resource: 417 (EXPECTATION FAILED)`, which reads like a server-side validation failure rather than a missing method, so the dashboard looked like a data problem instead of a wrong dotted path.
- **Pattern**: `frappe.handler.execute_cmd` raises `ValidationError` (HTTP 417) when it cannot resolve the dotted path, so a typo'd or renamed module is indistinguishable from a genuine validation error at the network layer. When a Frappe frontend panel is empty and the console shows 417, FIRST confirm the module and function actually exist on disk (`ls apps/<app>/<app>/api/...`) before debugging the query. Also note `bench --site <site> execute <dotted.path>` falls back to `eval()` and reports a bare `NameError: name '<app>' is not defined` for an unimportable path, which is another disguised "does not exist" signal.
- **Evidence**: `MarketingCRMIntelligence.vue` called `...marketing_intelligence.get_marketing_overview`; `ls apps/insights/insights/api/ml/` shows `marketing.py` and no `marketing_intelligence.py`; the endpoint returned `{exception, exc_type: "ValidationError", exc, _server_messages}` with status 417 while sibling endpoints on the real module returned 200.

### [Frontend Patterns] frappe-ui tailwind preset REPLACES theme.colors — indigo/emerald/slate/zinc/neutral emit ZERO css
- **Discovered**: 2026-07-31
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: Reviewing 23k LOC of custom intelligence dashboards in a custom app fork (`apps/insights/frontend`, frappe-ui 0.1.142). 42 utility classes across 12 files were rendering completely unstyled — an ML training panel showed black-on-white where a tinted card was intended. Two independent review passes classified the hits as merely "AI palette" taste violations; only a real Tailwind build revealed they compile to nothing.
- **Pattern**: `frappe-ui/src/tailwind/plugin.js` sets `theme.colors = colorPalette` (a full REPLACE, not `extend`). `colorPalette` is built from `colors.json.lightMode`, whose families are exactly: `gray blue green red amber orange yellow teal cyan purple pink violet`. **Tailwind's default `indigo`, `emerald`, `slate`, `zinc`, `neutral`, `sky`, `rose`, `lime`, `fuchsia`, `stone` DO NOT EXIST** and silently emit no CSS — no build warning, no console error. `indigo` is the dangerous one because it is the most natural substitute for `violet`/`blue`. Verify with a probe build, never by eye: `npx tailwindcss -i src/index.css -c tailwind.config.js --content probe.html -o out.css` then grep the output for the class. Add a CI guard: `! grep -rE '\b(text|bg|border|from|to|ring|divide)-(indigo|emerald|slate|zinc|neutral)-[0-9]{2,3}\b' src`.
- **Evidence**: `node_modules/frappe-ui/src/tailwind/plugin.js:59` (`colors: colorPalette`), `colorPalette.js:4-38` (`generateColorPalette`), `colors.json.lightMode` keys. Probe build confirmed `grep -c indigo out.css` = 0 while `bg-purple-500` emitted `rgb(156 69 227)`.

### [Frontend Patterns] frappe-ui semantic token families are ROLE-SCOPED: text→ink, bg→surface, border/ring/divide→outline
- **Discovered**: 2026-07-31
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: After migrating the same dashboards onto Espresso semantic tokens, 6 of 32 distinct semantic utilities in use emitted zero CSS. Agents had written `bg-ink-gray-7`, `bg-outline-gray-3`, `text-outline-gray-1`, and `ring-surface-white` by analogy, assuming any semantic family works with any utility prefix.
- **Pattern**: The preset registers each semantic family against SPECIFIC Tailwind utility keys, so crossing them is the same silent-zero-CSS failure as a missing colour family. Valid combinations only: `textColor`/`stroke`/`placeholderColor` take **ink**; `backgroundColor` takes **surface**; `fill` takes **ink** OR **surface**; `borderColor`/`ringColor`/`divideColor` take **outline**. So `bg-ink-*`, `bg-outline-*`, `text-surface-*`, `text-outline-*`, `border-ink-*`, `ring-surface-*` are all dead. Bare `border` (no colour) is safe and already resolves to `var(--outline-gray-1)`. Guard: `! grep -rE '\b(bg-(ink|outline)-|text-(surface|outline)-|(border|ring|divide)-(ink|surface)-)' src`.
- **Evidence**: `node_modules/frappe-ui/src/tailwind/plugin.js:220-250` — `textColor: { ink }`, `backgroundColor: { surface }`, `fill: { ink, surface }`, `stroke: { ink }`, `placeholderColor: { ink }`, `borderColor: () => ({ DEFAULT: 'var(--outline-gray-1)', outline })`, `ringColor: { outline }`, `divideColor: { outline }`. Probe build confirmed all 6 crossings emit nothing.

### [Frontend Patterns] Espresso gray-500 is #999999 (2.85:1) — text-gray-400/500/600 all FAIL WCAG AA body text
- **Discovered**: 2026-07-31
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: A WCAG 2.1 AA audit of the intelligence dashboards found 578 instances of `text-gray-500`/`text-gray-400` used as secondary body text in a financial-reporting product. Anyone reasoning from stock Tailwind gets this wrong: Tailwind's `gray-500` is `#6b7280` (4.83:1, PASSES), so the failure is invisible unless you read the installed palette.
- **Pattern**: Espresso overrides the whole gray ramp. Computed on white: `gray-400` #C7C7C7 **1.69:1**, `gray-500` #999999 **2.85:1**, `gray-600` #7C7C7C **4.17:1** — all three FAIL the 4.5:1 body-text threshold. `gray-700` #525252 is 7.81:1 and is the first passing step. Mapped to semantic ink: `ink-gray-3/4/5` fail, **`ink-gray-6` (7.81:1) is the minimum for body text**, `ink-gray-8` 11.73:1, `ink-gray-9` 17.93:1. Also fails as text: `ink-green-3` 4.06:1, `ink-blue-2` 3.34:1, `ink-amber-3` 3.16:1 — so green/amber/blue can NEVER carry status as text at body size. They are only valid as non-text graphics (3:1 threshold): `surface-green-3` 4.06, `surface-blue-3` 4.28, `surface-amber-3` 3.16, `surface-red-5` 5.36. Consequence: an AA-compliant Espresso status vocabulary is neutral-by-default with `ink-red-4` (5.36:1) for exceptions, and every colour fill needs an adjacent text label.
- **Evidence**: `frappe/public/scss/espresso/_colors.scss` gray-500 `#999999` (corroborates the 2026-07-15 source-verification entry); `node_modules/frappe-ui/src/tailwind/colors.json` `lightMode.gray` + `themedVariables.light.ink`; contrast computed per WCAG relative-luminance formula and cross-checked against the compiled CSS (`.text-gray-500 { color: rgb(153 153 153) }`).

### [Debugging Patterns] frappe-ui 0.1.142 Badge variant="solid" is unusable for blue/orange/red (1.03:1–1.46:1)
- **Discovered**: 2026-07-31
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: Building an AA-compliant status vocabulary on frappe-ui `<Badge>`. The `solid` variant looked like the obvious choice for a Critical badge, but computing its actual token pairs showed it is effectively invisible.
- **Pattern**: `Badge.vue`'s `solid` map pairs `ink-<color>-1` (a near-WHITE tint) with `surface-<color>-2/3/4` (also a light tint) — the intent was clearly white-on-saturated, but the tokens resolve light-on-light. Measured: `solid/blue` #F2F9FF on #E6F4FF = **1.05:1**, `solid/orange` #FDFAED on #FFF7D3 = **1.03:1**, `solid/red` #FFF7F7 on #FDC2C2 = **1.46:1**. Only `solid/gray` (white on #171717, 17.93:1) is usable. The `subtle` variant is fine for gray (7.04:1) and red (5.08:1); green/amber/blue subtle land at 3.0–3.7 (large-text only). So: use `variant="subtle"` or `"outline"`, restrict badge TEXT to gray and red, and carry escalation with variant rather than extra hues. Re-check if frappe-ui is upgraded.
- **Evidence**: `node_modules/frappe-ui/src/components/Badge.vue` solidClasses/subtleClasses maps, resolved through `colors.json.themedVariables.light` and scored with the WCAG formula.

### [Frontend Patterns] Swapping `any` → `Record<string, unknown>` without narrowing turns 0 type errors into hundreds
- **Discovered**: 2026-07-31
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: Enforcing a no-`any` rule across 23k LOC of dashboards. Replacing `data: any` and `useIntelligenceDashboard<Record<string, any>>` with `Record<string, unknown>` satisfied the lint rule but drove `vue-tsc` from 262 pre-existing `src2` errors to 571, because every `formatCurrency(row.amount)` and `row.balance.toFixed(2)` became an `unknown` violation. Measured cost of the naive swap on 4 files: +264 errors.
- **Pattern**: `Record<string, unknown>` is NOT a drop-in for `Record<string, any>`; it is a promise to narrow that the codebase has not kept. Do the two together: declare a real payload interface plus one row interface per array, with accessed fields typed `number`/`string`/`boolean` and optionality mirroring the code's existing `?.`/`|| 0` guards, then pass it as the resource generic or `defineProps` type ONCE and let it flow. Also: **verify row shapes against the Python endpoint, not the error messages** — a well-meaning agent flattened a nested `{"current": {...}}` payload into `current_revenue` and silently broke every rendered value; the backend at `insights/ml/strategic_finance/scenarios.py:277-282` returns nested objects. Only-`unknown`-is-acceptable case: genuinely arbitrary rows, e.g. a drill-down table over arbitrary DocType columns, where `String(val)`/`Number(val)` coercion at the read site is correct (that swap cost 1 error, not 264).
- **Evidence**: measured `npx vue-tsc --noEmit` deltas per file across the migration (262 → 571 → 180); `plugin.js`-independent. Final state 180 errors, 82 BELOW baseline, with zero per-file regressions.

## Version Compatibility

### [Version Compatibility] workspace_sidebar/ JSON files required to survive bench migrate
- **Discovered**: 2026-04-21
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: After migrate, all of a custom app's Workspace Sidebar entries were deleted from DB because there was no `workspace_sidebar/` directory
- **Pattern**: Frappe v15 `sync.py` deletes "orphaned" Workspace Sidebar DB records (those without a matching JSON file in `app/workspace_sidebar/`) on every `bench migrate`. Without `workspace_sidebar/*.json` files, module sidebars are destroyed on each migrate. Solution: create `workspace_sidebar/` directory with one JSON per module. File naming MUST match `frappe.scrub(name)` exactly — e.g., `"Chemical & Waste Recycling"` → `chemical_&_waste_recycling.json` (the `&` is preserved by `frappe.scrub()`, NOT converted to `_`).
- **Evidence**: `frappe/model/sync.py:120` — `workspace_sidebar` in `app_level_folders`; confirmed via `bench --site <site> execute "print(frappe.scrub('Chemical & Waste Recycling'))"` → `chemical_&_waste_recycling`

### [Version Compatibility] Desktop Icon JSON must use icon_type "App" for /desk tile visibility
- **Discovered**: 2026-04-21
- **Confidence**: high
- **Uses**: 2
- **Flagged**:
- **Context**: After `bench migrate`, an app tile disappeared from `/desk`. The app had `add_to_apps_screen` configured but no `desktop_icon/*.json`, so its tile never appeared on `/desk` (an app with the JSON did appear). Creating `desktop_icon/<app>.json` with `icon_type=App`, `link_type=External`, `link=/app/route`, and `logo_url=/assets/<app>/images/<app>-logo.png` resolved it.
- **Pattern**: `frappe/model/sync.py` imports all JSON files in `desktop_icon/` during every `bench migrate`. If the main app JSON has `icon_type: "Link"` instead of `icon_type: "App"`, it overwrites the DB record and the app tile vanishes from `/desk`. The correct JSON for the parent app tile MUST have `icon_type: "App"`, `link_type: "External"`, and `link: "/app/route"`. Additionally, `sync.py` calls `delete_duplicate_icons()` which deletes DB App icons without a matching JSON file. Fix: update the JSON + update DB via `frappe.db.set_value()` (not `doc.save()` — the Dynamic Link validation on `link_to` crashes for External link type) + `bench clear-cache`.
- **Evidence**: `frappe/model/sync.py:120` — `desktop_icon` in `app_level_folders`; `sync.py:308-321` — `delete_duplicate_icons()` removes App icons without JSON backing
- **Corrected (v16.35)**: the canonical Desk URL prefix is `/desk`, not `/app` — `frappe/hooks.py` `website_route_rules` maps `/desk/<path:app_path>` to the `desk` page, and `website_redirects` sends `/app/(.*)` -> `/desk/\1`. The shipped built-in Desktop Icon fixture uses `link: "/desk/build"` (`frappe/desk/doctype/desktop_icon/framework.json:10`). Write `link=/desk/route` in new `desktop_icon/*.json` files; `/app/route` values still resolve via the redirect but are the legacy v15 form.

### [Version Compatibility] Workspace Sidebar title must match workspace name to block auto-gen
- **Discovered**: 2026-05-20
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: After renaming a Workspace Sidebar from "Ops Production" to "Production", subsequent `bench migrate` runs kept recreating a duplicate "Ops Production" sidebar with only the workspace shortcuts (9 items vs the renamed sidebar's 45). The duplicate then won selection at `get_workspace_for_module`.
- **Pattern**: `frappe/desk/doctype/workspace_sidebar/workspace_sidebar.py:154` `create_workspace_sidebar_for_workspaces()` runs on app install / certain migrates and creates a Workspace Sidebar for any public Workspace whose `name` is NOT present in `frappe.get_all("Workspace Sidebar", pluck="title")` (note: pluck=`title`, not `name`). To block auto-creation while keeping a different sidebar `name`, set the sidebar's `title` field to exactly the workspace name. Combined with `name` matching the Desktop Icon label and the fixture filename matching `frappe.scrub(name)`, you get a stable three-way invariant that survives migrate.
- **Evidence**: Reproduced on Frappe v16.27.1; condition at workspace_sidebar.py:165-168 — `if workspace not in existing_sidebars` where `existing_sidebars = frappe.get_all("Workspace Sidebar", pluck="title")`

### [Version Compatibility] Desktop Icon label must match Workspace Sidebar name (case-insensitive)
- **Discovered**: 2026-05-20
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: Added a `Production` child desktop_icon under `Ops Production` parent launcher. Icon was correctly in DB but never appeared in the /desk modal.
- **Pattern**: `DesktopIcon.is_permitted()` for `icon_type == "Link"` looks up `bootinfo.workspace_sidebar_item[self.label.lower()]["items"]` and returns False on KeyError. The Desktop Icon `label` (lowercased) MUST be a key in `workspace_sidebar_item`. That dict is keyed by lowercased `Workspace Sidebar.name` (see `boot.py:get_sidebar_items` → `sidebar_items[sidebar_title.lower()]`). So the Workspace Sidebar `name` must match the icon `label` exactly (case-insensitive). The Workspace itself can be named anything else; only `Workspace Sidebar.name` is the linkage point. Items inside the sidebar still reference the actual Workspace by name via `link_to`.
- **Evidence**: `frappe/desk/doctype/desktop_icon/desktop_icon.py:107` — `items = bootinfo.workspace_sidebar_item[self.label.lower()]["items"]` raises KeyError caught at line 114-115 returning False
- **Corrected (v16.35)**: `DesktopIcon.is_permitted()` no longer exists. The check is now inlined in `get_desktop_icons()` (`frappe/desk/doctype/desktop_icon/desktop_icon.py:186-196`): `sidebar = bootinfo.workspace_sidebar_item.get(s.label.lower()); permitted = bool(sidebar and sidebar["items"])` — a safe `.get()`, not a KeyError-raising direct index. The core requirement (icon `label`, lowercased, must match a `Workspace Sidebar` name) still holds.

### [Version Compatibility] Desk icon full chain: label==Sidebar.name==Workspace.name==scrub(label).svg for clickable+imaged tiles
- **Discovered**: 2026-07-21
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: After renaming a custom app's module labels "X Management" -> "X Mngt", the 5 /desk tiles were visible but clicking gave "Page x-mngt not found" and showed no icon image. The prior entry (label==Sidebar.name) only fixes VISIBILITY, not click-through or image.
- **Pattern**: A standard `icon_type=Link` desk tile has THREE independent couplings, all keyed off the same string: (1) VISIBILITY — `Desktop Icon.label.lower()` must be a key in `bootinfo.workspace_sidebar_item` (== lowercased `Workspace Sidebar.name`). (2) ROUTE — the /desk home tile href is `/desk/<slug(Workspace Sidebar.name)>?sidebar=...` (built client-side, NOT via `get_route_for_icon`); slug = lowercase + spaces->dashes. For it to resolve, a **Workspace** must exist at `frappe.workspaces[slug(name)]`, i.e. `Workspace.name` (NOT title) must slug-match the sidebar name. (3) IMAGE — `get_desktop_icon()` builds `assets/<app>/icons/desktop_icons/<variant>/<frappe.scrub(Desktop Icon.label)>.svg`; the SVG file must be named `scrub(label).svg`. So a working "Crop Mngt" tile needs Desktop Icon.label = Workspace Sidebar.name = Workspace.name = "Crop Mngt", plus `crop_mngt.svg` in solid/ + subtle/. Corrects the earlier entry: the Workspace CANNOT be named differently if the tile must be clickable — only visibility tolerates a mismatch. Rename via `frappe.rename_doc("Workspace", old, new, force=True, rebuild_search=False)` (~12s first call; cascades the sidebar Home-item `link_to`), then re-export the workspace fixture to its new scrubbed folder and delete the old one.
- **Evidence**: frappe 16, live browser — tile href `/desk/crop-mngt?sidebar=Crop%20Mngt` 404'd until Workspace renamed to "Crop Mngt"; `desktop_icon.html` img src = `frappe.utils.get_desktop_icon(icon.label,...)` -> `utils.js:1447` `frappe.scrub(icon_name)`; route slug `router.js:580-582`; `frappe.workspaces` keyed by `slug(page.name)` at `desk.js:300`; tile href confirmed via DOM `a.desktop-icon[href]`.

### [Debugging Patterns] app_level_folders fixtures (desktop_icon/workspace_sidebar) without a `modified` key get reverted on every migrate
- **Discovered**: 2026-07-21
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: After a correct DB rename, `bench migrate` reverted Pest/Waste Desktop Icon labels from "Pest Mngt" back to the record name while Crop/Gym/Livestock (identical edits, but their fixtures HAD timestamps) held.
- **Pattern**: `app_level_folders` docs (`desktop_icon/*.json`, `workspace_sidebar/*.json`) are gated by the same modified-timestamp check as standard docs (`frappe/modules/import_file.py`): a fixture re-imports only when its `modified` is newer than the DB record's. A fixture with NO `modified` key is re-imported on EVERY migrate, and that re-import path can reset fields (e.g. label back to the record name) — silently un-doing direct `db.set_value` fixes. FIX: always ship `creation` + `modified` (+ `modified_by`) in these fixtures; set `modified` OLDER than the live DB record so migrate skips it. `import_file_by_path(path, force=True)` does NOT reliably update `label` on an existing record — use `frappe.db.set_value` for the live DB and rely on the fixture only for fresh installs.
- **Evidence**: frappe 16 — pest/waste desktop_icon fixtures lacked `modified`; adding "2026-04-16 14:54:00.000000" (older than the set_value'd DB modified) made migrate skip them and labels held across a second full migrate. Extends the existing "Workspace standard-sync skips re-import unless modified is bumped" entry to app_level_folders label reverts.

### [Version Compatibility] Workspace v16 has no is_standard field
- **Discovered**: 2026-05-20
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: Reviewing a custom app for v16 alignment — `setup_workspace.py` set `ws.is_standard = 0` which is a v15-only Workspace field.
- **Pattern**: Frappe v16 removed `is_standard` from the Workspace DocType. v16 uses `public` (1/0) for shared-vs-private and the JSON fixture path `app/<module>/workspace/<name>/<name>.json` for app-shipped workspaces. Programmatic workspace creation via `frappe.new_doc("Workspace")` should set `public=1`, `module=<module>`, and not reference `is_standard`. Prefer the JSON fixture over a one-time setup script — the JSON survives migrate and is the canonical source.
- **Evidence**: `bench --site <site> execute "[f.fieldname for f in frappe.get_meta('Workspace').fields]"` on Frappe v16.27.1 — `is_standard` not in returned fields list

### [Version Compatibility] Frappe ships only Draft/Approved/Rejected as built-in Workflow States
- **Discovered**: 2026-05-20
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: A custom app's migrate failed with "Workflow State Closed not found" because the workflow fixture referenced states the install.py author assumed were Frappe defaults.
- **Pattern**: When a Workflow fixture references a state, that Workflow State document must already exist or the fixture import crashes. Frappe ships ONLY `Draft`, `Approved`, `Rejected` as built-in Workflow States — NOT `Open`, `Completed`, `Closed`, `In Progress`, etc. Apps must create all non-default states via a `before_migrate` hook (or after_install) using `frappe.get_doc({"doctype": "Workflow State", "workflow_state_name": ..., "style": ...}).insert()`. Confirm built-ins with `bench --site <site> execute "[w.name for w in frappe.get_all('Workflow State')]"` on a fresh site.
- **Evidence**: `bench --site <site> execute "[w.name for w in frappe.get_all('Workflow State', filters={'name': ['in', ['Closed','Open','Completed']]})]"` returned `[]` on a fresh site — confirming Open/Completed/Closed are NOT bundled
- **Corrected (v16.35)**: the three built-in states are `Pending`, `Approved`, `Rejected` — NOT `Draft`. Source: `frappe/utils/install.py:101-118` (`install_basic_docs()`), which inserts exactly `Workflow State` "Pending"/"Approved"/"Rejected" plus `Workflow Action Master` "Approve"/"Reject"/"Review". "Draft" is not a shipped Workflow State record. The rest of the pattern (apps must create non-default states themselves) is correct.

### [API] frappe.cache() parentheses are v16-only — use frappe.cache.set_value/get_value
- **Discovered**: 2026-06-08
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: The payroll app's boot.py used `frappe.cache()` (callable form) — semgrep `frappe-cache-breaks-multitenancy` rule flags this
- **Pattern**: `frappe.cache()` (called as a function) is the v16 pattern for getting the Redis wrapper. In v15 the API differs. The multitenancy-safe and version-compatible form is `frappe.cache.set_value(key, val, expires_in_sec=N)` and `frappe.cache.get_value(key)` — these use the property accessor (no parentheses) which works on both v15 and v16 and handles site isolation internally.
- **Evidence**: semgrep rule `frappe-cache-breaks-multitenancy` in `frappe_correctness.yml`; fix confirmed working in boot.py cache for enabled countries list
- **Corrected (v16.35)**: `frappe.cache()` is NOT v16-only — `RedisWrapper.__call__` (`frappe/utils/redis_wrapper.py:48-50`, docstring "Added for backward compatibility to support frappe.cache().method(...)") exists identically in the v15.120.0 source too (`frappe/utils/redis_wrapper.py:37`). Both `frappe.cache()` and bare `frappe.cache` work on v15 and v16. The real distinction the semgrep rule enforces is the *method* called on the wrapper — `.set()`/`.get()` (raw Redis, no site prefix) vs `.set_value()`/`.get_value()` (site-aware) — not the parentheses.

### [API] frappe.publish_realtime without room/user scope is a semgrep ERROR
- **Discovered**: 2026-06-08
- **Confidence**: high
- **Uses**: 1
- **Flagged**:
- **Context**: The payroll app's `PayrollSettings.on_update()` called `frappe.publish_realtime("event")` with no audience scope — broadcasts to all connected users on the entire site
- **Pattern**: Every `frappe.publish_realtime()` call must specify at least one of: `user=`, `room=`, `doctype=`/`docname=`. Without scope, the event leaks to all sessions. For settings-updated events that only affect the saving user's session, use `user=frappe.session.user, after_commit=True`. The `after_commit=True` ensures the event fires only after the DB transaction commits, preventing stale reads in the handler.
- **Evidence**: semgrep rule `frappe-realtime-pick-room` (ERROR severity) in `frappe_correctness.yml` — confirmed as the single blocking ERROR in the payroll app's scan

### [API & ORM Patterns] override_whitelisted_methods can widen a core signature and add an arbitrary-file-write primitive
- **Discovered**: 2026-06-12
- **Confidence**: high
- **Uses**: 0
- **Flagged**:
- **Context**: Reviewing my_app — `override_whitelisted_methods["frappe.utils.print_format.print_by_server"]` points to a custom `print_by_server(doctype, name, printer_setting, ..., file_path=None)` that does `open(file_path, "wb"); output.write(f)` then `finally: os.remove(file_path)`. The `frappe.has_permission(doctype, "read", name)` gate only covers the printed doc — NOT `file_path`.
- **Pattern**: When you override a Frappe core whitelisted method via `override_whitelisted_methods`, your replacement is exposed at the SAME `/api/method/<core.dotted.path>` and inherits no extra protection. Adding a new caller-controlled param like `file_path` to the signature turns it into an arbitrary-file **truncate-then-delete** primitive for any authenticated user (the `open(path,"wb")` truncates the target before the `finally: os.remove` deletes it). Never accept a filesystem path from a whitelisted caller; always generate the temp path server-side (`os.path.join("/tmp", f"...{frappe.generate_hash()}...")`) as the same file already does for the raw-printing branch.
- **Evidence**: `my_app/my_app/customizations/print_format.py:39-80`; semgrep `frappe-security-file-traversal` flagged lines 63 & 75; the raw branch (line 62) correctly uses generate_hash while the PDF branch (72-73) trusts the param.

### [Frontend Patterns] doctype_js resolves source-side via get_js(), so a non-served public/ dir still works
- **Discovered**: 2026-06-12
- **Confidence**: high
- **Uses**: 0
- **Flagged**:
- **Context**: my_app nests three levels (`apps/my_app/my_app/my_app/`) and has TWO `public/js` dirs. `doctype_js` paths like `"public/js/sales_invoice.js"` and `"my_app/public/js/weighbridge_log.js"` both load fine despite only one being under a served `/assets/` path.
- **Pattern**: `doctype_js` (and `app_include_js` cousins) are read server-side relative to the app PACKAGE root (`get_app_path("app")` = `get_pymodule_path("app")` = `apps/<app>/<app>/`) and INLINED into the form bundle via `get_js()` — they are NOT fetched as browser `/assets/` URLs. So the file only needs to exist at `<package_root>/<hook_path>`, even if that dir isn't the build-served `public/`. To verify a `doctype_js` hook actually loads, resolve `<package_root>/<value>` on disk; a path that doesn't exist there means the client script silently never loads (no console error).
- **Evidence**: confirmed all three my_app `doctype_js` hooks resolve under `apps/my_app/my_app/` on frappe 16.27.1; `frappe/public/js/frappe/form/form.js` loads via the server-inlined `__messages`/`get_js` path, not an asset request.

