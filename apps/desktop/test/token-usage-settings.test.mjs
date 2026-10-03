import { readSettingsSource } from "./helpers/source-contracts.mjs";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { readFileSync, constants } from "node:fs";
import test from "node:test";

const search = await readFile(
  new URL("../src/lib/settings-search.ts", import.meta.url),
  "utf8",
);
const settingsPage = await readSettingsSource();
const api = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");

test("settings has no usage destination; host token history stays available", () => {
  assert.doesNotMatch(search, /id: "usage"/);
  assert.doesNotMatch(search, /settings\.nav\.usage/);
  assert.doesNotMatch(settingsPage, /TokenUsagePage/);
  assert.doesNotMatch(settingsPage, /tab === "usage"/);
  assert.match(api, /getTokenUsageHistory/);
});

test("settings usage page component is gone", async () => {
  await assert.rejects(
    () =>
      access(
        new URL("../src/components/settings/TokenUsagePage.tsx", import.meta.url),
        constants.F_OK,
      ),
    { code: "ENOENT" },
  );
});

/**
 * S3/S4 restyle uses numeric --radius-N steps (FD3). The named scale
 * (--radius-sm/md/lg/xl/2xl) maps to different px values in Fcode vs Raven,
 * so its use in settings.css would produce incorrect Raven-mismatch radii.
 */
test("settings CSS uses only numeric radius tokens, not named-scale aliases", () => {
  const css = readFileSync(
    new URL("../src/styles/settings.css", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    css,
    /border-radius:\s*var\(--radius-(?:sm|md|lg|xl|2xl)\)/,
    "settings.css must not use the named radius scale (sm/md/lg/xl/2xl); use --radius-N numeric steps",
  );
});
