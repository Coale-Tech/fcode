/**
 * Skill review: periodically review the session transcript and save reusable
 * lessons as skills on the local `fcode/self-improve` branch.
 *
 * Design: after every N completed agent turns, spawn omp in auto-print mode
 * (prompt piped to stdin → text stdout) with a minimal overlay to run one
 * background completion. The JSON response is validated and written as
 * `SKILL.md` files committed to the frappeskills repo. Never pushes; never
 * touches the main omp session or its prompt cache.
 *
 * Feature defaults OFF (`skills.review.enabled = false`) — it costs tokens.
 */

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { git, SELF_IMPROVE_BRANCH } from "./skill-packs.js";
import { lintSkillContent } from "./skill-lint.js";

// frappeskills pack has skillsSubdir: "" so skills live at repo root.
const FRAPPESKILLS_NAME = "frappeskills";

/** Rolling transcript buffer size (entries, not turns). */
const MAX_TRANSCRIPT_ENTRIES = 40;

/** Hard timeout per review subprocess. */
const REVIEW_TIMEOUT_MS = 2 * 60_000;

/** Valid skill name: starts with a letter, lowercase alphanumeric + hyphens, ≤50 chars. */
const SKILL_NAME_RE = /^[a-z][a-z0-9-]{0,49}$/;

// ─────────────────────────────────────────────────────────────────────────────
// Public config
// ─────────────────────────────────────────────────────────────────────────────

export interface SkillReviewConfig {
  /** Path to the omp binary. */
  ompBinary: string;
  /** Fcode data directory (contains `skills/frappeskills`). */
  dataDir: string;
  /** Fire a review every this many completed agent turns. */
  intervalTurns: number;
  /** Approximate token cap on the transcript (tokens ≈ chars/4). */
  maxInputTokens: number;
  /** Model id for the review subprocess; empty = omp's own default. */
  model: string;
  /** Logging sink. */
  log: (msg: string) => void;
  /**
   * Override the review runner for unit tests; avoids spawning omp.
   * When set, replaces `runReview` entirely.
   */
  _runReview?: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

/** One entry in the rolling session transcript. */
export interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
}

interface ParsedSkill {
  name: string;
  description: string;
  body: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (exported for unit tests)
// ─────────────────────────────────────────────────────────────────────────────

/** Build a compact transcript string, keeping the most recent content within maxChars. */
export function buildTranscriptText(entries: TranscriptEntry[], maxChars: number): string {
  const parts = entries.map((e) => `${e.role.toUpperCase()}: ${e.text.slice(0, 3000)}`);
  const full = parts.join("\n\n");
  if (full.length <= maxChars) return full;
  // Truncate from the start to keep the most recent content.
  const cut = full.slice(full.length - maxChars);
  const nl = cut.indexOf("\n");
  return "…(truncated)\n" + (nl !== -1 ? cut.slice(nl + 1) : cut);
}

/** Extract the first `{…}` JSON object from potentially-noisy stdout. */
export function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

/**
 * Parse and validate the model's structured JSON response.
 * Throws on malformed JSON or invalid skill shapes; returns empty array for `{"skills":[]}`.
 */
export function parseSkillsJson(raw: string): ParsedSkill[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("response is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("expected a JSON object at the top level");
  }
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.skills)) throw new Error('missing "skills" array');
  return (obj.skills as unknown[]).map((s, i) => {
    if (!s || typeof s !== "object" || Array.isArray(s)) {
      throw new Error(`skills[${i}] is not an object`);
    }
    const sk = s as Record<string, unknown>;
    const name = String(sk.name ?? "").trim();
    if (!SKILL_NAME_RE.test(name)) {
      throw new Error(`skills[${i}].name "${name}" is invalid (must match ${String(SKILL_NAME_RE)})`);
    }
    const description = String(sk.description ?? "").trim();
    if (!description) throw new Error(`skills[${i}].description is empty`);
    const body = String(sk.body ?? "").trim();
    if (!body) throw new Error(`skills[${i}].body is empty`);
    return { name, description, body };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Read existing skill names+descriptions from the frappeskills repo. */
function readExistingSkills(dataDir: string): Array<{ name: string; description: string }> {
  const repoDir = join(dataDir, "skills", FRAPPESKILLS_NAME);
  if (!existsSync(repoDir)) return [];
  try {
    return readdirSync(repoDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && SKILL_NAME_RE.test(d.name))
      .flatMap((d) => {
        const skillFile = join(repoDir, d.name, "SKILL.md");
        if (!existsSync(skillFile)) return [];
        const content = readFileSync(skillFile, "utf8");
        const m = content.match(/^---[\s\S]*?description:\s*(.+?)[\r\n]/m);
        return [{ name: d.name, description: (m?.[1] ?? "").trim() }];
      });
  } catch {
    return [];
  }
}

/** Build the user message sent to omp for the review. */
function buildReviewPrompt(
  transcript: string,
  existing: Array<{ name: string; description: string }>,
): string {
  const existingList =
    existing.length > 0
      ? existing.map((s) => `- ${s.name}: ${s.description}`).join("\n")
      : "(none yet)";
  return [
    "You are a skill curator for a Frappe coding assistant.",
    "Review the following conversation transcript and identify reusable procedural lessons worth saving as skills.",
    "",
    "Rules:",
    "- Save ONLY reusable, non-trivial procedural knowledge (patterns, gotchas, workflows, naming conventions)",
    "- No incident details, PR numbers, dates, ticket IDs, user names, or secrets",
    "- Prefer adding a section to an EXISTING skill over creating a near-duplicate",
    "- Return an empty skills array if nothing new or reusable was covered",
    "",
    "Existing self-improvement skills (prefer adding to these rather than creating new ones):",
    existingList,
    "",
    "Conversation transcript (oldest first):",
    transcript,
    "",
    'Return ONLY valid JSON, no prose, no code fences, no explanation:',
    '{"skills":[{"name":"kebab-case-name","description":"one sentence","body":"# Title\\n\\nContent..."}]}',
    "",
    "Skill body: standalone Frappe skill guide, 200–2000 words, markdown.",
    "Empty list is correct when nothing reusable was covered.",
  ].join("\n");
}

/** CLI args for the review run: tool-less, sessionless, no memory, cheap model unless one is set. */
export function reviewArgs(model: string, overlayPath: string): string[] {
  return [
    "-p",
    "--no-session",
    "--no-tools",
    "--no-skills",
    "--no-rules",
    "--no-extensions",
    "--no-title",
    "--no-lsp",
    "--config",
    overlayPath,
    "--model",
    model || "@smol",
  ];
}

/** Spawn `omp -p` with the prompt on stdin and return its stdout. */
function runOmpCompletion(
  ompBinary: string,
  args: string[],
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const child = spawn(ompBinary, args, {
    env: { ...process.env } as NodeJS.ProcessEnv,
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
  });

  let stdout = "";
  child.stdout?.on("data", (d: Buffer) => {
    stdout += d.toString("utf8");
  });
  // Swallow stderr — startup messages, model info, etc.
  child.stderr?.on("data", () => undefined);

  const timer = setTimeout(() => {
    child.kill("SIGTERM");
    reject(new Error("review subprocess timed out"));
  }, timeoutMs);

  child.on("error", (err) => {
    clearTimeout(timer);
    reject(err);
  });
  child.on("close", (code) => {
    clearTimeout(timer);
    if (stdout.trim()) {
      resolve(stdout);
    } else {
      reject(new Error(`review subprocess exited ${String(code)} with no output`));
    }
  });

  // Write prompt to omp's stdin then close so it reads it as the initial message.
  child.stdin?.write(prompt, "utf8");
  child.stdin?.end();

  return promise;
}

/** Write one skill file and commit it on the self-improve branch. Exported for tests. */
export async function writeAndCommitSkill(
  dataDir: string,
  skill: ParsedSkill,
  log: (msg: string) => void,
): Promise<void> {
  const repoDir = join(dataDir, "skills", FRAPPESKILLS_NAME);
  if (!existsSync(join(repoDir, ".git"))) {
    log(`skill-review: frappeskills not cloned, skipping "${skill.name}"`);
    return;
  }

  // Compose the full SKILL.md content with frontmatter.
  const content = `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.body}\n`;

  const { errors, warnings } = lintSkillContent(content);
  if (errors.length > 0) {
    log(`skill-review: "${skill.name}" lint errors: ${errors.join("; ")}`);
    return;
  }
  if (warnings.length > 0) {
    log(`skill-review: "${skill.name}" lint warnings: ${warnings.join("; ")}`);
  }

  const skillDir = join(repoDir, skill.name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), content, "utf8");

  const addResult = await git(repoDir, ["add", join(skill.name, "SKILL.md")]);
  if (!addResult.ok) {
    log(`skill-review: git add failed for "${skill.name}": ${addResult.out}`);
    return;
  }
  const commitResult = await git(repoDir, ["commit", "-m", `Fcode: review — ${skill.name}`]);
  if (!commitResult.ok) {
    // Might be "nothing to commit" if the skill already exists and is identical.
    log(`skill-review: git commit skipped/failed for "${skill.name}": ${commitResult.out}`);
    return;
  }
  log(`skill-review: committed skill "${skill.name}" on ${SELF_IMPROVE_BRANCH}`);
}

/** Run one full review pass (background). */
async function runReview(config: SkillReviewConfig, snapshot: TranscriptEntry[]): Promise<void> {
  const maxChars = Math.max(config.maxInputTokens, 1) * 4;
  const transcript = buildTranscriptText(snapshot, maxChars);
  const existing = readExistingSkills(config.dataDir);
  const prompt = buildReviewPrompt(transcript, existing);

  // No memory backend: the review sees only the transcript, and skips the memory injection tokens.
  const overlay = join(config.dataDir, "skill-review-overlay.yml");
  writeFileSync(overlay, "memory:\n  backend: off\n", "utf8");
  const stdout = await runOmpCompletion(config.ompBinary, reviewArgs(config.model, overlay), prompt, REVIEW_TIMEOUT_MS);
  const jsonText = extractJson(stdout);
  if (!jsonText) {
    config.log("skill-review: no JSON found in model response");
    return;
  }
  const skills = parseSkillsJson(jsonText);
  if (skills.length === 0) {
    config.log("skill-review: model found no skills to save");
    return;
  }
  for (const skill of skills) {
    await writeAndCommitSkill(config.dataDir, skill, config.log);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SkillReviewTrigger — public class
// ─────────────────────────────────────────────────────────────────────────────

interface SessionState {
  turnCount: number;
  transcript: TranscriptEntry[];
  reviewInFlight: boolean;
}

/**
 * Maintains per-session turn counts and transcript buffers.
 * Call `appendTurn` for each user/assistant exchange and `onAgentEnd` after
 * each completed top-level agent turn. Reviews run fire-and-forget in the
 * background; errors are swallowed and logged via `config.log`.
 */
export class SkillReviewTrigger {
  readonly #config: SkillReviewConfig;
  readonly #sessions = new Map<string, SessionState>();

  constructor(config: SkillReviewConfig) {
    this.#config = config;
  }

  #state(sessionId: string): SessionState {
    let s = this.#sessions.get(sessionId);
    if (!s) {
      s = { turnCount: 0, transcript: [], reviewInFlight: false };
      this.#sessions.set(sessionId, s);
    }
    return s;
  }

  /** Record a user or assistant message in the session transcript buffer. */
  appendTurn(sessionId: string, role: "user" | "assistant", text: string): void {
    if (!text.trim()) return;
    const state = this.#state(sessionId);
    state.transcript.push({ role, text });
    // Rolling window: keep only the most recent entries.
    if (state.transcript.length > MAX_TRANSCRIPT_ENTRIES) {
      state.transcript.splice(0, state.transcript.length - MAX_TRANSCRIPT_ENTRIES);
    }
  }

  /**
   * Call after each completed top-level agent turn.
   * Returns `true` if a background review was started.
   * Never throws — errors are logged via `config.log`.
   */
  onAgentEnd(sessionId: string): boolean {
    const interval = Math.max(this.#config.intervalTurns, 1);
    const state = this.#state(sessionId);
    state.turnCount++;

    if (state.reviewInFlight || state.turnCount % interval !== 0) {
      return false;
    }

    const snapshot = [...state.transcript];
    state.reviewInFlight = true;

    void (this.#config._runReview ?? (() => runReview(this.#config, snapshot)))()
      .catch((e: unknown) => {
        this.#config.log(`skill-review: error: ${String((e as Error)?.message ?? e)}`);
      })
      .finally(() => {
        const s = this.#sessions.get(sessionId);
        if (s) s.reviewInFlight = false;
      });

    return true;
  }

  /** Remove session state on dispose to avoid memory leaks. */
  disposeSession(sessionId: string): void {
    this.#sessions.delete(sessionId);
  }
}
