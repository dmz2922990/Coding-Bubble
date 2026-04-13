## Context

Coding-bubble is an Electron desktop app that monitors local Claude Code sessions via two modes:
- **Hook mode**: Claude Code hook scripts send events via Unix domain socket → `SocketServer` → `SessionStore.process()`
- **Stream mode**: App spawns `claude` CLI as child process, communicates via stdin/stdout JSON Lines → `StreamSession` → `StreamAdapterManager` → `SessionStore`

Both modes feed into the same `SessionStore` state machine and render through the same ChatPanel/FloatingBall UI. `SessionState.source` distinguishes `'hook'` vs `'stream'`.

The remote mode adds a third dimension: remote devices running Claude Code communicate with the local desktop app over the network. The remote device acts as **server**, the local app acts as **client**. The goal is to reuse existing SessionStore, ChatPanel, and FloatingBall logic unchanged — only the transport layer and session creation differ.

### Key Constraints
- Remote server must be a lightweight standalone Node.js process (no Electron dependency)
- Must support multiple concurrent hook + stream sessions from one remote server
- Must support connections from the client to multiple remote servers simultaneously
- Permission requests from remote sessions must be handled by the local user
- Remote hook sessions are driven by remote events (dynamic tab create/close)
- Remote stream sessions are initiated by the client (user selects remote project directory)

## Goals / Non-Goals

**Goals:**
- Enable monitoring and interaction with Claude Code sessions running on remote devices
- Reuse existing SessionStore, ChatPanel, FloatingBall, and StreamAdapterManager logic without modification
- Support all existing hook session functionality remotely (events, permissions, notifications, phase transitions)
- Support all existing stream session functionality remotely (send messages, approve/deny permissions, interrupt)
- Support multiple concurrent remote sessions of both types
- Provide a standalone server component deployable on any machine with Node.js and Claude Code CLI

**Non-Goals:**
- Modifying the local hook or stream mode behavior
- Building a web-based client (this is still an Electron desktop app)
- Supporting connections through NAT/firewall traversal (direct TCP connectivity required)
- File sync or remote file editing capabilities
- Multi-user access control (one client per server connection)

## Decisions

### D1: WebSocket as transport protocol

**Decision**: Use WebSocket (`ws` library) for client-server communication.

**Rationale**: WebSocket provides persistent, bidirectional, message-oriented communication over TCP. Unlike raw TCP, it handles message framing natively. Unlike HTTP/SSE, it supports true bidirectional communication needed for permission responses and stream input. The `ws` library is mature, lightweight, and has no native dependencies.

**Alternatives considered**:
- **Raw TCP + custom framing**: More control but reinvents message framing and reconnection logic
- **HTTP + SSE + POST**: Unidirectional event flow from server; would need separate HTTP requests for client→server, adding latency especially for permission responses
- **gRPC**: Overkill for this use case, adds complex build tooling

### D2: New package `@coding-bubble/remote`

**Decision**: Create a new `packages/remote/` package containing both server and shared protocol code.

**Structure**:
```
packages/remote/
  src/
    shared/
      protocol.ts       -- Message types, constants
      errors.ts         -- Error types
    server/
      index.ts          -- Server entry point (also CLI executable)
      server.ts         -- WebSocket server, connection management
      hook-collector.ts -- Installs hooks, collects events, forwards to clients
      stream-handler.ts -- Spawns claude CLI, relays stream-json to/from clients
    client/
      index.ts          -- Client exports
      remote-manager.ts -- Manages connections to remote servers
      remote-hook-adapter.ts    -- Bridges remote hook events into SessionStore
      remote-stream-adapter.ts  -- Bridges remote stream events into SessionStore
```

**Rationale**: Shared protocol types live in one place and are imported by both server and client. The server is published as a CLI tool (`npx @coding-bubble/remote` or installed globally). The client module is imported by the desktop app.

### D3: Message protocol design

**Decision**: JSON-based message protocol with a `type` discriminator field. All messages are sent as WebSocket text frames (one JSON object per frame).

**Protocol messages**:

```
// Authentication
→ { type: 'auth', token: string }
← { type: 'auth_result', success: boolean, error?: string }

// Connection lifecycle
← { type: 'server_info', hostname: string, platform: string, pid: number }

// Hook mode (server → client)
← { type: 'hook_event', sessionId: string, event: HookEvent }
→ { type: 'hook_permission_response', sessionId: string, toolUseId: string, response: HookResponse }
→ { type: 'hook_session_close', sessionId: string }  // client requests close

// Hook mode (client → server, for permission)
// (hook_permission_response above covers this)

// Stream mode (client → server)
→ { type: 'stream_create', requestId: string, cwd: string, sessionId?: string, model?: string, permissionMode?: string }
← { type: 'stream_create_result', requestId: string, sessionId: string, error?: string }
→ { type: 'stream_send', sessionId: string, text: string }
→ { type: 'stream_interrupt', sessionId: string }
→ { type: 'stream_destroy', sessionId: string }
→ { type: 'stream_permission_response', sessionId: string, requestId: string, result: PermissionResult }

// Stream mode (server → client)
← { type: 'stream_event', sessionId: string, event: StreamEvent }

// Remote directory browsing
→ { type: 'list_directory', requestId: string, path?: string }
← { type: 'list_directory_result', requestId: string, entries: DirEntry[], error?: string }

// Error
← { type: 'error', code: string, message: string, sessionId?: string }
```

**Rationale**: Each message is self-contained and carries the `sessionId` for multiplexing. The protocol mirrors the existing `HookEvent`/`HookResponse` and `StreamEvent`/`PermissionResult` types exactly, minimizing translation overhead.

### D4: Server-side hook collection architecture

**Decision**: The remote server runs its own local `SocketServer` (reusing `@coding-bubble/session-monitor`) to collect hook events from Claude Code, then forwards them as `hook_event` messages to the connected client.

**Flow**:
```
Remote Claude Code → hook script → Unix socket → Server's SocketServer
  → onEvent callback → WebSocket `hook_event` message → Client
  → onPermissionRequest callback → WebSocket `hook_event` (with PermissionRequest)
  → Client processes → User approves/denies → WebSocket `hook_permission_response`
  → Server resolves onPermissionRequest Promise → SocketServer writes response → hook script → Claude Code
```

**Rationale**: Reuses the existing `SocketServer` and hook scripts from `@coding-bubble/session-monitor`. The server is essentially a "bridge" that replaces the direct Unix socket connection with a WebSocket tunnel.

**Hook installation on remote**: The server calls `installHooks()` on startup with a modified hook script path that points to the remote server's socket path. This is identical to the local app's behavior.

### D5: Server-side stream session management

**Decision**: The remote server spawns `claude` CLI child processes on behalf of the client. It relays stream-json stdin/stdout through WebSocket messages.

**Flow**:
```
Client sends `stream_create` → Server spawns claude CLI (StreamSession)
  → StreamSession emits StreamEvent → Server wraps as `stream_event` → Client
  → Client sends `stream_send` → Server calls streamSession.send(text) → claude stdin
  → Permission request: StreamSession emits permission_request → Server sends `stream_event`
  → Client approves → sends `stream_permission_response` → Server calls streamSession.respondPermission()
```

**Rationale**: Reuses the existing `StreamSession` from `@coding-bubble/stream-json`. The server is a transparent relay — it doesn't interpret stream events, just forwards them.

### D6: Client-side integration — RemoteManager

**Decision**: Add a `RemoteManager` class in the desktop main process that manages WebSocket connections to remote servers and routes events into the existing SessionStore.

**Architecture**:
```
RemoteManager
  ├── connections: Map<serverId, WebSocket>
  ├── hookAdapter: RemoteHookAdapter     -- feeds hook events into SessionStore
  └── streamAdapter: RemoteStreamAdapter -- feeds stream events into SessionStore

RemoteHookAdapter
  ├── on hook_event → sessionStore.process(event) with source='remote-hook'
  ├── on permission → creates Promise, stores resolver, triggers UI
  └── on hook_session_close → sessionStore.process(SessionEnd)

RemoteStreamAdapter
  ├── on stream_event → translates StreamEvent → SessionStore operations (mirrors StreamAdapterManager)
  ├── send(message) → WebSocket stream_send
  ├── approvePermission(id) → WebSocket stream_permission_response
  └── destroy(id) → WebSocket stream_destroy
```

**Rationale**: The `RemoteHookAdapter` feeds events into `SessionStore.process()` exactly like the local `SocketServer` does. The `RemoteStreamAdapter` mirrors `StreamAdapterManager`'s event-to-SessionStore translation logic. Both set `source: 'remote-hook' | 'remote-stream'` on sessions.

**SessionState.source extension**: Add `'remote-hook' | 'remote-stream'` to the existing `'hook' | 'stream'` union type. This is a minimal change — all downstream code checks `source` only for display purposes (e.g., showing "hook" or "stream" badge).

### D7: Remote stream session creation UX

**Decision**: In the "new session" dialog, add a "Remote" option alongside existing "Local" option. When selected, user picks a configured remote server, then browses the remote filesystem to select a project directory.

**Flow**:
1. User clicks "+" → New session dialog
2. Selects "Remote" → Shows list of configured remote servers
3. Selects a server → Client sends `list_directory` messages to browse remote filesystem
4. Selects remote project directory → Client sends `stream_create` to server
5. Server spawns claude CLI, sends back `stream_create_result` with sessionId
6. New tab created with the remote stream session

### D8: Authentication

**Decision**: Simple token-based authentication. A shared secret token is configured on the server and provided by the client when connecting.

**Flow**:
1. Server starts with `--token <secret>` argument
2. Client connects, sends `{ type: 'auth', token: <secret> }`
3. Server validates, responds `{ type: 'auth_result', success: true/false }`
4. If failed, server closes the connection

**Rationale**: Simple, sufficient for trusted network environments. No need for complex OAuth or certificate-based auth for the initial implementation. Can be enhanced later.

### D9: Connection resilience

**Decision**: Client implements automatic reconnection with exponential backoff. Sessions are tagged with server identity so they can be re-associated after reconnect.

**Behavior**:
- On disconnect: remote sessions remain in SessionStore with `ended` phase
- On reconnect: server re-sends active session info, client updates existing sessions
- Backoff: 1s → 2s → 4s → 8s → 16s → 30s (max), reset on successful connect

## Risks / Trade-offs

**[Latency on permission requests]** → Remote permission flow adds network round-trip latency (hook event → client → user action → response → server → claude). Claude Code has a default timeout for hook responses. **Mitigation**: Document network requirements; consider adding a configurable auto-approve mode for remote sessions if latency is too high.

**[Security — cleartext token over network]** → Token is sent in plaintext over WebSocket (which is TCP). **Mitigation**: For initial implementation, this is acceptable on trusted networks. Future: add TLS/WSS support or SSH tunnel documentation.

**[SessionStore source type extension]** → Adding `'remote-hook' | 'remote-stream'` to the `source` union requires updating any code that pattern-matches on `source`. **Mitigation**: Audit all `source` references; most code doesn't care about source type.

**[Server process management]** → The remote server is a standalone process that users must manage (start/stop). **Mitigation**: Provide clear documentation, systemd service file, and a simple CLI interface. Consider Docker image for easy deployment.

**[Remote stream adapter duplicates StreamAdapterManager logic]** → The `RemoteStreamAdapter` needs to translate `StreamEvent` → `SessionStore` operations, which duplicates the `StreamAdapterManager` event mapping. **Mitigation**: Extract the common event-to-SessionStore translation into a shared utility function that both `StreamAdapterManager` and `RemoteStreamAdapter` use.

**[Multiple client connections]** → The design currently assumes one client per server. If multiple clients connect, hook events would need to be broadcast and permission responses would conflict. **Mitigation**: Server accepts only one client connection at a time; reject subsequent connections with an appropriate error.
