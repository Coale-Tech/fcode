/**
 * Fcode-owned tool approval mode. Persisted in `<dataDir>/approval-mode.json`.
 * Controls omp's `--approval-mode` flag on spawn.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolApprovalMode } from "@pi-desktop/shared";

const VALID_MODES: Record<ToolApprovalMode, true> = { "always-ask": true, write: true, yolo: true };

export function readApprovalMode(dataDir: string): ToolApprovalMode {
  try {
    const raw = JSON.parse(readFileSync(join(dataDir, "approval-mode.json"), "utf8")) as unknown;
    if (typeof raw === "string" && raw in VALID_MODES) {
      return raw as ToolApprovalMode;
    }
  } catch {
    // file absent or invalid — fall through to default
  }
  return "always-ask";
}

/** Trust boundary: only accept known mode values. */
export function validateApprovalMode(value: unknown): ToolApprovalMode {
  if (typeof value === "string" && value in VALID_MODES) {
    return value as ToolApprovalMode;
  }
  throw new Error(`invalid tool approval mode: ${String(value)}`);
}

export function writeApprovalMode(dataDir: string, mode: ToolApprovalMode): void {
  writeFileSync(join(dataDir, "approval-mode.json"), JSON.stringify(mode), "utf8");
}

/** Env var that the bridge process reads to set omp's approval mode. */
export function approvalModeEnv(mode: ToolApprovalMode): Record<string, string> {
  return { FCODE_TOOL_APPROVAL_MODE: mode };
}
