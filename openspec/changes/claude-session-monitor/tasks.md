# Tasks: Claude Session Monitor

Tasks must be completed and verified sequentially. Do not start a task until the previous one is verified.

---

## Phase 0: Cleanup — Remove existing LLM backend and static tabs

### Task 1: Remove packages/backend/ and packages/shared/
**Verification**: `ls packages/backend` and `ls packages/shared` both fail (directory doesn't exist or is empty). `package.json` workspace list doesn't reference them. Build succeeds (or at least doesn't fail on missing backend imports).

### Task 2: Rewrite main/index.ts — Remove backend startup, clean window logic
**Verification**: `apps/desktop/src/main/index.ts` has no import of `@coding-bubble/backend` or `startBackend`. No `BACKEND_PORT` or `BACKEND_AUTH_TOKEN`. App still launches (FloatingBall + ChatPanel windows work as before, though ChatPanel content will be minimal). No TypeScript compilation errors.

### Task 3: Rewrite preload/index.ts — Expose session management IPC
**Verification**: `apps/desktop/src/preload/index.ts` exposes: `session.list()`, `session.approve()`, `session.deny()`, `session.hooksStatus()`, `session.installHooks()`. No references to `backend` or `ws` URLs. TypeScript compiles.

### Task 4: Remove static tabs (notes, tools, history, settings, about) from ChatPanel
**Verification**: `ChatPanel/index.tsx` has no reference to `testTabs` or any tab IDs other than 'chat'. No `notes`, `tools`, `history`, `settings`, `about` tabs exist. The tab system only creates "对话" tab by default. TypeScript compiles. `npm run build` (or `pnpm build`) succeeds with zero errors.

### Task 5: Remove unused hooks (useClawSocket, useClawEmotion) and related code
**Verification**: `useClawSocket` and `useClawEmotion` hooks deleted. `ChatView` no longer imports them. No references to `backendFetch`. TypeScript compiles cleanly. App launches without runtime errors.

### Task 6: Clean up leftover references — emotion, memory, greeting, settings paths
**Verification**: `grep -r "emotion\|memory-service\|greeting\|startBackend\|backendFetch"` in `apps/` and `packages/` returns zero matches (except for design docs and this tasks file). `pnpm install` succeeds.

---

## Phase 1: Core Infrastructure — Hook, Socket, Session Store

### Task 7: Create Hook Python script
**Verification**: File `packages/session-monitor/resources/claude-bubble-state.py` exists. It reads JSON from stdin, connects to a Unix socket, sends event data, and for `PermissionRequest` waits for a response before printing allow/deny JSON to stdout. Running `python3 -c "import json; print(json.dumps({'session_id':'test','hook_event_name':'UserPromptSubmit','cwd':'/tmp','tool_input':{}}))" | python3 packages/session-monitor/resources/claude-bubble-state.py` connects to socket and exits (expected error if socket not running).

### Task 8: Create HookInstaller (main process)
**Verification**: Module exists at `packages/session-monitor/src/hook-installer.ts`. Exports `installHooks()` and `uninstallHooks()`. `installHooks()` writes the Python hook script to `~/.claude/hooks/claude-bubble-state.py` and registers it in `~/.claude/settings.json`. `uninstallHooks()` removes the hook registration. Verification: call `installHooks()`, then `~/.claude/hooks/claude-bubble-state.py` exists and `~/.claude/settings.json` contains `"hooks"` entry referencing `claude-bubble-state.py`.

### Task 9: Create Unix Domain Socket Server (main process)
**Verification**: Module exists at `packages/session-monitor/src/socket-server.ts`. Starts a Unix domain socket server listening for incoming connections. Correctly decodes `HookEvent` JSON. For `PermissionRequest`, keeps socket open and stores it for later response. For other events, closes socket after decoding. Verification: Start socket server, send a JSON event via `nc -U /tmp/...`, verify it's decoded and emitted via callback. Send a `PermissionRequest` event, verify socket stays open, then send a response JSON, verify it reaches the client.

### Task 10: Create SessionPhase and SessionState types
**Verification**: Types exported from `packages/session-monitor/src/types.ts` (or equivalent). Includes `SessionPhase` discriminated union with all 6 variants, `PermissionContext`, `SessionState`, `ChatHistoryItem`, `ToolCallItem`, `ToolStatus`, `HookEvent`, `HookResponse`. TypeScript type-checks (`tsc --noEmit` passes for this module).

### Task 11: Create SessionStore (main process state manager)
**Verification**: Module at `packages/session-monitor/src/session-store.ts`. Implements:
- `process(event)` — single entry point for all state mutations
- `sessions` — Map<sessionId, SessionState>
- `get(sessionId)` — query single session
- `publish()` — emit state to renderer via IPC event
- State machine with validated transitions (same as Claude Island SessionPhase)
- Tool tracker
Verification: Unit test creates store, feeds hook events in sequence (UserPromptSubmit → processing → PreToolUse → running → PostToolUse → success), verifies session state transitions correctly. All transitions that should be rejected are rejected.

### Task 12: Wire up HookInstaller + Socket Server + SessionStore in main/index.ts
**Verification**: App startup flow: `installHooks()` called → Socket Server started with callback → callback feeds events to `SessionStore.process()`. Starting a Claude Code session in a terminal (e.g., `claude` in a project directory) creates a session visible in the store. Verification: after `claude` starts, query session list via IPC/console.log, see one session with phase `idle` or `waitingForInput`.

---

## Phase 2: JSONL Parser — Chat History

### Task 13: Create JSONL Parser module
**Verification**: Module at `packages/session-monitor/src/jsonl-parser.ts`. Exports:
- `parseFullConversation(sessionId, cwd)` → `ChatHistoryItem[]`
- `parseIncremental(sessionId, cwd)` → `{ newItems, completedTools, toolResults }`
- Reads `~/.claude/projects/{project-dir}/{session-id}.jsonl`
- Correctly parses user messages, assistant messages, tool_use blocks, tool_result blocks, thinking blocks
Verification: Create a test session with a simple Claude conversation (user asks question, assistant responds with tool call + result + text), run `parseFullConversation()`, verify output contains correct ChatHistoryItems with proper types, IDs, and content.

### Task 14: Wire JSONL parser with file watching (fs.watch)
**Verification**: Parser watches the JSONL file. When Claude Code writes new data, the parser triggers incremental parsing. Debounced (100ms). Results fed into `SessionStore.process('fileUpdated', payload)`. Verification: start a Claude session, send a message, verify new messages appear in session store within 200ms.

### Task 15: Implement Tool Use ID cache in socket server
**Verification**: When `PreToolUse` event arrives with `tool_use_id`, cache it under `"sessionId:toolName:serializedInput"` key. When `PermissionRequest` arrives (which lacks `tool_use_id`), pop cached ID from queue. Unit test: feed PreToolUse(id=abc) → PermissionRequest(same tool), verify PermissionRequest gets toolUseId=abc.

### Task 16: Wire permission request → SessionStore → UI callback chain
**Verification**: PermissionRequest event → socket server caches → creates entry in store → store publishes phase `waitingForApproval` → renderer receives IPC event. Verification: trigger a permission-requesting tool in Claude CLI (e.g., `Bash` with require approval), verify session phase becomes `waitingForApproval` within 500ms.

---

## Phase 3: Renderer — UI Components

### Task 17: Rewrite preload IPC for session management
**Verification**: `apps/desktop/src/preload/index.ts` exposes `window.electronAPI.session.*` methods. Renderer can call `session.list()`, `session.approve()`, `session.deny()`, `session.on('session:update', cb)`, etc. TypeScript compiles, no type errors.

### Task 18: Create SessionTab content (chat history view)
**Verification**: New component renders:
- Session header (project name, path, status indicator)
- Message list with user/assistant/tool/thinking items
- Each item renders with correct styling (user right, assistant left, tool expandable, thinking collapsed)
Tool calls show name + input + status dot (color by status). Verification: mock 3-4 chat items (user msg, assistant msg, tool call, thinking), render component, verify all 4 types display correctly with correct visual distinction.

### Task 19: Create Permission Approval Bar
**Verification**: Component appears only when session phase is `waitingForApproval`. Shows tool name (monospace, amber), tool input preview (truncated), [Deny] button (gray), [Allow] button (white). Clicking Allow/Deny calls `session.approve(deny)` IPC. Slides in from bottom with spring animation. Verification: mock a `waitingForApproval` session, verify bar renders with correct info and buttons are clickable.

### Task 20: Create Session List (对话 tab content)
**Verification**: "对话" tab renders cards for each active session. Each card shows:
- Project name (bold)
- Project path (gray)
- Status indicator (colored dot + text)
- Current activity (tool running or permission pending)
Cards are clickable. Clicking a card switches to that session's tab. Verification: mock 2 sessions, verify 2 cards render with different statuses. Click first card, verify tab switches from "对话" to that session's tab.

### Task 21: Wire dynamic tab creation/removal in ChatPanel
**Verification**: ChatPanel listens to session store via IPC. New session → new tab created with session name as tab title. Session ends → tab removed. If removed tab was active → switch to "对话" tab. Verification: start 2 Claude sessions, verify 2 session tabs appear in TabBar + "对话" tab. End first session, verify its tab disappears and panel switches to "对话" tab.

### Task 22: Wire Permission Approval flow end-to-end
**Verification**: Claude CLI triggers permission request → Socket server receives event → Session phase becomes `waitingForApproval` → Renderer shows Permission Bar → User clicks "Allow" → IPC to main → Main writes `{"decision":"allow"}` to socket → Python script outputs approval JSON → Claude CLI continues execution. Verification: run a tool that requires permission in Claude CLI, verify it blocks, click Allow in Coding-bubble, verify Claude CLI proceeds and tool executes successfully. Full denial flow tested similarly.

### Task 23: Auto-scroll + new message indicator
**Verification**: Message list auto-scrolls to bottom on new content. When user scrolls up, auto-scroll pauses. New messages arrive → floating "⬇ N new messages" indicator appears. Clicking indicator scrolls to bottom and resumes auto-scroll. Verification: mock messages arriving while scrolled up, verify indicator appears with correct count.

### Task 24: Integrate hook status into settings/about (if any remains)
**Verification**: Settings or info area shows whether hooks are installed, with a toggle to install/uninstall. Verification: check UI shows correct hook status. Toggle works: uninstall → status shows "off" → install → status shows "on" + hooks exist on disk.

---

## Phase 4: Polish & Verification

### Task 25: E2E Smoke Test
**Verification**:
1. Start Coding-bubble → floating ball appears
2. Open terminal, `cd` to a project, run `claude`
3. ChatPanel opens → "对话" tab shows session card, session tab appears
4. Click session tab → chat history loads correctly
5. Send a message in Claude CLI → ChatPanel updates with user + assistant messages
6. Trigger a tool requiring permission → Permission Bar appears
7. Click Allow → Claude CLI proceeds
8. End Claude session (`exit`) → session tab disappears, switches to "对话"

### Task 26: Build verification
**Verification**: `pnpm install && pnpm build` succeeds with zero errors and zero warnings. `pnpm lint` passes. App launches in dev mode without console errors.
