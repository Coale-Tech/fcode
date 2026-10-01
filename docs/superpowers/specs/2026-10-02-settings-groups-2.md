# omp Settings Groups — Part 2

**Date**: 2026-10-02
**Branch**: feat/settings-groups-2

## Goal
Extend `omp-settings.json` with five new groups and surface them in the Settings UI (AI tab).

## Groups & Keys

| Group | Key | Type | Notes |
|-------|-----|------|-------|
| LSP | `lsp.enabled` | bool | |
| LSP | `lsp.formatOnWrite` | bool | |
| LSP | `lsp.diagnosticsOnWrite` | bool | |
| LSP | `lsp.diagnosticsOnEdit` | bool | |
| IDA Pro | `ida.enabled` | bool | |
| IDA Pro | `ida.python` | string | path; folder picker |
| IDA Pro | `ida.installDir` | string | path; folder picker |
| MCP | `mcp.enableProjectConfig` | bool | |
| MCP | `mcp.renderMarkdownResults` | bool | |
| MCP | `mcp.notifications` | bool | |
| Skills & Commands | `skills.enabled` | bool | merged into base overlay skills block |
| Skills & Commands | `skills.registryUrl` | string | |
| Skills & Commands | `skills.customDirectories` | string[] | appended after fcode-skills; folder picker |
| Skills & Commands | `commands.enableClaudeUser` | bool | |
| Skills & Commands | `commands.enableClaudeProject` | bool | |
| Hindsight (Memory) | `hindsight.autoRecall` | bool | merged into base overlay hindsight block |
| Hindsight (Memory) | `hindsight.autoRetain` | bool | |
| Hindsight (Memory) | `hindsight.retainMode` | enum | full-session / last-turn |
| Hindsight (Memory) | `hindsight.mentalModelsEnabled` | bool | |
| Hindsight (Memory) | `hindsight.mentalModelAutoSeed` | bool | |

## Skipped (with reason)
- `extensions` / `disabledExtensions` — array of npm package IDs; needs a package-manager UI, not a simple field.
- `display.smoothStreaming` / `display.showTokenUsage` / `theme.dark` / `theme.light` — TUI rendering only; no effect in rpc sidecar mode.
- `auth-broker.*` — no user-facing omp setting found by this name in the source.
- `mcp.startupTimeoutMs`, `ida.maxOpen`, `ida.idleCloseSec` — advanced tuning not in scope.

## Mechanism
- `FieldSchema` extended with `array` type (string[]).
- Skills user dirs appended to Fcode's fcode-skills dir in the base overlay block.
- Hindsight behavioral keys merged into the existing hindsight overlay block.
- Commands emitted as a separate `commands:` YAML section.
- LSP / IDA / MCP emitted as new top-level sections via `ompSettingsYaml`.
- Folder picker reuses `api.pickProjectFolders()` (already exists).
