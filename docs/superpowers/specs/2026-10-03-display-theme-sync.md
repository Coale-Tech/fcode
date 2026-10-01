# Display/Theme Sync — omp RPC mode analysis

## RPC-mode effect audit

| Setting | Has RPC effect? | Evidence |
|---|---|---|
| `display.smoothStreaming` | ❌ No | Drives `StreamingRevealController` inside `EventController`; `EventController` is not instantiated in `rpc-mode.ts`. |
| `display.showTokenUsage` | ❌ No | Controls `chatTranscriptDisplayPreferences` consumed by `chat-transcript-builder.ts` (TUI only). |
| `display.showTurnTime` | ❌ No | Same as showTokenUsage. |
| `display.hideToolActivity` | ❌ No | Drives `ui-helpers.ts` / `input-controller.ts` TUI rendering; not referenced in rpc-mode.ts. |
| `display.cacheMissMarker` | ❌ No | TUI transcript display only. |
| `display.collapseCompacted` | ❌ No | TUI transcript display only. |
| `display.shimmer` | ❌ No | TUI `setShimmerMode` animation only. |
| `display.pinnedAgents` | ❌ No | TUI agent jump list in `interactive-mode.ts` only. |
| `theme.dark` | ✅ Yes | `exportToHtml(path, true)` reads `cfgThemeDark` for the dark CSS palette in the exported HTML. |
| `theme.light` | ✅ Yes | Same, for the light CSS palette. |

## Fcode → omp mapping

- **theme.dark / theme.light**: No Fcode equivalent (Fcode picks dark/light *mode*, not a specific omp TUI palette). Added as text inputs in **Settings → AI → HTML Export Theme**. Defaults (titanium / light) apply when blank.
- **display.smoothStreaming**: Fcode has its own `settings.smoothStreaming` for the Fcode transcript. No overlap with omp; no overlay key emitted.
- **contextUsageDisplay** (Fcode): Shows remaining/used context in Fcode's own context bar. Unrelated to omp `display.showTokenUsage`; no mapping.

## Changes

- `omp/…/rpc/rpc-mode.ts`: pass `useUserThemes = true` to `exportToHtml` so the HTML uses omp's configured TUI themes (default titanium / light) with CSS `prefers-color-scheme` adaptation.
- `packages/shared/…/omp.ts`: add `"theme.dark"` and `"theme.light"` to `OmpSettingsValues`.
- `…/omp-settings-config.ts`: add both to SCHEMA (type: string).
- `packages/omp-bridge/…/bridge.ts`: emit `theme:` YAML block when either is set.
- `apps/desktop/…/omp-settings-sections.tsx`: **HTML Export Theme** card with two text inputs.
- `packages/i18n`: 9 locales — `ompThemeGroup`, `ompThemeDark/Desc`, `ompThemeLight/Desc`.
