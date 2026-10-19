import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { printResult, readEndpoint } from "./endpoint.js";

describe("printResult", () => {
  let output = "";
  beforeEach(() => {
    output = "";
    vi.spyOn(process.stdout, "write").mockImplementation((s) => { output += String(s); return true; });
  });
  afterEach(() => vi.restoreAllMocks());

  it("prints JSON with --json flag", () => {
    printResult({ a: 1 }, true);
    expect(JSON.parse(output)).toEqual({ a: 1 });
  });

  it("prints (none) for empty array", () => {
    printResult([], false);
    expect(output).toBe("(none)\n");
  });

  it("prints tab-separated rows for object array", () => {
    printResult([{ name: "main", branch: "main" }, { name: "feat", branch: "feat/x" }], false);
    const lines = output.trim().split("\n");
    expect(lines[0]).toBe("name\tbranch");
    expect(lines[1]).toBe("main\tmain");
    expect(lines[2]).toBe("feat\tfeat/x");
  });

  it("prints key: value for plain object", () => {
    printResult({ ok: true, count: 3 }, false);
    expect(output).toContain("ok: true");
    expect(output).toContain("count: 3");
  });
});

describe("readEndpoint", () => {
  afterEach(() => vi.restoreAllMocks());

  it("exits 2 when FCODE_ENDPOINT_FILE is not set", () => {
    const origEnv = process.env.FCODE_ENDPOINT_FILE;
    delete process.env.FCODE_ENDPOINT_FILE;
    const exits: number[] = [];
    vi.spyOn(process, "exit").mockImplementation((code) => { exits.push(code as number); throw new Error("exit"); });
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      expect(() => readEndpoint()).toThrow("exit");
      expect(exits[0]).toBe(2);
    } finally {
      if (origEnv !== undefined) process.env.FCODE_ENDPOINT_FILE = origEnv;
    }
  });
});
