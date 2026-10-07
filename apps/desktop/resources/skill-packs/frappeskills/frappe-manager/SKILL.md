---
name: frappe-manager
description: Run Docker-based Frappe development and testing environments with Frappe Manager (fm). Use when setting up local dev without a classic bench, running isolated sites, or managing containerized Frappe workflows.
---

# Frappe Manager (Docker)

Run Frappe sites in Docker with `fm` when a classic bench is not the environment.

## When to use

- Setting up a local development site without building a bench by hand
- Running an isolated environment per project or per experiment
- Reproducing a bug on a clean site quickly
- Working on a machine where bench dependencies are inconvenient

## Inputs required

- Whether the project already uses `fm` (look for its config, not `apps/`+`sites/`)
- Site name and the apps to install
- Frappe/ERPNext branch or version required

## Procedure

### 0) Detect the environment

A Frappe Manager project does not look like a bench. If `ls apps/ sites/` fails,
check for an `fm` site before assuming the path is wrong —
[`frappe-project-triage`](../frappe-project-triage/SKILL.md).

### 1) Create a site

```bash
fm create <site> --frappe-branch version-16
fm list
fm info <site>
```

### 2) Work inside the site

```bash
fm shell <site>            # bench shell inside the container
fm start <site>
fm stop <site>
fm logs <site>
```

Inside `fm shell`, ordinary bench commands apply — always with `--site`.

### 3) Install apps

```bash
fm shell <site>
bench get-app <repo-url> && bench --site <site> install-app <app>
```

### 4) Reset when the site is dirty

Recreate rather than debug a corrupted dev site — it is cheaper. Export what you
need (fixtures, code) first; the site's database is disposable.

Full command surface and troubleshooting:
[references/frappe-manager.md](references/frappe-manager.md).

## Verification

- [ ] `fm list` shows the site as running
- [ ] Site loads in the browser at its local URL
- [ ] Target apps appear in `bench --site <site> list-apps`
- [ ] Code changes on the host are visible inside the container
- [ ] Versions match the intended branch

## Failure modes / debugging

- **Port already in use**: another site or a host bench is bound; stop one
- **Site unreachable**: container stopped — `fm start <site>`, then `fm logs <site>`
- **Code edits not reflected**: the app isn't mounted from the host path you're editing
- **Slow filesystem on macOS**: Docker bind-mount overhead, expected; keep node_modules inside the container
- **Migrate fails inside the container**: same causes as a bench — see [`frappe-bench-operations`](../frappe-bench-operations/SKILL.md)

## Escalation

- Classic bench operations → [`frappe-bench-operations`](../frappe-bench-operations/SKILL.md)
- Environment identification → [`frappe-project-triage`](../frappe-project-triage/SKILL.md)
- Test isolation strategy → [`frappe-testing`](../frappe-testing/SKILL.md)

## References

- [references/frappe-manager.md](references/frappe-manager.md) - Full `fm` command surface, split by topic (installation/sites, dev workflow, SSL/production, Docker config)

## Guardrails

- **Don't mix `fm` and a host bench on the same ports**
- **Treat dev sites as disposable**: recreate instead of repairing
- **Always `--site`** inside the container too
- **Keep app code on the host, dependencies in the container**
- **Never point `fm` at production data**

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| Assuming a bench layout | No `apps/`+`sites/` at the host path | Detect `fm` first |
| Running bench commands on the host | Wrong environment | `fm shell <site>` |
| Debugging a corrupted dev site for hours | Cheaper to recreate | `fm create` fresh |
| Port collisions with a running bench | Site unreachable | Stop one environment |
