/** Chat author identity derived from the user's display or OS full name. */
export type UserIdentity = { chatUserName: string; userInitials: string };

export function userIdentityFromName(name: string | null | undefined): UserIdentity | null {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const userInitials =
    words.length >= 2
      ? ((words[0]?.[0] ?? "") + (words[words.length - 1]?.[0] ?? "")).toUpperCase()
      : (words[0]?.slice(0, 2) ?? "").toUpperCase();
  return { chatUserName: words.join(" "), userInitials };
}
