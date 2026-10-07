---
name: fcode-skill-improve
description: "Use when you learned a durable, reusable Frappe/ERPNext lesson, or a frappe-* skill was wrong or missing something. Records it in the local frappeskills clone; never pushes without user approval."
---

# Improve the Frappe skills

The Coale-Tech `frappe-*` skills are a git clone at `$FCODE_DATA_DIR/skills/frappeskills`
(read it with `echo $FCODE_DATA_DIR`). It is always on branch `fcode/self-improve`.
Fcode fast-forwards it from upstream on every launch and keeps your commits on top.

## When
Only for lessons that will pay off again: a verified gotcha, a wrong claim in a skill,
a missing step you had to discover. Not for one-off task details, secrets, or client data.

## How
1. Verify the lesson against installed source first. Do not record guesses.
2. Edit the one skill (or its `references/` file) that owns the topic. Keep it short;
   fix a wrong line in place rather than appending a near-duplicate.
3. `git -C "$FCODE_DATA_DIR/skills/frappeskills" add -A && git -C "$FCODE_DATA_DIR/skills/frappeskills" commit -m "<skill>: <lesson>"`
4. Tell the user what you changed, in one line. Stop.

## Publishing (only when the user approves)
```
cd "$FCODE_DATA_DIR/skills/frappeskills"
git push -u origin fcode/self-improve
gh pr create --repo Coale-Tech/frappeskills --base main --head fcode/self-improve \
  --title "<summary>" --body "<lessons, one per commit>"
```
Never push to `main`. Never push without an explicit yes in this conversation.
After the PR merges, `git reset --hard origin/HEAD` on the branch is the user's call, not yours.
