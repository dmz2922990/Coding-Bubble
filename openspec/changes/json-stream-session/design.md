## Context

Coding-bubble currently monitors Claude Code sessions via a hooks-based architecture: a Python hook script sends events over Unix domain socket to the Electron main process, which updates the renderer through IPC. This approach can observe and approve/deny tool usage but **cannot send messages to Claude Code** — the user must type in their terminal.

Claude Code supports a `stream-json` mode (`--input-format stream-json --output-format stream-json --permission-prompt-tool stdio`) that exposes full bidirectional communication over stdin/stdout JSON lines. The cc-connect project has a mature Go implementation of this protocol.

The entire implementation will be in **TypeScript**, running on Node.js (Electron main process). No new runtime languages or external dependencies are needed — `child_process` is built into Node.

### Constraints

- Must not interfere with the existing hooks-based monitoring
- Must reuse existing `SessionTab` UI components for message rendering
- Stream-json sessions are visually distinct from hook-based sessions
- The `packages/session-monitor` package owns session state; stream-json is an alternative session source
- Electron main process is the only place that can spawn child processes

## Goals / Non-Goals

**Goals:**
- Allow users to create new Claude Code conversations from within Coding-bubble
- Send prompts and receive streaming responses (text, tool_use, thinking, result) in real-time
- Handle permission requests (`control_request`) via the existing approval UI
- Support session resume (`--resume` / `--continue --fork-session`)
- Graceful 3-phase shutdown (stdin close → SIGTERM → SIGKILL)

**Non-Goals:**
- Replacing the existing hooks-based monitoring (both run in parallel)
- Multi-modal input (images, files) in v1 — text-only input for now
- Streaming token-by-token rendering (buffer per turn is acceptable for v1)
- Supporting `--permission-mode bypassPermissions` or `dontAsk` from the UI
- Managing multiple workspaces per session (single cwd per stream session)

## Decisions

### D1: Module placement — New `packages/stream-json/` package

**Decision:** Create a new `@coding-bubble/stream-json` package rather than adding to `session-monitor`.

**Rationale:** `session-monitor` is focused on the hooks/socket pipeline. Stream-json has completely different lifecycle management (child process, stdin/stdout pipes, 3-phase shutdown). Separating them keeps both packages focused and testable independently. Both packages feed into the same `SessionStore` through the main process.

**Alternatives considered:**
- Adding to `session-monitor`: would bloat the package with unrelated process management concerns
- Keeping everything in `apps/desktop/src/main/`: too coupled to Electron, untestable in isolation

### D2: TypeScript port of cc-connect protocol — Event-driven class

**Decision:** Port the core stream-json protocol as a `StreamSession` class with EventEmitter pattern, matching cc-connect's `claudeSession` architecture but in TypeScript.

```
StreamSession
  ├── spawn(cwd, options) → void
  ├── send(text) → void
  ├── respondPermission(requestId, result) → void
  ├── close() → Promise<void>
  ├── events: EventEmitter<StreamEvent>
  └── sessionId: string | null
```

**Rationale:** EventEmitter is idiomatic Node.js and integrates naturally with the main process event loop. The class encapsulates the child process lifecycle, stdin/stdout reading, and JSON line parsing.

### D3: Integration with SessionStore — Adapter in main process

**Decision:** The main process runs an adapter that translates `StreamSession` events into `HookEvent`-like payloads and feeds them into the existing `SessionStore.process()` method. Stream-json sessions get a `source: 'stream'` marker on their `SessionState`.

**Rationale:** Reusing `SessionStore` means we get the state machine, intervention tracking, notification bubbling, and IPC broadcasting for free. The adapter translates stream-json events to the hook event vocabulary:
- `system.init` → `SessionStart`
- `assistant` (text/thinking/tool_use) → accumulated into `chatItems`, phase transitions mirror hook events
- `result` → `Stop`
- `control_request` → `PermissionRequest`
- Process exit → `SessionEnd`

### D4: Input UI — Chat input bar in SessionTab

**Decision:** Add a `MessageInput` component that renders at the bottom of stream-json session tabs. It is conditionally shown only for sessions with `source: 'stream'`.

```
┌─────────────────────────────┐
│ [Tab: 🟢 project-name  ×]  │
│                             │
│  SessionTab (messages)      │
│  ...existing chat items...  │
│                             │
├─────────────────────────────┤
│ ┌───────────────────┐ ──┐  │
│ │ Type a message... │   │  │  ← MessageInput (only for stream sessions)
│ └───────────────────┘ ──┘  │
└─────────────────────────────┘
```

**Rationale:** The input bar is a natural extension of the session tab. It mirrors chat application conventions (Enter to send, Shift+Enter for newline).

### D5: Session creation — "+" button in SessionListView

**Decision:** Add a `+` button at the bottom of the session list ("对话" tab). Clicking it prompts for a working directory, then creates a stream-json tab.

```
┌─────────────────────────────┐
│  SessionListView            │
│  ┌───────────────────────┐  │
│  │ 🔵 project-a  空闲    │  │
│  ├───────────────────────┤  │
│  │ 🟢 project-b  处理中  │  │
│  └───────────────────────┘  │
│                             │
│         [ + 新建对话 ]       │  ← New button
└─────────────────────────────┘
```

**Rationale:** Placing the button in the session list view is the natural entry point. It's discoverable without disrupting the existing layout.

### D6: Visual distinction — Badge + prefix on stream tabs

**Decision:** Stream-json session tabs display a `⚡` prefix icon and a subtle green left-border accent. The session card in `SessionListView` also shows the lightning icon.

**Rationale:** Users need to quickly distinguish between monitored (hook) sessions and interactive (stream) sessions. The prefix icon is visible in the tab bar, and the border accent provides additional differentiation without requiring a new component.

### D7: Permission handling — Reuse existing approval UI

**Decision:** Stream-json `control_request` events are translated to `waitingForApproval` phase in `SessionStore`. The existing `PermissionBar` and `AskUserQuestion` components in `SessionTab` handle them identically. The main process adapter writes `control_response` back to stdin.

**Rationale:** No new UI needed for permissions. The existing flow (store pending → show UI → user approves/denies → resolve) works unchanged. The only difference is the resolve mechanism: hook sessions resolve via socket, stream sessions resolve via stdin write.

### D8: Session persistence — Store stream session metadata in config

**Decision:** Stream session metadata (claude session ID, cwd, creation time) is persisted to `data/config.json` under a `streamSessions` key. On app restart, completed sessions are shown as resumable in the session list.

**Rationale:** Claude Code stores conversation history in `~/.claude/projects/{key}/{id}.jsonl`. By persisting the Claude-assigned session ID, we can offer `--resume` on restart. This is simpler than building a separate database.

## Risks / Trade-offs

**[Risk] Child process zombie on crash** → Main process tracks all spawned processes in a `Map<sessionId, StreamSession>`. On `app.on('before-quit')`, iterate and call `close()` with a 10s aggregate timeout. If Electron crashes hard, OS reaps child processes.

**[Risk] Large stdout lines exceed buffer** → Use `readline` module with configurable max buffer (default 10MB, matching cc-connect). Lines exceeding this are logged and skipped.

**[Risk] CLAUDECODE env vars cause nested session detection** → Filter `process.env` before spawning: remove all keys starting with `CLAUDECODE` (e.g., `CLAUDECODE_SESSION_ID`).

**[Risk] Concurrent stdin writes from send + permission response** → All stdin writes go through a serialized `writeJSON()` method with a Mutex (or simple queue), matching cc-connect's `stdinMu`.

**[Trade-off] No streaming token-by-token rendering in v1** → We accumulate text events and update on `result`. This simplifies the implementation significantly. Token-by-token can be added later by processing `assistant` content blocks incrementally.

**[Trade-off] Text-only input in v1** → Multi-modal (images, files) requires base64 encoding and disk persistence. Deferred to keep scope manageable. The `send()` method's signature allows future extension with attachment parameters.
