## ADDED Requirements

### Requirement: WebSocket server on remote device
The system SHALL provide a standalone WebSocket server that runs on the remote device, listening on a configurable TCP port for incoming client connections.

#### Scenario: Server starts with default port
- **WHEN** the remote server is started without specifying a port
- **THEN** the server SHALL listen on port 9527

#### Scenario: Server starts with custom port
- **WHEN** the remote server is started with `--port 8080`
- **THEN** the server SHALL listen on port 8080

#### Scenario: Server port already in use
- **WHEN** the server attempts to bind to a port that is already occupied
- **THEN** the server SHALL log an error message and exit with non-zero code

### Requirement: Token-based authentication
The system SHALL authenticate client connections using a shared secret token. The server MUST reject any connection that does not provide a valid token.

#### Scenario: Successful authentication
- **WHEN** a client connects and sends `{ type: 'auth', token: '<valid-token>' }`
- **THEN** the server SHALL respond with `{ type: 'auth_result', success: true }` and keep the connection open

#### Scenario: Failed authentication
- **WHEN** a client connects and sends `{ type: 'auth', token: '<invalid-token>' }`
- **THEN** the server SHALL respond with `{ type: 'auth_result', success: false, error: 'Invalid token' }` and close the connection

#### Scenario: No token configured on server
- **WHEN** the server is started without `--token` argument
- **THEN** the server SHALL accept all connections without authentication

#### Scenario: Client sends no auth message
- **WHEN** a client connects but does not send an auth message within 5 seconds
- **THEN** the server SHALL close the connection

### Requirement: Single client connection enforcement
The server SHALL accept at most one authenticated client connection at a time. Subsequent connection attempts MUST be rejected.

#### Scenario: Second client attempts to connect while one is active
- **WHEN** an authenticated client is already connected and a second client attempts to connect
- **THEN** the server SHALL reject the second connection with an appropriate error

#### Scenario: Previous client disconnects, new client connects
- **WHEN** the authenticated client disconnects and a new client connects
- **THEN** the server SHALL accept the new client's connection normally

### Requirement: JSON message protocol
All communication between server and client SHALL use JSON messages sent as WebSocket text frames. Each message MUST contain a `type` field as the message discriminator.

#### Scenario: Valid message exchange
- **WHEN** the server receives a valid JSON message with a recognized `type`
- **THEN** the server SHALL process the message and send an appropriate response

#### Scenario: Malformed message received
- **WHEN** the server receives a non-JSON or structurally invalid message
- **THEN** the server SHALL send an `{ type: 'error', code: 'INVALID_MESSAGE', message: '...' }` response and keep the connection open

#### Scenario: Unknown message type
- **WHEN** the server receives a JSON message with an unrecognized `type`
- **THEN** the server SHALL send an `{ type: 'error', code: 'UNKNOWN_TYPE', message: '...' }` response

### Requirement: Session multiplexing
Multiple hook and stream sessions SHALL be multiplexed over a single WebSocket connection. Each message MUST carry a `sessionId` field to identify which session it belongs to.

#### Scenario: Multiple hook sessions active
- **WHEN** multiple Claude Code hook sessions are active on the remote device
- **THEN** the server SHALL forward events for all sessions over the same connection, each tagged with its `sessionId`

#### Scenario: Multiple stream sessions active
- **WHEN** the client has created multiple remote stream sessions
- **THEN** all stream events and commands SHALL flow through the same connection, disambiguated by `sessionId`

### Requirement: Automatic reconnection from client
The client SHALL implement automatic reconnection with exponential backoff when the WebSocket connection is lost.

#### Scenario: Connection lost and restored
- **WHEN** the WebSocket connection drops unexpectedly
- **THEN** the client SHALL attempt to reconnect after 1 second, then 2s, 4s, 8s, 16s, up to a maximum of 30 seconds between attempts

#### Scenario: Connection restored successfully
- **WHEN** a reconnection attempt succeeds and authentication passes
- **THEN** the backoff timer SHALL reset to 1 second

#### Scenario: Session recovery after reconnect
- **WHEN** the connection is restored after a disconnect
- **THEN** the server SHALL re-send information about all active sessions, and the client SHALL update existing SessionStore entries rather than creating duplicates

### Requirement: Server info broadcast
After successful authentication, the server SHALL send server identification information to the client.

#### Scenario: Server info sent after auth
- **WHEN** a client successfully authenticates
- **THEN** the server SHALL send `{ type: 'server_info', hostname: string, platform: string, pid: number }`

### Requirement: Remote directory browsing
The server SHALL support remote directory listing to enable the client to browse the remote filesystem when creating stream sessions.

#### Scenario: List root directory
- **WHEN** the client sends `{ type: 'list_directory', requestId: 'r1' }` without a path
- **THEN** the server SHALL return the contents of the remote user's home directory

#### Scenario: List specific directory
- **WHEN** the client sends `{ type: 'list_directory', requestId: 'r1', path: '/home/user/projects' }`
- **THEN** the server SHALL return `{ type: 'list_directory_result', requestId: 'r1', entries: [{ name, type: 'file'|'directory', path }] }`

#### Scenario: Directory does not exist
- **WHEN** the client requests listing of a non-existent path
- **THEN** the server SHALL return `{ type: 'list_directory_result', requestId: 'r1', entries: [], error: 'Path not found' }`

### Requirement: Remote server as standalone CLI
The remote server SHALL be executable as a standalone Node.js CLI process with no Electron dependency.

#### Scenario: Start server via npx
- **WHEN** user runs `npx @coding-bubble/remote --token mysecret --port 9527`
- **THEN** the server SHALL start, install hooks on the remote device, and begin listening for client connections

#### Scenario: Graceful shutdown
- **WHEN** the server process receives SIGINT or SIGTERM
- **THEN** the server SHALL close the WebSocket connection, stop accepting new connections, clean up hook installations, and exit cleanly

### Requirement: Client-side server configuration
The desktop app SHALL allow users to configure one or more remote servers with host, port, and token.

#### Scenario: Add a new remote server
- **WHEN** user enters server host, port, and token in settings and clicks "Add"
- **THEN** the configuration SHALL be saved and the client SHALL attempt to connect

#### Scenario: Remove a remote server
- **WHEN** user removes a configured remote server
- **THEN** the client SHALL disconnect from that server and close all associated sessions

#### Scenario: Edit server configuration
- **WHEN** user modifies the host, port, or token of an existing server configuration
- **THEN** the client SHALL disconnect and reconnect with the updated settings
