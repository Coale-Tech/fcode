# Whole-App Standards Audit

For auditing an entire Frappe/ERPNext custom app (tens of thousands of LOC)
against framework standards in one pass, rather than reviewing file by file.

**When to use:** "comprehensive audit", "review the whole app", "align with
framework standards" — scope is the app, not a diff. For a single PR or diff,
run an ordinary review instead; this procedure is overhead at that size.

## Procedure

1. **Recon yourself — never delegate it.** Confirm bench and site identity
   (`ls apps/ sites/`, `default_site` in `sites/common_site_config.json`), read `hooks.py`,
   `modules.txt`, `pyproject.toml`, and list every module directory: `api/`,
   `doctype/`, `overrides/`, `doc_events/`, `events/`, `tasks/`, `config/`,
   `utils/`, `tests/`, `patches/`, `fixtures/`, and the frontend `src/`. Get
   per-file LOC (`wc -l`) to size the slices before dispatching. Do not guess
   sizes.

2. **Slice by LOC balance, not by feature.** Split whitelisted API files into
   ~4 groups of comparable total LOC — one mature API file commonly runs 2–4K
   LOC, so five files can be a single 15K-LOC slice. Then separate slices for:
   DocTypes + controllers + permissions; overrides + `doc_events` + events +
   `hooks.py` wiring; jobs + scheduler + cache + config + utils; frontend; and
   tests + patches + fixtures + repo hygiene. Aim for **8–10 slices** so each
   reviewer's context stays bounded.

3. **Dispatch every slice in one batch** of parallel read-only review
   subagents. Each task gets: the exact file list with LOC, the severity
   taxonomy (CRITICAL / HIGH / MEDIUM / LOW), the required finding format, and
   an explicit instruction to verify each claim against installed
   `frappe`/`erpnext` source rather than from memory before citing it.

   ```
   [SEVERITY] file:line — finding — violates: X — fix: Y
   ```

   In the shared context, tell slices to flag suspected cross-slice issues to
   each other (for example, a phantom import whose target package lives in
   another slice) and to hand off rather than both reporting the same root
   cause independently.

4. **Read each result as it lands**, not all of them serially at the end. Work
   through completed slices while the rest still run, and watch for
   coordination messages between reviewers mid-run.

5. **Recover null-yield failures.** Subagents doing very large source reads
   sometimes fail at the final yield while the full report is already present
   in their transcript. Always read the agent's artifact even when the job is
   reported as failed — the content is usually recoverable. Never drop a slice
   because its job status says `failed`.

6. **Spot-check 3–5 of the most severe claims yourself** before compiling: open
   the exact `file:line` cited. Cheap insurance against one hallucinated line
   number in a 200-finding corpus, and it reveals whether reviewers actually
   verified against source as instructed.

7. **Compile one master report** (`AUDIT_REPORT.md` in the app root — this is
   the deliverable, not incidental documentation), organised by severity across
   the whole app, never by which reviewer found it. Deduplicate actively: when
   several slices found different faces of one root cause — a phantom package
   import surfaced via a broken consumer, a commented-out hook referencing it,
   and a dead sibling DocType — merge them into a single finding carrying all
   corroborating citations. That merged finding is usually the most important
   one in the report. Lead with an executive summary: a severity-count table
   and a "top N systemic issues" list (the cross-cutting patterns repeated
   across slices — typically missing permission gates, swallowed exceptions
   hiding partial writes, unparameterized SQL, untranslated user strings).

8. **Track it with a 3-phase todo list** — Recon, Delegated Audit (one task per
   slice), Synthesis (verify, compile, roadmap) — so progress survives a long
   session with many waits.

## Why slicing beats one big read

A single agent reading 80K+ LOC sequentially has lost the earlier context by
the time it reaches related code elsewhere in the app. Bounded-scope parallel
reviewers each stay inside useful context and produce independently verifiable,
source-cited findings. Cross-slice corroboration — the same defect surfacing
from three or four angles — is strong evidence of a real systemic issue, and is
what the report should lead with.

## What to audit against

Severity anchors, in order of consequence:

- **CRITICAL** — security (missing `frappe.has_permission(..., throw=True)` on
  state-changing whitelisted code, string-formatted SQL, `eval`/`exec` on user
  input), and correctness defects that post partial or wrong financial state.
- **HIGH** — swallowed exceptions hiding failed writes, `frappe.db.commit()`
  mid-transaction, core files edited instead of extended, check-then-act races
  that need a DB unique constraint.
- **MEDIUM** — missing `_()` on user-facing strings, N+1 query patterns,
  `get_doc().save()` where `set_value` suffices, untested business paths.
- **LOW** — naming, dead code, missing docstrings, formatting.

See [semgrep-rules.md](semgrep-rules.md) for the mechanically checkable
subset, and [permissions.md](../../frappe-doctype-development/references/permissions.md) / [database.md](../../frappe-api-development/references/database.md)
for the rules behind the CRITICAL and HIGH anchors.

## Sources

Verified against Frappe v16.35.0 / ERPNext v16.6.1 (`apps/frappe/frappe/__init__.py`,
`apps/erpnext/erpnext/__init__.py` `__version__`):

- `sites/common_site_config.json` — `default_site` key confirmed present, used for bench/site recon
- A representative installed custom app (`apps/coale_construction/`) confirmed the standard recon surface: `pyproject.toml` at the app root and `<app>/<app>/modules.txt`
- CRITICAL/MEDIUM severity anchors correspond to rules already verified in [semgrep-rules.md](semgrep-rules.md)'s own `## Sources` section: `unchecked-frappe-permission-call` (`has_permission(..., throw=True)`), `frappe-sql-format-injection`/`frappe-codeinjection-eval` (string-formatted SQL, `eval`/`exec`), `frappe-manual-commit` (`frappe.db.commit()` outside try/except), `frappe-missing-translate-function-python`/`-js` (missing `_()`/`__()`)
- HIGH/MEDIUM anchors without a mechanical rule (core files edited instead of extended, check-then-act races, N+1 queries, `get_doc().save()` vs `set_value`, untested business paths) are judgment calls documented in [permissions.md](../../frappe-doctype-development/references/permissions.md) and [database.md](../../frappe-api-development/references/database.md), not installed-source API claims
