## Why

Permission bar currently renders 3 fixed buttons (Allow / Deny / Always Allow) regardless of context. Claude Code already sends `permission_suggestions` in both hook and json-stream modes, but Coding-bubble ignores them entirely. Without parsing and surfacing these suggestions, users cannot benefit from smart one-click rule creation (e.g., "Always allow `npm test:*`" or "Auto-accept edits") that Claude Code generates based on the specific tool and command context.

## What Changes

- Parse `permission_suggestions` from Claude Code's permission requests in both communication paths (Hook/Socket and Stream/stdio)
- Replace the fixed "Always Allow" button with dynamically generated suggestion buttons based on the parsed `permission_suggestions` array
- Support all suggestion types: `addRules` (command/pattern-based rules), `setMode` (mode switching like acceptEdits), and `addDirectories`
- Merge multiple `addRules` suggestions (e.g., from piped commands `a && b`) into a single button, matching clawd-on-desk behavior
- Construct proper `updatedPermissions` in the response when a suggestion button is clicked
- Rename "一直允许" to "始终允许" for consistent terminology
- Add localized (zh/en) suggestion labels based on suggestion type and content

## Capabilities

### New Capabilities
- `permission-suggestions`: Parsing, merging, rendering, and responding to Claude Code's `permission_suggestions` in permission requests across both Hook and Stream communication paths

### Modified Capabilities

## Impact

- `packages/stream-json/src/stream-session.ts` — Extract `permission_suggestions` from `control_request` messages
- `packages/stream-json/src/types.ts` — Add suggestion-related type definitions
- `apps/desktop/src/main/stream-adapter.ts` — Pass suggestions through event system, handle suggestion-based responses
- `apps/desktop/src/main/index.ts` — IPC handlers for suggestion decisions (both hook and stream paths)
- `apps/desktop/src/preload/index.ts` — New IPC channel for suggestion-based permission resolution
- `apps/desktop/src/renderer/components/ChatPanel/SessionTab.tsx` — Dynamic PermissionBar rendering with suggestion buttons
- `packages/session-monitor/src/socket-server.ts` — Parse `permission_suggestions` from Hook events
