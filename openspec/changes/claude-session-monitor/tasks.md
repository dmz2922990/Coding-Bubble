# Tasks: Claude Session Monitor

Tasks must be completed and verified sequentially. Do not start a task until the previous one is verified.

---

## Phase 0: Cleanup — Remove existing LLM backend and static tabs

- [x] **Task 1: Remove packages/backend/ and packages/shared/**
  Verification: `ls packages/backend` and `ls packages/shared` both fail (directory doesn't exist or is empty). `package.json` workspace list doesn't reference them. Build succeeds.
  **Done**: Completed in commit [func_update::backend:strip] 7d6b9af.

- [x] **Task 2: Rewrite main/index.ts — Remove backend startup, clean window logic**
  Verification: `apps/desktop/src/main/index.ts` has no import of `@coding-bubble/backend` or `startBackend`. No `BACKEND_PORT` or `BACKEND_AUTH_TOKEN`. App still launches (FloatingBall + ChatPanel windows work). No TypeScript compilation errors.

- [x] **Task 3: Rewrite preload/index.ts — Expose session management IPC**
  Verification: `apps/desktop/src/preload/index.ts` exposes: `session.list()`, `session.approve()`, `session.deny()`, `session.hooksStatus()`, `session.installHooks()`. No references to `backend` or `ws` URLs. TypeScript compiles.

- [x] **Task 4: Remove static tabs (notes, tools, history, settings, about) from ChatPanel**
  Verification: `ChatPanel/index.tsx` has no reference to `testTabs` or any tab IDs other than 'chat'. No `notes`, `tools`, `history`, `settings`, `about` tabs exist. Only "对话" tab by default.

- [x] **Task 5: Remove unused hooks (useClawSocket, useClawEmotion) and related code**
  Verification: `useClawSocket` and `useClawEmotion` hooks deleted. `ChatView` no longer imports them. No references to `backendFetch`. TypeScript compiles cleanly.

- [x] **Task 6: Clean up leftover references — emotion, memory, greeting, settings paths**
  Verification: No imports of useClawSocket, useClawEmotion, or backendFetch remain. env.d.ts updated to session management IPC.

- [x] **Task 7: Clean up ChatPanel status bar and agent status elements**
  Verification: ChatView.tsx deleted, ChatPanel simplified to basic panel with title and close button.

---

## Phase 1: Core Infrastructure — Hook, Socket, Session Store

- [x] **Task 8: Create Hook Python script**
  Verification: File `packages/session-monitor/resources/claude-bubble-state.py` exists. Reads JSON from stdin, connects to Unix socket, sends event data. For PermissionRequest, waits for response before printing allow/deny JSON.

- [x] **Task 9: Create HookInstaller (main process)**
  Verification: Module at `packages/session-monitor/src/hook-installer.ts`. Exports `installHooks()` and `uninstallHooks()`. Writes Python hook to `~/.claude/hooks/claude-bubble-state.py` and registers in `~/.claude/settings.json`.

- [x] **Task 10: Create Unix Domain Socket Server (main process)**
  Verification: Module at `packages/session-monitor/src/socket-server.ts`. Listens on Unix socket, decodes HookEvent JSON. PermissionRequest keeps socket open. Tool Use ID cache built in.

- [x] **Task 11: Create SessionPhase and SessionState types**
  Verification: Types exported from `packages/session-monitor/src/types.ts`. Includes SessionPhase (6 variants), PermissionContext, SessionState, ChatHistoryItem, ToolCallItem, ToolStatus, HookEvent, HookResponse. `tsc --noEmit` passes.

- [x] **Task 12: Create SessionStore (main process state manager)**
  Verification: Module at `packages/session-monitor/src/session-store.ts`. Implements `process(event)`, `sessions` Map, `get(sessionId)`, `publish()` via IPC. Validated state machine transitions.

- [x] **Task 13: Wire up HookInstaller + Socket Server + SessionStore in main/index.ts**
  Verification: App startup calls `installHooks()` → `SessionStore.process()` → socket server started. TypeScript compiles.

---

## Phase 2: JSONL Parser — Chat History

- [x] **Task 14: Create JSONL Parser module**
  Verification: Module at `packages/session-monitor/src/jsonl-parser.ts`. Exports `parseFullConversation()` and `parseIncremental()`. Correctly parses user/assistant/tool_use/tool_result/thinking blocks.

- [ ] **Task 15: Wire JSONL parser with file watching (fs.watch)**
  Verification: Parser watches the JSONL file. When Claude Code writes new data, the parser triggers incremental parsing. Debounced (100ms). Results fed into `SessionStore.process('fileUpdated', payload)`.

- [x] **Task 16: Implement Tool Use ID cache in socket server**
  Verification: PreToolUse caches under `sessionId:toolName:serializedInput` key with FIFO queue. PermissionRequest pops from cache. ToolUseIdCache class in socket-server.ts.

- [x] **Task 17: Wire permission request → SessionStore → UI callback chain**
  Verification: PermissionRequest event → socket server correlates toolUseId → SessionStore creates `waitingForApproval` phase → broadcasts via onPublish. Full UI wiring pending Phase 3.

---

## Phase 3: Renderer — UI Components

- [x] **Task 18: Rewrite preload IPC for session management**
  Renderer can call `session.list()`, `session.approve()`, `session.deny()`, `session.on('session:update', cb)`. TypeScript compiles.

- [x] **Task 19: Create SessionTab content (chat history view)**
  SessionTab component with header, message list, ToolItem (expandable), ThinkingItem (collapsed), PermissionBar.

- [x] **Task 20: Create Permission Approval Bar**
  PermissionBar shows tool name, input preview, Allow/Deny buttons. Appears only on `waitingForApproval` phase.

- [x] **Task 21: Create Session List (对话 tab content)**
  SessionListView renders session cards with name, path, status dot. Empty state when no sessions.

- [x] **Task 22: Wire dynamic tab creation/removal in ChatPanel**
  ChatPanel listens to session updates via IPC, creates/removes tabs dynamically. Switches to "对话" on tab removal.

- [ ] **Task 23: Wire Permission Approval flow end-to-end**
  Claude CLI → Socket → SessionStore → PermissionBar → IPC → Main → Socket → Python → CLI. UI wired, end-to-end needs Claude CLI testing.

- [x] **Task 24: Auto-scroll + new message indicator**
  SessionTab has auto-scroll with pause on user scroll and "↓ N 条新消息" floating indicator.

---

## Phase 4: Polish & Verification

- [ ] **Task 25: E2E Smoke Test**
  1. Start Coding-bubble → floating ball appears
  2. `cd project && claude` → ChatPanel shows session card + tab
  3. Click session tab → chat history loads
  4. Send message in CLI → Panel updates
  5. Trigger permission → Bar appears → Click Allow → CLI proceeds
  6. End session → tab disappears → switches to "对话"

- [ ] **Task 26: Build verification**
  Verification: `pnpm install && pnpm build` succeeds with zero errors. App launches in dev mode without console errors.
