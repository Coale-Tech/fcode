---
name: frappe-desk-customization
description: Customize the Frappe Desk UI with form scripts, list view settings, workspaces, dialogs, and client-side JavaScript APIs. Use when building interactive Desk experiences, adding custom buttons, or scripting form behaviour.
---

# Frappe Desk Customization

Script and shape the Desk — the fastest way to ship UI in Frappe, because it is
already built.

## When to use

- Adding buttons, filters, dynamic behaviour to a Desk form
- Customizing list views: indicators, formatters, bulk actions
- Building navigation: Workspaces, Workspace Sidebar (v16), Desktop Icons
- Opening dialogs, prompts, or multi-step interactions in Desk
- Grid, datatable and keyboard interaction work

## Inputs required

- DocType(s) whose forms or lists change
- Roles that see the customization
- Whether the behaviour is client-side only or needs a server call
- Frappe version — v16 adds Workspace Sidebar and serves Desk at `/desk` (v15: `/app`)

## Procedure

### 0) Prefer configuration over code

List settings, form layout, and field visibility are configurable
(Customize Form, List Settings). Write JavaScript only for behaviour that
configuration cannot express.

### 1) Add a form script

`<app>/<module>/doctype/<doctype>/<doctype>.js`:

```javascript
frappe.ui.form.on("Sample Doc", {
    refresh(frm) {
        if (frm.doc.docstatus === 1) {
            frm.add_custom_button(__("Approve"), () => approve(frm));
        }
    },
    customer(frm) {
        frm.set_value("currency", "");
    },
});

function approve(frm) {
    frm.call("approve").then(() => frm.reload_doc());
}
```

Events, `frm` API, child-table events: [references/frontend-desk.md](references/frontend-desk.md).

### 2) Customize the list view

```javascript
frappe.listview_settings["Sample Doc"] = {
    add_fields: ["status", "amount"],
    get_indicator(doc) {
        return [__(doc.status), doc.status === "Open" ? "orange" : "green", "status,=," + doc.status];
    },
};
```

See [references/listview-patterns.md](references/listview-patterns.md).

### 3) Build navigation

Workspaces (shortcuts, links, charts) exist in v15 and v16; Desk Pages
(`frappe.pages[...]`) remain the tool for custom full-page UIs in both. v16 adds
the Workspace Sidebar and routes Desktop Icons to it. Details:
[references/workspace-patterns.md](references/workspace-patterns.md) and
`assets/workspace.py.template`.

### 4) Use native interaction patterns

Grids, datatables, keyboard shortcuts, quick entry and bulk edit already exist —
match their behaviour rather than reinventing it:
[references/desk-ui-interactions.md](references/desk-ui-interactions.md).

### 5) Rebuild assets

```bash
bench build --app <app>
bench --site <site> clear-cache
```

## Verification

- [ ] Script loads (no console errors) and the button/behaviour appears
- [ ] Behaviour is role-correct — hidden or disabled for users who lack rights
- [ ] Server calls fail safely when the user lacks permission
- [ ] List indicators and filters work on real data
- [ ] Workspace renders with its shortcuts and links
- [ ] `bench build --app <app>` run and the browser hard-reloaded

## Failure modes / debugging

- **Script not loading**: file not in the DocType folder, or `bench build` not run
- **Button appears for everyone**: no role check — gate with `frappe.user.has_role`
- **`frm.call` 403**: the server method has its own permission gate; that is correct — fix the role, not the gate
- **Changes don't show**: asset cache — `bench build --app <app>` + `clear-cache` + hard reload
- **Workspace missing after migrate**: not exported as a fixture, or the module is wrong
- **Client script clashes with a Client Script record**: both run; consolidate into one

## Escalation

- Behaviour needs a server endpoint → [`frappe-api-development`](../frappe-api-development/SKILL.md)
- Desk cannot express the UX → [`frappe-frontend-development`](../frappe-frontend-development/SKILL.md)
- Look and feel questions → [`frappe-design-tokens`](../frappe-design-tokens/SKILL.md)
- Data model change needed → [`frappe-doctype-development`](../frappe-doctype-development/SKILL.md)

## References

- [references/frontend-desk.md](references/frontend-desk.md) - Form scripts, `frm` API, dialogs
- [references/listview-patterns.md](references/listview-patterns.md) - List settings, indicators, bulk actions
- [references/workspace-patterns.md](references/workspace-patterns.md) - Desktop Icons, Workspace Sidebar (v16), Workspace blocks
- [references/desk-ui-interactions.md](references/desk-ui-interactions.md) - Grids, datatables, keyboard behaviour
- `assets/workspace.py.template`

## Guardrails

- **Configuration before code**: Customize Form and List Settings cover most requests
- **Never gate security client-side**: hiding a button is UX, not permission
- **Always `__()` user-facing strings** in client scripts
- **Rebuild after JS changes**: `bench build --app <app>` then `clear-cache`
- **Check the version**: Workspace Sidebar is v16-only; v15 has no sidebar doctype

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| Hiding a button as the only access control | Server is still callable | Server-side permission gate |
| Untranslated button labels | No i18n | `__("Approve")` |
| Business logic in the form script | Bypassed by API callers | Put it in the controller |
| Forgetting `bench build` | Stale assets served | Build and clear cache |
| (v16) Desktop Icon `link_type: "Workspace"` | Invalid Select option | `Workspace Sidebar` or `External` |
| Reimplementing grid behaviour | Inconsistent UX | Use native grid APIs |
