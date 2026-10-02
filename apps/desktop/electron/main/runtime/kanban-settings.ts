/** Kanban board settings — simple JSON file in dataDir. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type KanbanSettings = {
  enabled: boolean;
  maxInProgress: number;
  maxRuntimeSeconds: number;
  /** Max agent-created cards per chat session. */
  maxAgentCardsPerSession: number;
  /** Max card spawns per calendar day. */
  maxDailySpawns: number;
};

const SETTINGS_FILE = "kanban-settings.json";
const DEFAULTS: KanbanSettings = {
  enabled: false,
  maxInProgress: 2,
  maxRuntimeSeconds: 1800,
  maxAgentCardsPerSession: 20,
  maxDailySpawns: 20,
};

export function readKanbanSettings(dataDir: string): KanbanSettings {
  try {
    const raw = readFileSync(join(dataDir, SETTINGS_FILE), "utf8");
    const parsed = JSON.parse(raw) as Partial<KanbanSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeKanbanSettings(dataDir: string, settings: KanbanSettings): void {
  writeFileSync(join(dataDir, SETTINGS_FILE), JSON.stringify(settings, null, 2), "utf8");
}

export function validateKanbanSettings(input: unknown): KanbanSettings {
  const s = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    enabled: typeof s.enabled === "boolean" ? s.enabled : DEFAULTS.enabled,
    maxInProgress: Number.isInteger(s.maxInProgress) && (s.maxInProgress as number) > 0
      ? (s.maxInProgress as number) : DEFAULTS.maxInProgress,
    maxRuntimeSeconds: Number.isInteger(s.maxRuntimeSeconds) && (s.maxRuntimeSeconds as number) > 0
      ? (s.maxRuntimeSeconds as number) : DEFAULTS.maxRuntimeSeconds,
    maxAgentCardsPerSession: Number.isInteger(s.maxAgentCardsPerSession) && (s.maxAgentCardsPerSession as number) > 0
      ? (s.maxAgentCardsPerSession as number) : DEFAULTS.maxAgentCardsPerSession,
    maxDailySpawns: Number.isInteger(s.maxDailySpawns) && (s.maxDailySpawns as number) > 0
      ? (s.maxDailySpawns as number) : DEFAULTS.maxDailySpawns,
  };
}
