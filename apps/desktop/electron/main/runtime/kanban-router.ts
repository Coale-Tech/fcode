/**
 * Kanban router — picks the omp agent a card should be delegated to.
 * Pure: keyword overlap between the card and each agent's name/description,
 * scaled by that agent's recorded success rate (see kanban-stats). No embeddings:
 * ruflo's own "learned routing" is keyword patterns plus a confidence nudge, so
 * this is the same thing — with the difference that the result is actually acted on.
 */
import { type AgentOutcome, successPrior } from "@pi-desktop/shared";

export type RoutableAgent = { name: string; description: string; shadowed?: boolean };

/** Common words that carry no routing signal. */
const STOPWORDS: Record<string, true> = Object.fromEntries(
  (
    "the and for with from into this that when then should must need please make add fix use run new " +
    "file code task your you are was were have has will can"
  )
    .split(" ")
    .map((word) => [word, true]),
);

/** A name hit is a strong signal; description hits are capped so a wordy agent cannot out-score one. */
const NAME_WEIGHT = 3;
const DESCRIPTION_CAP = 6;
/** Below this a card is left to the generic worker (one name hit, or three description hits). */
const MIN_SCORE = 3;

/** Lowercase word set (≥3 chars, splits on punctuation) minus stopwords. */
function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of text.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []) {
    if (!Object.hasOwn(STOPWORDS, word)) out.add(word);
  }
  return out;
}

export function pickAgent(
  task: { title: string; body: string },
  agents: readonly RoutableAgent[],
  outcomes: Map<string, AgentOutcome>,
): string | undefined {
  const card = tokens(`${task.title} ${task.body}`);
  if (card.size === 0) return undefined;

  const scored: { name: string; raw: number; final: number }[] = [];
  for (const agent of agents) {
    // `task` is what a worker's root agent already is; a shadowed duplicate is not the one omp would run.
    if (agent.shadowed || agent.name === "task") continue;
    let nameHits = 0;
    for (const word of tokens(agent.name)) if (card.has(word)) nameHits += 1;
    let descriptionHits = 0;
    for (const word of tokens(agent.description)) if (card.has(word)) descriptionHits += 1;
    const raw = NAME_WEIGHT * nameHits + Math.min(DESCRIPTION_CAP, descriptionHits);
    scored.push({ name: agent.name, raw, final: raw * successPrior(outcomes.get(agent.name)) });
  }

  // Highest final score; ties → higher raw score, then name, so the result is deterministic.
  scored.sort((a, b) => b.final - a.final || b.raw - a.raw || (a.name < b.name ? -1 : 1));
  const best = scored[0];
  return best && best.final >= MIN_SCORE ? best.name : undefined;
}
