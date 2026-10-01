import assert from "node:assert/strict";
import { register } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));
const { buildChecks, checksFor, failing } = await import("../src/lib/build-checks.ts");

const ready = {
  benchRunning: true,
  appsLoaded: true,
  studioInstalled: true,
  developerMode: true,
  watchdogOk: true,
  site: "coale.localhost",
};
const states = (i) => buildChecks(i).map((c) => c.state);

test("all four checks pass when Studio is ready", () => {
  assert.deepEqual(states(ready), ["ok", "ok", "ok", "ok"]);
  assert.equal(failing(buildChecks(ready)).length, 0);
});

test("a stopped bench fails only the bench check; the rest are unknown, not failures", () => {
  const checks = buildChecks({ ...ready, benchRunning: false });
  assert.deepEqual(checks.map((c) => c.state), ["fail", "unknown", "unknown", "unknown"]);
  assert.deepEqual(failing(checks).map((c) => c.key), ["bench"]);
});

test("unprobed developer_mode and watchdog stay unknown while the app list loads", () => {
  assert.deepEqual(
    states({ ...ready, appsLoaded: false, developerMode: null, watchdogOk: null }),
    ["ok", "unknown", "unknown", "unknown"],
  );
});

test("a missing Studio app hides the probes that depend on it", () => {
  const checks = buildChecks({ ...ready, studioInstalled: false, developerMode: false });
  assert.deepEqual(checks.map((c) => c.state), ["ok", "fail", "unknown", "unknown"]);
});

test("developer_mode off is the first problem and carries a site-specific remedy", () => {
  const [first] = failing(buildChecks({ ...ready, developerMode: false }));
  assert.equal(first.key, "developerMode");
  assert.match(first.remedy, /--site coale\.localhost clear-cache$/);
});

test("remedy keeps the <site> placeholder when the site is unknown", () => {
  const studio = buildChecks({ ...ready, studioInstalled: false, site: null })[1];
  assert.match(studio.remedy, /--site <site> install-app studio/);
});

test("Builder only cares about the bench check", () => {
  const checks = buildChecks({ ...ready, developerMode: false });
  assert.deepEqual(checksFor("builder", checks).map((c) => c.key), ["bench"]);
  assert.equal(checksFor("studio", checks).length, 4);
});
