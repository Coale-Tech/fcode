/**
 * harness-rpc.ts — JSON-RPC handler for `skills.harness.run`.
 *
 * Orchestrates a full Propose–Probe–Compose loop for a given task and stages
 * the non-base result as pending proposals (NEVER auto-applies).
 *
 * Reads defaults from `skills.harness.*` settings via getHarnessConfig().
 * Refuses when `skills.harness.enabled` is false.
 *
 * Registration in bridge.ts: add a case for `"skills.harness.run"` that calls
 * the handler returned by createHarnessRpcHandler().
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diffHarnessTrees, harnessDiversity, surfaceForBase } from "@pi-desktop/shared";
import { stageProposal } from "./skill-review.js";
import { selectBlind, type SelectResult } from "./harness-select.js";
import { Library, type Experience } from "./harness-library.js";
import { runParallel, runSequential, type ModeResult, type RunView } from "./harness-recursion.js";
import { makeOmpRollout, makeOmpProposer, makeOmpModelCall, readProjectHarness } from "./harness-omp.js";
import type { HarnessTree } from "@pi-desktop/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Params for the `skills.harness.run` JSON-RPC method. */
export interface HarnessRunParams {
  /** Full task description (the agent will receive this as its prompt). */
  task: string;
  /** Working directory for base rollouts (project root). */
  cwd: string;
  /** Number of parallel/sequential iterations.  Default from settings. */
  k?: number;
  /** Loop mode.  Default from settings. */
  mode?: "parallel" | "sequential";
  /** Domain for the library (e.g. "frappe-customization"). */
  domain?: string;
}

/** Result returned by `skills.harness.run`. */
export interface HarnessRunResult {
  /** All stage + rollout labels in execution order. */
  labels: string[];
  /** Blind selection outcome. */
  selection: {
    chosenLabel: string;
    chosenIsBase: boolean;
    why: string;
    fallback: boolean;
  };
  /** Total stage attempts (includes retries). */
  attempts: number;
  /** Proposal ids staged for user approval (empty when base selected). */
  stagedIds: string[];
  /**
   * Paths in the chosen tree that changed vs base but were NOT auto-staged:
   * AGENTS.md, CLAUDE.md, scripts, and removed paths.
   * AGENTS.md changes may be surfaced to the user in the result text.
   */
  unstagedEdits: string[];
  /** Pairwise diversity of the final candidates. */
  diversity: { n: number; nDistinct: number; meanLineJaccard: number };
  /** Non-fatal errors collected during the run. */
  errors: string[];
}

/** Config for the RPC handler — supplied from bridge main(). */
export interface HarnessRpcConfig {
  ompBinary: string;
  dataDir: string;
  /** Harness settings from getHarnessConfig(). */
  harnessSettings: {
    enabled: boolean;
    k: number;
    mode: "parallel" | "sequential";
    model: string;
  };
  log: (msg: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the async handler for `skills.harness.run`.
 * The bridge case calls: `handler(params).then(respond).catch(respondError)`.
 */
export function createHarnessRpcHandler(
  config: HarnessRpcConfig,
): (params: HarnessRunParams) => Promise<HarnessRunResult> {
  return async (params: HarnessRunParams): Promise<HarnessRunResult> => {
    const { enabled, k: defaultK, mode: defaultMode, model } = config.harnessSettings;

    if (!enabled) {
      throw new Error("skills.harness.enabled is false; set it to true to run probe loops");
    }

    const { task, cwd, k = defaultK, mode = defaultMode, domain = "general" } = params;
    if (!task?.trim()) throw new Error("task is required");
    const runConfig = { ompBinary: config.ompBinary, dataDir: config.dataDir, model, cwd };
    const workDir = mkdtempSync(join(tmpdir(), "fcode-harness-"));

    try {
      // ── 1. Base harness (read from the real project — not empty) ────────────
      const baseTree: HarnessTree = readProjectHarness(cwd);
      const surface = surfaceForBase(baseTree);
      const rolloutFn = makeOmpRollout({ ...runConfig, timeoutMs: 3 * 60_000 }, task);
      const proposerFn = makeOmpProposer({ ...runConfig, timeoutMs: 3 * 60_000 });
      const modelCall = makeOmpModelCall(runConfig);

      // ── 2. Roll k base rollouts ─────────────────────────────────────────────
      config.log(`[harness-rpc] rolling ${k} base rollout(s)…`);
      const baseLabel = "base";
      const baseRollouts: RunView[] = await Promise.all(
        Array.from({ length: k }, (_, i) => rolloutFn(baseTree, k === 1 ? baseLabel : `${baseLabel}${i}`)),
      );

      // ── 3. Library index ────────────────────────────────────────────────────
      const library = new Library(join(config.dataDir, "harness-library"), domain);
      const libIndex = library.exists() ? readFileSync(library.index, "utf8") : undefined;

      // ── 4. Run loop ─────────────────────────────────────────────────────────
      config.log(`[harness-rpc] running ${mode} loop, k=${k}…`);
      let modeResult: ModeResult;
      const loopOpts = { workDir, libraryIndex: libIndex, surface };
      if (mode === "parallel") {
        modeResult = await runParallel(task, task, k, baseTree, baseRollouts, proposerFn, rolloutFn, loopOpts);
      } else {
        modeResult = await runSequential(task, task, k, baseTree, baseRollouts, proposerFn, rolloutFn, loopOpts);
      }

      // ── 5. Blind selection (baseline-inclusive, Fcode adaptation) ──────────
      const pool: Record<string, HarnessTree> = { base: baseTree };
      for (const lbl of modeResult.finals) pool[lbl] = modeResult.trees[lbl] ?? {};

      const selection: SelectResult = await selectBlind({
        pool,
        baseLabel: "base",
        task,
        taskId: task.slice(0, 60),
        k,
        mode,
        callModel: modelCall,
      });
      config.log(`[harness-rpc] selected: ${selection.chosenLabel} (isBase=${String(selection.chosenIsBase)})`);

      // ── 6. Reflection (experience extraction) ──────────────────────────────
      let experience: Experience | null = null;
      if (!selection.chosenIsBase) {
        experience = await _extractExperience(
          task,
          selection,
          modeResult,
          modelCall,
          config.log,
        );
      }

      // ── 7. Library add ──────────────────────────────────────────────────────
      if (!selection.chosenIsBase && experience) {
        library.add(task.slice(0, 80), pool[selection.chosenLabel] ?? {}, {
          why: selection.why,
          label: selection.chosenLabel,
          experience,
        });
        config.log("[harness-rpc] experience recorded in library");
      }

      // ── 8. Diff-aware staging (never auto-apply) ───────────────────────────
      const stagedIds: string[] = [];
      const unstagedEdits: string[] = [];
      if (!selection.chosenIsBase) {
        const chosen = pool[selection.chosenLabel] ?? {};
        const diff = diffHarnessTrees(baseTree, chosen, surface);

        // Stage changed/added <name>/SKILL.md only; report everything else as unstagedEdits
        for (const rel of [...diff.added, ...diff.modified]) {
          if (rel.endsWith("/SKILL.md") && rel.split("/").length === 2) {
            const content = chosen[rel] ?? "";
            const name = rel.split("/")[0]!;
            // Extract description from frontmatter (omp silently drops skills without one)
            const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/m.exec(content.slice(0, 800));
            const descMatch = fmMatch ? /^description:\s*(.+)$/m.exec(fmMatch[1]) : null;
            const description = descMatch ? descMatch[1].trim() : `Harness adoption: ${name} (${selection.chosenLabel})`;
            const proposal = stageProposal(
              config.dataDir,
              { name: `harness-${name}`, description, body: content },
              config.log,
            );
            stagedIds.push(proposal.id);
          } else {
            unstagedEdits.push(rel);
          }
        }
        // Removed paths (including removed skills) are reported but not staged
        unstagedEdits.push(...diff.removed);

        config.log(
          `[harness-rpc] staged ${stagedIds.length} proposal(s); unstagedEdits: [${unstagedEdits.join(", ")}]`,
        );
      }

      const allLabels = modeResult.stages.map((s) => s.label);
      const totalAttempts = modeResult.stages.reduce((s, st) => s + st.attempts, 0);
      const divResult = harnessDiversity(Object.fromEntries(modeResult.finals.map((l) => [l, modeResult.trees[l] ?? {}])));

      return {
        labels: allLabels,
        selection: {
          chosenLabel: selection.chosenLabel,
          chosenIsBase: selection.chosenIsBase,
          why: selection.why,
          fallback: selection.fallback,
        },
        attempts: totalAttempts,
        stagedIds,
        unstagedEdits,
        diversity: divResult,
        errors: modeResult.errors,
      };
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reflection helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adapted from harness2 selection.py reflect_adoption / _distil.
 * Prompt asks for <edits> and <experience> blocks.
 * Returns null on parse failure (NO_ENTRY is valid).
 */
async function _extractExperience(
  task: string,
  selection: SelectResult,
  modeResult: ModeResult,
  callModel: (prompt: string) => Promise<string>,
  log: (msg: string) => void,
): Promise<Experience | null> {
  const stageSummary = modeResult.stages
    .map((s) => `- ${s.label} (${s.dim}): ${s.keptBase ? "KEEP_BASE" : "edited"} — ${s.notes.slice(0, 200)}`)
    .join("\n");

  const prompt = [
    `You are reading the record of one harness improvement round for the following task:\n\n${task}`,
    `# WHAT HAPPENED\n\nHarness "${selection.chosenLabel}" was selected. Selection reasoning:\n\n${selection.why}\n\nStage summaries:\n${stageSummary}`,
    `# WHAT EACH EDIT DID\n\nFor each component any candidate changed, write:\ncomponent / candidates / change / observed execution difference / verdict (helped|hurt|no observed effect|confounded).\nUse \`confounded\` when a candidate changed several things at once and no execution isolates one of them.`,
    `# THE ONE LESSON THAT TRANSFERS\n\nAt most one durable entry. \`cue\` = shape of situation; \`lesson\` = operation to apply; \`evidence\` = edit rows. Write NO_ENTRY if the record shows no concrete reusable contrast.`,
    `# OUTPUT FORMAT\n\n<edits>\n(edit rows)\n</edits>\n\n<experience>\ncue: ...\nlesson: ...\nevidence: ...\nconfidence: high|medium|low\n</experience>`,
  ].join("\n\n");

  let text = "";
  try {
    text = await callModel(prompt);
  } catch (e) {
    log(`[harness-rpc] reflection call failed: ${String(e)}`);
    return null;
  }

  if (text.includes("NO_ENTRY")) return null;

  const expMatch = /<experience>(.*?)<\/experience>/s.exec(text);
  if (!expMatch) return null;

  const exp: Partial<Experience> = {};
  for (const line of expMatch[1].trim().split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase() as keyof Experience;
    const val = line.slice(colon + 1).trim();
    if (key === "cue" || key === "lesson" || key === "evidence" || key === "confidence") {
      exp[key] = val;
    }
  }
  if (!exp.cue || !exp.lesson || !exp.evidence) return null;

  const editsMatch = /<edits>(.*?)<\/edits>/s.exec(text);
  if (editsMatch) exp.edits = editsMatch[1].trim();

  return exp as Experience;
}
