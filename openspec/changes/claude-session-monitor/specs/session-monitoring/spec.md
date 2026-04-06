# Spec: Session Monitoring

## Requirements

### Session Lifecycle

- **REQ-1**: The system SHALL detect new Claude Code sessions within 1 second of session start via the `SessionStart` or `UserPromptSubmit` hook event.
- **REQ-2**: The system SHALL assign each session a unique identity derived from the `session_id` field provided by the hook.
- **REQ-3**: The system SHALL track session phase using a validated state machine with phases: idle, processing, waitingForInput, waitingForApproval, compacting, ended.
- **REQ-4**: The system SHALL only allow valid state transitions as defined in the SessionPhase design. Invalid transitions SHALL be logged and ignored.
- **REQ-5**: The system SHALL remove a session from the store when the `SessionEnd` hook fires with `status: "ended"`.
- **REQ-6**: The system SHALL publish state changes to all renderer processes within 200ms of any state mutation.

### Hook System

- **REQ-7**: On app startup, the system SHALL install a Python hook script at `~/.claude/hooks/claude-bubble-state.py`.
- **REQ-8**: The system SHALL register the hook in `~/.claude/settings.json` for the following events: UserPromptSubmit, PreToolUse, PostToolUse, PermissionRequest, Notification, Stop, SubagentStop, SessionStart, SessionEnd, PreCompact.
- **REQ-9**: The PermissionRequest hook SHALL be registered with a `timeout` of 86400 seconds to prevent Claude from timing out while waiting for user decision.
- **REQ-10**: The system SHALL verify the hook script exists and is properly registered on each app launch, repairing if corrupted or missing.

### Socket Communication

- **REQ-11**: The system SHALL create a Unix domain socket server at `/tmp/claude-bubble.sock` on app startup.
- **REQ-12**: The socket server SHALL decode incoming JSON events into typed `HookEvent` objects.
- **REQ-13**: For `PermissionRequest` events, the socket server SHALL keep the client connection open and store it in a pending permissions map keyed by `toolUseId`.
- **REQ-14**: The socket server SHALL respond to pending permission requests with `{"decision": "allow"|"deny", "reason": string|null}` JSON.
- **REQ-15**: When responding to a permission request, the socket server SHALL close the client connection after writing the response.
- **REQ-16**: For non-PermissionRequest events, the socket server SHALL close the connection after decoding.

### Tool Use ID Correlation

- **REQ-17**: Since PermissionRequest events do not include `tool_use_id`, the system SHALL cache `tool_use_id` from the preceding `PreToolUse` event.
- **REQ-18**: The cache key SHALL be a composite of `sessionId:toolName:serializedInput` (with sorted keys for determinism).
- **REQ-19**: The cache SHALL use a FIFO queue per key to handle multiple concurrent tool uses of the same type.

### Permission Flow

- **REQ-20**: When a `PermissionRequest` hook fires, the hook script SHALL connect to the Unix socket and block waiting for a response.
- **REQ-21**: The session SHALL transition to `waitingForApproval` phase with a `PermissionContext` containing tool name, input, and toolUseId.
- **REQ-22**: The renderer SHALL display an approval bar with Allow and Deny buttons when a session is in `waitingForApproval` phase.
- **REQ-23**: Clicking "Allow" SHALL trigger `session.approve(sessionId)` IPC, which writes `{"decision":"allow","reason":null}` to the held-open socket connection.
- **REQ-24**: Clicking "Deny" SHALL trigger `session.deny(sessionId, reason?)` IPC, which writes `{"decision":"deny","reason":"..."}` to the socket connection.
- **REQ-25**: After permission is resolved (allowed or denied), the session SHALL transition to the next appropriate phase (processing for allow, idle/waitingForInput for deny).
- **REQ-26**: If multiple tools are pending approval simultaneously, resolving one SHALL switch the session phase to the next pending tool rather than to idle.

### Chat History (JSONL Parsing)

- **REQ-27**: The system SHALL parse Claude Code JSONL files at `~/.claude/projects/{project-dir}/{session-id}.jsonl`.
- **REQ-28**: The system SHALL support full conversation parsing for initial session tab load.
- **REQ-29**: The system SHALL support incremental parsing that reads only new lines since the last parse (offset-based).
- **REQ-30**: Incremental parsing SHALL be debounced at 100ms to avoid excessive re-parsing during active conversations.
- **REQ-31**: The parser SHALL extract: user messages (text), assistant messages (text + thinking blocks), tool_use blocks (name, input, id), tool_result blocks (stdout, stderr, error, interrupt detection).
- **REQ-32**: The parser SHALL detect `/clear` commands and trigger a reconciliation that clears existing chat items for that session.
- **REQ-33**: The parser SHALL extract structured results for individual tools (Bash stdout/stderr, Read content, Edit patches, etc.).

### Tab Management

- **REQ-34**: The ChatPanel SHALL maintain a "对话" tab as the default tab (non-closable).
- **REQ-35**: Each active session SHALL have a corresponding dynamic tab with the session's project name as title.
- **REQ-36**: Session tabs SHALL include a colored status indicator: green for processing, amber pulsing for waitingForApproval, gray for idle/waitingForInput, red for ended.
- **REQ-37**: When a session ends, its tab SHALL be automatically removed.
- **REQ-38**: If the active tab is removed due to session end, the active tab SHALL switch to "对话".
- **REQ-39**: The "对话" tab SHALL display a list of all active sessions as cards, showing project name, path, status, and current activity.
- **REQ-40**: Clicking a session card in the "对话" tab SHALL switch to that session's individual tab.

### Tab Content Requirements

- **REQ-41**: The "对话" tab SHALL display an empty state message when no sessions are active.
- **REQ-42**: A session tab SHALL display a header with project name, path, and current phase.
- **REQ-43**: A session tab SHALL display the chat history as a scrollable list.
- **REQ-44**: User messages SHALL display on the right side with a styled bubble.
- **REQ-45**: Assistant messages SHALL display on the left side with a status indicator dot.
- **REQ-46**: Tool calls SHALL display with tool name, input preview, status dot (colored), and be expandable to show results.
- **REQ-47**: Thinking blocks SHALL display collapsed (first 80 characters) with click-to-expand.
- **REQ-48**: Permission approval bar SHALL appear at the bottom of the message area when session is in `waitingForApproval` phase.

### Scroll Behavior

- **REQ-49**: The message list SHALL auto-scroll to bottom when new content arrives.
- **REQ-50**: When user scrolls away from bottom, auto-scroll SHALL pause.
- **REQ-51**: While auto-scroll is paused, new messages SHALL trigger a floating "N new messages" indicator.
- **REQ-52**: Clicking the indicator SHALL scroll to bottom and resume auto-scroll.
