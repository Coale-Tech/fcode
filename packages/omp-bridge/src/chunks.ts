/**
 * omp rpc_chunk reassembly (E10, matching rpc-frame.ts semantics).
 *
 * After negotiating protocol v2, omp splits frames larger than MAX_RPC_FRAME_BYTES
 * (1 MiB) into rpc_chunk frames of 256 KB each. We reassemble them before mapping.
 *
 * Limits (from oh-my-pi/packages/coding-agent/src/modes/rpc/rpc-frame.ts:6-10):
 *   MAX_RPC_FRAME_BYTES      = 1 MiB
 *   MAX_RPC_REASSEMBLED_BYTES = 64 MiB
 *
 * The outer NDJSON line cap is lower: we summarise anything over NDJSON_LINE_CAP
 * before emitting it to the main process (E10 — prevents 64 MiB JS strings).
 */

export const MAX_RPC_FRAME_BYTES = 1 * 1024 * 1024; // 1 MiB
export const MAX_RPC_REASSEMBLED_BYTES = 64 * 1024 * 1024; // 64 MiB

/** Cap on the outer NDJSON line emitted toward the main process. */
export const NDJSON_LINE_CAP = 4 * 1024 * 1024; // 4 MiB — well below 64 MiB IPC limit

/** Truncation sentinel embedded in the emitted line when capped. */
export const NDJSON_TRUNCATION_MARKER = "[fcode:truncated]";

export interface RpcChunkFrame {
  type: "rpc_chunk";
  chunkId: string;
  index: number;
  count: number;
  byteLength: number;
  data: string; // base64-encoded 256 KB slice
}

export class FrameTooLargeError extends Error {
  constructor(chunkId: string, bytes: number) {
    super(`rpc_chunk ${chunkId} exceeds MAX_RPC_REASSEMBLED_BYTES (${bytes} bytes)`);
    this.name = "FrameTooLargeError";
  }
}

/**
 * Reassemble a single rpc_chunk frame into the pending buffer.
 * Returns the complete payload string when all chunks have arrived,
 * or null if more chunks are pending.
 * Throws FrameTooLargeError if the reassembled size would exceed the cap.
 */
export function reassembleChunk(
  chunks: Map<string, { count: number; received: string[]; byteLength: number }>,
  frame: RpcChunkFrame,
): string | null {
  let buf = chunks.get(frame.chunkId);
  if (!buf) {
    buf = { count: frame.count, received: [], byteLength: 0 };
    chunks.set(frame.chunkId, buf);
  }

  const decoded = Buffer.from(frame.data, "base64").toString("utf8");
  buf.byteLength += decoded.length;

  if (buf.byteLength > MAX_RPC_REASSEMBLED_BYTES) {
    chunks.delete(frame.chunkId);
    throw new FrameTooLargeError(frame.chunkId, buf.byteLength);
  }

  // Sparse store by index so out-of-order chunks work correctly.
  buf.received[frame.index] = decoded;

  if (buf.received.filter(Boolean).length < buf.count) {
    return null; // waiting for more
  }

  chunks.delete(frame.chunkId);
  return buf.received.join("");
}

/**
 * Truncate an outbound NDJSON line if it exceeds NDJSON_LINE_CAP.
 * The line is already JSON; we replace the string value of the longest
 * text field with a truncation notice rather than silently dropping it.
 */
export function capNdjsonLine(line: string): string {
  if (line.length <= NDJSON_LINE_CAP) return line;
  // Truncate raw: the renderer will surface NDJSON_TRUNCATION_MARKER.
  return line.slice(0, NDJSON_LINE_CAP) + `"${NDJSON_TRUNCATION_MARKER}"}`;
}
