# Rich Tool Panels

**Branch:** feat/rich-tool-panels  
**Date:** 2026-10-02

## Goal

Richer transcript rendering for four tool families currently shown as generic
"use" rows: `eval` (Python/JS REPL), `browser` (Playwright), `computer` (desktop
automation), and `ida` (IDA Pro). All data is derived from existing
`tool_execution` result payloads — no new RPC.

## Data Sources

| Tool | Payload key (`details.*`) | Shape |
|---|---|---|
| `eval` | `cells[]` | `{code, output, language, status}[]` |
| `eval` | `images[]` | `{data, mimeType}[]` base64 inline |
| `browser` | `action`, `url`, `screenshots[]` | `{dest, mimeType, width, height}[]` paths |
| `computer` | `screenshots[]` | `{path, width, height}[]` file paths |
| `ida` | `action`, `db`, `meta` | structured fields |

Text output for browser/computer/ida lives in the raw envelope `content[].text`.

## Changes

- **`tool-presentation.ts`**: add tool-name checks before the action switch in
  `resultBlocks` for eval/browser/computer/ida; extract per-cell code+output
  blocks for eval, URL/output blocks for browser, output block for computer,
  action/db fields + output for ida.
- **`ToolScreenshots.tsx`** (new): React component that reads `details.screenshots`
  file paths (browser `dest`, computer `path`) via `useReferencedImageDataUrl`,
  and eval `details.images` as inline base64. Renders null when not applicable.
- **`ToolRow.tsx`**: inject `<ToolScreenshots>` after the body block, guarded by
  `inlineOpen` so it only shows when the row is expanded.
- **i18n**: one new key `chat.toolScreenshot` in all 9 locales for alt text.

## Acceptance

- `eval` rows expand to show per-cell code + output with language label.
- `browser` rows show current URL and text output; screenshots render as images.
- `computer` rows show output text; screenshots render as images.
- `ida` rows show structured action/db fields + execution output.
- Boundary tests: missing fields, large output truncation (mapped block),
  non-image content (no crash on empty `screenshots[]`), unknown tool name
  (existing fallback unchanged).
