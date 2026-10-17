/**
 * Sidebar session glyph (D design `.d-session-icon`): a coarse kind read from
 * the session title's leading verb, so a list scans by what each session did.
 */
export type SessionKind = "chat" | "code" | "edit" | "git" | "tool";

const KIND_RULES: ReadonlyArray<readonly [SessionKind, RegExp]> = [
  ["git", /\b(?:pr|pull request)\b|#\d+/i],
  ["tool", /^(?:set ?up|install|configure|deploy)\b/i],
  ["code", /^fix\b|\brefactor$/i],
  ["edit", /^(?:migrate|refactor|edit|rename|rewrite)\b/i],
];

export function sessionKind(title: string | undefined): SessionKind {
  const text = (title ?? "").trim();
  for (const [kind, pattern] of KIND_RULES) {
    if (pattern.test(text)) return kind;
  }
  return "chat";
}
