/**
 * Read-only shell commands omp may run without a permission prompt.
 *
 * Emitted into the omp overlay as ordered `bash.patterns` rules (bridge.ts) and
 * mirrored by the permission-card risk badge (ui-requests.ts). omp's glob: `*`
 * matches any run of characters in the whitespace-normalised command.
 *
 * The safety net is omp's: an allow-rule never matches a command containing
 * shell control (`; & | < > $ ( )`, backticks, newlines) and critical patterns
 * still prompt. `find` (-exec, -delete) and `rg` (--pre) are left out because
 * their own flags can run or delete files without any shell control.
 */
export const READ_ONLY_BASH_PATTERNS: readonly string[] = [
  "git status*",
  "git log*",
  "git diff*",
  "git show*",
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
  "file *",
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
  const command = cmd.trim().replace(/\s+/g, " ");
  if (!command || SHELL_CONTROL.test(command)) return false;
  return !matchesAny(PROMPT_BASH_PATTERNS, command) && matchesAny(READ_ONLY_BASH_PATTERNS, command);
}
