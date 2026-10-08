---
name: frappe-deep-research
description: Investigate how Frappe actually behaves by tracing installed framework source, and record confirmed discoveries as reusable patterns. Use for "how does Frappe do X", "trace this", "is it possible", or when documentation and behaviour disagree.
---

# Frappe Deep Research

Answer framework questions from installed source, with citations — then keep
what you learned.

## When to use

- "How does Frappe actually do X?"
- Behaviour contradicts the documentation or a reference file
- Deciding whether something is possible before designing around it
- Comparing two framework mechanisms
- Recording a hard-won discovery for future sessions

## Inputs required

- The precise question, in behavioural terms
- The installed app paths to search (`apps/frappe`, `apps/erpnext`, `apps/hrms`)
- Versions in play (from [`frappe-project-triage`](../frappe-project-triage/SKILL.md))

## Procedure

### 0) Establish the precedence order

**Installed source > official docs > everything else.** A blog post, a model's
memory, or a reference file never outranks the code running on the site.

### 1) Locate the mechanism

```bash
grep -rn "def enqueue" apps/frappe/frappe/utils/background_jobs.py
grep -rln "publish_realtime" apps/frappe/frappe
```

Search by behaviour, then read whole functions — not snippets.

### 2) Trace the call path

Follow from the entry point (HTTP handler, hook dispatch, CLI command) to the
implementation. Record each hop with `file:line` so the answer is checkable.

### 3) Confirm empirically

```bash
bench --site <site> console
```

Run the smallest expression that proves the behaviour. A source reading that was
never executed is a hypothesis.

### 4) Answer with citations

State the behaviour, then the evidence: file, function, and the line that
decides it. Note version sensitivity explicitly.

### 5) Capture the discovery

If the answer was non-obvious and another agent would hit the same wall, append
an entry to the file matching its category:

```
### [category] Short title
- **Discovered**: YYYY-MM-DD
- **Confidence**: low|medium|high
- **Uses**: 0
- **Context**: what was being built or debugged
- **Pattern**: the finding
- **Evidence**: error message, source file, or test that confirmed it
```

| Category | File |
|---|---|
| Debugging, API & ORM, Frontend, Version Compatibility | [references/learned-patterns.md](references/learned-patterns.md) |
| Build & Deployment, Permissions, Caching & Asset | [references/learned-patterns-ops.md](references/learned-patterns-ops.md) |

Split by size, not meaning — if either file nears the 600-line reference cap,
split its categories further and update this table.

### 6) Promote when proven

When an entry reaches `confidence: high` with two uses (or the user confirms it),
move it into the owning skill's reference, search for similar content first,
update in place if found, and leave a
`<!-- promoted from learned-patterns YYYY-MM-DD -->` marker. Prune
low-confidence entries older than 90 days with zero uses.

## Verification

- [ ] Every claim cites `file:line` in installed source
- [ ] The behaviour was executed, not only read
- [ ] Version sensitivity stated where it exists
- [ ] Contradicting reference files were corrected, not left stale
- [ ] Worthwhile discoveries recorded in the matching `learned-patterns*.md` file

## Failure modes / debugging

- **Answer contradicts observed behaviour**: you read a different version or a superseded code path
- **Grep finds nothing**: the mechanism is named differently — search by the error string or the DocType name
- **Behaviour differs per site**: site config, installed apps, or a monkey-patch in a custom app
- **A reference file disagrees with source**: the reference is wrong — fix it and note it
- **Answer is unreproducible**: it was inferred, not executed

## Escalation

- Finding belongs in a topic reference → the owning skill via [`frappe-router`](../frappe-router/SKILL.md)
- Systemic problems in an app → [`frappe-app-audit`](../frappe-app-audit/SKILL.md)
- Version-delta questions → [`frappe-project-triage`](../frappe-project-triage/SKILL.md)

## References

- [references/deep-research.md](references/deep-research.md) - Research pipeline and source precedence
- [references/learned-patterns.md](references/learned-patterns.md) - Discovered patterns log: Debugging, API & ORM, Frontend, Version Compatibility
- [references/learned-patterns-ops.md](references/learned-patterns-ops.md) - Discovered patterns log: Build & Deployment, Permissions, Caching & Asset

## Guardrails

- **Installed source is the authority**: it outranks docs, memory and these skills
- **Cite `file:line`**: an uncited claim is a guess
- **Execute before asserting**: reading is a hypothesis
- **Read whole functions**, not fragments — early returns change everything
- **Fix the reference that was wrong** instead of leaving both versions alive
- **Record sparingly**: one strong reusable lesson beats several vague ones
- **Genericize before recording**: no client/bench/app names, hostnames, or machine topology in `learned-patterns*.md` entries — write "a custom app" or "a site", not the real name

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| Answering from memory | Framework changed | Read installed source |
| Citing documentation over code | Docs lag releases | Source wins |
| Reading a snippet | Missed guard clause | Read the whole function |
| Skipping empirical confirmation | Plausible but wrong | Run it in console |
| Leaving a wrong reference in place | Next agent repeats the error | Correct it |
| Logging every minor fact | Noise buries signal | Record only reusable lessons |
