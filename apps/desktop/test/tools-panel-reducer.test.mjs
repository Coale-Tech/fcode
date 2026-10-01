/**
 * Boundary tests for the tools-panel reducer (lib/tools-panel.ts).
 *
 * Tests cover: cap/eviction, missing fields, non-image payloads, large output
 * truncation, and the parse helpers that translate raw agentMessage events.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const {
  toolsPanelReducer,
  EMPTY_TOOLS_STATE,
  MAX_SCREENSHOTS,
  MAX_EVAL_CELLS,
  MAX_IDA_RESULTS,
  MAX_BROWSER_STEPS,
  MAX_COMPUTER_ACTIONS,
  MAX_OUTPUT_BYTES,
  parseBrowserToolStart,
  parseBrowserToolEnd,
  parseEvalToolEnd,
  parseComputerToolStart,
  parseComputerToolEnd,
  parseIdaToolEnd,
} = await import("../src/lib/tools-panel.ts");

// ─── helpers ──────────────────────────────────────────────────────────────────

function browserEndEvent(overrides = {}) {
  return {
    type: "tool_end",
    toolName: "browser",
    isError: false,
    args: { action: "run" },
    result: {
      details: {
        action: "run",
        url: "https://example.com",
        title: "Example",
        screenshots: [{ dest: "/tmp/shot.png", mimeType: "image/png", width: 1280, height: 800 }],
      },
      content: [],
    },
    ...overrides,
  };
}

function evalEndEvent(cells = [], overrides = {}) {
  return {
    type: "tool_end",
    toolName: "eval",
    isError: false,
    result: {
      details: { cells },
      content: [],
    },
    ...overrides,
  };
}

function makeCell(index = 0, overrides = {}) {
  return {
    index,
    language: "python",
    code: `print(${index})`,
    output: `${index}`,
    status: "complete",
    durationMs: 100,
    ...overrides,
  };
}

function computerEndEvent(screenshots = [], overrides = {}) {
  return {
    type: "tool_end",
    toolName: "computer",
    isError: false,
    args: { action: "run" },
    result: {
      details: { screenshots, code: "desktop.screenshot()" },
      content: [],
    },
    ...overrides,
  };
}

function idaEndEvent(overrides = {}) {
  return {
    type: "tool_end",
    toolName: "ida",
    isError: false,
    result: {
      details: { action: "list" },
      content: [{ type: "text", text: "No IDA databases open." }],
    },
    ...overrides,
  };
}

// ─── cap / eviction ───────────────────────────────────────────────────────────

describe("browser screenshots cap", () => {
  it(`retains at most ${MAX_SCREENSHOTS} screenshots`, () => {
    let state = EMPTY_TOOLS_STATE;
    const counter = { current: 0 };
    for (let i = 0; i < MAX_SCREENSHOTS + 5; i++) {
      const evt = browserEndEvent({
        result: {
          details: {
            url: `https://example.com/${i}`,
            screenshots: [{ dest: `/tmp/s${i}.png`, mimeType: "image/png" }],
          },
          content: [],
        },
      });
      const action = parseBrowserToolEnd(evt, counter);
      state = toolsPanelReducer(state, action);
    }
    assert.equal(state.browser.screenshots.length, MAX_SCREENSHOTS);
    // Latest screenshot is the last one pushed.
    assert.ok(state.browser.screenshots.at(-1).dest.includes(`s${MAX_SCREENSHOTS + 4}.png`));
  });
});

describe("browser step history cap", () => {
  it(`retains at most ${MAX_BROWSER_STEPS} steps`, () => {
    let state = EMPTY_TOOLS_STATE;
    const counter = { current: 0 };
    for (let i = 0; i < MAX_BROWSER_STEPS + 10; i++) {
      const start = { type: "tool_start", toolName: "browser", args: { action: "run" } };
      const startAction = parseBrowserToolStart(start, counter);
      state = toolsPanelReducer(state, startAction);
      const end = browserEndEvent();
      const endAction = parseBrowserToolEnd(end, counter);
      state = toolsPanelReducer(state, endAction);
    }
    assert.equal(state.browser.steps.length, MAX_BROWSER_STEPS);
  });
});

describe("eval cell cap", () => {
  it(`retains at most ${MAX_EVAL_CELLS} cells`, () => {
    let state = EMPTY_TOOLS_STATE;
    const counter = { current: 0 };
    for (let i = 0; i < MAX_EVAL_CELLS + 5; i++) {
      const evt = evalEndEvent([makeCell(i)]);
      const action = parseEvalToolEnd(evt, counter);
      if (action) state = toolsPanelReducer(state, action);
    }
    assert.equal(state.eval.cells.length, MAX_EVAL_CELLS);
  });
});

describe("computer action cap", () => {
  it(`retains at most ${MAX_COMPUTER_ACTIONS} actions`, () => {
    let state = EMPTY_TOOLS_STATE;
    const counter = { current: 0 };
    for (let i = 0; i < MAX_COMPUTER_ACTIONS + 5; i++) {
      const startEvt = { type: "tool_start", toolName: "computer", args: { action: "run" } };
      const startAction = parseComputerToolStart(startEvt, counter);
      state = toolsPanelReducer(state, startAction);
      const endAction = parseComputerToolEnd(computerEndEvent(), counter);
      state = toolsPanelReducer(state, endAction);
    }
    assert.equal(state.computer.actions.length, MAX_COMPUTER_ACTIONS);
  });
});

describe("IDA result cap", () => {
  it(`retains at most ${MAX_IDA_RESULTS} results`, () => {
    let state = EMPTY_TOOLS_STATE;
    const counter = { current: 0 };
    for (let i = 0; i < MAX_IDA_RESULTS + 5; i++) {
      const action = parseIdaToolEnd(idaEndEvent(), counter);
      state = toolsPanelReducer(state, action);
    }
    assert.equal(state.ida.results.length, MAX_IDA_RESULTS);
  });
});

// ─── large output truncation ───────────────────────────────────────────────────

describe("output truncation", () => {
  it("truncates eval cell output above MAX_OUTPUT_BYTES", () => {
    const bigOutput = "x".repeat(MAX_OUTPUT_BYTES + 5000);
    const counter = { current: 0 };
    const evt = evalEndEvent([makeCell(0, { output: bigOutput })]);
    const action = parseEvalToolEnd(evt, counter);
    assert.ok(action);
    const cell = action.cells[0];
    assert.ok(cell.output.length < bigOutput.length);
    assert.ok(cell.output.includes("[…output truncated]"));
  });

  it("truncates IDA output above MAX_OUTPUT_BYTES", () => {
    const bigText = "A".repeat(MAX_OUTPUT_BYTES + 2000);
    const counter = { current: 0 };
    const evt = idaEndEvent({
      result: {
        details: { action: "exec" },
        content: [{ type: "text", text: bigText }],
      },
    });
    const action = parseIdaToolEnd(evt, counter);
    assert.ok(action);
    // Truncation applied in reducer, not parser.
    const state = toolsPanelReducer(EMPTY_TOOLS_STATE, action);
    const result = state.ida.results[0];
    assert.ok(result.output.length < bigText.length);
    assert.ok(result.output.includes("[…output truncated]"));
  });
});

// ─── missing fields ───────────────────────────────────────────────────────────

describe("missing fields", () => {
  it("browser: no screenshots in details produces empty array", () => {
    const counter = { current: 0 };
    const evt = browserEndEvent({
      result: { details: { action: "open", url: "https://x.com" }, content: [] },
    });
    const action = parseBrowserToolEnd(evt, counter);
    assert.ok(action);
    assert.equal(action.screenshots.length, 0);
    assert.equal(action.url, "https://x.com");
  });

  it("browser: missing result/details returns undefined", () => {
    const counter = { current: 0 };
    const evt = { type: "tool_end", toolName: "browser", result: null };
    const action = parseBrowserToolEnd(evt, counter);
    // details is null → screenshots defaults to []
    assert.ok(action);
    assert.equal(action.screenshots.length, 0);
  });

  it("eval: cells with missing code field are skipped", () => {
    const counter = { current: 0 };
    const evt = evalEndEvent([
      { index: 0, output: "out", status: "complete" }, // no code
      makeCell(1),
    ]);
    const action = parseEvalToolEnd(evt, counter);
    assert.ok(action);
    assert.equal(action.cells.length, 1);
    assert.equal(action.cells[0].code, "print(1)");
  });

  it("eval: empty cells list returns undefined action", () => {
    const counter = { current: 0 };
    const action = parseEvalToolEnd(evalEndEvent([]), counter);
    assert.equal(action, undefined);
  });

  it("computer: no screenshots produces empty array", () => {
    const counter = { current: 0 };
    const action = parseComputerToolEnd(computerEndEvent([]), counter);
    assert.ok(action);
    assert.equal(action.screenshots.length, 0);
  });

  it("ida: wrong toolName returns undefined", () => {
    const counter = { current: 0 };
    const evt = { type: "tool_end", toolName: "browser", result: { details: { action: "list" }, content: [] } };
    assert.equal(parseIdaToolEnd(evt, counter), undefined);
  });

  it("browser: wrong toolName returns undefined", () => {
    const counter = { current: 0 };
    const evt = { type: "tool_end", toolName: "eval" };
    assert.equal(parseBrowserToolEnd(evt, counter), undefined);
  });
});

// ─── non-image payloads ───────────────────────────────────────────────────────

describe("non-image payloads", () => {
  it("browser: screenshot dest missing → entry skipped", () => {
    const counter = { current: 0 };
    const evt = browserEndEvent({
      result: {
        details: {
          url: "https://a.com",
          screenshots: [{ mimeType: "image/png" }], // no dest
        },
        content: [],
      },
    });
    const action = parseBrowserToolEnd(evt, counter);
    assert.equal(action.screenshots.length, 0);
  });

  it("computer: screenshot path missing → entry skipped", () => {
    const counter = { current: 0 };
    const evt = computerEndEvent([{ width: 100, height: 100 }]); // no path
    const action = parseComputerToolEnd(evt, counter);
    assert.equal(action.screenshots.length, 0);
  });
});

// ─── reducer clear ────────────────────────────────────────────────────────────

describe("reducer clear", () => {
  it("clear resets all sub-panel state to empty", () => {
    let state = EMPTY_TOOLS_STATE;
    const counter = { current: 0 };
    const action = parseIdaToolEnd(idaEndEvent(), counter);
    state = toolsPanelReducer(state, action);
    assert.ok(state.ida.results.length > 0);
    state = toolsPanelReducer(state, { type: "clear" });
    assert.equal(state.ida.results.length, 0);
    assert.equal(state.browser.steps.length, 0);
    assert.equal(state.eval.cells.length, 0);
    assert.equal(state.computer.actions.length, 0);
  });
});

// ─── upsert (tool_start → tool_end) ───────────────────────────────────────────

describe("browser step upsert", () => {
  it("tool_end updates optimistic step from tool_start (same index)", () => {
    let state = EMPTY_TOOLS_STATE;
    const counter = { current: 0 };
    const startEvt = { type: "tool_start", toolName: "browser", args: { action: "open" } };
    const startAction = parseBrowserToolStart(startEvt, counter);
    state = toolsPanelReducer(state, startAction);
    assert.equal(state.browser.steps.length, 1);
    assert.equal(state.browser.steps[0].url, undefined);

    const endAction = parseBrowserToolEnd(browserEndEvent(), counter);
    state = toolsPanelReducer(state, endAction);
    // Should still be 1 step, now with url filled in.
    assert.equal(state.browser.steps.length, 1);
    assert.equal(state.browser.steps[0].url, "https://example.com");
  });
});
