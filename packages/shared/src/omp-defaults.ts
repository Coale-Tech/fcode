/**
 * Single source of truth for the defaults of Fcode-owned omp settings.
 * The Settings UI, the bridge overlay/loaders and the curator all read these;
 * do not repeat the literals elsewhere. (omp-native keys keep omp's own default,
 * which the settings manifest carries.)
 */
import type { OmpSettingsValues } from "./types/omp.js";

export const FCODE_SETTING_DEFAULTS = {
  "skills.curator.enabled": true,
  "skills.curator.staleDays": 14,
  "skills.curator.archiveDays": 30,
  "skills.review.enabled": false,
  "skills.review.intervalTurns": 10,
  "skills.review.maxInputTokens": 8000,
  "skills.review.model": "",
  "skills.review.requireApproval": true,
  "skills.review.passes": "single",
  "skills.harness.enabled": false,
  "skills.harness.k": 1,
  "skills.harness.mode": "parallel",
  "skills.harness.model": "",
  "memory.injectMaxChars": 6000,
  "memory.frozen.maxChars": 2000,
} as const satisfies Partial<OmpSettingsValues>;

type DefaultKey = keyof typeof FCODE_SETTING_DEFAULTS;

/** The configured value of an Fcode-owned setting, or its default. */
export function ompSetting<K extends DefaultKey>(
  settings: OmpSettingsValues,
  key: K,
): NonNullable<OmpSettingsValues[K]> {
  return (settings[key] ?? FCODE_SETTING_DEFAULTS[key]) as NonNullable<OmpSettingsValues[K]>;
}

/**
 * omp keys Fcode writes itself (approval mode, memory backend, screenshot dir).
 * They are hidden from the generic Advanced page and never taken from it.
 */
export const FCODE_OWNED_OMP_KEYS: Readonly<Record<string, true>> = {
  "tools.approvalMode": true,
  "memory.backend": true,
  "browser.screenshotDir": true,
};
