/**
 * Pure skill-content linter — no I/O, no side effects.
 * Shared by both the omp-bridge (agent side) and the Electron main process.
 *
 * Exact exported signature (REVIEW agent imports this from @pi-desktop/omp-bridge
 * which re-exports from here; desktop imports directly from @pi-desktop/shared):
 *
 *   export function lintSkillContent(content: string): { errors: string[]; warnings: string[] }
 *
 * Errors  = hard blocks: invalid frontmatter, oversize body, secrets, injection, invisible chars
 * Warnings = "lessons, not logs" guidance: incident-log shape, oversize body
 */

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Secret patterns — label only; matched text is NEVER echoed in messages.
 * Order matters: more-specific prefixes first to avoid double-firing on the same token.
 */
const SECRET_PATTERNS: [RegExp, string][] = [
  [/AKIA[0-9A-Z]{16}/, "AWS access key"],
  [/github_pat_[A-Za-z0-9_]{22,}/, "GitHub PAT"],
  [/gh[pousr]_[A-Za-z0-9_]{36,}/, "GitHub token"],
  [/sk-ant-[A-Za-z0-9_-]{20,}/, "Anthropic API key"],
  [/sk-[A-Za-z0-9_-]{20,}/, "API key (likely OpenAI)"],
  [/AIza[0-9A-Za-z_-]{35}/, "Google API key"],
  [/xox[baprs]-[0-9A-Za-z-]{10,}/, "Slack token"],
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, "PEM private key"],
  // JWT: three base64url segments, each at least 6 chars
  [/eyJ[A-Za-z0-9_-]{6,}\.eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/, "JWT token"],
  // Generic credential assignment: keyword = <20+ non-whitespace chars>
  [/(?:password|secret|token|api[_-]?key)\s*[:=]\s*\S{20,}/i, "credential assignment"],
];

const INJECT_RES: RegExp[] = [
  /ignore\s+(?:all\s+)?previous\s+instructions?/i,
  /disregard\s+(?:all\s+)?(?:previous\s+)?instructions?/i,
  /you\s+are\s+now\s+(?:a|an)\s+\w/i,
  /new\s+(?:system\s+)?prompt/i,
];

/** Zero-width spaces + bidi override controls — invisible Unicode. */
const INVISIBLE_RE = /[\u200B\u200C\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/;

/** Incident-log signals — one warning per type per file (deduplicated). */
const INCIDENT_DATE_RE = /^\s*(?:[-*#]\s+)?20\d\d-\d\d-\d\d/;
const ISSUE_REF_RE = /#\d{2,}|PR\s+\d+/;
const CHAT_QUOTE_RE = /user said|["']user\s*:/i;
const COMMIT_SHA_RE = /\b[0-9a-f]{40}\b/;

export function lintSkillContent(content: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines = content.split(/\r?\n/);

  // ── Frontmatter ──────────────────────────────────────────────────────────
  const fm = FRONTMATTER_RE.exec(content);
  if (!fm) {
    errors.push("line 1: missing YAML frontmatter (--- block with name and description required)");
  } else {
    const fmText = fm[1];
    const nameM = /^name:\s*(.+)$/m.exec(fmText);
    if (!nameM) {
      errors.push("frontmatter: missing 'name' field");
    } else {
      // strip optional surrounding quotes
      const name = nameM[1].trim().replace(/^['"]|['"]$/g, "");
      if (!NAME_RE.test(name)) {
        errors.push("frontmatter: 'name' must match /^[a-z0-9][a-z0-9-]{0,63}$/ (kebab-case, no uppercase)");
      }
    }
    const descM = /^description:\s*(.+)$/m.exec(fmText);
    if (!descM || !descM[1].trim()) {
      errors.push("frontmatter: missing non-empty 'description' field");
    }
  }

  // ── Size ─────────────────────────────────────────────────────────────────
  const byteLen = new TextEncoder().encode(content).length;
  if (byteLen > 64_000) {
    errors.push(`body is ${byteLen} bytes (hard cap 64 000)`);
  } else if (content.length > 24_000) {
    warnings.push(`body is ${content.length} chars (consider trimming to < 24 000)`);
  }

  // ── Secrets (per line, never echo matched text) ───────────────────────────
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const [re, label] of SECRET_PATTERNS) {
      if (re.test(line)) {
        errors.push(`line ${i + 1}: ${label} detected`);
      }
    }
  }

  // ── Prompt injection (per line) ───────────────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    for (const re of INJECT_RES) {
      if (re.test(lines[i])) {
        errors.push(`line ${i + 1}: prompt-injection phrase`);
        break; // one error per line
      }
    }
  }

  // ── Invisible Unicode (per line) ──────────────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    if (INVISIBLE_RE.test(lines[i])) {
      errors.push(`line ${i + 1}: invisible Unicode character`);
    }
  }

  // ── Incident-log shape warnings (deduplicated per file) ───────────────────
  let sawDate = false, sawRef = false, sawQuote = false, sawSha = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!sawDate && INCIDENT_DATE_RE.test(line)) {
      warnings.push(`line ${i + 1}: date-stamped entry — skills should be lessons, not incident logs`);
      sawDate = true;
    }
    if (!sawRef && ISSUE_REF_RE.test(line)) {
      warnings.push(`line ${i + 1}: PR/issue reference — remove incident specifics`);
      sawRef = true;
    }
    if (!sawQuote && CHAT_QUOTE_RE.test(line)) {
      warnings.push(`line ${i + 1}: chat transcript phrase — distil into a reusable lesson`);
      sawQuote = true;
    }
    if (!sawSha && COMMIT_SHA_RE.test(line)) {
      warnings.push(`line ${i + 1}: commit SHA — remove incident specifics`);
      sawSha = true;
    }
  }

  return { errors, warnings };
}
