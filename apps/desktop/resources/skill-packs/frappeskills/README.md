<div align="center">
  <img src=".github/assets/logo.svg" width="96" alt="frappeskills" />

  <h1>frappeskills</h1>

  <p><b>Agent Skills for full-stack Frappe Framework / ERPNext development.</b></p>

  <p>
    <img src="https://img.shields.io/badge/frappe-v16-2490EF" alt="frappe v16" />
    <img src="https://img.shields.io/badge/skills-21-1467B1" alt="21 skills" />
    <img src="https://img.shields.io/badge/references-71-555" alt="71 references" />
  </p>
</div>

## Why

Frappe work spans schema, controllers, permissions, jobs, Desk customization,
Vue SPAs, design tokens, bench operations and ERPNext domain logic. One skill
covering all of it is either shallow or enormous — and an agent loads the whole
thing to answer one question.

These are **task-scoped skills**: each owns one kind of work, states its
procedure in the same nine sections, and carries only the references that work
needs. [`frappe-router`](frappe-router/SKILL.md) is the entry point that maps a
task to its skill.

Every deep reference is source-verified against installed framework source and
ends with a `## Sources` section naming the files it was checked against.
**Installed source outranks this repo**; a reference that disagrees with
`apps/frappe` on disk is a bug.

## Skills

| Skill | Use it for | Refs |
| --- | --- | ---: |
| [frappe-router](frappe-router/SKILL.md) | Entry point — route a task to the right skill | 0 |
| [frappe-project-triage](frappe-project-triage/SKILL.md) | Project type, versions, installed apps, v15↔v16 deltas | 3 |
| [frappe-app-development](frappe-app-development/SKILL.md) | App scaffolding, `hooks.py`, fixtures, jobs, cache, realtime, i18n | 9 |
| [frappe-doctype-development](frappe-doctype-development/SKILL.md) | DocTypes, field types, child tables, naming, controllers, permissions, workflows | 9 |
| [frappe-api-development](frappe-api-development/SKILL.md) | Whitelisted APIs, REST, webhooks, OAuth, rate limiting, ORM | 9 |
| [frappe-desk-customization](frappe-desk-customization/SKILL.md) | Form scripts, list views, workspaces, desk interactions | 4 |
| [frappe-frontend-development](frappe-frontend-development/SKILL.md) | frappe-ui Vue SPAs, portal pages, SPA architecture | 7 |
| [frappe-ui-patterns](frappe-ui-patterns/SKILL.md) | App shells and UX patterns from CRM/Helpdesk/HRMS, mobile | 2 |
| [frappe-design-tokens](frappe-design-tokens/SKILL.md) | Espresso design system, color/type/spacing tokens | 2 |
| [frappe-printing-templates](frappe-printing-templates/SKILL.md) | Print formats, email templates, Jinja, PDFs | 1 |
| [frappe-reports](frappe-reports/SKILL.md) | Report Builder, Query/Script reports, charts, Insights | 2 |
| [frappe-web-forms](frappe-web-forms/SKILL.md) | Public data collection without a frontend | 1 |
| [frappe-testing](frappe-testing/SKILL.md) | Unit tests, factories, CI, Cypress | 4 |
| [frappe-enterprise-patterns](frappe-enterprise-patterns/SKILL.md) | CRM/Helpdesk-scale architecture, service layers, SLAs | 2 |
| [frappe-bench-operations](frappe-bench-operations/SKILL.md) | Bench CLI, site management, broken-bench recovery | 2 |
| [frappe-manager](frappe-manager/SKILL.md) | Docker dev environments with `fm` | 1 |
| [frappe-erpnext-hrms](frappe-erpnext-hrms/SKILL.md) | Sales, purchase, stock, accounting, payroll, leave | 2 |
| [frappe-crm-app](frappe-crm-app/SKILL.md) | Frappe CRM: Lead/Deal pipeline, org-hierarchy permissions, SLAs, telephony/WhatsApp integrations | 5 |
| [frappe-data-import](frappe-data-import/SKILL.md) | Convert a raw Excel sheet into a Data Import CSV/XLSX and bulk load records | 2 |
| [frappe-app-audit](frappe-app-audit/SKILL.md) | Whole-app standards and security audit | 2 |
| [frappe-deep-research](frappe-deep-research/SKILL.md) | "How does Frappe do X" against installed source; pattern log | 2 |

## Installation

```bash
git clone git@github.com:Coale-Tech/frappeskills.git ~/.claude/skills-src/frappeskills
~/.claude/skills-src/frappeskills/install.sh
```

`install.sh` symlinks every `frappe-*` skill into each skill root that exists:
`~/.claude/skills` (Claude Code), `~/.agents/skills` (Codex and other
`.agents`-aware runtimes) and `~/.omp/agent/skills` (omp).
Edit in the clone, commit from there — the symlinks mean exactly one copy exists
on disk.

For omp it also links two extras from `omp/` into `~/.omp/agent/`:

- `/frappe <task>`: loads `frappe-router` and the skills it routes the task
  to. If the task includes the word `all`, it reads all 21 skills instead.
- `frappe-dev` agent: a task agent with all 21 skills preloaded, for large
  implementation work.

For any other agent runtime, point its skill root at this directory or copy the
skill folders into it.

## How it works

1. **Route** — `frappe-router` maps the task to one skill (and names the
   combinations complex work needs).
2. **Trigger** — each skill's `description` frontmatter matches the request
   directly, so an agent can also enter without the router.
3. **Load on demand** — a skill's `SKILL.md` is ~100–200 lines; its
   `references/` are read only when that step needs them.
4. **Verify** — every skill ends its procedure in migrate + clear-cache +
   exercising the real path, with a Verification checklist and a Failure-modes
   table.

## Skill structure

Every skill follows the same nine sections:

```
<skill>/
  SKILL.md        When to use · Inputs required · Procedure ·
                  Verification · Failure modes / debugging · Escalation ·
                  References · Guardrails · Common Mistakes
  references/     topic files owned by this skill, loaded on demand
  assets/         templates for this skill's work (where applicable)
  scripts/        executable checks (where applicable)
```

Assets ship where they are used: DocType and controller templates in
`frappe-doctype-development/assets`, the Vue templates and Tailwind preset in
`frappe-frontend-development/assets`, the runnable `mini-app/` skeleton in
`frappe-app-development/assets`, and `validate-compatibility.py` in
`frappe-project-triage/scripts`.

## Compatibility

Target is **v16** — frappe 16.27.x, erpnext 16.6.x, hrms 16.4.x — with v15 notes
throughout and a dedicated
[v15-v16-compatibility.md](frappe-project-triage/references/v15-v16-compatibility.md).

Verify the versions on any bench rather than trusting this line:

```bash
grep __version__ apps/{frappe,erpnext,hrms}/*/__init__.py
```

## Portability

The repo is machine-agnostic on purpose: no absolute paths, no bench topology,
no client app names, no host-specific tooling. A host that wants local
conventions — bench cluster layout, delegation policy, process management,
code-search tooling — puts them in its own agent context file (`AGENTS.md` /
`CLAUDE.md`) or an appended system prompt, which wins over a skill's Guardrails.

## Authoring guidelines

- **One skill per kind of work.** New topics become a reference inside the
  owning skill, or a new skill with its own references — never a second skill
  covering the same work.
- **Keep `SKILL.md` lean** (~100–200 lines) and in the nine-section order. Depth
  belongs in `references/`.
- **Every deep reference ends with `## Sources`** citing installed framework
  files.
- **Adopted third-party material carries inline provenance** naming its source
  file.
- **Cross-skill links are relative**: `../frappe-x/SKILL.md`,
  `../frappe-x/references/y.md`.
- New discoveries go into
  [learned-patterns.md](frappe-deep-research/references/learned-patterns.md) or
  [learned-patterns-ops.md](frappe-deep-research/references/learned-patterns-ops.md)
  (by category, see `frappe-deep-research`), and get promoted into the owning
  skill's reference once confirmed.
- **A new skill directory needs `./install.sh` re-run.** Symlinking is not
  automatic — the script only links what exists in each root at run time, so
  a freshly added `frappe-*/` is invisible to every agent until it runs again.

## Credits

- Structure, SKILL.md section format, router pattern, and a large share of the
  procedures and references are adopted from
  [lubusIN/frappe-skills](https://github.com/lubusIN/frappe-skills) (MIT) —
  full licence text in `LICENSES/frappe-skills-lubusIN-MIT.txt`.
- Earlier routing material derives from
  [frappe/skills](https://github.com/frappe/skills) (Frappe Technologies).
- Everything else is source-verified against installed Frappe / ERPNext / HRMS v16.

See [`NOTICE`](NOTICE) for full attribution.

## License

Private repository. Third-party material retains its original licence; see
`LICENSES/` and `NOTICE`.
