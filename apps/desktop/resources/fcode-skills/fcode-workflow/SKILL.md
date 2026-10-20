---
name: fcode-workflow
description: "Use FIRST when asked to build, change or fix anything in a Frappe/ERPNext app (feature, DocType, API, report, UI, bug). Defines the standard process: Orient, Spec, Plan, Build, Verify, Review, Accept, with approval gates and which Fcode agent owns each phase."
---

# Fcode standard process

Seven phases, in order. Each ends with a gate; do not start the next phase until the gate holds.
You orchestrate: delegate with the `task` tool to the named agent, keep decisions and the
evidence table yourself.

**Size rule.** A one-file fix or a typo needs only phases 1 (Orient), 4, 5 and 7, with the
spec as one sentence in your reply. Anything that adds or changes a DocType, permission, API,
hook, patch, or user-visible screen runs all seven.

## 1. Orient — you, `frappe-scout` for anything non-obvious
- Confirm the bench and site: `ls apps sites`, `grep default_site sites/common_site_config.json`.
  Use `fcode_bench_run list-apps` to see what is installed.
- Read the app's `AGENTS.md`/`CLAUDE.md`, `docs/adr/`, and `hooks.py`. Existing conventions win.
- Find what already exists before proposing anything new (`frappe-scout`, read-only).
- **Gate:** you can name the bench, site, app, Frappe version, and the existing code you will extend.

## 2. Spec — you
Write `docs/specs/<slug>.md` in the app repo (create the folder if missing):
- **Goal** (one sentence), **Non-goals**, **Users/roles**.
- **Acceptance criteria**: a numbered list; each one observable and testable ("Sales User cannot
  submit an unapproved Quotation", not "permissions work").
- **Data/permission impact**: DocTypes, fields, roles, patches, fixtures touched.
- **Open questions**: ask the user now with `ask`; do not guess answers.
- **Gate:** the user approves the spec (explicit yes) when it adds or changes data, permissions
  or public APIs. Otherwise state it and continue.

## 3. Plan — you
Append a `## Plan` to the spec: ordered tasks, each with files, the agent that owns it, and the
exact verification command or check. Test tasks come before the code they cover.
Optionally create one Kanban card per task when the user wants to run them in parallel.
- **Gate:** every acceptance criterion maps to at least one task and one verification.

## 4. Build — `frappe-tester` (tests first), then `frappe-dev`
- `frappe-tester` writes the failing tests for the criteria and confirms they fail for the right reason.
- `frappe-dev` implements one task at a time. Follow `frappe-router` and the skill it picks.
- `frappe-data-importer` for bulk spreadsheet data; `frappe-builder` for Studio/Builder work.
- Never edit core apps; extend with Custom Fields, fixtures, `doc_events`.
- **Gate:** the task's tests pass via `fcode_bench_run run-tests` (not a hand-run command).

## 5. Verify — `frappe-bench-ops`, `frappe-ui-verifier`
- After DocType, hooks or fixture changes: `fcode_bench_run migrate`, then `clear-cache`, then `build` if assets changed.
- Run the whole affected app's tests, not only the new ones.
- UI changes: `frappe-ui-verifier` exercises the real screen and attaches screenshots.
- **Gate:** green tests, a clean migrate, and screenshot evidence for every UI criterion.

## 6. Review — `frappe-reviewer`
- Review the diff against `frappe-app-standards`, security rules and v16 correctness.
- Fix every Critical and High finding with `frappe-dev`, then re-run phase 5 for what changed.
  Allow two review rounds; if Critical/High remain after round two, stop and tell the user.
- **Gate:** no open Critical or High findings.

## 7. Accept — you
Reply with an evidence table, one row per acceptance criterion:

| # | Criterion | Proof (test name, command output, screenshot path) | Status |
|---|---|---|---|

Then: update the app's changelog/docs if behaviour changed, commit with a message that names the
spec, and mark the spec `Status: Accepted`. If you learned a durable Frappe lesson, record it
with `fcode-skill-improve`. A criterion without proof is `Not verified` — say so; never claim done.

## Rules for every phase
- Prove, don't assert: every "works" cites a run you made in this session.
- Mutating bench commands prompt the user; wait for approval, never route around it with `bash`.
- Stop and ask when two readings of the request lead to different data or permission models.
- Keep the spec current: change it before the code when scope moves.
