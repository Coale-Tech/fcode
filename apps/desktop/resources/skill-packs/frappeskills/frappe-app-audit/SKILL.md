---
name: frappe-app-audit
description: Audit a whole Frappe app against framework standards covering security, permissions, SQL safety, i18n, hooks correctness, fixtures, frontend, and tests. Use when assessing an existing app rather than making one change.
---

# Frappe App Audit

Assess an entire app against framework standards and report findings by
severity, with file:line evidence.

## When to use

- Inheriting or reviewing an app you did not write
- Pre-release quality gate
- Recurring bugs suggest systemic problems, not one defect
- Security review of custom Frappe code

## Inputs required

- App path and the site it runs on
- Frappe/ERPNext versions (from [`frappe-project-triage`](../frappe-project-triage/SKILL.md))
- Whether the app is in production (changes severity thresholds)

## Procedure

### 0) Triage first

Versions, installed apps, module layout, frontend model. An audit without
version context produces wrong findings.

### 1) Sweep security

```bash
grep -rnE "frappe\.db\.sql\(f|\.format\(|% *\(" apps/<app> --include=*.py
grep -rn "@frappe.whitelist" apps/<app> --include=*.py
grep -rn "allow_guest=True" apps/<app> --include=*.py
```

Each whitelisted method: does a state-changing path call
`frappe.has_permission(..., throw=True)`? Are argument types validated? Rule
catalog: [references/semgrep-rules.md](references/semgrep-rules.md).

### 2) Sweep correctness

```bash
grep -rn "def after_save" apps/<app> --include=*.py
grep -rn "frappe.db.commit()" apps/<app> --include=*.py
grep -rn "flushall" apps/<app> --include=*.py
```

Plus module-level queries (multitenancy breakage) and Single-value reads via
`get_value` instead of `get_single_value`.

### 3) Sweep i18n

```bash
grep -rnE "frappe\.throw\(\"|frappe\.msgprint\(\"" apps/<app> --include=*.py
```

### 4) Sweep customization hygiene

Custom fields exported as fixtures? Core apps untouched? `hooks.py` handlers
resolvable? Workspaces/desk pages correct for the version?

### 5) Sweep the frontend

Hardcoded colors, raw `fetch`, Options API, missing empty/error states,
unbuilt assets.

### 6) Sweep tests

Do tests exist for the app's real contracts? Do any pin implementation details
or exact strings? Those are liabilities — flag them for deletion.

### 7) Report by severity

Full procedure and report template:
[references/app-audit.md](references/app-audit.md). Every finding needs
`file:line`, the rule it violates, and the concrete fix.

## Verification

- [ ] Every whitelisted method reviewed for a permission gate
- [ ] No string-interpolated SQL remains unflagged
- [ ] i18n gaps listed with file:line
- [ ] Fixture coverage confirmed against the site's Custom Fields
- [ ] Frontend findings reproduced in a browser, not assumed
- [ ] Findings ranked by severity with concrete fixes
- [ ] No finding asserted without evidence

## Failure modes / debugging

- **Grep noise**: comments and tests match the patterns — verify each hit in context
- **False "missing permission" findings**: the gate may live in a service the method calls
- **Version-inappropriate findings**: a v15 app audited against v16 rules
- **Findings without fixes**: unusable report — always name the replacement
- **Audit scope creep**: an audit reports, it does not refactor

## Escalation

- Fixing what the audit found → the owning skill via [`frappe-router`](../frappe-router/SKILL.md)
- Architectural problems rather than defects → [`frappe-enterprise-patterns`](../frappe-enterprise-patterns/SKILL.md)
- Unclear framework behaviour behind a finding → [`frappe-deep-research`](../frappe-deep-research/SKILL.md)

## References

- [references/app-audit.md](references/app-audit.md) - Audit procedure and report format
- [references/semgrep-rules.md](references/semgrep-rules.md) - Security and correctness rule catalog

## Guardrails

- **Evidence or it isn't a finding**: `file:line` for every claim
- **Audit reports, it does not refactor**: fixes are separate, owned work
- **Severity reflects exploitability and blast radius**, not personal taste
- **Check the version before applying a rule**
- **Verify each grep hit in context**: patterns over-match

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| Reporting grep hits verbatim | False positives destroy trust | Verify in context |
| Findings without fixes | Nobody can act | Name the replacement |
| Auditing without version context | Wrong rules applied | Triage first |
| Mixing audit and refactor | Unreviewable diff | Report, then fix separately |
| Flagging style as security | Noise drowns real issues | Rank by severity |
