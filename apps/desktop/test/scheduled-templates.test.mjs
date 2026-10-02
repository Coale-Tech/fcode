/**
 * Tests for scheduled-templates.ts (I.4)
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { SCHEDULED_TEMPLATES } = await import(
  "../src/features/scheduled/scheduled-templates.ts"
);

test("SCHEDULED_TEMPLATES: has 5-6 entries", () => {
  assert.ok(SCHEDULED_TEMPLATES.length >= 5 && SCHEDULED_TEMPLATES.length <= 6,
    `expected 5-6 templates, got ${SCHEDULED_TEMPLATES.length}`);
});

test("SCHEDULED_TEMPLATES: all entries have required fields", () => {
  for (const tmpl of SCHEDULED_TEMPLATES) {
    assert.ok(tmpl.id, `${tmpl.id}: missing id`);
    assert.ok(tmpl.nameKey, `${tmpl.id}: missing nameKey`);
    assert.ok(tmpl.title, `${tmpl.id}: missing title`);
    assert.ok(tmpl.prompt, `${tmpl.id}: missing prompt`);
    assert.ok(["manual", "hourly", "daily", "weekly"].includes(tmpl.cadence),
      `${tmpl.id}: invalid cadence "${tmpl.cadence}"`);
    assert.ok(tmpl.schedule, `${tmpl.id}: missing schedule`);
  }
});

test("SCHEDULED_TEMPLATES: weekly templates have weekdays array", () => {
  for (const tmpl of SCHEDULED_TEMPLATES) {
    if (tmpl.cadence === "weekly") {
      assert.ok(Array.isArray(tmpl.schedule.weekdays) && tmpl.schedule.weekdays.length > 0,
        `${tmpl.id}: weekly template must have non-empty weekdays`);
    }
  }
});

test("SCHEDULED_TEMPLATES: ids are unique", () => {
  const ids = SCHEDULED_TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate ids found");
});

test("SCHEDULED_TEMPLATES: nameKeys start with 'scheduled.'", () => {
  for (const tmpl of SCHEDULED_TEMPLATES) {
    assert.ok(tmpl.nameKey.startsWith("scheduled."),
      `${tmpl.id}: nameKey "${tmpl.nameKey}" should start with "scheduled."`);
  }
});

test("SCHEDULED_TEMPLATES: daily-digest template fills a valid draft", () => {
  const tmpl = SCHEDULED_TEMPLATES.find((t) => t.id === "daily-digest");
  assert.ok(tmpl, "daily-digest template must exist");
  assert.equal(tmpl.cadence, "daily");
  assert.ok(tmpl.title.length > 0);
  assert.ok(tmpl.prompt.length > 0);
  assert.equal(typeof tmpl.schedule.hour, "number");
  assert.equal(typeof tmpl.schedule.minute, "number");
});
