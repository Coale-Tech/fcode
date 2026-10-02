import assert from "node:assert/strict";
import { register } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { buildActivityTimeline } = await import("../src/lib/activity-summary.ts");

// Minimal UiMessage shape sufficient for buildActivityTimeline
function msg(overrides) {
  return {
    id: crypto.randomUUID(),
    role: "tool",
    toolName: "Read",
    toolStatus: "success",
    toolArgs: { path: "foo.txt" },
    toolCallId: undefined,
    toolDurationMs: undefined,
    content: "",
    ...overrides,
  };
}

test("buildActivityTimeline returns empty for no messages", () => {
  assert.deepEqual(buildActivityTimeline([]), []);
});

test("buildActivityTimeline skips non-tool messages", () => {
  const rows = buildActivityTimeline([
    { id: "1", role: "user", content: "hi" },
    { id: "2", role: "assistant", content: "yo" },
  ]);
  assert.equal(rows.length, 0);
});

test("buildActivityTimeline maps success to ok status", () => {
  const [row] = buildActivityTimeline([msg({ toolStatus: "success", toolName: "Read" })]);
  assert.equal(row.status, "ok");
  assert.equal(row.name, "Read");
});

test("buildActivityTimeline maps running to running status", () => {
  const [row] = buildActivityTimeline([msg({ toolStatus: "running" })]);
  assert.equal(row.status, "running");
});

test("buildActivityTimeline maps error and denied to error status", () => {
  const [e] = buildActivityTimeline([msg({ toolStatus: "error" })]);
  const [d] = buildActivityTimeline([msg({ toolStatus: "denied" })]);
  assert.equal(e.status, "error");
  assert.equal(d.status, "error");
});

test("buildActivityTimeline extracts path as target for Read tool", () => {
  const [row] = buildActivityTimeline([
    msg({ toolName: "Read", toolArgs: { path: "src/lib/foo.ts" } }),
  ]);
  assert.equal(row.target, "src/lib/foo.ts");
});

test("buildActivityTimeline extracts command as target for Bash tool", () => {
  const [row] = buildActivityTimeline([
    msg({ toolName: "Bash", toolArgs: { command: "pnpm test" } }),
  ]);
  assert.equal(row.target, "pnpm test");
});

test("buildActivityTimeline preserves durationMs", () => {
  const [row] = buildActivityTimeline([msg({ toolDurationMs: 1234 })]);
  assert.equal(row.durationMs, 1234);
});

test("buildActivityTimeline preserves input order (newest last)", () => {
  const rows = buildActivityTimeline([
    msg({ toolName: "Read", toolArgs: { path: "a.ts" } }),
    msg({ toolName: "Write", toolArgs: { path: "b.ts" } }),
    msg({ toolName: "Bash", toolArgs: { command: "pnpm build" } }),
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].name, "Read");
  assert.equal(rows[2].name, "Bash");
});
