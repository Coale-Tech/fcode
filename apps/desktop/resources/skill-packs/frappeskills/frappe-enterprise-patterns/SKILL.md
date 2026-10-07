---
name: frappe-enterprise-patterns
description: Apply production-grade architecture for large Frappe apps like CRM, Helpdesk, and HRMS, including multi-entity modelling, workflows, SLAs, and service layers. Use when designing complex systems rather than single features.
---

# Frappe Enterprise Patterns

Architecture for apps that outgrow a handful of DocTypes: CRM/Helpdesk-scale
systems with workflows, SLAs and integrations.

## When to use

- Designing a multi-entity product, not a single feature
- Introducing a service layer, domain events, or background pipelines
- Adding SLA tracking with pause/resume and breach handling
- Reviewing an app's architecture before it grows further

## Inputs required

- Core entities and their lifecycle states
- Roles and who acts at each state
- SLA or time-commitment requirements
- Integration points and their failure semantics
- Expected volume per entity

## Procedure

### 0) Model the domain first

Entities, ownership, and state transitions before any code. One aggregate per
business transaction; child tables for owned rows, Links for references.

### 1) Separate layers

```
doctype/…            thin controllers — validation and lifecycle only
services/…           business operations, transaction boundaries
integrations/…       outbound connectors, retries, mapping
api.py               whitelisted surface, permission gates
tasks.py             scheduled and enqueued work
```

Controllers stay thin; services are callable from API, jobs and tests alike.
See [references/enterprise-patterns.md](references/enterprise-patterns.md) and
the runnable skeleton in
[`frappe-app-development`](../frappe-app-development/SKILL.md) `assets/mini-app/`.

### 2) Make state explicit

Use a Workflow for human-driven transitions and a status field driven by code
for machine transitions — never both for the same field.

### 3) Add SLAs deliberately

Frappe core has no SLA doctype (ERPNext and Helpdesk ship their own). Build
targets per priority, business-hours calculation, pause on "waiting for
customer" and breach escalation on core primitives, and don't name the doctype
`Service Level Agreement` (collides with ERPNext):
[references/sla-patterns.md](references/sla-patterns.md).

Built-in audit and assignment primitives before custom code: `track_changes`
(Version diffs), Milestone Tracker, Assignment Rule (writes ToDo),
Notification (`Days Before`/`Value Change`/`Method` events), Log Settings
retention.

### 4) Design integrations to fail

Every outbound call: idempotency key, retry with backoff, dead-letter record,
and an operator-visible failure state. Never leave a half-applied transaction.

### 5) Plan for volume

Index the columns you filter on, paginate every list surface, and move
aggregation to scheduled rollups when tables pass millions of rows.

## Verification

- [ ] Every entity's states and transitions are documented and enforced
- [ ] Business logic is reachable from API, job and test without duplication
- [ ] SLA computation matches business hours on a worked example
- [ ] Integration retries are idempotent — replaying does not duplicate records
- [ ] Failure states are visible to an operator, not just in logs
- [ ] List surfaces paginate and stay fast on production-size data

## Failure modes / debugging

- **Business logic duplicated in controller and API**: extract to a service
- **Workflow and code both setting status**: transitions fight; pick one owner
- **SLA drifts from expectation**: business-hours calendar or pause logic, not the target
- **Duplicate records after a retry**: missing idempotency key
- **Slow list views at scale**: unindexed filter column or unbounded query
- **Silent integration failures**: exceptions swallowed in a job — surface them as a document state

## Escalation

- UI structure for the product → [`frappe-ui-patterns`](../frappe-ui-patterns/SKILL.md)
- Job and queue mechanics → [`frappe-app-development`](../frappe-app-development/SKILL.md)
- Query performance → [`frappe-api-development`](../frappe-api-development/SKILL.md) → `database.md`
- Standards sweep of the result → [`frappe-app-audit`](../frappe-app-audit/SKILL.md)

## References

- [references/enterprise-patterns.md](references/enterprise-patterns.md) - Layering, audit trail (Version, Milestone Tracker), assignment, notifications, retention, multi-tenancy
- [references/sla-patterns.md](references/sla-patterns.md) - Build-your-own SLA on core primitives: targets, pause/resume, breach handling

## Guardrails

- **Thin controllers, fat services**: lifecycle hooks orchestrate, they don't implement
- **One owner per status field**: workflow or code, never both
- **Every integration is idempotent and retryable**
- **Failures are documents, not log lines**: operators need to see and retry them
- **Index before volume arrives**, not after the incident
- **Don't build enterprise scaffolding for a small app**: cost without benefit

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| Business logic in controllers only | Unreachable from jobs and tests | Service layer |
| Workflow and code both own status | Conflicting transitions | Single owner |
| Retry without idempotency | Duplicate side effects | Idempotency key |
| Swallowed integration errors | Silent data loss | Failure state + alert |
| Unbounded list queries | Timeouts at scale | Paginate and index |
| Custom audit table for field history | Duplicates core | `track_changes` or Milestone Tracker |
| Premature enterprise architecture | Complexity without users | Start simple, extract later |
