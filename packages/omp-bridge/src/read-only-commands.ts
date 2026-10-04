/**
 * Read-only shell commands omp may run without a permission prompt.
 *
 * Emitted into the omp overlay as ordered `bash.patterns` rules (bridge.ts) and
 * mirrored by the permission-card risk badge (ui-requests.ts). omp's glob: `*`
 * matches any run of characters in the whitespace-normalised command.
 *
 * The safety net is omp's: an allow-rule never matches a command containing
 * shell control (`; & | < > $ ( )`, backticks, newlines) and critical patterns
 * still prompt. `find` (-exec, -delete), `rg` (--pre) and `file` (-C writes
 * magic.mgc) are left out because their own flags write or run without any
 * shell control. Git subcommands are token-bounded so `git diff*` cannot
 * match `git difftool --extcmd=…`.
 */
export const READ_ONLY_BASH_PATTERNS: readonly string[] = [
  "git status",
  "git status *",
  "git log",
  "git log *",
  "git diff",
  "git diff *",
  "git show",
  "git show *",
  "git branch",
  "ls",
  "ls *",
  "pwd",
  "cat *",
  "head *",
  "tail *",
  "wc *",
  "grep *",
  "which *",
  "stat *",
];

/** Matched before the allow-rules: `--output` makes log/diff/show write a file. */
export const PROMPT_BASH_PATTERNS: readonly string[] = ["git *--output*"];

const SHELL_CONTROL = /[\n\r;&|<>`$()]/;

function matchesAny(patterns: readonly string[], command: string): boolean {
  return patterns.some((glob) =>
    new RegExp(`^${glob.split("*").map((part) => part.replace(/[\\^$+?.()|[\]{}]/g, "\\$&")).join(".*")}$`).test(command),
  );
}

/** Fcode-side mirror of the rules above; drives the risk badge only. */
export function isReadOnlyCommand(cmd: string): boolean {
  if (SHELL_CONTROL.test(cmd)) return false;
  const command = cmd.trim().replace(/\s+/g, " ");
  if (!command) return false;
  return !matchesAny(PROMPT_BASH_PATTERNS, command) && matchesAny(READ_ONLY_BASH_PATTERNS, command);
}
