/** Raven chat destination settings — simple JSON file in dataDir. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RavenSettings } from "@pi-desktop/shared";
import { writeJsonAtomicSync } from "../atomic-json";
import { isAllowedHttpUrl } from "../safe-open-external";

const SETTINGS_FILE = "raven-settings.json";
const DEFAULTS: RavenSettings = { enabled: false, url: "" };

export function readRavenSettings(dataDir: string): RavenSettings {
  try {
    return validateRavenSettings(JSON.parse(readFileSync(join(dataDir, SETTINGS_FILE), "utf8")));
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeRavenSettings(dataDir: string, settings: RavenSettings): void {
  writeJsonAtomicSync(join(dataDir, SETTINGS_FILE), settings);
}

/** Anything but an http(s) URL becomes ""; Raven can only be enabled with a URL. */
export function validateRavenSettings(input: unknown): RavenSettings {
  const s = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const url = typeof s.url === "string" && isAllowedHttpUrl(s.url) ? s.url.trim() : DEFAULTS.url;
  return { enabled: url !== "" && s.enabled === true, url };
}
