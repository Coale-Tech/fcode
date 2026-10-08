# Frappe Semgrep Rules Reference

Rules path: `<bench>/apps/semgrep-rules/rules`
Source: https://github.com/frappe/semgrep-rules
Verified against the `semgrep-rules` app for Frappe **16.35.0**
(HEAD `b101a16`, branch `develop`, remote `upstream`, dated 2026-08-05, as of
2026-09-23). Treat the live `rules/*.yml` as authoritative if this catalog
drifts.

---

## Running Semgrep

```bash
# Check all generated files
semgrep --config=<bench>/apps/semgrep-rules/rules <app_folder>

# Errors only (block completion)
semgrep --config=<bench>/apps/semgrep-rules/rules --severity=ERROR <app_folder>

# Single file
semgrep --config=<bench>/apps/semgrep-rules/rules path/to/file.py
```

---

## Rule Categories

### Security — `rules/security/`

| Rule ID | Severity | What It Catches |
|---------|----------|-----------------|
| `frappe-sql-format-injection` | WARNING | `.format()` or f-string in `frappe.db.sql()` — SQL injection |
| `frappe-codeinjection-eval` | ERROR | `eval()`, `exec()`, `safe_exec()`, `safe_eval()` — RCE |
| `frappe-ssti` | ERROR | `render_template($ARG)` — template injection |
| `frappe-security-file-traversal` | WARNING | `open(...)` — file traversal risk |
| `relaxed-permissions` | WARNING | `"role": "All"` in JSON perms |
| `frappe-setuser` | WARNING | `frappe.set_user(...)` — privilege escalation |
| `missing-argument-type-hint` | WARNING | `@frappe.whitelist()` args missing type hints |
| `guest-whitelisted-method` | WARNING | `allow_guest=True` endpoints |
| `frappe-format-string-injection` | ERROR | Exception object in `.format()` on `_()` — use `str(e)` |

### Frappe Correctness — `rules/frappe_correctness.yml`

| Rule ID | Severity | What It Catches |
|---------|----------|-----------------|
| `frappe-breaks-multitenancy` | ERROR | `frappe.db.*` / `frappe.get_all` assigned to global var |
| `frappe-cache-breaks-multitenancy` | ERROR | `frappe.cache().set/get()` — use `set_value/get_value` |
| `frappe-modifying-but-not-comitting` | ERROR | `self.attr = x` in hooks without `db_set()` or `save()` |
| `frappe-modifying-but-not-comitting-other-method` | ERROR | A method calls `self.$OTHER()` after setting `self.$attr` — verify the change is committed (`db_set()`/`save()`) |
| `frappe-modifying-child-tables-while-iterating` | ERROR | `self.append/remove` inside `for row in self.table` |
| `frappe-same-key-assigned-twice` | ERROR | Dict literal with duplicate keys |
| `frappe-redis-flush` | ERROR | `frappe.cache.flushall()` — use `flushdb()` |
| `frappe-overriding-local-proxies` | ERROR | `frappe.db = ...` etc. — breaks proxies |
| `frappe-single-value-type-safety` | ERROR | `frappe.db.get_value(DocType, None, ...)` — use `get_single_value` |
| `frappe-set-value-semantics` | ERROR | `frappe.db.set_value(DocType, None, ...)` — use `set_single_value` |
| `frappe-after-save-controller-hook` | ERROR | `def after_save(self)` — not a valid hook |
| `frappe-qb-incorrect-order-usage` | ERROR | `.orderby("field", "asc")` — `order` must be keyword arg |
| `frappe-incorrect-debounce` | ERROR | `frappe.utils.debounce(fn)(...)` called inline |
| `frappe-realtime-pick-room` | ERROR | `frappe.publish_realtime()` without room/user scoping |
| `frappe-monkey-patching-not-allowed` | ERROR | Overwriting imported module properties |
| `frappe-test-whitelist-missing-protection` | ERROR | `@frappe.whitelist()` in test files — use `@whitelist_for_tests()` |
| `frappe-print-function-in-doctypes` | WARNING | `print()` in DocType files |
| `frappe-no-functional-code` | WARNING | `map()` / `filter()` — use list comprehensions |
| `frappe-query-debug-statement` | WARNING | `debug=True` left in queries |
| `frappe-manual-commit` | WARNING | `frappe.db.commit()` outside try/except |
| `frappe-enqueue-without-after-commit` | WARNING | `frappe.enqueue()`/`enqueue_doc()` called from a controller method without `enqueue_after_commit=True`, `now=True`, or `is_async=False` — job may run before the transaction commits |

### Hooks — `rules/hooks.yml`

| Rule ID | Severity | What It Catches |
|---------|----------|-----------------|
| `override-doctype-class` | ERROR | `override_doctype_class = ...` in `hooks.py` — only one app can override a DocType this way and it breaks silently when the original controller changes; use `doc_events` or `extend_doctype_class` instead |

### Code Quality — `rules/code_quality.yml`

| Rule ID | Severity | What It Catches |
|---------|----------|-----------------|
| `unchecked-frappe-permission-call` | ERROR | `frappe.has_permission()` return value ignored without `throw=True`. Exempt: assigned to a var, used in `return`/`if`/`assert`, or as a comprehension predicate (list/set/dict/generator); `test_*.py` excluded (refined in HEAD 3011799, #43) |
| `overusing-args` | WARNING | `def func(args)` — use explicit params |
| `use-vanilla-js-include` | WARNING | `in_list(list, item)` — use `list.includes(item)` |
| `useless-get-doc-dict` | WARNING | `frappe.get_doc(dict(k=v))` — use `frappe.get_doc(k=v)` |

### Translations — `rules/translate.yml` + `rules/ux.yml`

| Rule ID | Severity | What It Catches |
|---------|----------|-----------------|
| `frappe-missing-translate-function-python` | WARNING | `frappe.throw/msgprint("text")` not wrapped in `_()` |
| `frappe-missing-translate-function-js` | WARNING | Same in JS — not wrapped in `__()` |
| `frappe-missing-translation-button-text` | WARNING | `frm.add_custom_button("text")` not wrapped in `__()` |
| `frappe-translation-empty-string` | WARNING | `_("")` or `__("")` |
| `frappe-translation-variable-only` | WARNING | `_("{0}")` — translating placeholder only |
| `frappe-translation-trailing-spaces` | WARNING | Whitespace in translate strings |
| `frappe-translation-python-formatting` | WARNING | `_("...".format(...))` — format before translate |
| `frappe-translation-js-formatting` | WARNING | Template literal in `__()` |
| `frappe-translation-python-splitting` | WARNING | Concatenating translated strings |
| `frappe-translation-js-splitting` | WARNING | Splitting/concatenating strings inside `__()` — e.g. `__('a') + __('b')` |
| `frappe-untranslated-label-in-translated-message` | WARNING | `self.meta.get_label()` inside `_()` not translated |

### Reports — `rules/report.yml`

(Scoped to `**/report` paths — query/script reports.)

| Rule ID | Severity | What It Catches |
|---------|----------|-----------------|
| `frappe-missing-translate-function-in-report-python` | WARNING | Report column `label="..."` not wrapped in `_()` |
| `frappe-translated-values-in-business-logic` | WARNING | Translated string used as an option *value* — pass `{label: __("x"), value: "x"}` instead so business-logic comparisons stay on untranslated values |

---

## Common Fix Patterns

```python
# SQL injection / raw SQL -> frappe.qb (always; never frappe.db.sql for a
# query the query builder can express)
# BAD
frappe.db.sql(f"SELECT * FROM tabItem WHERE name = '{name}'")
# BAD (parameterized, but still frappe.db.sql where frappe.qb applies)
frappe.db.sql("SELECT * FROM tabItem WHERE name = %s", (name,))
# GOOD
Item = frappe.qb.DocType("Item")
frappe.qb.from_(Item).select(Item.name).where(Item.name == name).run(as_dict=True)

# Unchecked permission -> throw=True or check return
# BAD
frappe.has_permission("Sales Order", doc=doc)
# GOOD
frappe.has_permission("Sales Order", doc=doc, throw=True)

# Single DocType values
# BAD
frappe.db.get_value("System Settings", "System Settings", "field")
# GOOD
frappe.db.get_single_value("System Settings", "field")

# Wrong controller hook name
# BAD: def after_save(self)
# GOOD: def after_insert(self) or def on_update(self)

# Translate all user-facing text
# BAD
frappe.throw("Not permitted")
# GOOD
frappe.throw(_("Not permitted"))

# Exception in format string
# BAD
frappe.throw(_("Error: {}").format(e))
# GOOD
frappe.throw(_("Error: {}").format(str(e)))

# Child table iteration
# BAD: self.remove(row) inside for row in self.items
# GOOD: collect first, then remove
to_remove = [r for r in self.items if condition(r)]
for row in to_remove:
    self.remove(row)

# Multitenancy — never at module level
# BAD: CACHE = frappe.get_all("Item", ...)
# GOOD: def get_items(): return frappe.get_all("Item", ...)
```

```javascript
// Translate all JS user-facing text
// BAD
frappe.throw("Not permitted")
frm.add_custom_button("Submit", fn)
// GOOD
frappe.throw(__("Not permitted"))
frm.add_custom_button(__("Submit"), fn)

// Vanilla JS over Frappe wrappers
// BAD: in_list(arr, item)
// GOOD: arr.includes(item)

// Debounce — create once, don't call inline
// BAD: frappe.utils.debounce(fn)(arg)
// GOOD: const debouncedFn = frappe.utils.debounce(fn, 300); debouncedFn(arg)
```

---

## Semgrep Reviewer Protocol

The `semgrep review subagent` agent MUST:

1. **Run semgrep** on all generated Python, JS, and JSON files
2. **Block on any ERROR** — fix before marking task complete
3. **Report WARNINGs** with file, line, rule ID, and suggested fix
4. **Re-run after fixes** to confirm clean
5. Use `# nosemgrep: rule-id` sparingly with justification comment

### Severity thresholds

| Severity | Action |
|----------|--------|
| ERROR | Must fix — blocks completion |
| WARNING | Surface to user — fix or add `# nosemgrep` with justification |

---

## Recommended Checks (not in the upstream `semgrep-rules` catalog)

These patterns are NOT enforced by the official `frappe/semgrep-rules` app, but
are high-value to grep for in review. Verified against Frappe v16 source.

| Pattern | Why it's dangerous | Fix |
|---------|--------------------|-----|
| `ignore_permissions=True` in a `@frappe.whitelist()`-reachable path driven by user input | Bypasses ALL permission checks (`document.py:409` short-circuits `has_permission()`: `if self.flags.ignore_permissions: return True`) → privilege escalation | Remove it, or gate behind `frappe.only_for(...)` / `frappe.has_permission(..., throw=True)` first |
| `doc.flags.ignore_permissions = True` set from a request value | Same as above — user-controlled bypass | Only set in trusted jobs/migrations, never from `frappe.form_dict` |
| Interpolated value in a `permission_query_conditions` hook return string without `frappe.db.escape(...)` | SQL injection into the row-filter `WHERE` clause (consumed via `get_permission_query_conditions()`, `db_query.py:1159`) | Wrap every interpolated value in `frappe.db.escape(...)` |
| `frappe.db.sql(f"... {var} ...")` / `.format()` | SQL injection — same class as `frappe-sql-format-injection` but also covers `execute`/`multisql` | Rewrite as `frappe.qb` (preferred) or, only if `frappe.qb` genuinely cannot express the query, parameterize: `frappe.db.sql("... %s", (var,))` |
| `@frappe.whitelist()` with no `methods=` on a state-changing endpoint | Accepts GET/PUT/DELETE too; CSRF and caching implications | `@frappe.whitelist(methods=["POST"])` |
| User-facing `frappe.throw(...)`/`frappe.msgprint(...)` without `_()` | Untranslatable UI text — same class as `frappe-missing-translate-function-python` | Wrap message in `_(...)` (JS: `__(...)`) |
| Raw user-supplied HTML rendered/stored without `frappe.utils.sanitize_html(...)` (e.g. Text Editor / HTML field content echoed into a report or web page) | Stored/reflected XSS — `sanitize_html` (`frappe/utils/html_utils.py:146`) strips script/style tags and disallowed attributes; skipping it lets `<script>` through | Pass through `frappe.utils.sanitize_html(html)` before rendering or persisting untrusted HTML; use `frappe.utils.escape_html(...)` for plain-text-in-HTML contexts |
| Any `frappe.db.sql(...)` call, parameterized or not, for a query `frappe.qb`/`frappe.get_all`/`frappe.get_list` can express | Not a security bug by itself, but every hand-written query bypasses `frappe.qb`'s automatic multitenancy-safe table naming, dialect handling (MariaDB/Postgres/SQLite), and composability — and is one accidental edit away from `frappe-sql-format-injection`. `frappe.query_builder.functions` wraps dialect-specific SQL (`CustomFunction`, `ImportMapper`) precisely so raw SQL is never needed for this | Rewrite via `frappe.qb.from_(...)`/`frappe.qb.get_query(...)`; wrap a DB-specific function with `pypika.terms.CustomFunction("FN_NAME", ["arg1", "arg2"])` rather than dropping into raw SQL |

**The one legitimate exception**: an operator `frappe.qb`/PyPika does not
expose at all — e.g. a `REGEXP`/dialect-specific match operator. Frappe core
itself drops to `frappe.db.sql` for exactly this reason in
`append_number_if_name_exists` (`frappe/model/naming.py:531-537`, matching
`frappe.db.REGEX_CHARACTER` in a `WHERE` clause with no query-builder
equivalent). Treat that shape — a real operator gap, not convenience — as the
only acceptable `frappe.db.sql` use for an otherwise `frappe.qb`-expressible
query, and comment why at the call site.

## Sources

All rule IDs verified present in `apps/frappe/../semgrep-rules/rules` on this bench:

- `rules/security/` — `authorization.yml` (`relaxed-permissions`, `frappe-setuser`), `filesystem.yml`, `format_string_injection.yml`, `rce.yml`, `sql.yml`, `whitelisted.yml`
- `rules/frappe_correctness.yml` — 22 rules incl. `frappe-modifying-but-not-comitting-other-method` and `frappe-enqueue-without-after-commit`
- `rules/code_quality.yml` — `unchecked-frappe-permission-call`, `overusing-args`, `use-vanilla-js-include`, `useless-get-doc-dict`
- `rules/translate.yml` — incl. `frappe-translation-js-splitting`; `rules/ux.yml`; `rules/report.yml`
- `rules/hooks.yml` — `override-doctype-class`
- Framework API confirmations (frappe 16.35.0): `apps/frappe/frappe/model/document.py` (`ignore_permissions` short-circuit in `has_permission`, l.409), `apps/frappe/frappe/model/db_query.py` (`get_permission_query_conditions`, l.1159), `apps/frappe/frappe/__init__.py` (`whitelist` l.439, `has_permission` l.600), `apps/frappe/frappe/database/database.py` (`escape`, l.1405), `apps/frappe/frappe/utils/html_utils.py` (`sanitize_html`, l.146), `apps/frappe/frappe/utils/data.py` (`escape_html`, l.1720)
- Query builder enforcement: `apps/frappe/frappe/database/query.py:290` (`.delete()` support), `apps/frappe/frappe/query_builder/functions.py` (`CustomFunction`/`ImportMapper` wrapping dialect-specific SQL), `apps/frappe/frappe/model/naming.py:531-537` (`append_number_if_name_exists`, the one real `REGEXP`-operator exception)
