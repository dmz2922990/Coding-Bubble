## ADDED Requirements

### Requirement: Remote stream session creation
The client SHALL be able to request the remote server to spawn a new Claude Code CLI process with stream-json protocol and relay its input/output through the WebSocket connection.

#### Scenario: Create new remote stream session
- **WHEN** the client sends `{ type: 'stream_create', requestId: 'r1', cwd: '/home/user/project' }`
- **THEN** the server SHALL spawn `claude --output-format stream-json --input-format stream-json --permission-prompt-tool stdio --verbose` in the specified directory
- **AND** the server SHALL respond with `{ type: 'stream_create_result', requestId: 'r1', sessionId: '<new-id>' }`

#### Scenario: Create remote stream session with session resume
- **WHEN** the client sends `{ type: 'stream_create', requestId: 'r1', cwd: '/home/user/project', sessionId: '<claude-session-id>' }`
- **THEN** the server SHALL spawn claude with `--resume <claude-session-id>` flag

#### Scenario: Create session on non-existent directory
- **WHEN** the client sends `stream_create` with a `cwd` that does not exist on the remote device
- **THEN** the server SHALL respond with `{ type: 'stream_create_result', requestId: 'r1', error: 'Directory not found' }`

#### Scenario: Create session when claude CLI not found
- **WHEN** the server cannot find the `claude` CLI on the remote device
- **THEN** the server SHALL respond with `{ type: 'stream_create_result', requestId: 'r1', error: 'Claude CLI not found' }`

### Requirement: Remote stream event relay
The server SHALL relay all stream-json events from the spawned Claude CLI to the client as `stream_event` messages.

#### Scenario: Stream events forwarded
- **WHEN** the spawned Claude CLI outputs a stream-json line (e.g., `text_delta`, `tool_use`, `tool_result`, `result`, `thinking`)
- **THEN** the server SHALL parse it into a `StreamEvent` and send `{ type: 'stream_event', sessionId, event: StreamEvent }` to the client

#### Scenario: All stream event types supported
- **WHEN** any of the supported stream event types occur (`text`, `text_delta`, `tool_use`, `tool_result`, `result`, `thinking`, `permission_request`, `session_state`, `session_init`, `tool_progress`, `tool_summary`, `rate_limit`, `system_status`, `task_lifecycle`, `post_turn_summary`, `error`, `exit`)
- **THEN** the server SHALL relay them to the client without loss or modification

### Requirement: Remote stream user input
The client SHALL be able to send user messages to the remote Claude CLI session.

#### Scenario: Send message to remote stream
- **WHEN** the user types a message in a remote stream session's ChatPanel and presses enter
- **THEN** the client SHALL send `{ type: 'stream_send', sessionId, text: '<user message>' }` to the server
- **AND** the server SHALL call `streamSession.send(text)` to write to the claude CLI stdin

### Requirement: Remote stream permission handling
Permission requests from the remote Claude CLI SHALL be forwarded to the client for approval. The client's response SHALL be relayed back to the server and then to the Claude CLI.

#### Scenario: Permission request — user approves
- **WHEN** the remote Claude CLI emits a `permission_request` event
- **THEN** the server SHALL relay it as a `stream_event` to the client
- **AND** the client SHALL transition the session to `waitingForApproval` and show the permission UI
- **WHEN** the user approves
- **THEN** the client SHALL send `{ type: 'stream_permission_response', sessionId, requestId, result: { behavior: 'allow', updatedInput } }`
- **AND** the server SHALL call `streamSession.respondPermission(requestId, result)` to write the control response to claude CLI stdin

#### Scenario: Permission request — user denies
- **WHEN** the user denies a permission request
- **THEN** the client SHALL send `{ type: 'stream_permission_response', sessionId, requestId, result: { behavior: 'deny', message: '...' } }`

#### Scenario: Permission request — always allow
- **WHEN** the user clicks "Always Allow" on a permission request
- **THEN** the client SHALL send `{ type: 'stream_permission_response', sessionId, requestId, result: { behavior: 'allow', updatedInput } }`
- **AND** the client SHALL send a subsequent message to set the session's permission mode to `'auto'` for future requests

### Requirement: Remote stream interrupt
The client SHALL be able to interrupt a running remote stream session.

#### Scenario: User interrupts remote session
- **WHEN** the user clicks the interrupt button on a remote stream session
- **THEN** the client SHALL send `{ type: 'stream_interrupt', sessionId }` to the server
- **AND** the server SHALL call `streamSession.interrupt()` to send the interrupt signal

### Requirement: Remote stream destroy
The client SHALL be able to destroy (terminate) a remote stream session.

#### Scenario: User closes a remote stream tab
- **WHEN** the user closes a remote stream session tab
- **THEN** the client SHALL send `{ type: 'stream_destroy', sessionId }` to the server
- **AND** the server SHALL call `streamSession.close()` to terminate the claude CLI process

#### Scenario: Session exits on its own
- **WHEN** the remote Claude CLI process exits (naturally or by error)
- **THEN** the server SHALL send an `exit` `stream_event` to the client
- **AND** the client SHALL transition the session to `ended` phase

### Requirement: Remote stream session in new session dialog
The "new session" dialog SHALL include a "Remote" option that allows the user to select a remote server and browse its filesystem to choose a project directory.

#### Scenario: User selects Remote in new session dialog
- **WHEN** the user clicks the "+" button to create a new session and selects "Remote"
- **THEN** the dialog SHALL show a list of configured remote servers with connection status

#### Scenario: User browses remote filesystem
- **WHEN** the user selects a connected remote server
- **THEN** the dialog SHALL show the remote filesystem starting from the home directory
- **AND** the user SHALL be able to navigate into subdirectories by clicking on directory entries
- **AND** the user SHALL be able to go up to the parent directory

#### Scenario: User selects remote project and creates session
- **WHEN** the user selects a remote directory and clicks "Create"
- **THEN** the client SHALL send a `stream_create` message to the selected remote server
- **AND** upon success, a new tab SHALL be created with the remote stream session

#### Scenario: Remote server not connected
- **WHEN** the user selects a remote server that is not currently connected
- **THEN** the dialog SHALL show "Disconnected" status and SHALL NOT allow directory browsing

### Requirement: Remote stream session reuse of existing UI
Remote stream sessions SHALL reuse the existing ChatPanel, message rendering, tool call display, and all UI components used by local stream sessions.

#### Scenario: Chat messages rendered identically
- **WHEN** remote stream events produce chat items in SessionStore
- **THEN** they SHALL be rendered using the same ChatPanel components as local stream sessions

#### Scenario: Tool calls displayed identically
- **WHEN** remote stream events produce tool call items
- **THEN** they SHALL be displayed with the same tool call UI (name, input, status, result) as local sessions

#### Scenario: Result summary displayed identically
- **WHEN** a remote stream session completes a turn
- **THEN** the result summary (tokens, cost, duration) SHALL be displayed identically to local sessions

### Requirement: Remote stream session identification
Remote stream sessions SHALL be distinguishable from local sessions in the UI.

#### Scenario: Tab shows remote server badge
- **WHEN** a remote stream session tab is displayed
- **THEN** the tab SHALL show the remote server's hostname or configured name

#### Scenario: Source type stored in SessionState
- **WHEN** a remote stream session is created in SessionStore
- **THEN** its `source` field SHALL be `'remote-stream'`

### Requirement: Multiple remote stream sessions
The system SHALL support multiple concurrent remote stream sessions, including from different remote servers.

#### Scenario: Multiple sessions on same server
- **WHEN** the client creates multiple stream sessions on the same remote server with different project directories
- **THEN** each session SHALL have its own tab and operate independently

#### Scenario: Sessions across different servers
- **WHEN** the client creates stream sessions on different remote servers
- **THEN** all sessions SHALL be visible in the tab bar, each tagged with its server identifier
