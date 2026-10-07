# Translations

Frappe translates UI strings and doc-level text at render time, from CSV files
(runtime, per-app) merged with a compiled PO/MO subsystem (build-time, per-app,
generated from the same CSV history). Verified against Frappe 16.35.0; the PO/MO
subsystem (`frappe/gettext/`) is unchanged from the v15 baseline.

## Marking strings for translation

```python
# Python
from frappe import _

frappe.msgprint(_("Item {0} not found").format(item_code))
_("Cancel", context="Button")               # disambiguating context
```

```python
frappe._(msg, lang=None, context=None)      # frappe/utils/translations.py
frappe.N_(msg, context=None)                # marker only — used where a string is
                                             # defined but translated later (e.g. a
                                             # module-level constant); returns msg
                                             # unchanged, exists so the extractor finds it
```

`frappe._lt(msg, lang=None, context=None)` returns a lazy `_LazyTranslate` object
instead of a resolved string — use for strings defined at import/module load time
(e.g. DocType field labels in Python) where the active language isn't known yet;
the translation happens on `str()`/render, not at definition time.

```javascript
// Client script / JS
frappe.msgprint(__("Item {0} not found", [item_code]));
__("Cancel", null, "Button");               // (txt, replace, context)
```

`frappe._`/`window.__` (`frappe/public/js/frappe/translate.js`) signature is
`(txt, replace = null, context = null)`. `replace` is passed to `$.format(text,
replace)` for `{0}`-style placeholder substitution — pass an array/object of values,
not pre-formatted text, so the translated string keeps correct placeholder order.

## Where translations live

Two coexisting mechanisms are merged at read time
(`frappe/translate.py::get_translations_from_apps`), CSV first then MO overriding on
key collision:

1. **CSV** — `<app>/translations/<lang>.csv`, one `source,translated[,context]` row
   per string; hand-edited or produced by `bench get-untranslated`/
   `update-translations`. A 3-column row keys as `f"{source}:{context}"`.
2. **PO/MO** (`frappe/gettext/`) — `<app>/locale/<lang>.po` compiled to
   `sites/assets/locale/<lang>/LC_MESSAGES/<app>.mo`; built from `<app>/locale/main.pot`
   via `bench build-message-files` (uses Babel to extract from `.py`/`.js`/templates).

Translations also inherit from a parent language: `es-GT` falls back to `es` for any
key it doesn't override itself.

## CLI

```bash
# CSV-based translation lifecycle
bench get-untranslated <lang> <untranslated_file> [--app <app>] [--all]
bench update-translations <lang> <untranslated_file> <translated_file> [--app <app>]
bench import-translations <lang> <path>

# Scaffold a new language CSV for an app
bench new-language <lang_code> <app>

# Move an app's translations from one app to another (e.g. after a module split)
bench migrate-translations <source_app> <target_app>

# Rebuild locale/main.pot and compile locale/<lang>.po -> assets .mo (site-independent)
bench build-message-files
```

`get-untranslated`/`update-translations`/`import-translations` default `--app` to
`_ALL_APPS` (every installed app's strings for that language) unless scoped.

## Best practices

- Wrap literal user-facing strings at the call site: `_("Draft")`, not a variable
  built from concatenation — the Babel/CSV extractor only finds string literals.
- Use `context=` to disambiguate the same source string translated differently in
  different UI positions (e.g. "Submit" the verb vs. a button label).
- Use `_lt()` for field labels or other strings evaluated at import time, not `_()`.
- Keep an app's own strings in that app's `translations/`/`locale/`; run
  `migrate-translations` rather than hand-copying CSV rows after a module move.

## Sources

- `frappe/utils/translations.py` — `_`, `_lt`, `N_`, `_LazyTranslate`
- `frappe/translate.py` — `get_translations_from_apps`, `get_translation_dict_from_file`
- `frappe/gettext/translate.py` — `generate_pot`, `csv_to_po`, `compile_translations`,
  `get_po_path`, `get_pot_path`, `get_mo_path`
- `frappe/public/js/frappe/translate.js` — `frappe._`/`window.__`
- `frappe/commands/translate.py` — CLI commands above
