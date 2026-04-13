## ADDED Requirements

### Requirement: Server-side hook event collection
The remote server SHALL install Claude Code hook scripts on the remote device and collect hook events via a local Unix domain socket, identical to the local hook mode.

#### Scenario: Server installs hooks on startup
- **WHEN** the remote server starts
- **THEN** the server SHALL call `installHooks()` to register hook scripts in `~/.claude/settings.json` on the remote device

#### Scenario: Hook event received and forwarded
- **WHEN** a Claude Code session on the remote device triggers a hook event (e.g., `PreToolUse`, `PostToolUse`, `Notification`, `SessionStart`)
- **THEN** the server SHALL receive the event via its local `SocketServer` and forward it to the client as `{ type: 'hook_event', sessionId: string, event: HookEvent }`

#### Scenario: Hook event received with no client connected
- **WHEN** a hook event occurs on the remote device and no client is connected
- **THEN** the server SHALL discard the event (fire-and-forget for non-permission events)

### Requirement: Client-side remote hook session creation
When the client receives a hook event with a new `sessionId`, it SHALL create a new session in the SessionStore with `source: 'remote-hook'`.

#### Scenario: First event from a remote session
- **WHEN** the client receives a `hook_event` with a `sessionId` not yet tracked in SessionStore
- **THEN** the client SHALL create a new session via `sessionStore.process(event)` with `source` set to `'remote-hook'`

#### Scenario: Subsequent events from an existing remote session
- **WHEN** the client receives a `hook_event` with a `sessionId` already tracked in SessionStore
- **THEN** the client SHALL feed the event into `sessionStore.process(event)` to update the existing session state

### Requirement: Remote hook dynamic tab management
Remote hook sessions SHALL be dynamically created and closed by remote messages. The client SHALL create a new tab when a remote session starts and close it when the session ends.

#### Scenario: Remote session starts — tab created
- **WHEN** the client receives a `hook_event` with `hook_event_name: 'SessionStart'` from a remote server
- **THEN** a new tab SHALL be created in the ChatPanel for that session, showing the remote project name

#### Scenario: Remote session ends — tab closed
- **WHEN** the client receives a `hook_event` with `hook_event_name: 'SessionEnd'` from a remote server
- **THEN** the session SHALL transition to `ended` phase and the tab SHALL be marked as ended

#### Scenario: Client requests session close
- **WHEN** the user closes a remote hook session tab in the UI
- **THEN** the client SHALL send `{ type: 'hook_session_close', sessionId: string }` to the server and clean up the session in SessionStore

### Requirement: Remote hook permission request relay
Permission requests from remote Claude Code sessions SHALL be forwarded to the client for user approval. The response SHALL be sent back to the server and relayed to the hook script.

#### Scenario: Permission request flow — user approves
- **WHEN** a remote Claude Code session triggers a `PermissionRequest` hook event
- **THEN** the server SHALL forward it to the client as a `hook_event`
- **AND** the client SHALL transition the session to `waitingForApproval` phase
- **AND** the FloatingBall SHALL show a notification
- **WHEN** the user clicks approve
- **THEN** the client SHALL send `{ type: 'hook_permission_response', sessionId, toolUseId, response: { decision: 'allow' } }`
- **AND** the server SHALL relay the response to the hook script which outputs it to Claude Code

#### Scenario: Permission request flow — user denies
- **WHEN** a remote Claude Code session triggers a `PermissionRequest` hook event
- **AND** the user clicks deny with a reason
- **THEN** the client SHALL send `{ type: 'hook_permission_response', sessionId, toolUseId, response: { decision: 'deny', reason: '...' } }`
- **AND** the server SHALL relay the denial to the hook script

#### Scenario: Permission request while client disconnected
- **WHEN** a `PermissionRequest` occurs on the remote device and no client is connected
- **THEN** the server SHALL auto-deny the permission with reason "No client connected" to avoid blocking Claude Code indefinitely

#### Scenario: Permission request timeout
- **WHEN** a `PermissionRequest` has been forwarded to the client but no response is received within 120 seconds
- **THEN** the server SHALL auto-deny the permission with reason "Timeout waiting for client response"

### Requirement: Remote hook covers all local hook event types
The remote hook mode SHALL support all hook event types supported by the local hook mode: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `StopFailure`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PostCompact`, `Notification`, `PermissionRequest`.

#### Scenario: All event types forwarded correctly
- **WHEN** any of the 14 hook event types occur on the remote device
- **THEN** the server SHALL forward the complete `HookEvent` (including `hook_event_name`, `session_id`, `cwd`, `pid`, `payload`) to the client without data loss

#### Scenario: SessionStore processes remote events identically
- **WHEN** the client receives a remote `hook_event` and feeds it to `sessionStore.process()`
- **THEN** the SessionStore SHALL produce the same state transitions, chat items, and notifications as it would for a local hook event

### Requirement: Remote hook session identification
Remote hook sessions SHALL be distinguishable from local sessions in the UI, showing the remote server name/hostname.

#### Scenario: Tab shows remote server badge
- **WHEN** a remote hook session tab is displayed
- **THEN** the tab SHALL show the remote server's hostname or configured name alongside the project name

#### Scenario: Session list shows source type
- **WHEN** the session list is displayed
- **THEN** remote hook sessions SHALL be visually distinguished from local hook and stream sessions

### Requirement: Multiple remote hook sessions
The system SHALL support multiple concurrent remote hook sessions from one remote server.

#### Scenario: Multiple Claude Code sessions active on remote
- **WHEN** multiple Claude Code sessions are running simultaneously on the remote device
- **THEN** each session SHALL appear as a separate tab in the client, each with its own `sessionId`

#### Scenario: Sessions from different remote servers
- **WHEN** the client is connected to multiple remote servers, each with active hook sessions
- **THEN** all sessions SHALL be displayed, tagged with their respective server identifiers
