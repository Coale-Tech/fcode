/**
 * omp-bridge: live runtime state for the active omp process.
 *
 * Tracks the pending UI requests so that:
 * - extension_ui_request{cancel} clears the correct entry (E9)
 * - asktool.resolve finds the matching omp request id
 * - session dispose cancels every open card (DX3)
 */

export interface PendingUiRequest {
  /** omp's own request id */
  ompRequestId: string;
  /** method: "confirm" | "select" | "input" | "editor" | "notify" etc */
  method: string;
  /** session the request belongs to */
  sessionId: string;
  /** toolCallId synthesized from most-recent open tool_execution_start, or the ompRequestId */
  toolCallId: string;
  /** toolName synthesized similarly */
  toolName: string;
}

export interface OmpBridgeState {
  /** omp process pid, or undefined when not running */
  pid?: number;
  /** Whether the protocol v2 handshake succeeded (DX10 / E10 / E9) */
  protocolVersion: 1 | 2;
  /** bench root path set via sidecar.configure or active workspace selection */
  cwd: string;
  /** Pending UI requests keyed by omp request id */
  pendingRequests: Map<string, PendingUiRequest>;
  /** Per-session map of the most-recent open tool_execution_start toolCallId and toolName */
  openToolCalls: Map<string, { toolCallId: string; toolName: string }>;
  /** Whether the session is read-only due to v1 protocol downgrade (DX10) */
  readOnly: boolean;
  /** Partial rpc_chunk reassembly buffers keyed by chunkId (E10) */
  chunks: Map<string, ChunkBuffer>;
}

export interface ChunkBuffer {
  count: number;
  received: string[];
  byteLength: number;
}

export function createBridgeState(cwd: string): OmpBridgeState {
  return {
    protocolVersion: 1,
    cwd,
    pendingRequests: new Map(),
    openToolCalls: new Map(),
    readOnly: false,
    chunks: new Map(),
  };
}
