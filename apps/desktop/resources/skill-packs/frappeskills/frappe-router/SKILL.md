---
name: frappe-router
description: Route to the appropriate Frappe skill based on task type. Use as the entry point when working on any Frappe/ERPNext project to determine which specialized skill to apply.
---

# Frappe Router

Route to the right Frappe skill for your task. Target is **v16** (frappe 16.27.x,
erpnext 16.6.x, hrms 16.4.x) with v15 notes throughout.

## When to use

- First step when starting any Frappe-related work
- To determine which specialized skill applies to your task
- To find which skill owns a reference you remember reading

## Procedure

### 0) Identify task type

| Task | Skill |
|------|-------|
| Understand project structure, versions, apps, v15↔v16 deltas | → `frappe-project-triage` |
| Scaffold new app, hooks, background jobs, caching, fixtures | → `frappe-app-development` |
| Create/modify DocTypes, fields, controllers, permissions | → `frappe-doctype-development` |
| Build REST/RPC APIs, webhooks, OAuth, integrations, ORM queries | → `frappe-api-development` |
| Customize Desk UI, form scripts, list views, workspaces | → `frappe-desk-customization` |
| Build Vue 3 frontends with frappe-ui, portals, SPA architecture | → `frappe-frontend-development` |
| UI/UX patterns from CRM/Helpdesk/HRMS, mobile layouts | → `frappe-ui-patterns` |
| Espresso design tokens, color/type/spacing scales | → `frappe-design-tokens` |
| Print formats, email templates, Jinja, PDFs | → `frappe-printing-templates` |
| Reports (Builder, Query, Script), charts, Insights | → `frappe-reports` |
| Public web forms for data collection | → `frappe-web-forms` |
| Write or run tests, CI, Cypress | → `frappe-testing` |
| CRM/Helpdesk-scale architecture, SLAs | → `frappe-enterprise-patterns` |
| Docker dev environments with `fm` | → `frappe-manager` |
| Bench CLI, site management, broken bench recovery | → `frappe-bench-operations` |
| ERPNext or HRMS domain workflows | → `frappe-erpnext-hrms` |
| Frappe CRM app: Lead/Deal pipeline, org-hierarchy permissions, telephony/WhatsApp | → `frappe-crm-app` |
| Convert a raw Excel sheet into a Data Import CSV/XLSX and bulk load records | → `frappe-data-import` |
| Assess a whole app against framework standards | → `frappe-app-audit` |
| "How does Frappe actually do X" against installed source | → `frappe-deep-research` |

### 1) Run triage first (recommended)

Before deep work, run `frappe-project-triage` to establish:
- Project type (bench / Frappe Manager / standalone)
- Frappe, ERPNext and HRMS versions — read from source, not memory
- Installed apps (never assume ERPNext is present)
- Available tooling and existing conventions

### 2) Combine skills as needed

- New app = `frappe-app-development` + `frappe-doctype-development` + `frappe-api-development` + `frappe-testing`
- Feature with Desk UI = `frappe-doctype-development` + `frappe-desk-customization` + `frappe-api-development`
- Custom frontend = `frappe-frontend-development` + `frappe-design-tokens` + `frappe-api-development`
- Document workflow = `frappe-doctype-development` + `frappe-printing-templates` + `frappe-reports`
- Enterprise app = `frappe-enterprise-patterns` + `frappe-doctype-development`
- Bulk data load from a spreadsheet = `frappe-data-import` + `frappe-doctype-development` (to confirm target fields)
- Unexplained framework behaviour = `frappe-deep-research` + the owning skill

## Quick decision tree

```
Unknown project?                      → frappe-project-triage
New app or app-wide plumbing?         → frappe-app-development
Data model, controllers, permissions? → frappe-doctype-development
Endpoints, ORM, external access?      → frappe-api-development
Desk screens and scripts?             → frappe-desk-customization
Vue SPA or portal?                    → frappe-frontend-development
Look and feel?                        → frappe-design-tokens / frappe-ui-patterns
Paper, PDF, email?                    → frappe-printing-templates
Numbers on a screen?                  → frappe-reports
Public data collection?               → frappe-web-forms
Proof it works?                       → frappe-testing
Bench broken or site ops?             → frappe-bench-operations
Docker dev env?                       → frappe-manager
Sales / stock / payroll semantics?    → frappe-erpnext-hrms
Frappe CRM Lead/Deal pipeline?        → frappe-crm-app
Whole-app quality question?           → frappe-app-audit
Loading a spreadsheet into records?   → frappe-data-import
"How does Frappe do X?"               → frappe-deep-research
```

## Guardrails

- **Always triage first** before changing code in an unknown project
- **Check versions from source**: `grep __version__ apps/{frappe,erpnext,hrms}/*/__init__.py` — never `bench --version`
- **Don't assume ERPNext** — many sites run Frappe Framework alone
- **Always pass `--site <site>`** — never run bare `bench migrate`
- **Never edit core apps** — extend via Custom Fields, `doc_events`, and overrides
- **Installed source outranks these skills** — a reference that disagrees with `apps/frappe` on disk is a bug

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| Skipping project triage | Wrong patterns for that version/app set | Run `frappe-project-triage` first |
| ERPNext-specific code on a Frappe-only site | `ModuleNotFoundError` at import | Check installed apps first |
| Wrong skill for the task | Incomplete implementation | Match task type in the table above |
| Ignoring version differences | Deprecated or missing APIs | Check `frappe-project-triage` → `v15-v16-compatibility.md` |
| Working on the wrong site | Changes don't appear | Always specify `--site` |
| Vanilla JS/jQuery for a new frontend | Ecosystem mismatch | frappe-ui (Vue 3) via `frappe-frontend-development` |
| Hand-rolled app shell for CRUD | Inconsistent UX | Follow CRM/Helpdesk shells via `frappe-enterprise-patterns` |
