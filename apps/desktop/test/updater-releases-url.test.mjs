import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const updaterSource = readFileSync(
  join(here, "../electron/main/updater.ts"),
  "utf8",
);

test("RELEASES_URL points at the Fcode fork, not upstream PI-Desktop", () => {
  assert.match(
    updaterSource,
    /export const RELEASES_URL = "https:\/\/github\.com\/Coale-Tech\/fcode\/releases\/latest";/,
  );
  assert.doesNotMatch(updaterSource, /vastsa\/PI-Desktop/);
});
