---
description: Frappe task with the frappe-* skills loaded (add "all" to load all 21)
---
Frappe/ERPNext task: $ARGUMENTS

Before any other tool call:
1. Read `skill://frappe-router` and follow its routing table.
2. Read every `skill://frappe-*` skill the router maps this task to. If the task contains the word `all`, read all 21 `frappe-*` skills instead.
3. Confirm the bench: `ls apps sites` and `grep default_site sites/common_site_config.json` (never `currentsite.txt`).

Then do the task following the loaded skills' Procedure, Verification and Guardrails sections. Verify APIs against the installed v16 source, not memory; tag v16-only behaviour `(v16)`.
