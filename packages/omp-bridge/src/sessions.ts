/**
 * omp-bridge: session id ↔ omp session directory map.
 *
 * Persisted to <dataDir>/omp-sessions.json so a restart re-attaches with
 * {type:"open_session"} instead of losing history (E14: corrupt map is
 * treated as empty, and open_session failure falls back to a new session).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface SessionEntry {
  sessionDir: string;
  projectPath: string;
  /** Model id, used to derive supportsVision (E19). */
  modelId?: string;
  /** Input modalities declared by the model at start (E19). */
  inputModalities?: string[];
}

export type SessionMap = Record<string, SessionEntry>;

export class SessionStore {
  private map: SessionMap = {};
  private path: string;

  constructor(dataDir: string) {
    this.path = join(dataDir, "omp-sessions.json");
    this.load();
  }

  private load(): void {
    try {
      const raw = readFileSync(this.path, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        this.map = parsed as SessionMap;
      }
      // invalid shape → treated as empty (E14)
    } catch {
      // file missing or corrupt → empty (E14)
      this.map = {};
    }
  }

  get(sessionId: string): SessionEntry | undefined {
    return this.map[sessionId];
  }

  set(sessionId: string, entry: SessionEntry): void {
    this.map[sessionId] = entry;
    this.save();
  }

  delete(sessionId: string): void {
    delete this.map[sessionId];
    this.save();
  }

  /** Replace entire map (E14: on open_session failure, rewrite map). */
  rewrite(newMap: SessionMap): void {
    this.map = newMap;
    this.save();
  }

  private save(): void {
    try {
      writeFileSync(this.path, JSON.stringify(this.map, null, 2), "utf8");
    } catch {
      // non-fatal: next start will just start fresh sessions
    }
  }
}
