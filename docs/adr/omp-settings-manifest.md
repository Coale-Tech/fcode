# ADR omp-settings-manifest: omp settings come from a build-time manifest

- Status: Accepted
- Date: 2026-10-12

## Context

omp declares each setting once (`register({ id, type, default, ui })`) and lists
all of them through `config/all-settings.ts`. Fcode hand-coded each exposed key
in four places (shared type, main-process schema, overlay YAML writer, React
section) plus nine locales, so only 66 keys were reachable from the UI and the
rest of the schema (retry, compaction, edit, advisor, web, ssh, …) was settable
only by editing omp config files by hand.

## Decision

- `scripts/gen-omp-settings-manifest.mjs` runs after `build-omp.mjs` and writes
  `apps/desktop/resources/omp-settings-manifest.json` (`OmpSettingDescriptor[]`)
  from omp's registry, stamped with the omp `sourceHash`; `--check` fails on drift.
- `OmpSettingsValues.advanced` holds dotted-id → value for everything without a
  curated key. The main process validates each entry against the manifest;
  `packages/omp-bridge/src/overlay-advanced.ts` expands them to nested overlay
  YAML. A curated key always wins over the same id in `advanced`.
- Settings > omp Advanced renders from the manifest only; descriptors whose id is
  in `CURATED_OMP_KEYS` are hidden there.
- Labels and descriptions are omp's English text. Only page chrome is localized.

## Consequences

- A new omp setting appears in Fcode when omp is re-vendored and the manifest is
  regenerated; no per-key UI work.
- Curated sections remain for settings Fcode owns or presents differently.
- Descriptions are not translated; translate groups or descriptions on demand.
- Settings without omp `ui` metadata stay hidden, matching omp's own panel.
