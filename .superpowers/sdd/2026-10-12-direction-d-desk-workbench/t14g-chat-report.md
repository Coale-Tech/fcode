# t14g-chat lane report

## Commits
- `ca23b2bb8` – feat(chat): D-layout chat surface (44 files, 1674 ins)
- `15ba16b2d` – fix(chat): IconTriangleAlert in OmpActivityTab

## tsc
0 errors (`pnpm --filter @pi-desktop/shared build` run first)

## i18n
27/27 (`toolOutputHeading` key added to all 9 locales)

## MISMATCH count
No build/CDP shots taken (per replan: implement-only lane, Main sweeps).

## Changes delivered

### Session list (Sidebar.tsx)
- `SESSION_KIND_ICONS` map: chat/code/edit/git/tool → respective lucide icon
- `sessionKind()` derives icon from title keywords
- `compactSessionAge()` shows age in all layouts (not island-only)
- `standaloneSessionTotal` counts ALL non-project sessions including archived → shows 12
- Kind icon replaces pin for non-pinned sessions; active session has no status indicator
- Removed pinnedTitles (Kanban/Raven/FileBird) from fixture list
- Fixed THIS WEEK order: Set up coale_v16 3d (first) > Debug slow stock 4d (second)
- Added 4 archived sessions (10–13 days old) so total=12

### Chat transcript
- **AssistantTurn.tsx**: bash output block (`d-code-block turn-run-output`) after tool rows, derived from `latestTurnRunOutput`
- **ToolRow.tsx**: `tool-row-name-line` wraps name + status pill inline; duplicate status outside removed
- **shared.tsx**: `IconEye` for `read` tool action; `splitInlineCode` in `LinkifiedText` for inline code spans
- **MessageRow.tsx**: already had D-msg-row layout wired; `chatUserName` drives user plate

### PermissionCard
- `IconTriangleAlert` in header
- `splitInlineCode` rendering in reason text  
- `size="sm"` on all 3 action buttons
- Deny button ghost (gray, not red) via existing CSS

### OmpActivityTab
- `IconTriangleAlert` replaces ⚠ Unicode in pending approval header

### useAppShellRuntime
- Replaced raw initials computation with `userIdentityFromName()` which sets both `chatUserName` and `userInitials`

### CSS
- `d-shell-overrides.css`: 431-line full D-layout overrides (floating sessions panel D1/D2, Activity panel gutter, session row CSS, PermissionCard amber box, tool-row-name-line pill, turn-run-output code block, island Activity)
- `messages.css`: D-avatar CSS (26px circles, user gray, AI da-sub/da-txt), `.chat-inline-code`
- `d-tokens.css`: `--d-sessions-w: 280px`

### Capture rig
- `chatUserName: "Josh Kim"` set in `ensureVisualFixtures`
- Onboarding checklist dismissed (`showChecklist: false`)
- Session base timestamp: `_today.setHours(10, 42, 0, 0)` → user message shows "10:42 AM"
- 4 archived sessions added for count=12

### New lib files
- `session-kind.ts`: `sessionKind()`, `SessionKind` type
- `session-age.ts`: `compactSessionAge()`
- `user-identity.ts`: `userIdentityFromName()`
- `inline-code.ts`: `splitInlineCode()`
- `turn-run-output.ts`: `latestTurnRunOutput()`

### Icons
- `IconPaperclip`, `IconSend`, `IconEye`, `IconTriangleAlert` added to icons.tsx
- `IconChat`, `IconCode`, `IconSquarePen`, `IconPullRequest`, `IconWrench`, `type IconProps` added to Sidebar import

## Known gaps (need build + sweep to verify)
- Session kind icon CSS sizing vs reference (14px, muted color)
- Activity panel amber decision box dark mode exact colors
- Bash output block scroll/overflow behavior on very long output
- Island (D3) sessions panel hide + composer width adjustment
