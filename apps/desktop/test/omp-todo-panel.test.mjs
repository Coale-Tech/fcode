/**
 * Boundary tests for OmpTodoPanel pure helpers (feat/session-data).
 *
 * Covers hasActiveTasks — the gating predicate that decides whether the panel
 * renders. Render-level tests are out of scope (no test renderer in node:test).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { hasActiveTasks } = await import(
  "../src/features/chat/transcript/omp-todo-logic.ts"
);
// ─── hasActiveTasks ───────────────────────────────────────────────────────────

test("empty phases → false", () => {
  assert.equal(hasActiveTasks([]), false);
});

test("all tasks completed → false", () => {
  assert.equal(
    hasActiveTasks([{ tasks: [{ status: "completed" }, { status: "completed" }] }]),
    false,
  );
});

test("all tasks abandoned → false", () => {
  assert.equal(
    hasActiveTasks([{ tasks: [{ status: "abandoned" }] }]),
    false,
  );
});

test("mix of completed and abandoned → false", () => {
  assert.equal(
    hasActiveTasks([{ tasks: [{ status: "completed" }, { status: "abandoned" }] }]),
    false,
  );
});

test("in_progress task → true", () => {
  assert.equal(
    hasActiveTasks([{ tasks: [{ status: "in_progress" }] }]),
    true,
  );
});

test("pending (default) task → true", () => {
  assert.equal(
    hasActiveTasks([{ tasks: [{ status: "pending" }] }]),
    true,
  );
});

test("blocked task → true", () => {
  assert.equal(
    hasActiveTasks([{ tasks: [{ status: "blocked" }] }]),
    true,
  );
});

test("active task in second phase → true even if first phase all done", () => {
  assert.equal(
    hasActiveTasks([
      { tasks: [{ status: "completed" }] },
      { tasks: [{ status: "in_progress" }] },
    ]),
    true,
  );
});

test("phase with no tasks → treated as no active tasks", () => {
  assert.equal(hasActiveTasks([{ tasks: [] }]), false);
});
