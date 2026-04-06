# Design: Claude Session Monitor

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Electron Main                      │
│                                                      │
│  ┌────────────┐    ┌───────────────┐                 │
│  │ Hook       │───▶│ Socket Server  │                 │
│  │ Installer  │    │ (Unix socket)  │                 │
│  └────────────┘    └───────┬───────┘                 │
│                            │                         │
│                            ▼                         │
│  ┌─────────────────────────────────────┐             │
│  │  SessionStore (Zustand → IPC pipe)  │             │
│  │  • Session lifecycle                │             │
│  │  • Tool tracking                    │             │
│  │  • State machine (SessionPhase)     │             │
│  └───────┬─────────────────────────────┘             │
│          │                                           │
│          ▼                                           │
│  ┌──────────────────────┐                            │
│  │  JSONL File Watcher  │                            │
│  │  • fs.watch          │                            │
│  │  • Incremental parse │                            │
│  │  • Structured parse  │                            │
│  └──────────────────────┘                            │
└──────────────────────────────────────────────────────┘
                         │ IPC (invoke/on)
                         ▼
┌──────────────────────────────────────────────────────┐
│                    React Renderer                     │
│                                                      │
│  FloatingBall → ChatPanel                            │
│                 │                                    │
│            TabBar (dynamic)                          │
│                 │                                    │
│     ┌───────────┴───────────┐                        │
│     │                       │                        │
│  对话 Tab              Session Tab(s)               │
│  (Session list)        (Chat history)               │
│                                                      │
└──────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. SessionStore location
The session store lives in the **Electron main process**, not the renderer. This is because:
- Hook events arrive in main process (Unix socket)
- JSONL file watching is more reliable from main process
- Multiple renderer windows may need access (future)
- IPC pushes state to renderer via electron event listeners

### 2. JSONL Parser
Claude Code writes conversation data to `~/.claude/projects/{project-dir}/{session-id}.jsonl`.
The parser:
- **Incremental parsing**: tracks file offset, reads only new lines (100ms debounce)
- **Full parsing**: available for session tab initialization (load existing history)
- **Structured result parsing**: extracts tool-specific data (Bash stdout/stderr, Read file content, Edit patches, etc.)
- **Clear detection**: `/clear` command detected by parsing special marker lines

### 3. Permission Flow
```
Claude CLI ──hook──▶ Python Script ──socket──▶ Main Process
                                                  │
                                                  ▼
                                            SessionStore
                                            (waitingForApproval)
                                                  │
                                             IPC to renderer
                                                  │
                                                  ▼
                                      Permission Bar in UI
                                      [Deny]     [Allow]
                                          │
                                          ▼
                                    Main process writes
                                    {"decision":"allow"}
                                    back to socket
                                          │
                                    Python script outputs
                                    hookSpecificOutput JSON
                                          │
                                    Claude CLI continues
```

### 4. Tool Use ID Cache
PermissionRequest events from hooks do **not** include `tool_use_id`. The solution:
- Cache `tool_use_id` from preceding `PreToolUse` event
- Use composite key: `"sessionId:toolName:serializedInput"`
- FIFO queue per key (multiple concurrent tool uses of same type)
- Pop from queue when PermissionRequest arrives

### 5. Tab Lifecycle
```
HookEvent (UserPromptSubmit/PreToolUse) with new sessionId
  → Create SessionState in Store
  → Main process emits 'session:new' to renderer
  → Renderer creates new tab

SessionEnd hook + JSONL confirms session is gone
  → Remove SessionState
  → Main process emits 'session:ended'
  → Renderer removes tab
  → If active tab was removed → switch to "对话" tab
```

## Session Phase State Machine

```
               ┌─────────────────────────────┐
               │                             │
               ▼                             │
  (start) → idle ──► processing ◄───────────┤
               │         │                   │
               │         ▼                   │
               │   waitingForApproval ───────┤
               │         │                   │
               │         ▼                   │
               │   waitingForInput ──────────┤
               │         │                   │
               │         ▼                   │
               │   compacting ───────────────┤
               │         │                   │
               │         ▼                   │
               │   ended ───────────────────►┘ (remove)

Valid transitions:
  idle → processing, waitingForApproval, compacting
  processing → waitingForInput, waitingForApproval, compacting, idle
  waitingForApproval → processing (approved), idle (denied), waitingForInput
  waitingForInput → processing, idle, compacting
  compacting → processing, idle, waitingForInput
  any → ended
  ended → (terminal, no transitions out)
```

## Shared Types

All session-related types moved to a new shared module:

```typescript
// Phase
type SessionPhase =
  | { type: 'idle' }
  | { type: 'processing' }
  | { type: 'waitingForInput' }
  | { type: 'waitingForApproval'; context: PermissionContext }
  | { type: 'compacting' }
  | { type: 'ended' }

interface PermissionContext {
  toolUseId: string
  toolName: string
  toolInput: Record<string, unknown> | null
  receivedAt: number
}

// Session
interface SessionState {
  sessionId: string
  cwd: string
  projectName: string
  phase: SessionPhase
  chatItems: ChatHistoryItem[]
  pid?: number
  tty?: string
  lastActivity: number
  createdAt: number
}

// Chat Items
type ChatHistoryItem =
  | { id: string; type: 'user'; content: string; timestamp: number }
  | { id: string; type: 'assistant'; content: string; timestamp: number }
  | { id: string; type: 'toolCall'; tool: ToolCallItem; timestamp: number }
  | { id: string; type: 'thinking'; content: string; timestamp: number }
  | { id: string; type: 'interrupted'; timestamp: number }

interface ToolCallItem {
  name: string
  input: Record<string, string>
  status: ToolStatus
  result?: string
  structuredResult?: unknown
}

type ToolStatus = 'running' | 'success' | 'error' | 'interrupted' | 'waitingForApproval'
```

## IPC Protocol

**Main → Renderer events:**
```typescript
'session:new'        → { sessionId }
'session:update'     → { sessionId, phase }
'session:ended'      → { sessionId }
'session:history'    → { sessionId, items: ChatHistoryItem[] }
'session:permission' → { sessionId, toolName, toolInput }
```

**Renderer → Main invokes:**
```typescript
'session:approve'   → { sessionId }     → responds to socket
'session:deny'      → { sessionId, reason? } → responds to socket
'session:list'      → {}                → returns SessionState[]
'session:hooks-status' → {}             → returns { installed: boolean }
'session:install-hooks' → {}            → installs hooks
```
