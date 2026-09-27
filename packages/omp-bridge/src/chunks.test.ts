/**
 * Tests for rpc_chunk reassembly and NDJSON line cap (E10).
 * Tasks: E10 — chunk reassembly pure functions.
 */
import { describe, expect, it } from "vitest";
import {
  capNdjsonLine,
  FrameTooLargeError,
  MAX_RPC_REASSEMBLED_BYTES,
  NDJSON_LINE_CAP,
  NDJSON_TRUNCATION_MARKER,
  reassembleChunk,
} from "./chunks.js";

function makeChunks() {
  return new Map<string, { count: number; received: string[]; byteLength: number }>();
}

describe("reassembleChunk", () => {
  it("returns null until all chunks arrive", () => {
    const buf = makeChunks();
    const result = reassembleChunk(buf, {
      type: "rpc_chunk",
      chunkId: "c1",
      index: 0,
      count: 2,
      byteLength: 5,
      data: Buffer.from("hello").toString("base64"),
    });
    expect(result).toBeNull();
    expect(buf.has("c1")).toBe(true);
  });

  it("returns complete payload when all chunks have arrived (in order)", () => {
    const buf = makeChunks();
    reassembleChunk(buf, {
      type: "rpc_chunk",
      chunkId: "c2",
      index: 0,
      count: 2,
      byteLength: 5,
      data: Buffer.from("hello").toString("base64"),
    });
    const result = reassembleChunk(buf, {
      type: "rpc_chunk",
      chunkId: "c2",
      index: 1,
      count: 2,
      byteLength: 6,
      data: Buffer.from(" world").toString("base64"),
    });
    expect(result).toBe("hello world");
    expect(buf.has("c2")).toBe(false); // cleared after reassembly
  });

  it("handles out-of-order chunk arrival", () => {
    const buf = makeChunks();
    // index 1 arrives first
    reassembleChunk(buf, {
      type: "rpc_chunk",
      chunkId: "c3",
      index: 1,
      count: 2,
      byteLength: 5,
      data: Buffer.from("world").toString("base64"),
    });
    const result = reassembleChunk(buf, {
      type: "rpc_chunk",
      chunkId: "c3",
      index: 0,
      count: 2,
      byteLength: 5,
      data: Buffer.from("hello").toString("base64"),
    });
    expect(result).toBe("helloworld");
    expect(buf.has("c3")).toBe(false);
  });

  it("throws FrameTooLargeError when reassembled size exceeds the cap", () => {
    const buf = makeChunks();
    // Prime the buffer at exactly the cap so adding 1 more byte tips it over.
    buf.set("big", { count: 2, received: [], byteLength: MAX_RPC_REASSEMBLED_BYTES });

    expect(() =>
      reassembleChunk(buf, {
        type: "rpc_chunk",
        chunkId: "big",
        index: 1,
        count: 2,
        byteLength: 1,
        data: Buffer.from("x").toString("base64"),
      }),
    ).toThrow(FrameTooLargeError);
    expect(buf.has("big")).toBe(false); // cleared on error
  });
});

describe("capNdjsonLine", () => {
  it("passes through a line within the cap", () => {
    const line = '{"type":"message","text":"hi"}';
    expect(capNdjsonLine(line)).toBe(line);
  });

  it("truncates a line that exceeds NDJSON_LINE_CAP", () => {
    const big = "x".repeat(NDJSON_LINE_CAP + 100);
    const result = capNdjsonLine(big);
    expect(result.length).toBeLessThanOrEqual(NDJSON_LINE_CAP + NDJSON_TRUNCATION_MARKER.length + 3);
    expect(result).toContain(NDJSON_TRUNCATION_MARKER);
  });

  it("exact boundary is not truncated", () => {
    const exact = "y".repeat(NDJSON_LINE_CAP);
    expect(capNdjsonLine(exact)).toBe(exact);
  });
});
