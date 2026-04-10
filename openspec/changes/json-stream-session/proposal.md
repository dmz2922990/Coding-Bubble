## Why

The current hooks-based architecture can only monitor and approve existing Claude Code terminal sessions — it cannot send messages or initiate conversations from within the app. Claude Code's `--input-format stream-json --output-format stream-json` mode enables full bidirectional communication over stdin/stdout, allowing Coding-bubble to become a first-class client: spawning sessions, sending prompts, receiving streaming responses, and handling permission requests — all without requiring a separate terminal.

## What Changes

- Add a `+` button in the session list view ("对话" tab) to create a new stream-json session
- Spawn a Claude Code child process with `stream-json` mode and manage its lifecycle (start/stop/graceful shutdown)
- Reuse the existing `SessionTab` UI for rendering messages, with a stream-json visual indicator (badge/icon) to distinguish from hook-based sessions
- Add a message input bar at the bottom of stream-json session tabs for composing and sending prompts
- Stream assistant responses (text, tool_use, thinking) in real-time into the existing chat item list
- Handle `control_request` permission prompts via the existing approval UI (Allow/Deny/Always Allow)
- Persist stream-json sessions so they can be resumed (`--resume` or `--continue --fork-session`)
- Coexist with the existing hooks-based monitoring without interference

## Capabilities

### New Capabilities
- `stream-json-process`: Spawning and managing Claude Code child processes via stdin/stdout JSON stream protocol (lifecycle, stdin write, stdout read loop, graceful 3-phase shutdown, session resume)
- `stream-json-input-ui`: Message input bar for composing prompts and sending to Claude Code, with send-on-enter, multi-line support, and turn-busy indicator
- `stream-json-session-tab`: Tab creation flow from the "+" button, stream-json session tab rendering (reuse SessionTab with special indicator badge), and session list integration

### Modified Capabilities

## Impact

- **Main process** (`apps/desktop/src/main/index.ts`): New child process spawning, stdin/stdout pipe management, new IPC channels for send/create/destroy stream sessions
- **New package or module**: Stream-json protocol handler (TypeScript port of cc-connect's `agent/claudecode/session.go`), likely within `packages/session-monitor/` or a new `packages/stream-json/` package
- **Renderer** (`ChatPanel/SessionListView`, `SessionTab`): "+" button in session list, input bar component, stream-json badge indicator, message streaming display
- **Preload** (`preload/index.ts`): New IPC channels (`stream:create`, `stream:send`, `stream:destroy`, `stream:onEvent`)
- **Shared types** (`packages/shared/`): New event/message types for stream-json protocol
- **Dependencies**: `child_process` (Node built-in), no new external packages expected
