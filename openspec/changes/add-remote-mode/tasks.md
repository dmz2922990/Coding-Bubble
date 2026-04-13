## 1. Shared Protocol & Package Setup

- [x] 1.1 Create `packages/remote/` package with `package.json`, `tsconfig.json`, and entry points
- [x] 1.2 Define shared protocol types in `src/shared/protocol.ts` — all message type interfaces (`AuthMessage`, `HookEventMessage`, `StreamCreateMessage`, `StreamEventMessage`, `PermissionResponseMessage`, `ListDirectoryMessage`, `ErrorMessage`, etc.) and a discriminated union `RemoteMessage` type
- [x] 1.3 Define shared error codes and constants in `src/shared/errors.ts` (`INVALID_MESSAGE`, `UNKNOWN_TYPE`, `AUTH_FAILED`, `TIMEOUT`, `NOT_CONNECTED`)
- [x] 1.4 Add `ws` dependency to `packages/remote/package.json`
- [x] 1.5 Extend `SessionState.source` type in `packages/session-monitor/src/types.ts` to include `'remote-hook' | 'remote-stream'`
- [x] 1.6 Audit all `source` references in the codebase and update pattern-matching logic if needed

## 2. Remote Server — Transport Layer

- [x] 2.1 Implement WebSocket server in `src/server/server.ts` — listen on configurable port, accept connections, enforce single-client limit, handle graceful shutdown (SIGINT/SIGTERM)
- [x] 2.2 Implement authentication handler — validate token on `auth` message, respond with `auth_result`, close connection on failure or timeout (5s), skip auth when no token configured
- [x] 2.3 Implement message router — parse incoming JSON, dispatch by `type`, handle malformed/unknown messages with error responses
- [x] 2.4 Implement `server_info` broadcast — send hostname, platform, pid after successful auth

## 3. Remote Server — Hook Collection

- [x] 3.1 Implement `src/server/hook-collector.ts` — create local `SocketServer` (reusing `@coding-bubble/session-monitor`), call `installHooks()` on startup, forward hook events to connected client as `hook_event` messages
- [x] 3.2 Implement hook permission relay — intercept `PermissionRequest` events from local `SocketServer`, forward to client as `hook_event`, await client's `hook_permission_response`, resolve the local permission Promise
- [x] 3.3 Implement permission timeout — auto-deny after 120s if no client response
- [x] 3.4 Implement disconnect handling — auto-deny pending permissions with "No client connected" when client disconnects

## 4. Remote Server — Stream Handler

- [x] 4.1 Implement `src/server/stream-handler.ts` — handle `stream_create` messages: spawn `StreamSession` in requested cwd, respond with `stream_create_result` including new sessionId or error
- [x] 4.2 Implement stream event relay — subscribe to `StreamSession` events, forward each as `stream_event` message to client
- [x] 4.3 Implement `stream_send` handler — call `streamSession.send(text)` on the target session
- [x] 4.4 Implement `stream_interrupt` handler — call `streamSession.interrupt()` on the target session
- [x] 4.5 Implement `stream_destroy` handler — call `streamSession.close()` and clean up session state
- [x] 4.6 Implement `stream_permission_response` handler — call `streamSession.respondPermission(requestId, result)` with client's decision
- [x] 4.7 Implement session resume support — handle `sessionId` parameter in `stream_create` to pass `--resume` flag

## 5. Remote Server — Directory Browsing & CLI

- [x] 5.1 Implement `list_directory` handler — list filesystem entries with name, type (file/directory), and full path; default to home directory when no path specified; handle non-existent paths with error
- [x] 5.2 Implement CLI entry point `src/server/index.ts` — parse `--port`, `--token` arguments, start server, install hooks, handle graceful shutdown (cleanup hooks, close connections)
- [x] 5.3 Add bin entry to `package.json` for CLI execution (`npx @coding-bubble/remote`)

## 6. Client — Remote Manager

- [x] 6.1 Implement `src/client/remote-manager.ts` — manage multiple WebSocket connections (Map of serverId → WebSocket), store server configurations (host, port, token)
- [x] 6.2 Implement connection lifecycle — connect, authenticate, disconnect, auto-reconnect with exponential backoff (1s → 2s → 4s → 8s → 16s → 30s max)
- [x] 6.3 Implement session recovery on reconnect — request active session info from server, update existing SessionStore entries without creating duplicates
- [x] 6.4 Implement `list_directory` request — send request and return Promise with directory entries

## 7. Client — Remote Hook Adapter

- [x] 7.1 Implement `src/client/remote-hook-adapter.ts` — receive `hook_event` messages, feed into `sessionStore.process(event)` with source `'remote-hook'`
- [x] 7.2 Implement remote hook permission handling — receive permission `hook_event`, create Promise with resolver, trigger `waitingForApproval` phase in SessionStore, send `hook_permission_response` when user resolves
- [x] 7.3 Implement `hook_session_close` — handle user-initiated tab close by sending close message and cleaning up SessionStore
- [x] 7.4 Integrate RemoteHookAdapter with RemoteManager — register message handlers on WebSocket connection

## 8. Client — Remote Stream Adapter

- [x] 8.1 Implement `src/client/remote-stream-adapter.ts` — manage remote stream sessions (Map of sessionId → session state), translate incoming `stream_event` messages into SessionStore operations (mirroring `StreamAdapterManager` event mapping)
- [x] 8.2 Extract shared event-to-SessionStore translation logic from `StreamAdapterManager` into a reusable utility (both local and remote adapters use the same mapping)
- [x] 8.3 Implement `create(cwd, sessionId?)` — send `stream_create` to server, await `stream_create_result`, create session in SessionStore with source `'remote-stream'`
- [x] 8.4 Implement `send(sessionId, text)` — send `stream_send` to server
- [x] 8.5 Implement permission handling — receive `permission_request` stream events, create pending permission, send `stream_permission_response` on user action
- [x] 8.6 Implement `interrupt(sessionId)` and `destroy(sessionId)` — send corresponding messages to server
- [x] 8.7 Integrate RemoteStreamAdapter with RemoteManager

## 9. Desktop — IPC & Main Process Integration

- [x] 9.1 Add new IPC channels in preload: `remote.connect`, `remote.disconnect`, `remote.listServers`, `remote.addServer`, `remote.removeServer`, `remote.listDirectory`, `remote.stream.create`, `remote.stream.send`, `remote.stream.approve`, `remote.stream.deny`, `remote.stream.alwaysAllow`, `remote.stream.interrupt`, `remote.stream.destroy`, `remote.hook.closeSession`
- [x] 9.2 Implement IPC handlers in `apps/desktop/src/main/index.ts` — wire `remote.*` channels to RemoteManager methods
- [x] 9.3 Initialize RemoteManager in main process startup sequence — connect to configured servers, register adapters
- [x] 9.4 Integrate remote sessions into `broadcastToRenderer` — ensure remote session updates reach the renderer via existing `session:update` channel

## 10. Desktop — UI: Settings & Configuration

- [x] 10.1 Add remote server configuration section to Settings panel — form to input host, port, token; list of configured servers with connect/disconnect/remove actions
- [x] 10.2 Persist server configurations in runtime config (`data/config.json`) under a `remoteServers` key
- [x] 10.3 Show connection status indicator for each configured server (connected/disconnected/connecting)

## 11. Desktop — UI: New Session Dialog & Tab Management

- [x] 11.1 Add "Remote" option to new session dialog — show list of connected remote servers
- [x] 11.2 Implement remote directory browser component — display entries from `list_directory`, support navigation (click to enter directory, back button to go up), show current path
- [x] 11.3 Wire remote directory selection to stream creation — on "Create" button, call `remote.stream.create` with selected server and directory
- [x] 11.4 Add remote server badge to tab headers — show hostname or configured name on remote hook and stream session tabs
- [x] 11.5 Handle dynamic tab creation for remote hook sessions — auto-create tab on `SessionStart` event, auto-mark ended on `SessionEnd`
- [x] 11.6 Handle tab close for remote sessions — send appropriate close/destroy message to server, clean up SessionStore

## 12. Testing & Validation

- [ ] 12.1 Unit tests for protocol message parsing and validation (`packages/remote/src/shared/`)
- [ ] 12.2 Unit tests for server authentication and single-client enforcement
- [ ] 12.3 Unit tests for server hook event forwarding and permission relay
- [ ] 12.4 Unit tests for server stream handler (create, send, destroy, permission)
- [ ] 12.5 Unit tests for client RemoteManager reconnection logic
- [ ] 12.6 Unit tests for client RemoteHookAdapter event ingestion
- [ ] 12.7 Unit tests for client RemoteStreamAdapter event translation
- [ ] 12.8 Integration test: full hook permission round-trip (server → client → user approve → server)
- [ ] 12.9 Integration test: full stream session lifecycle (create → send → permission → destroy)
- [ ] 12.10 E2E test: connect to remote server, create remote stream session, send message, verify display
