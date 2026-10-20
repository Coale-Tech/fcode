/**
 * Harness tree validator for Fcode's omp-based agent surface.
 *
 * Ported from /tmp/h2/core/tree.py (validate, _check_skills, _check_script_refs,
 * autotrigger, diff_summary, diversity) and adapted to omp's real skill
 * discovery model.
 *
 * --- omp trigger-line finding ---
 * omp does NOT require explicit trigger lines in always-on text.  Every
 * discovered skill is listed automatically in the system prompt's <skills>
 * section (name + description) regardless of whether the skill name appears in
 * AGENTS.md or any other always-on file.  In compact mode (skills.listMode:
 * compact) skills that overflow the 6 000-char budget are listed in a trailing
 * note ("N more — load any via skill://<name>") and remain fully loadable via
 * skill://<name>; they are never silently dropped.  Therefore "never named in
 * always-on text" is NOT an error for omp.  autotriggerSkills() is implemented
 * per contract but is a safe no-op for omp: it always returns { tree, repaired: [] }.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** A harness tree: relative path → file text (no I/O). */
export type HarnessTree = Record<string, string>;

/**
 * Surface description for one agent framework.
 *
 * skillDir: directory containing <name>/SKILL.md entries.  '' means the tree
 * root (frappeskills convention: skills live at root, e.g. my-skill/SKILL.md).
 * alwaysOn: relative paths whose content is always prepended to every prompt.
 * alwaysOnMax: character cap for the combined always-on content (item 7).
 */
export interface HarnessSurface {
  /** Skill root relative to harness tree root.  '' = tree root. */
  skillDir: string;
  /** Relative paths of always-on context files (AGENTS.md, CLAUDE.md, …). */
  alwaysOn: string[];
  /** Hard character cap for combined always-on content (item 7). */
  alwaysOnMax: number;
}

/** Census returned by validateHarnessTree (matches h2 validate return shape). */
export interface HarnessCensus {
  alwaysOnChars: number;
  files: number;
  skills: number;
  scripts: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// FCODE_SURFACE constant
// Grounded in the omp source:
//   • Skills: <skillDir>/<name>/SKILL.md  (frappeskills uses '' = root)
//   • Always-on: project AGENTS.md and ~/.claude/CLAUDE.md
//     (omp loads them via loadStandaloneContextFiles and injects before the
//     main system prompt — they are the "always-on" layer in omp's world)
//   • alwaysOnMax default 6 000: a conservative starting point.
//     NOTE: omp's 6 000-char constant (skill-descriptions.ts COMPACT_MAX_CHARS)
//     caps the skills *description list*, NOT AGENTS.md.  Real Fcode AGENTS.md
//     is typically much larger.  Use surfaceForBase() when validating candidates
//     against a known base to avoid spuriously rejecting every candidate.
// ─────────────────────────────────────────────────────────────────────────────

export const FCODE_SURFACE: HarnessSurface = {
  skillDir: "",
  alwaysOn: ["AGENTS.md", "CLAUDE.md"],
  alwaysOnMax: 6_000,
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** Extract frontmatter values (description, name, enabled) from a SKILL.md. */
function parseFrontmatter(content: string): Record<string, string | boolean> {
  const m = FRONTMATTER_RE.exec(content);
  if (!m) return {};
  const block = m[1]!;
  const result: Record<string, string | boolean> = {};
  for (const line of block.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    if (val === "true") result[key] = true;
    else if (val === "false") result[key] = false;
    else result[key] = val;
  }
  return result;
}

/**
 * Collect skill names from a harness tree.
 * A skill is: <skillDir>/<name>/SKILL.md  (or <name>/SKILL.md when skillDir='').
 */
function skillNames(tree: HarnessTree, surface: HarnessSurface): string[] {
  const prefix = surface.skillDir ? surface.skillDir + "/" : "";
  // Match exactly: [prefix]<name>/SKILL.md  — no deeper nesting
  const seen = new Set<string>();
  for (const rel of Object.keys(tree)) {
    if (!rel.startsWith(prefix)) continue;
    const rest = rel.slice(prefix.length);
    // rest must be exactly <name>/SKILL.md
    const parts = rest.split("/");
    if (parts.length === 2 && parts[1] === "SKILL.md" && parts[0] && !parts[0].startsWith(".")) {
      seen.add(parts[0]);
    }
  }
  return [...seen].sort();
}

/**
 * Return all *.py paths referenced via `python3? <path>.py` (or just `python <path>.py`)
 * in a file's content.
 */
const SCRIPT_REF_RE = /\bpython3?\s+([\w./][^\s]*\.py)\b/g;

function scriptRefs(content: string): string[] {
  const refs: string[] = [];
  let m: RegExpExecArray | null;
  SCRIPT_REF_RE.lastIndex = 0;
  while ((m = SCRIPT_REF_RE.exec(content)) !== null) {
    refs.push(m[1]!);
  }
  return refs;
}

/** Combined text of all always-on files present in the tree. */
function alwaysOnText(tree: HarnessTree, surface: HarnessSurface): string {
  return surface.alwaysOn.map(p => tree[p] ?? "").join("\n\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill-level checks (ported from h2 _check_skills)
// ─────────────────────────────────────────────────────────────────────────────

function checkSkills(
  tree: HarnessTree,
  surface: HarnessSurface,
  errs: string[],
  lintSkillContent?: (content: string) => { errors: string[]; warnings: string[] },
): string[] {
  const names = skillNames(tree, surface);
  const prefix = surface.skillDir ? surface.skillDir + "/" : "";

  for (const name of names) {
    const rel = `${prefix}${name}/SKILL.md`;
    const content = tree[rel]!;
    const fm = parseFrontmatter(content.slice(0, 600));

    // omp silently drops skills without a description when requireDescription=true
    if (!fm["description"] || String(fm["description"]).trim() === "") {
      errs.push(
        `${rel} needs a \`description:\` in its frontmatter, ` +
          `or the skill is dropped SILENTLY at load`,
      );
    }

    // omp uses frontmatter `name` to OVERRIDE the directory name; if a `name` is
    // present and differs from the dir name, every reference to the directory name
    // stops matching.  (omp does NOT require name == dir; mismatch is a warning,
    // not a silent drop — but it breaks trigger lines if any exist.)
    if (fm["name"] && String(fm["name"]) !== name) {
      errs.push(
        `${rel} frontmatter \`name: ${String(fm["name"])}\` OVERRIDES the ` +
          `directory name at load, so every reference to \`${name}\` stops ` +
          `matching; drop the \`name:\` line or set it to \`name: ${name}\``,
      );
    }

    // Reuse lintSkillContent for per-file checks when provided (item 2 contract).
    if (lintSkillContent) {
      const result = lintSkillContent(content);
      for (const e of result.errors) {
        errs.push(`${rel}: ${e}`);
      }
    }
  }
  return names;
}

// ─────────────────────────────────────────────────────────────────────────────
// Script-reference checks (ported from h2 _check_script_refs)
// ─────────────────────────────────────────────────────────────────────────────

function checkScriptRefs(tree: HarnessTree, surface: HarnessSurface, errs: string[]): void {
  const have = new Set(Object.keys(tree).filter(r => r.endsWith(".py")));
  const prefix = surface.skillDir ? surface.skillDir + "/" : "";

  for (const [rel, content] of Object.entries(tree)) {
    const isSkill = rel.endsWith("/SKILL.md") && rel.startsWith(prefix);
    const isAlwaysOn = surface.alwaysOn.includes(rel);
    if (!isSkill && !isAlwaysOn) continue;

    for (const ref of scriptRefs(content)) {
      if (!have.has(ref)) {
        errs.push(`${rel} invokes \`${ref}\` but that file is not in the harness`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a harness tree.
 *
 * Returns ALL errors (never throws).  On an empty error list the tree is valid
 * and the census is meaningful.
 *
 * Checks performed (strength 2):
 *   1. always-on content over the alwaysOnMax cap
 *   2. skill missing `description:` frontmatter (silent drop in omp)
 *   3. skill `name:` frontmatter != directory name (reference mismatch)
 *   4. python scripts invoked but absent from the tree
 *   5. python scripts compiled via the injected compilePython hook
 *   6. per-file lint via lintSkillContent (injected; keeps shared pkg pure)
 *
 * NOT an error (omp-specific finding):
 *   • skill never named in always-on text — omp auto-lists every skill in the
 *     system-prompt <skills> section; trigger lines are not needed
 *
 * @param tree        Relative-path → content map (no I/O performed)
 * @param opts.surface          Defaults to FCODE_SURFACE
 * @param opts.compilePython    Optional: compile a .py file, return error or null
 * @param opts.lintSkillContent Optional: reuse lintSkillContent from skill-lint.ts
 */
export function validateHarnessTree(
  tree: HarnessTree,
  opts?: {
    surface?: HarnessSurface;
    compilePython?: (rel: string, src: string) => string | null;
    lintSkillContent?: (content: string) => { errors: string[]; warnings: string[] };
  },
): { ok: boolean; errors: string[]; census: HarnessCensus } {
  const surface = opts?.surface ?? FCODE_SURFACE;
  const errs: string[] = [];

  // ── 1. always-on size cap ────────────────────────────────────────────────
  const body = alwaysOnText(tree, surface);
  if (body.length > surface.alwaysOnMax) {
    errs.push(
      `always-on content is ${body.length} chars, over the ${surface.alwaysOnMax} cap; ` +
        `trim AGENTS.md / CLAUDE.md or reduce skill descriptions`,
    );
  }

  // ── 2–3. skill frontmatter ───────────────────────────────────────────────
  const skills = checkSkills(tree, surface, errs, opts?.lintSkillContent);

  // ── 4. missing script references ─────────────────────────────────────────
  checkScriptRefs(tree, surface, errs);

  // ── 5. python compile check ──────────────────────────────────────────────
  if (opts?.compilePython) {
    for (const [rel, src] of Object.entries(tree)) {
      if (!rel.endsWith(".py")) continue;
      const compileErr = opts.compilePython(rel, src);
      if (compileErr) {
        errs.push(`${rel} does not compile: ${compileErr}`);
      }
    }
  }

  const census: HarnessCensus = {
    alwaysOnChars: body.length,
    files: Object.keys(tree).length,
    skills: skills.length,
    scripts: Object.keys(tree).filter(r => r.endsWith(".py")).length,
  };

  return { ok: errs.length === 0, errors: errs, census };
}

/**
 * Give every skill a trigger line in always-on text.
 *
 * omp-finding: omp auto-lists every skill in <skills>; trigger lines are NOT
 * needed.  This function is a safe no-op: it returns the tree unchanged with
 * repaired=[].  Implemented per contract to allow callers to call it
 * unconditionally and benefit automatically if the surface changes.
 */
export function autotriggerSkills(
  tree: HarnessTree,
  _surface?: HarnessSurface,
): { tree: HarnessTree; repaired: string[] } {
  // ponytail: no-op for omp (see module-level comment); zero cost.
  return { tree, repaired: [] };
}

/**
 * Diff two harness trees.
 * Ported from h2 diff_summary; adapted to HarnessSurface for alwaysOnCharDelta.
 */
export function diffHarnessTrees(
  before: HarnessTree,
  after: HarnessTree,
  surface: HarnessSurface = FCODE_SURFACE,
): { added: string[]; removed: string[]; modified: string[]; alwaysOnCharDelta: number } {
  const beforeKeys = new Set(Object.keys(before));
  const afterKeys = new Set(Object.keys(after));

  const added = [...afterKeys].filter(k => !beforeKeys.has(k)).sort();
  const removed = [...beforeKeys].filter(k => !afterKeys.has(k)).sort();
  const modified = [...beforeKeys]
    .filter(k => afterKeys.has(k) && before[k] !== after[k])
    .sort();

  const alwaysOnCharDelta =
    alwaysOnText(after, surface).length - alwaysOnText(before, surface).length;

  return { added, removed, modified, alwaysOnCharDelta };
}

/**
 * Pairwise line-Jaccard diversity over a set of candidate trees.
 * Ported from h2 diversity().
 * 0 = all trees identical; 1 = all trees share no lines.
 */
export function harnessDiversity(trees: Record<string, HarnessTree>): {
  n: number;
  nDistinct: number;
  meanLineJaccard: number;
} {
  const names = Object.keys(trees).sort();
  if (names.length < 2) {
    return { n: names.length, nDistinct: names.length, meanLineJaccard: 1.0 };
  }

  // Build per-tree line sets: "rel:line_text" for non-empty lines.
  const lineSet = (t: HarnessTree): Set<string> => {
    const s = new Set<string>();
    for (const [rel, content] of Object.entries(t)) {
      for (const ln of content.split("\n")) {
        if (ln.trim()) s.add(`${rel}:${ln}`);
      }
    }
    return s;
  };

  const sets: Record<string, Set<string>> = {};
  for (const n of names) sets[n] = lineSet(trees[n]!);

  const sims: number[] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = sets[names[i]!]!;
      const b = sets[names[j]!]!;
      const intersection = [...a].filter(x => b.has(x)).length;
      const union = new Set([...a, ...b]).size;
      sims.push(union > 0 ? intersection / union : 1.0);
    }
  }

  // Count structurally distinct trees.
  const fingerprint = (t: HarnessTree) =>
    JSON.stringify(Object.keys(t).sort().map(k => [k, t[k]]));
  const nDistinct = new Set(names.map(n => fingerprint(trees[n]!))).size;

  const meanLineJaccard =
    sims.length > 0
      ? Math.round((sims.reduce((a, b) => a + b, 0) / sims.length) * 10_000) / 10_000
      : 1.0;

  return { n: names.length, nDistinct, meanLineJaccard };
}

// ─────────────────────────────────────────────────────────────────────────────
// surfaceForBase
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a HarnessSurface whose alwaysOnMax is scaled to the real project base.
 *
 * FCODE_SURFACE.alwaysOnMax = 6 000 was chosen conservatively and would reject
 * every real Fcode project (the combined AGENTS.md + CLAUDE.md is typically far
 * larger).  Use this function instead of bare FCODE_SURFACE when validating
 * candidate trees against a known base.
 *
 * The cap is `max(FCODE_SURFACE.alwaysOnMax, alwaysOnLength(base) + 2000)`:
 * the base's own length plus 2 000 chars of growth headroom.
 */
export function surfaceForBase(base: HarnessTree): HarnessSurface {
  const baseLen = alwaysOnText(base, FCODE_SURFACE).length;
  return {
    ...FCODE_SURFACE,
    alwaysOnMax: Math.max(FCODE_SURFACE.alwaysOnMax, baseLen + 2_000),
  };
}
