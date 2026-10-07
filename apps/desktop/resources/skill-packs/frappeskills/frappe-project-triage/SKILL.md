---
name: frappe-project-triage
description: Detect Frappe project type, version, installed apps, and tooling before changing code. Use as the first step on any Frappe/ERPNext codebase, and when checking v15 to v16 compatibility.
---

# Frappe Project Triage

Establish what you are working on before you change it — project type, versions,
installed apps, conventions.

## When to use

- First contact with any Frappe/ERPNext codebase
- Before recommending an API that may not exist in that version
- Picking up an existing app someone else wrote
- Planning a v15 → v16 migration

## Inputs required

- Path to the bench (or Frappe Manager project) and the site name
- Whether the task targets an existing app or a new one

## Procedure

### 0) Identify the environment

```bash
ls apps/ sites/                 # a bench has both
grep default_site sites/common_site_config.json   # default site; currentsite.txt is ignored
bench --site <site> list-apps   # what is actually installed
```

No `apps/`+`sites/` pair? It may be a Frappe Manager project — see
[`frappe-manager`](../frappe-manager/SKILL.md).

### 1) Read versions from source

```bash
grep __version__ apps/{frappe,erpnext,hrms}/*/__init__.py
```

Never use `bench --version`. Version dictates API availability: v13 → v16 differ
substantially. Record the versions before writing code.

### 2) Detect the app layout

```bash
ls apps/<app>/<app>/            # modules
cat apps/<app>/<app>/hooks.py   # app_name, doc_events, fixtures, scheduler
ls apps/<app>/<app>/*/doctype/  # existing DocTypes
```

### 3) Detect the frontend model

| Evidence | Frontend |
|---|---|
| only `public/js/*.js` | Desk client scripts |
| `<app>/www/` pages | portal / website |
| `frontend/` with `package.json` + `frappe-ui` | Vue 3 SPA |

### 4) Detect existing conventions

```bash
ls apps/<app>/.pre-commit-config.yaml apps/<app>/pyproject.toml 2>/dev/null
ls apps/<app>/<app>/tests/ apps/<app>/cypress 2>/dev/null
```

Match the app's conventions; do not introduce a second style.

### 5) Check version hazards

```bash
python3 scripts/validate-compatibility.py apps/<app>
```

Flags v15/v16 hazards: removed APIs, desk-page vs. workspace, `frappe.call`
usage in SPA sources. See [references/v15-v16-compatibility.md](references/v15-v16-compatibility.md).

### 6) Choose the working skill

Hand off to the owning skill via [`frappe-router`](../frappe-router/SKILL.md) —
existing app conventions in hand, versions known.

## Verification

- [ ] Bench root and site name confirmed, not inferred
- [ ] frappe / erpnext / hrms versions read from `__init__.py`
- [ ] Installed apps listed; ERPNext presence confirmed either way
- [ ] App module layout and `hooks.py` keys reviewed
- [ ] Frontend model identified
- [ ] `validate-compatibility.py` run and output understood

## Failure modes / debugging

- **`ls apps/ sites/` fails**: you are not at a bench root; look one level up or check for Frappe Manager
- **`list-apps` shows fewer apps than `apps/`**: the app exists on disk but isn't installed on that site
- **`ModuleNotFoundError: erpnext`**: the site is Frappe-only; drop the ERPNext dependency or install it
- **Versions disagree between apps**: branches are mixed; confirm each app's git branch before trusting either

## Escalation

- Docker-based project → [`frappe-manager`](../frappe-manager/SKILL.md)
- Existing app you must extend → [references/existing-app.md](references/existing-app.md)
- New app from scratch → [`frappe-app-development`](../frappe-app-development/SKILL.md)
- Whole-app quality question → [`frappe-app-audit`](../frappe-app-audit/SKILL.md)

## References

- [references/project-triage.md](references/project-triage.md) - Full triage checklist and commands
- [references/existing-app.md](references/existing-app.md) - Extending an app you did not write
- [references/v15-v16-compatibility.md](references/v15-v16-compatibility.md) - Version deltas and migration notes
- `scripts/validate-compatibility.py` - Static v15/v16 hazard check

## Guardrails

- **Read versions from source**: `grep __version__`, never `bench --version` or `bench --help`
- **Never assume ERPNext**: check `list-apps` before importing `erpnext.*`
- **Never infer the bench from the workspace parent**: confirm with `apps/`+`sites/`
- **Triage before editing**: version-inappropriate APIs fail at runtime, not at write time
- **Match existing conventions**: a second convention beside an existing one is a defect

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| Trusting remembered version numbers | APIs differ per version | Read `__init__.py` |
| Assuming a bench because a directory has apps | Frappe Manager and standalone layouts differ | Check for `sites/` too |
| Using ERPNext DocTypes on a Frappe-only site | Import error at load | `list-apps` first |
| Ignoring `hooks.py` before editing | Duplicate `doc_events` handlers | Read it in triage |
| Introducing a new code style | Two conventions in one app | Follow the app's existing style |
