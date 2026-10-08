---
name: frappe-ui-patterns
description: Apply the frappe-ui design language and proven patterns from Frappe CRM, Helpdesk, and HRMS including app shells, screen archetypes, hierarchy, confirmations, and mobile layouts. Use when designing app structure and interaction flows rather than wiring data.
---

# Frappe UI Patterns

Reuse the interaction patterns Frappe's own products already validated, instead
of inventing an app shell per project.

## When to use

- Deciding overall app structure: sidebar, nav, list/detail split
- Designing list, board, detail or settings screens
- Making an existing frontend work on small screens
- Reviewing an interface for consistency with the Frappe ecosystem

## Inputs required

- Primary user task and the entity they work with
- Device mix (desk-first, mobile-first, or both)
- Whether the product resembles CRM (pipeline), Helpdesk (queue), or HRMS (records)
- Pinned frappe-ui version: `DesktopShell`, `MobileShell`, `BottomSheet`,
  `useIsMobile` are 1.0 (`(v1)`); 0.1.x apps hand-build the shell

## Procedure

### 0) Pick the closest reference product

| Product shape | Model after | Key pattern |
|---|---|---|
| Pipeline / deals | Frappe CRM | List + board toggle, side panel detail |
| Queue / tickets | Frappe Helpdesk | Filtered queue, agent view, SLA chips |
| Records / self-service | Frappe HRMS | Record list, request flows, approvals |

See [references/ui-patterns.md](references/ui-patterns.md).

### 1) Lay out the shell

Desktop: `DesktopShell` + `Sidebar` (+ optional `Rail`) + `PageHeader`.
Mobile: `MobileShell` + `MobileNav` + `PageHeaderMobile`. Pick the shell with
`useIsMobile()`; desktop and mobile are two navigation models, not one
responsive component. Anatomy and geometry:
[references/ui-patterns.md](references/ui-patterns.md).

### 2) Design the list

Filters and search above, dense rows, an indicator column, bulk actions on
selection, pagination or infinite scroll — not both. Rows come from
`frappe-ui/list` (1.0) or `ListView` (0.1.x).
### 3) Design the detail

Primary actions top-right, status prominent, related records in tabs or side
panel, activity/comments last. Confirm destructive actions with
`dialog.danger`, report outcomes with `toast` — never a hand-built confirm
`Dialog`.

### 4) Make it responsive

Sidebar becomes a `BottomSheet`, persistent nav becomes `MobileNav` tabs,
action clusters collapse into one `Dropdown`, side-by-side panes become
separate routes — [references/mobile-patterns.md](references/mobile-patterns.md).

### 5) Validate against the reference product

Open the CRM/Helpdesk equivalent screen and compare density, spacing and
affordances before shipping.

## Verification

- [ ] Shell matches one reference product's structure, not a bespoke invention
- [ ] List screen supports filter, search, bulk action and empty state
- [ ] Detail screen exposes the primary action without scrolling
- [ ] Layout works at 375 px width without horizontal scroll
- [ ] Color only via `variant` + `theme` and semantic tokens; one accent per screen
- [ ] Screen checked with `data-theme="dark"`
- [ ] Keyboard navigation reaches every interactive element

## Failure modes / debugging

- **Screen feels unlike the rest of the ecosystem**: usually spacing scale and font weights, not layout
- **Table unusable on mobile**: convert rows to cards below the breakpoint
- **Actions hidden behind menus**: promote the single primary action
- **Infinite scroll plus pagination**: pick one
- **Sidebar eats the screen**: drawer below the tablet breakpoint

## Escalation

- Implementing the components → [`frappe-frontend-development`](../frappe-frontend-development/SKILL.md)
- Token values and scales → [`frappe-design-tokens`](../frappe-design-tokens/SKILL.md)
- Data and workflow modelling → [`frappe-enterprise-patterns`](../frappe-enterprise-patterns/SKILL.md)
- Frappe CRM's actual DocTypes, permissions, SLAs and integrations behind the "Pipeline / deals" pattern → [`frappe-crm-app`](../frappe-crm-app/SKILL.md)

## References

- [references/ui-patterns.md](references/ui-patterns.md) - P1–P14 summary, shell anatomy, archetypes, hierarchy, color, states, confirmations, forms
- [references/mobile-patterns.md](references/mobile-patterns.md) - `MobileShell`, `MobileNav`, `BottomSheet`, `useIsMobile`, desktop-to-mobile translation
- Component props live in [`frappe-frontend-development`](../frappe-frontend-development/references/frappe-ui-components.md); these files link there rather than repeat them

## Guardrails

- **Copy a shipped product's pattern** before designing a new one
- **One primary action per screen**: everything else is secondary
- **Tokens for spacing and type**: bespoke values make screens feel foreign
- **Two color axes only**: `variant` + `theme`; no `intent`/`kind`/`severity` props
- **Mobile is a layout change, not a separate app**
- **Empty, loading and error states are part of the design**, not an afterthought

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| Custom app shell for CRUD | Inconsistent UX, more maintenance | Follow CRM/Helpdesk shells |
| Dense desktop table on mobile | Unusable | Stacked cards below breakpoint |
| Multiple competing primary buttons | Users hesitate | One primary, rest secondary |
| Hand-built confirm `Dialog` | Boilerplate, inconsistent | `dialog.confirm` / `dialog.danger` |
| Inventing an `ActionSheet` for mobile | No such component | `BottomSheet` or `Dropdown` |
| Ad-hoc spacing values | Visual drift | Token scale |
| No empty state | Looks broken on day one | Explicit empty state with an action |
