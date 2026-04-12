## 1. Package scaffolding

- [x] 1.1 Create `packages/stream-json/` package with `package.json`, `tsconfig.json`, and `src/` directory
- [x] 1.2 Add `@coding-bubble/stream-json` to workspace config (`pnpm-workspace.yaml`)
- [x] 1.3 Add `@coding-bubble/stream-json` as dependency in `apps/desktop/package.json`

## 2. Core types

- [x] 2.1 Define `StreamEventType` enum and `StreamEvent` interface in `packages/stream-json/src/types.ts`
- [x] 2.2 Define `StreamSessionOptions` interface (cwd, sessionId, model, permissionMode)
- [x] 2.3 Define `PermissionResult` interface (behavior, updatedInput, message)

## 3. StreamSession class

- [x] 3.1 Implement `StreamSession.spawn()` — spawn Claude Code with stream-json flags, filter CLAUDECODE env vars
- [x] 3.2 Implement stdout read loop — readline interface with 10MB max buffer, parse JSON lines, dispatch by `type` field
- [x] 3.3 Implement `handleSystem()` — extract session_id from `system` init event
- [x] 3.4 Implement `handleAssistant()` — parse content array, emit text/tool_use/thinking events
- [x] 3.5 Implement `handleResult()` — emit result event with done=true, session_id, token usage
- [x] 3.6 Implement `handleControlRequest()` — emit permission_request event for `can_use_tool` subtype
- [x] 3.7 Implement `handleControlCancelRequest()` — log and ignore cancelled requests
- [x] 3.8 Implement serialized `writeJSON()` — Mutex-guarded stdin write with newline terminator
- [x] 3.9 Implement `send(text)` — write user message JSON to stdin
- [x] 3.10 Implement `respondPermission(requestId, result)` — write `control_response` with allow/deny to stdin
- [x] 3.11 Implement 3-phase `close()` — stdin close (120s) → SIGTERM (5s) → SIGKILL
- [x] 3.12 Implement error handling — emit `error` and `exit` events on process crash or abnormal exit
- [x] 3.13 Implement `--resume` and `--continue --fork-session` flag construction for session resumption
- [x] 3.14 Export public API from `packages/stream-json/src/index.ts`

## 4. SessionStore adapter

- [x] 4.1 Add `source: 'hook' | 'stream'` field to `SessionState` type in `packages/session-monitor/src/types.ts`
- [x] 4.2 Set `source: 'stream'` when creating sessions from stream-json adapter
- [x] 4.3 Implement adapter in `apps/desktop/src/main/stream-adapter.ts` — translate `StreamEvent` to `HookEvent` and feed into `SessionStore.process()`
- [x] 4.4 Map stream events: `system.init` → `SessionStart`, `result` → `Stop`, process exit → `SessionEnd`
- [x] 4.5 Map stream assistant events to chat items (user, assistant, toolCall, thinking) and phase transitions
- [x] 4.6 Map `control_request` to `PermissionRequest` with pending permission resolver wiring

## 5. IPC channels

- [x] 5.1 Add `stream:create` IPC handler — spawn StreamSession, register adapter, return session ID
- [x] 5.2 Add `stream:send` IPC handler — call `session.send(text)` on the active stream session
- [x] 5.3 Add `stream:destroy` IPC handler — call `session.close()` and clean up adapter
- [x] 5.4 Add `stream:resume` IPC handler — spawn with `--resume` or `--continue --fork-session`
- [x] 5.5 Add `stream:onEvent` forwarder — broadcast stream events to panel renderer via IPC
- [x] 5.6 Add cleanup on app quit — iterate all active stream sessions, call `close()` with aggregate timeout

## 6. Preload bridge

- [x] 6.1 Expose `stream.create(cwd)` in preload `contextBridge`
- [x] 6.2 Expose `stream.send(sessionId, text)` in preload
- [x] 6.3 Expose `stream.destroy(sessionId)` in preload
- [x] 6.4 Expose `stream.resume(claudeSessionId, cwd)` in preload
- [x] 6.5 Expose `stream.onEvent(callback)` event listener in preload

## 7. Session list "+" button

- [x] 7.1 Add "+" button UI at the bottom of `SessionListView` component
- [x] 7.2 Implement click handler — call `window.electronAPI.dialog.showOpenDialog` for directory selection
- [x] 7.3 Call `window.electronAPI.stream.create(selectedDir)` and handle response

## 8. Stream session tab

- [x] 8.1 Add `⚡` prefix and accent color to stream session tabs in `TabBar`
- [x] 8.2 Add `⚡` icon to stream session cards in `SessionListView`
- [x] 8.3 Make stream session tabs closable (set `closable: true`)
- [x] 8.4 Implement tab close handler — call `stream.destroy(sessionId)` before removing tab
- [x] 8.5 Wire stream session creation to auto-open a new tab and set it active

## 9. Message input bar

- [x] 9.1 Create `MessageInput` component with multi-line textarea and send button
- [x] 9.2 Implement Enter to send, Shift+Enter for newline
- [x] 9.3 Ignore empty/whitespace-only messages
- [x] 9.4 Disable input and show spinner during `thinking`/`processing`/`compacting` phases
- [x] 9.5 Re-enable input and auto-focus on `done`/`idle`/`waitingForApproval`/`waitingForInput`
- [x] 9.6 Conditionally render `MessageInput` only for sessions with `source: 'stream'`

## 10. Permission UI wiring

- [x] 10.1 Wire existing `PermissionBar` approve/deny handlers to call `stream.respondPermission()` for stream sessions
- [x] 10.2 Wire existing `AskUserQuestion` answer handler to build `updatedInput` with answers for stream sessions
- [x] 10.3 Handle `Always Allow` — set session permission mode and auto-approve current request

## 11. Session persistence

- [ ] 11.1 Save stream session metadata to `data/config.json` under `streamSessions` key after `system` init event
- [ ] 11.2 Load persisted stream sessions on app startup
- [ ] 11.3 Display persisted sessions in `SessionListView` with resume capability
