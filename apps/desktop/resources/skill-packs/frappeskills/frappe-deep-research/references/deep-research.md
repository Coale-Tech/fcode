# Deep Research Mode

A repeatable pipeline for answering a Frappe question **thoroughly and with
citations**, grounded in this workspace. Merged in from the former
`frappe-deep-research` skill. Use it when the task is *understanding / tracing /
comparing / verifying* — not building. Building is the rest of this skill.

**Precedence on conflict: installed source > official docs > web.** Local source
is authoritative; docs and web add context. Every non-trivial claim carries a
source; anything not directly observed is marked `[INFERENCE]`.

Companion operational content: [`frappe-bench-operations`](../../frappe-bench-operations/SKILL.md)'s
`references/bench.md` and `references/bench-troubleshooting.md`.

## When to use

- "How does `<feature>` actually work in Frappe/ERPNext/HRMS?"
- "What's the correct/best way to do `<X>` in Frappe (v16)?"
- "Trace `<symbol/flow>` across apps" / "what breaks if I change `<Y>`?"
- "Compare `<A>` vs `<B>`" / "Is `<Z>` possible / where is it implemented?"
- Library/API questions (frappe-ui, a PyPI/npm dep) needing source-verified answers.

Triggers: *deep research, research frappe, investigate, how does frappe, trace,
find everything about, compare, is it possible.*

## Pipeline (run in order; skip stages that don't apply)

### 1. Scope
Restate the question in one line; split into 2–5 concrete sub-questions. Note the
target app(s) and whether it's backend / frontend / config / cross-app.

### 2. Local first — installed framework source → semantic code search
Start with installed framework source for the authoritative answer, then use semantic
code-search tools (when available) for discovery. The pipeline is:
- **Installed framework source (authoritative):** `<bench>/apps/{frappe,erpnext,hrms}/...` and, for custom apps, their bench path. **Cite file:line.** This settles any "how does Frappe do X" question.
- **Semantic code search:** Use available code-search tools to find functions/classes by name, keyword, or concept; explore callers, callees, imports, impact radius, affected flows, and architecture.
- **Language-server protocol (LSP):** For symbol-accurate resolution (exact definition, every callsite, inheritance, types), use LSP when available — `definition` / `references` / `implementation` / `hover` — where semantic search is approximate.

### 3. Official docs — current, version-aware
For API signatures, config, migration, or library usage, consult official documentation
for Frappe, ERPNext, frappe-ui, or any dependency. Prefer current docs over training memory.

### 4. Web — current / community / comparative
Use web search for changelogs, discussions, comparisons, or things not in
source/docs; add `recency` filter for fast-moving topics. Then read primary sources in
reader mode — GitHub issues/PRs, `discuss.frappe.io`, release notes, blogs. Use
browser automation only for JavaScript-heavy or auth-gated pages.

### 5. Fan-out (for broad or multi-part questions)
Dispatch parallel read-only subagents in ONE `task` batch, each owning a
sub-question, writing compressed cited findings to `local://<topic>.md`:
- A read-only scout subagent — codebase/source investigation.
- A librarian subagent — external library/API answered from its real source.

Keep fan-out ≤ concurrency cap; **you synthesize** — don't offload the final call.
For staged multi-wave work use the `eval` DAG: `parallel()` / `pipeline()` with
`agent(..., handle=True)` and `local://` handoffs.

### 6. Synthesize
Lead with the answer. Then evidence, each claim cited (source path/line or URL).
- State the **version** it's true for; flag v15↔v16 diffs.
- Mark `[INFERENCE]` for anything not directly observed; surface contradictions
  between source, docs, and web (source wins).
- If it's a "how to build" answer, point at the matching reference in this skill
  and enforce `frappe-app-standards` (no core edits, Espresso, security).

### 7. Persist
Log durable, reusable findings to `references/learned-patterns.md` (Debugging,
API & ORM, Frontend, Version Compatibility) or `references/learned-patterns-ops.md`
(Build & Deployment, Permissions, Caching & Asset) — entry template there — and/or
`retain` to memory. Optionally save a report via the wiki.

## Tooling notes (faster + safer)

- **SQLite via `read`, not `sqlite3`**: query any `.sqlite`/`.db`/`.sqlite3` (OMP
  caches, tool output, exported datasets) read-only through `read` — no bash,
  paginated: `read '<db>.sqlite?q=SELECT ...'` (raw SELECT, ≤1000 rows),
  `read '<db>.sqlite:table'` (schema + sample rows),
  `read '<db>.sqlite:table:key'` (one row by PK), or
  `read '<db>.sqlite:table?where=...&order=...&limit=...'`. Opens DB readonly. The
  same tool reads archives (`.tar`/`.tgz`/`.zip`, incl. inner path), documents
  (PDF/docx/xlsx/pptx → text), and does JSON extraction via `?q=`/`/path`.
- **Isolation mode for trial edits**: when a sub-question needs experimental edits
  across apps ("does patching X fix Y?"), spawn the subagent with `isolated: true`.
  Cloning via filesystem-level snapshots allows each agent to work conflict-free and 
  return a `.patch` instead of mutating the tree. Requires a git repo; isolated agents 
  are torn down at completion. Read the patch and decide — don't blind-apply.
- **Parallel subagents for discovery**: dispatch read-only scout/librarian subagents 
  alongside other analysis tasks. Each subagent carries its own code/document search 
  capability and returns cited findings for synthesis.

## Guardrails
- Precedence on conflict: **installed source > official docs > web**.
- Never assert an API/hook/token you didn't verify in source or current docs.
- Custom apps only for edits; never edit core (`rule://frappe-app-standards`).
- Every deliverable ends with the sources it used.

## Sources

This file documents a research process for using this skill repo and the host
harness's own tools, not a Frappe API — the only claims that are independently
verifiable are its cross-references to sibling files, confirmed present in
this skill repo (paths relative to `frappeskills/`):

- `frappe-bench-operations/references/bench.md`, `frappe-bench-operations/references/bench-troubleshooting.md`
- `frappe-deep-research/references/learned-patterns.md` — has `## Debugging Patterns` (L16), `## API & ORM Patterns` (L27), `## Frontend Patterns` (L148), `## Version Compatibility` (L269)
- `frappe-deep-research/references/learned-patterns-ops.md` — has `## Build & Deployment` (L13), `## Permissions Patterns` (L259), `## Caching & Asset Patterns` (L272)
